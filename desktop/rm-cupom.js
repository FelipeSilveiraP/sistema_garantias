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
  throw new ErroDefinitivo(`o produto "${nomeRm}" não foi encontrado no RM (confira o PRODUTO DO RM PARA QUALQUER CARRO em ATUALIZAR PREÇOS)`);
}

// ---------- produto do CARRO (pedido do usuario, 2026-11-25) ----------
// Os canivetes/carcacas do RM tem o carro no nome ("CHAVE CANIVETE SECA GOL G5 G6", "CANIVETE
// CHEVROLET CRUZE E ONIX 3 BOTOES"). Todos sao o mesmo tipo de produto (mesmo NCM), entao o
// cupom pode sair com o do carro da garantia: 1) o que tem o MODELO no nome; 2) senao o
// primeiro com a MARCA; 3) senao o NOME NO RM de sempre. Pecas (PILHA, BOTAO) nao mudam.
// Nada muda na tela nem na emissao: so qual produto do RM entra na venda.

/** Como cada marca pode estar escrita no nome do produto do RM. */
const APELIDOS_MARCA = {
  CHEVROLET: ["CHEVROLET", "GM", "CHEV"],
  VOLKSWAGEN: ["VOLKSWAGEN", "VW"],
  "MERCEDES-BENZ": ["MERCEDES", "BENZ"],
  "CAOA CHERY": ["CHERY"],
  "LAND ROVER": ["LAND ROVER"],
  CITROEN: ["CITROEN"],
};

/** Palavras que nao dizem qual e o produto (ficam fora da "familia"). */
const GENERICAS = new Set(["CHAVE", "TROCA", "COM", "SEM", "PARA", "DE", "DA", "DO", "E"]);

function palavras(texto) {
  return normalizar(texto).split(/[^A-Z0-9]+/).filter(Boolean);
}

/** " A B C " contem " B C "? (palavra inteira, nao pedaco: "GOL" nao bate com "GOLF") */
function temTermo(nome, termo) {
  const t = palavras(termo).join(" ");
  return Boolean(t) && ` ${palavras(nome).join(" ")} `.includes(` ${t} `);
}

/** Palavras do NOME NO RM que dizem o tipo de produto ("CARCACA CANIVETE" -> CARCACA, CANIVETE). */
function familia(nomeRm) {
  return palavras(nomeRm).filter((p) => p.length >= 3 && !GENERICAS.has(p));
}

/** Modelo sem a marca ("FIAT 500" -> "500"; "S-10" -> "S 10" e "S10"). */
function termosModelo(modelo, apelidos) {
  const marca = new Set(apelidos.flatMap(palavras));
  const resto = palavras(modelo).filter((p) => !marca.has(p));
  if (!resto.length) return [];
  const junto = resto.join("");
  return [...new Set([resto.join(" "), junto, resto[0]].filter((t) => t.length >= 2))];
}

/** Escolhe o produto do carro entre os do RM (ou null). Exportado para teste. */
function escolherDoCarro(produtos, nomeRm, marca, modelo) {
  const fam = familia(nomeRm);
  const apelidos = marca ? (APELIDOS_MARCA[normalizar(marca)] || [marca]) : [];
  const modelos = modelo ? termosModelo(modelo, apelidos) : [];
  let melhor = null;
  let melhorPontos = 0;
  for (const p of produtos) {
    if (p.isActive === false) continue;
    const nome = p.descricao;
    const deFamilia = fam.filter((f) => temTermo(nome, f)).length;
    if (!deFamilia) continue;
    const temModelo = modelos.some((m) => temTermo(nome, m));
    const temMarca = apelidos.some((a) => temTermo(nome, a));
    if (!temModelo && !temMarca) continue;
    const pontos = (temModelo ? 100 : 0) + (temMarca ? 50 : 0) + deFamilia * 10;
    if (pontos > melhorPontos) { // empate: fica o primeiro que apareceu
      melhor = p;
      melhorPontos = pontos;
    }
  }
  return melhor;
}

/** Produto do carro da garantia no RM: busca pela marca e pelo modelo e escolhe. */
async function acharProdutoDoCarro(chamar, contexto, item, marca, modelo) {
  if (item.peca || (!marca && !modelo)) return null;
  const apelidos = marca ? (APELIDOS_MARCA[normalizar(marca)] || [marca]) : [];
  const termos = [...(modelo ? termosModelo(modelo, apelidos).slice(0, 1) : []), ...apelidos];
  const vistos = new Map();
  for (const termo of termos) {
    const consulta = new URLSearchParams({
      pageSize: "100",
      q: termo,
      tabelaPrecoId: contexto.tabelaPrecoId,
      companyId: contexto.companyId,
      mixDoPdv: "true",
    });
    const resposta = await chamar("GET", `/v1/produtos?${consulta}`);
    // busca do carro e um "a mais": se falhar, o cupom segue com o NOME NO RM
    if (resposta.status < 200 || resposta.status >= 300) continue;
    const dados = conferir(resposta, `pesquisar ${termo}`);
    for (const p of (dados && dados.items) || []) {
      if (!vistos.has(p.id)) vistos.set(p.id, p);
    }
  }
  return escolherDoCarro([...vistos.values()], item.nomeRm, marca, modelo);
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
      // o canivete/carcaca do CARRO da garantia; sem achar, o NOME NO RM de sempre
      const produto = (await acharProdutoDoCarro(chamar, contexto, item, pedido.marca, pedido.modelo))
        || (await acharProduto(chamar, contexto, item.nomeRm));
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

module.exports = { emitirNoRm, normalizar, escolherDoCarro, ErroTemporario, ErroDefinitivo };
