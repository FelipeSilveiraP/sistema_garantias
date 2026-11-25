// Teste do cupom fiscal automatico com um RM FALSO (sem internet, sem nota de verdade).
// Confere o que o sistema manda ao PDV do RM (igual a venda real gravada no DevTools),
// a nova tentativa sem segunda venda, os erros e o cupom impresso.
// Uso: node desktop/teste-rm-cupom.js
const assert = require("assert");
const { emitirNoRm, normalizar, escolherDoCarro, ErroTemporario, ErroDefinitivo } = require("./rm-cupom");

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

  // ----- produto do CARRO (pedido 2026-11-25): nomes como os cadastrados no RM da loja -----
  const CATALOGO = [
    { id: "c-generico", descricao: "CARCAÇA CANIVETE", isActive: true },
    { id: "c-controle-fiat", descricao: "CARCAÇA CONTROLE FIAT AZUL", isActive: true },
    { id: "c-palio", descricao: "CHAVE CANIVETE FIAT PALIO / UNO E IDEA", isActive: true },
    { id: "c-gol-seca", descricao: "CHAVE CANIVETE SECA VW GOL G5 G6 SEM BOTOES", isActive: true },
    { id: "c-gol-oca", descricao: "CHAVE CANIVETE OCA VW GOL G5 / POLO 03 BOTOES", isActive: true },
    { id: "c-saveiro", descricao: "CARCAÇA CANIVETE SAVEIRO", isActive: true },
    { id: "c-onix", descricao: "CANIVETE CHEVROLET CRUZE E ONIX 3 BOTÕES COM PARAFUSO OCO", isActive: true },
    { id: "c-golf", descricao: "CANIVETE VW GOLF", isActive: true },
    { id: "pilha", descricao: "PILHA CR2032", isActive: true },
  ];
  const doCarro = (marca, modelo, nomeRm = "CARCAÇA CANIVETE") => (escolherDoCarro(CATALOGO, nomeRm, marca, modelo) || {}).id;
  await caso("carro: ONIX (Chevrolet) -> o canivete escrito CHEVROLET/ONIX", async () => {
    assert.strictEqual(doCarro("CHEVROLET", "ONIX"), "c-onix");
    assert.strictEqual(doCarro("CHEVROLET", "CRUZE"), "c-onix");
    assert.strictEqual(doCarro("CHEVROLET", "SPIN"), "c-onix"); // sem o modelo: o primeiro da marca
  });
  await caso("carro: modelo escrito no nome ganha (SAVEIRO), senao o primeiro da marca", async () => {
    assert.strictEqual(doCarro("VOLKSWAGEN", "SAVEIRO"), "c-saveiro");
    assert.strictEqual(doCarro("VOLKSWAGEN", "GOL"), "c-gol-seca"); // GOL nao confunde com GOLF
    assert.strictEqual(doCarro("VOLKSWAGEN", "POLO"), "c-gol-oca");
    assert.strictEqual(doCarro("VOLKSWAGEN", "JETTA"), "c-gol-seca"); // VW sem o modelo: o primeiro
    assert.strictEqual(doCarro("FIAT", "PALIO"), "c-palio");
  });
  await caso("carro: marca sem produto proprio -> null (o cupom usa o NOME NO RM de sempre)", async () => {
    assert.strictEqual(doCarro("TOYOTA", "COROLA"), undefined);
    assert.strictEqual(doCarro(null, null), undefined);
    // a palavra do produto tem de bater: BOLACHA de um ONIX nao vira canivete
    assert.strictEqual(doCarro("CHEVROLET", "ONIX", "BOLACHA"), undefined);
  });
  await caso("venda no RM sai com o canivete do carro; a PILHA (peca) continua a de sempre", async () => {
    const rm = rmFalso({ produtos: CATALOGO });
    const pedido = { ...PEDIDO, marca: "CHEVROLET", modelo: "ONIX", itens: [
      { nomeRm: "CARCAÇA CANIVETE", quantidade: 1, valorUnitario: 138, peca: false },
      { nomeRm: "PILHA CR2032", quantidade: 1, valorUnitario: 12, peca: true },
    ] };
    await emitirNoRm(pedido, rm.chamar, CONTEXTO, {});
    const venda = rm.pedidos.find((x) => x.caminho === "/v1/pdv/vendas");
    assert.deepStrictEqual(venda.corpo.itens.map((i) => i.produtoId), ["c-onix", "pilha"]);
    assert.strictEqual(venda.corpo.totalMostrado, 150);
  });
  await caso("venda de carro sem produto proprio: usa o NOME NO RM (como antes)", async () => {
    const rm = rmFalso({ produtos: CATALOGO });
    await emitirNoRm({ ...PEDIDO, marca: "TOYOTA", modelo: "HILUX", itens: [{ nomeRm: "CARCAÇA CANIVETE", quantidade: 1, valorUnitario: 150 }], total: 150 }, rm.chamar, CONTEXTO, {});
    const venda = rm.pedidos.find((x) => x.caminho === "/v1/pdv/vendas");
    assert.deepStrictEqual(venda.corpo.itens.map((i) => i.produtoId), ["c-generico"]);
  });

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

  await caso("impressora lembrada pelo navegador do RM = Daruma DR700 (sem margens, sem cabecalho), sem apagar o resto", () => {
    const fs = require("fs");
    const os = require("os");
    const path = require("path");
    const { lembrarImpressoraDoCupom } = require("./impressora-navegador");
    const pasta = fs.mkdtempSync(path.join(os.tmpdir(), "prefs-rm-"));
    fs.writeFileSync(path.join(pasta, "Preferences"), JSON.stringify({ outra: { coisa: 1 }, printing: { x: 2 } }));
    assert.ok(lembrarImpressoraDoCupom(pasta));
    const prefs = JSON.parse(fs.readFileSync(path.join(pasta, "Preferences"), "utf8"));
    const estado = JSON.parse(prefs.printing.print_preview_sticky_settings.appState);
    assert.strictEqual(estado.recentDestinations[0].id, "Daruma DR700");
    assert.strictEqual(estado.marginsType, 1);
    assert.strictEqual(estado.isHeaderFooterEnabled, false);
    assert.deepStrictEqual(prefs.outra, { coisa: 1 });
    assert.strictEqual(prefs.printing.x, 2);
    fs.rmSync(pasta, { recursive: true, force: true });
  });

  await caso("impressora do cupom: Daruma DR700 por padrao; no PC de desenvolvimento, Microsoft Print to PDF (so o nome exato)", () => {
    const { escolherImpressora } = require("./impressora-navegador");
    const lista = [{ name: "Brother DCP-1610NW series" }, { name: "Daruma DR700" }, { name: "Microsoft Print to PDF" }, { name: "Fax" }];
    assert.strictEqual(escolherImpressora(lista).name, "Daruma DR700");
    assert.strictEqual(escolherImpressora(lista, "microsoft print to pdf").name, "Microsoft Print to PDF");
    assert.strictEqual(escolherImpressora(lista, "Impressora que nao existe"), null);
    // nunca cai na Brother nem em outra por engano
    assert.strictEqual(escolherImpressora([{ name: "Brother DCP-1610NW series" }]), null);
    assert.strictEqual(escolherImpressora([{ name: "Daruma DR700 (Copiar 1)" }]).name, "Daruma DR700 (Copiar 1)");
    assert.strictEqual(escolherImpressora([{ name: "Daruma DR700" }], "Microsoft Print to PDF"), null);
  });

  await caso("modo quiosque imprime como o Chrome: folha DA IMPRESSORA (bobina), sem margens, escala 100, sem fundo", () => {
    const fs = require("fs");
    const path = require("path");
    const { opcoesImpressaoCupom, estadoImpressao } = require("./impressora-navegador");
    const o = opcoesImpressaoCupom("Daruma DR700");
    assert.strictEqual(o.silent, true);
    assert.strictEqual(o.deviceName, "Daruma DR700");
    // sem isto o Electron imprime em A4 e o cupom do RM sai com outro formato na termica
    assert.strictEqual(o.usePrinterDefaultPageSize, true);
    assert.ok(!("pageSize" in o), "nunca forcar tamanho de pagina: o cupom do RM usa a folha do driver");
    assert.ok(!("dpi" in o), "DPI = o da impressora (igual ao Chrome)");
    assert.deepStrictEqual(o.margins, { marginType: "none" });
    assert.strictEqual(o.scaleFactor, 100);
    // mesmas escolhas da janela de impressao do Chrome (estadoImpressao)
    const chrome = estadoImpressao("Daruma DR700");
    assert.strictEqual(o.printBackground, chrome.isCssBackgroundEnabled);
    assert.strictEqual(String(o.scaleFactor), chrome.scaling);
    const rmJs = fs.readFileSync(path.join(__dirname, "rm.js"), "utf8");
    assert.ok(/webContents\.print\(\s*opcoesImpressaoCupom\(/.test(rmJs), "rm.js usa as opcoes do Chrome");
  });

  await caso("falha de rede vira frase que a loja entende (motivo do 'RM fora do ar')", () => {
    const { traduzirFalhaDeRede: t } = require("./rm-rede");
    assert.match(t({ origem: "pagina", erro: "ERR_INTERNET_DISCONNECTED" }), /sem internet/);
    assert.match(t({ origem: "api", erro: "net::ERR_NAME_NOT_RESOLVED" }), /servidor do RM.*DNS/);
    assert.match(t({ origem: "pagina", erro: "ERR_CONNECTION_TIMED_OUT" }), /site do RM.*demorou/);
    assert.match(t({ origem: "api", erro: "net::ERR_CERT_DATE_INVALID" }), /data e a hora do Windows/);
    assert.match(t({ origem: "api", erro: "net::ERR_PROXY_CONNECTION_FAILED" }), /proxy/);
    assert.match(t({ origem: "api", status: 503 }), /erro 503/);
    assert.match(t(null), /30 segundos/);
    assert.match(t({ origem: "api", erro: "net::ERR_ESTRANHO" }), /ERR_ESTRANHO/);
  });

  await caso("o sistema NUNCA desenha nem imprime cupom (regra permanente): so manda a requisicao ao RM", () => {
    const fs = require("fs");
    const path = require("path");
    assert.ok(!fs.existsSync(path.join(__dirname, "cupom-impressao.js")), "sem gerador de cupom no sistema");
    const rmJs = fs.readFileSync(path.join(__dirname, "rm.js"), "utf8");
    assert.ok(!/montarHtml|data:text\/html|qrcode/i.test(rmJs), "rm.js nao monta cupom");
    // modo quiosque: so imprime a pagina do RM DEPOIS de o proprio RM pedir a impressao
    assert.ok(/window\.print = \(\) =>/.test(rmJs) && /__garantiasImpressao === "pronto"/.test(rmJs), "imprime so quando o RM pede");
  });

  console.log(`\n${ok} ok, ${falhas} falha(s)`);
  process.exit(falhas ? 1 : 0);
})();
