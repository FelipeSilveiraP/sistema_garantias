// Cupom fiscal automatico no PDV do RM Software (app.rmsoftware.dev.br).
//
// Faz pela API do RM o mesmo que o operador faz na tela do PDV (conferido numa venda
// real gravada no DevTools): pesquisar cada produto pela PALAVRA (nunca pelo codigo),
// ajustar quantidade e valor, pagamento sempre em DINHEIRO, finalizar e emitir a NFC-e.
// Sem estoque, cliente ou vendedor.
//
// Este arquivo nao depende do Electron: `chamar(metodo, caminho, corpo)` e quem fala
// com o RM (desktop/rm.js usa a janela escondida do RM; os testes usam um RM falso).

/** Erro que vale tentar de novo (sem internet, RM fora do ar, login vencido). */
class ErroTemporario extends Error {}
/** Erro que outra tentativa nao resolve (produto nao achado, venda recusada). */
class ErroDefinitivo extends Error {}

/** "Carcaça  Canivete" -> "CARCACA CANIVETE": compara sem acento, caixa ou espaco duplo. */
function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

/** Valor em reais com 2 casas, como o PDV manda (120 ou 120.5, nunca "120,50"). */
function reais(valor) {
  return Math.round(Number(valor) * 100) / 100;
}

/** Resposta do RM -> dados, ou o erro certo. */
function conferir(resposta, oQue) {
  const { status, dados } = resposta;
  if (status === 0 || status === 401 || status === 403 || status === 408 || status === 429 || status >= 500) {
    const motivo = status === 0 ? "sem resposta do RM (internet ou RM fora do ar)"
      : status === 401 || status === 403 ? "o login do RM venceu"
      : `o RM respondeu ${status}`;
    throw new ErroTemporario(`${oQue}: ${motivo}`);
  }
  if (status < 200 || status >= 300 || !dados || dados.ok === false) {
    const msg = dados && (dados.message || dados.mensagem || dados.erro || (dados.error && dados.error.message));
    throw new ErroDefinitivo(`${oQue}: o RM recusou (${status}${msg ? ` — ${String(msg).slice(0, 200)}` : ""})`);
  }
  return dados.data;
}

/** Produto do RM com o nome exato (sem acento/caixa); procura pelo nome e, se preciso, pela 1a palavra. */
async function acharProduto(chamar, contexto, nomeRm) {
  const alvo = normalizar(nomeRm);
  const buscas = [nomeRm, String(nomeRm).trim().split(/\s+/)[0]];
  for (const termo of buscas) {
    const consulta = new URLSearchParams({
      pageSize: "50",
      q: termo,
      tabelaPrecoId: contexto.tabelaPrecoId,
      companyId: contexto.companyId,
      mixDoPdv: "true",
    });
    const dados = conferir(await chamar("GET", `/v1/produtos?${consulta}`), `pesquisar ${nomeRm}`);
    const iguais = ((dados && dados.items) || []).filter((p) => p.isActive !== false && normalizar(p.descricao) === alvo);
    if (iguais.length === 1) return iguais[0];
    if (iguais.length > 1) throw new ErroDefinitivo(`há ${iguais.length} produtos "${nomeRm}" no RM`);
  }
  throw new ErroDefinitivo(`o produto "${nomeRm}" não foi encontrado no RM (confira o NOME NO RM em ATUALIZAR PREÇOS)`);
}

/**
 * Emite a NFC-e do pedido montado pelo servidor (GET /api/garantias/{id}/cupom-rm).
 * `memoria` guarda o que ja deu certo (venda criada), para a nova tentativa nao criar
 * outra venda. Devolve { numero, chave, status, idVenda }.
 */
async function emitirNoRm(pedido, chamar, contexto, memoria = {}) {
  if (!contexto.companyId || !contexto.tabelaPrecoId) {
    throw new ErroTemporario("o RM ainda não carregou a empresa e a tabela de preços");
  }
  if (!memoria.idVenda) {
    const itens = [];
    for (const item of pedido.itens) {
      const produto = await acharProduto(chamar, contexto, item.nomeRm);
      const valor = reais(item.valorUnitario);
      itens.push({ produtoId: produto.id, quantidade: item.quantidade, valorUnitario: valor, valorUnitarioBase: valor, desconto: 0 });
    }
    const total = reais(pedido.total);
    // conferencia do PDV: o total que o RM calcula tem de ser o da garantia
    const totais = conferir(await chamar("POST", "/v1/pdv/totais", {
      companyId: contexto.companyId,
      itens: itens.map(({ valorUnitarioBase, ...resto }) => resto),
    }), "conferir o total");
    if (!totais || reais(totais.valorTotal) !== total) {
      throw new ErroDefinitivo(`o RM calculou R$ ${totais && totais.valorTotal} e a garantia vale R$ ${total}`);
    }
    const venda = conferir(await chamar("POST", "/v1/pdv/vendas", {
      vendaUuid: pedido.vendaUuid,
      companyId: contexto.companyId,
      itens,
      pagamento: { forma: "avista", meio: "01", parcelas: [] }, // 01 = dinheiro
      totalMostrado: total,
      vendedorId: null,
      tabelaPrecoId: contexto.tabelaPrecoId,
      formaRecebimentoId: null,
      emitir: false,
    }), "finalizar a venda");
    if (!venda || !venda.id) throw new ErroDefinitivo("o RM não devolveu o número da venda");
    memoria.idVenda = venda.id;
  }
  const nota = conferir(await chamar("POST", `/v1/pdv/vendas/${encodeURIComponent(memoria.idVenda)}/emitir`, {}), "emitir a NFC-e");
  if (!nota || nota.numero === null || nota.numero === undefined || !nota.chaveAcesso) {
    throw new ErroDefinitivo(`a NFC-e não foi emitida (situação: ${nota && nota.status})`);
  }
  return {
    numero: String(nota.numero),
    chave: String(nota.chaveAcesso),
    status: String(nota.status || ""),
    idVenda: memoria.idVenda,
    // numero da venda no RM ("#279" em ULTIMAS VENDAS): e por ele que o botao CUPOM do RM e achado
    vendaNumero: nota.vendaNumero === null || nota.vendaNumero === undefined ? null : Number(nota.vendaNumero),
  };
}

module.exports = { emitirNoRm, normalizar, ErroTemporario, ErroDefinitivo };
