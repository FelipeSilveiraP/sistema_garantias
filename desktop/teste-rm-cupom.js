// Teste do cupom fiscal automatico com um RM FALSO (sem internet, sem nota de verdade).
// Confere o que o sistema manda ao PDV do RM (igual a venda real gravada no DevTools),
// a nova tentativa sem segunda venda, os erros e o cupom impresso.
// Uso: node desktop/teste-rm-cupom.js
const assert = require("assert");
const { emitirNoRm, normalizar, ErroTemporario, ErroDefinitivo } = require("./rm-cupom");
const { montarHtml } = require("./cupom-impressao");

let ok = 0;
let falhas = 0;
async function caso(nome, fn) {
  try {
    await fn();
    ok++;
    console.log(`  ok  ${nome}`);
  } catch (erro) {
    falhas++;
    console.log(`  FALHOU  ${nome}\n        ${erro && erro.stack ? erro.stack.split("\n").slice(0, 3).join("\n        ") : erro}`);
  }
}

const CONTEXTO = { companyId: "empresa-1", tabelaPrecoId: "tabela-1" };
const PEDIDO = {
  idGarantia: 7,
  status: "NAO_LANCADO",
  vendaUuid: "29f470f8-9dbf-4ec2-9da8-253e04a8fc6b",
  total: 150,
  itens: [
    { nomeRm: "CARCAÇA CANIVETE", quantidade: 1, valorUnitario: 138 },
    { nomeRm: "PILHA CR2032", quantidade: 1, valorUnitario: 12 },
  ],
};

const PRODUTOS = [
  { id: "p-carcaca", descricao: "CARCAÇA", isActive: true },
  { id: "p-canivete", descricao: "CARCAÇA  CANIVETE", isActive: true },
  { id: "p-pilha", descricao: "Pilha CR2032", isActive: true },
  { id: "p-velha", descricao: "PILHA CR2032", isActive: false },
];

/** RM falso: responde como a API real (formato { ok, data }) e guarda os pedidos. */
function rmFalso(opcoes = {}) {
  const pedidos = [];
  let emitirFalhas = opcoes.emitirFalhas || 0;
  const chamar = async (metodo, caminho, corpo) => {
    pedidos.push({ metodo, caminho, corpo });
    if (opcoes.semLogin) return { status: 401, dados: { ok: false } };
    const url = new URL(`https://api.teste${caminho}`);
    if (metodo === "GET" && url.pathname === "/v1/produtos") {
      const q = normalizar(url.searchParams.get("q"));
      const lista = (opcoes.produtos || PRODUTOS).filter((p) => normalizar(p.descricao).includes(q));
      return { status: 200, dados: { ok: true, data: { items: lista, total: lista.length } } };
    }
    if (metodo === "POST" && url.pathname === "/v1/pdv/totais") {
      const total = corpo.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0);
      return { status: 200, dados: { ok: true, data: { valorTotal: opcoes.totalErrado || total } } };
    }
    if (metodo === "POST" && url.pathname === "/v1/pdv/vendas") {
      return { status: 201, dados: { ok: true, data: { id: "venda-1", status: "rascunho", numero: null } } };
    }
    if (metodo === "POST" && url.pathname === "/v1/pdv/vendas/venda-1/emitir") {
      if (emitirFalhas-- > 0) return { status: 0, dados: null };
      return {
        status: 200,
        dados: { ok: true, data: { id: "venda-1", status: "autorizada", numero: 262, chaveAcesso: "35261168244470000134650010000002629148690252" } },
      };
    }
    return { status: 404, dados: { ok: false, message: "rota desconhecida" } };
  };
  return { chamar, pedidos };
}

(async () => {
  console.log("cupom fiscal no RM (RM falso):");

  await caso("emite como o operador: produtos pela palavra, dinheiro, total conferido", async () => {
    const rm = rmFalso();
    const nota = await emitirNoRm(PEDIDO, rm.chamar, CONTEXTO, {});
    assert.deepStrictEqual(nota, { numero: "262", chave: "35261168244470000134650010000002629148690252", status: "autorizada", idVenda: "venda-1" });
    const buscas = rm.pedidos.filter((p) => p.caminho.startsWith("/v1/produtos"));
    assert.ok(buscas.every((b) => !/[?&]q=\d+(&|$)/.test(b.caminho)), "nunca pesquisa por codigo");
    assert.ok(buscas[0].caminho.includes("tabelaPrecoId=tabela-1") && buscas[0].caminho.includes("companyId=empresa-1"));
    const venda = rm.pedidos.find((p) => p.caminho === "/v1/pdv/vendas").corpo;
    assert.strictEqual(venda.vendaUuid, PEDIDO.vendaUuid);
    assert.deepStrictEqual(venda.pagamento, { forma: "avista", meio: "01", parcelas: [] });
    assert.strictEqual(venda.emitir, false);
    assert.strictEqual(venda.totalMostrado, 150);
    // acento, caixa e espaco duplo nao atrapalham; produto inativo e ignorado
    assert.deepStrictEqual(venda.itens.map((i) => [i.produtoId, i.quantidade, i.valorUnitario, i.valorUnitarioBase]),
      [["p-canivete", 1, 138, 138], ["p-pilha", 1, 12, 12]]);
    assert.deepStrictEqual(rm.pedidos.map((p) => p.metodo + " " + p.caminho.split("?")[0]).slice(-3),
      ["POST /v1/pdv/totais", "POST /v1/pdv/vendas", "POST /v1/pdv/vendas/venda-1/emitir"]);
  });

  await caso("nova tentativa depois da falha na emissao nao cria outra venda", async () => {
    const rm = rmFalso({ emitirFalhas: 1 });
    const memoria = {};
    await assert.rejects(emitirNoRm(PEDIDO, rm.chamar, CONTEXTO, memoria), ErroTemporario);
    const nota = await emitirNoRm(PEDIDO, rm.chamar, CONTEXTO, memoria);
    assert.strictEqual(nota.numero, "262");
    assert.strictEqual(rm.pedidos.filter((p) => p.caminho === "/v1/pdv/vendas").length, 1);
  });

  await caso("login vencido = erro temporario (vale reconectar e tentar de novo)", async () => {
    await assert.rejects(emitirNoRm(PEDIDO, rmFalso({ semLogin: true }).chamar, CONTEXTO, {}), ErroTemporario);
    await assert.rejects(emitirNoRm(PEDIDO, rmFalso().chamar, { companyId: null, tabelaPrecoId: null }, {}), ErroTemporario);
  });

  await caso("produto que nao existe ou repetido no RM: nao inventa, pede o cupom manual", async () => {
    const rm = rmFalso({ produtos: [{ id: "x", descricao: "CARCAÇA", isActive: true }] });
    await assert.rejects(emitirNoRm(PEDIDO, rm.chamar, CONTEXTO, {}), (e) => e instanceof ErroDefinitivo && /CARCAÇA CANIVETE/.test(e.message));
    assert.ok(!rm.pedidos.some((p) => p.caminho === "/v1/pdv/vendas"), "nenhuma venda criada");
    const repetido = rmFalso({ produtos: [{ id: "a", descricao: "CARCACA CANIVETE" }, { id: "b", descricao: "Carcaça Canivete" }] });
    await assert.rejects(emitirNoRm(PEDIDO, repetido.chamar, CONTEXTO, {}), ErroDefinitivo);
  });

  await caso("total diferente do da garantia: nao finaliza a venda", async () => {
    const rm = rmFalso({ totalErrado: 999 });
    await assert.rejects(emitirNoRm(PEDIDO, rm.chamar, CONTEXTO, {}), ErroDefinitivo);
    assert.ok(!rm.pedidos.some((p) => p.caminho === "/v1/pdv/vendas"));
  });

  await caso("cupom impresso: dados da nota, QR Code, contingencia e texto do RM sem HTML", () => {
    const html = montarHtml({
      chave: "35261168244470000134650010000002629148690252",
      numero: "262",
      serie: "1",
      dhEmi: "2026-11-16T22:36:51-03:00",
      tpEmis: "9",
      ambiente: "1",
      emitente: { nome: "Loja <script>alert(1)</script>", cnpj: "68244470000134", ie: "161123006111", endereco: "Rua X, 1" },
      itens: [{ codigo: "19", descricao: "CARCACA CANIVETE", quantidade: 1, unidade: "UN", valorUnitario: 120, valorTotal: 120 }],
      valorTotal: 120,
      pagamentos: [{ meio: "01", valor: 120 }],
      troco: 0,
      valorAproxTributos: 41.74,
      qrCode: "https://www.nfce.fazenda.sp.gov.br/qrcode?p=3526",
      urlChave: "https://www.nfce.fazenda.sp.gov.br/consulta",
      logoTermico: "javascript:alert(1)",
    });
    assert.ok(!html.includes("<script>"), "texto do RM nao vira HTML");
    assert.ok(!html.includes("javascript:"), "logo estranho e ignorado");
    assert.ok(html.includes("<svg"), "QR Code");
    assert.ok(html.includes("EMITIDA EM CONTINGÊNCIA"));
    assert.ok(html.includes("3526 1168 2444 7000 0134 6500 1000 0002 6291 4869 0252"));
    assert.ok(html.includes("68.244.470/0001-34"));
    assert.ok(html.includes("Dinheiro") && html.includes("120,00") && html.includes("16/11/2026 22:36:51"));
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
