// Teste do cupom fiscal automatico com um RM FALSO (sem internet, sem nota de verdade).
// Confere o que o sistema manda ao PDV do RM (igual a venda real gravada no DevTools),
// a nova tentativa sem segunda venda, os erros e o cupom impresso.
// Uso: node desktop/teste-rm-cupom.js
const assert = require("assert");
const { emitirNoRm, normalizar, ErroTemporario, ErroDefinitivo } = require("./rm-cupom");

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
        dados: { ok: true, data: { id: "venda-1", status: "autorizada", numero: 262, vendaNumero: 279, chaveAcesso: "35261168244470000134650010000002629148690252" } },
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
    assert.deepStrictEqual(nota, { numero: "262", chave: "35261168244470000134650010000002629148690252", status: "autorizada", idVenda: "venda-1", vendaNumero: 279 });
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

  await caso("o sistema NUNCA desenha nem imprime cupom (regra permanente): so manda a requisicao ao RM", () => {
    const fs = require("fs");
    const path = require("path");
    assert.ok(!fs.existsSync(path.join(__dirname, "cupom-impressao.js")), "sem gerador de cupom no sistema");
    const rmJs = fs.readFileSync(path.join(__dirname, "rm.js"), "utf8");
    assert.ok(!/montarHtml|data:text\/html|qrcode/i.test(rmJs), "rm.js nao monta cupom (so imprime a pagina do proprio RM)");
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
