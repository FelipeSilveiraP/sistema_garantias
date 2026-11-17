// Teste de ponta a ponta do cupom fiscal automatico com um RM FALSO (sem internet e
// sem nota de verdade): janela escondida do RM, login pela pagina do RM, emissao depois
// de salvar a garantia, NFC-e registrada, cupom "impresso" em PDF, RM fora do ar.
// Uso: npx electron desktop/teste-rm-electron.js   (no Linux: xvfb-run -a npx electron ...)
const { app, BrowserWindow } = require("electron");
const { spawn } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const net = require("net");
const os = require("os");
const path = require("path");

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "garantias-rm-"));
const PASTA_PDF = path.join(PASTA, "cupons");
const JAR = path.join(__dirname, "..", "backend", "target", "garantias-backend-0.1.0.jar");
const TOKEN_RM = "cracha-de-teste";
let resultados = 0;
let falhas = 0;

function teste(nome, ok, detalhe = "") {
  resultados++;
  if (!ok) falhas++;
  console.log(`${ok ? "[OK]    " : "[FALHA]"} ${nome}${detalhe ? " — " + detalhe : ""}`);
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

async function ate(condicao, ms = 20000) {
  const inicio = Date.now();
  while (Date.now() - inicio < ms) {
    if (await condicao()) return true;
    await esperar(200);
  }
  return false;
}

function portaLivre() {
  return new Promise((resolver) => {
    const s = net.createServer();
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolver(p));
    });
  });
}

// ---------- RM falso: pagina (app) e API em portas diferentes, como o real ----------
function paginaRm(portaApi) {
  return `<!doctype html><html><body><script>
    const API = "http://127.0.0.1:${portaApi}";
    const tk = localStorage.getItem("tk");
    if (!tk) {
      if (!location.pathname.startsWith("/login")) history.replaceState(null, "", "/login");
      document.body.textContent = "Entrar no sistema";
    } else {
      const h = { authorization: "Bearer " + tk };
      fetch(API + "/v1/auth/me", { headers: h }).then((r) => {
        if (r.status !== 200) { localStorage.removeItem("tk"); history.replaceState(null, "", "/login"); return; }
        fetch(API + "/v1/notificacoes?companyId=empresa-1", { headers: h });
        fetch(API + "/v1/produtos?pageSize=20&tabelaPrecoId=tabela-1&companyId=empresa-1&mixDoPdv=true", { headers: h });
      }).catch(() => {});
    }
  </script></body></html>`;
}

function servidorApp(portaApi) {
  return http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(paginaRm(portaApi));
  });
}

function servidorApi(origem, registro) {
  const produtos = [
    { id: "p-carcaca", descricao: "CARCAÇA", isActive: true },
    { id: "p-canivete", descricao: "CARCAÇA CANIVETE", isActive: true },
  ];
  return http.createServer((req, res) => {
    const cors = {
      "Access-Control-Allow-Origin": origem,
      "Access-Control-Allow-Headers": "authorization,content-type",
      "Access-Control-Allow-Methods": "GET,POST",
    };
    if (req.method === "OPTIONS") {
      res.writeHead(204, cors);
      res.end();
      return;
    }
    let corpo = "";
    req.on("data", (d) => { corpo += d; });
    req.on("end", () => {
      const url = new URL(req.url, "http://x");
      registro.push({ metodo: req.method, caminho: url.pathname, consulta: url.search, origem: req.headers.origin,
        autorizacao: req.headers.authorization, corpo: corpo ? JSON.parse(corpo) : null });
      const responder = (status, data) => {
        res.writeHead(status, { ...cors, "Content-Type": "application/json" });
        res.end(JSON.stringify(status < 300 ? { ok: true, data } : { ok: false, message: data }));
      };
      if (req.headers.authorization !== `Bearer ${TOKEN_RM}`) return responder(401, "nao autenticado");
      if (url.pathname === "/v1/auth/me") return responder(200, { companies: [{ id: "empresa-1" }] });
      if (url.pathname === "/v1/notificacoes") return responder(200, []);
      if (url.pathname === "/v1/produtos") {
        const q = (url.searchParams.get("q") || "").toUpperCase();
        return responder(200, { items: produtos.filter((p) => p.descricao.includes(q)) });
      }
      const b = corpo ? JSON.parse(corpo) : {};
      if (url.pathname === "/v1/pdv/totais") {
        return responder(200, { valorTotal: b.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0) });
      }
      if (url.pathname === "/v1/pdv/vendas") return responder(201, { id: "venda-" + b.vendaUuid.slice(0, 8), status: "rascunho" });
      const m = /^\/v1\/pdv\/vendas\/([^/]+)\/(emitir|cupom-dados)$/.exec(url.pathname);
      if (m && m[2] === "emitir") {
        return responder(200, { id: m[1], status: "autorizada", numero: 262, chaveAcesso: "35261168244470000134650010000002629148690252" });
      }
      if (m) {
        return responder(200, {
          chave: "35261168244470000134650010000002629148690252", numero: "262", serie: "1", dhEmi: "2026-11-16T22:36:51-03:00",
          ambiente: "1", tpEmis: "1", protocolo: "135260000000001", dhRecbto: "2026-11-16T22:36:52-03:00",
          emitente: { nome: "LOJA TESTE", cnpj: "68244470000134", ie: "1", endereco: "Rua X" },
          itens: [{ codigo: "19", descricao: "CARCACA CANIVETE", quantidade: 1, unidade: "UN", valorUnitario: 120, valorTotal: 120 }],
          valorTotal: 120, pagamentos: [{ meio: "01", valor: 120 }], troco: 0, qrCode: "https://exemplo/qr", urlChave: "https://exemplo",
        });
      }
      return responder(404, "rota desconhecida");
    });
  });
}

// ---------- servidor interno (Spring) com banco temporario ----------
async function subirBackend() {
  const porta = await portaLivre();
  const token = crypto.randomBytes(24).toString("hex");
  const proc = spawn("java", ["-jar", JAR], {
    env: { ...process.env, SERVER_PORT: String(porta), FINDESK_API_TOKEN: token, FINDESK_DB_PATH: path.join(PASTA, "garantias.db") },
    stdio: "ignore",
  });
  const pronto = await ate(async () => {
    try {
      const r = await fetch(`http://127.0.0.1:${porta}/api/status`, { headers: { "X-FinDesk-Token": token } });
      return r.ok && (await r.json()).inicializado === "true";
    } catch {
      return false;
    }
  }, 60000);
  if (!pronto) throw new Error("backend nao subiu");
  return { proc, porta, token };
}

async function principal() {
  const portaApp = await portaLivre();
  const portaApi = await portaLivre();
  process.env.FINDESK_RM_APP = `http://127.0.0.1:${portaApp}`;
  process.env.FINDESK_RM_API = `http://127.0.0.1:${portaApi}`;
  process.env.FINDESK_RM_PDF_DIR = PASTA_PDF;
  process.env.FINDESK_RM_ESPERA_MS = "6000";
  const registro = [];
  const sApp = servidorApp(portaApi).listen(portaApp, "127.0.0.1");
  let sApi = servidorApi(process.env.FINDESK_RM_APP, registro).listen(portaApi, "127.0.0.1");

  const backend = await subirBackend();
  const api = async (metodo, caminho, corpo) => {
    const r = await fetch(`http://127.0.0.1:${backend.porta}${caminho}`, {
      method: metodo,
      headers: { "X-FinDesk-Token": backend.token, "Content-Type": "application/json" },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
    return r.json();
  };
  const avisos = [];
  const { criarRm } = require("./rm");
  let encerrando = false;
  const rm = criarRm({
    registrarLog: (nivel, msg) => { if (process.env.DEBUG_RM) console.log(nivel, msg); },
    backend: () => ({ porta: backend.porta, token: backend.token }),
    avisar: (a) => avisos.push(a),
    encerrando: () => encerrando,
  });
  const janelaRm = () => BrowserWindow.getAllWindows().find((w) => w.webContents.getURL().startsWith(process.env.FINDESK_RM_APP));

  try {
    // 1) primeira vez: sem login no RM -> a janela do RM aparece e o pop-up avisa
    await rm.iniciar();
    teste("sem login: pop-up ENTRE NO RM", avisos.some((a) => a.titulo === "ENTRE NO RM SOFTWARE"), JSON.stringify(avisos.map((a) => a.titulo)));
    teste("sem login: a janela do RM aparece para alguem entrar", Boolean(janelaRm() && janelaRm().isVisible()));

    // 2) alguem entra no RM (na pagina do RM): a janela some sozinha
    await janelaRm().webContents.executeJavaScript(`localStorage.setItem("tk", "${TOKEN_RM}"); location.href = "/app/pdv";`);
    teste("depois do login a janela do RM se esconde", await ate(() => !janelaRm().isVisible(), 10000));

    // 3) garantia salva -> cupom sai sozinho
    const servicos = await api("GET", "/api/servicos");
    const carcaca = servicos.find((s) => s.nome === "TROCA CARCAÇA");
    const nova = (valor, itens) => api("POST", "/api/garantias", {
      dataServico: new Date().toISOString().slice(0, 10), placa: "ABC1D23", semPlaca: false, modelo: "ONIX",
      qtdCarcaca: 0, qtdBotao: 0, qtdPilha: 0, qtdItens: 0, valor, tecnico: "FELIPE", forcar: true, itens,
    });
    const g1 = await nova("120.00", [{ idServico: carcaca.id, quantidade: 1 }]);
    avisos.length = 0;
    rm.emitir(g1.id);
    const lancou = await ate(async () => (await api("GET", `/api/garantias/${g1.id}`)).cupomStatus === "LANCADO", 30000);
    teste("garantia salva vira LANÇADO sozinha", lancou, JSON.stringify(avisos));
    const venda = registro.find((r) => r.caminho === "/v1/pdv/vendas");
    teste("venda mandada pela pagina do RM (mesma origem e cracha do RM)",
      Boolean(venda && venda.origem === process.env.FINDESK_RM_APP && venda.autorizacao === `Bearer ${TOKEN_RM}`));
    teste("venda em dinheiro, produto achado pela palavra, valor da garantia",
      Boolean(venda && venda.corpo.pagamento.meio === "01" && venda.corpo.itens[0].produtoId === "p-canivete"
        && venda.corpo.itens[0].valorUnitario === 120 && venda.corpo.tabelaPrecoId === "tabela-1" && venda.corpo.companyId === "empresa-1"));
    teste("cupom impresso (PDF no teste)", await ate(() => fs.existsSync(path.join(PASTA_PDF, "nfce-262.pdf")), 10000));
    teste("nenhum pop-up quando tudo da certo", avisos.length === 0, JSON.stringify(avisos));

    // 4) mandar de novo a mesma garantia nao cria outra venda
    rm.emitir(g1.id);
    await esperar(1500);
    teste("garantia ja lançada nao emite de novo", registro.filter((r) => r.caminho === "/v1/pdv/vendas").length === 1);

    // 5) produto sem NOME NO RM: pop-up para fazer o cupom manualmente
    const g2 = await nova("80.00", [{ idServico: null, descricao: "CHAVE CODIFICADA", quantidade: 1 }]);
    rm.emitir(g2.id);
    teste("produto sem nome no RM: pop-up FAÇA O CUPOM NO RM",
      await ate(() => avisos.some((a) => a.titulo === "FAÇA O CUPOM NO RM" && /NOME NO RM/.test(a.mensagem)), 10000),
      JSON.stringify(avisos));

    // 6) RM fora do ar: tenta, reconecta, tenta de novo e pede o cupom manual
    avisos.length = 0;
    await new Promise((r) => sApi.close(r));
    sApi.closeAllConnections && sApi.closeAllConnections();
    const g3 = await nova("120.00", [{ idServico: carcaca.id, quantidade: 1 }]);
    rm.emitir(g3.id);
    const avisou = await ate(() => avisos.some((a) => a.titulo === "FAÇA O CUPOM NO RM"), 60000);
    teste("RM fora do ar: depois de 2 tentativas, pop-up FAÇA O CUPOM NO RM com os produtos", avisou
      && avisos[0].itens.some((i) => /CARCAÇA CANIVETE/.test(i)), JSON.stringify(avisos));
    teste("RM fora do ar: garantia continua NAO LANÇADO", (await api("GET", `/api/garantias/${g3.id}`)).cupomStatus === "NAO_LANCADO");
  } finally {
    encerrando = true;
    backend.proc.kill();
    sApp.close();
    if (sApi.listening) sApi.close();
  }
}

app.whenReady().then(async () => {
  try {
    await principal();
  } catch (erro) {
    teste("execucao do teste", false, erro && erro.stack);
  }
  console.log(`\n${resultados - falhas}/${resultados} ok`);
  fs.rmSync(PASTA, { recursive: true, force: true });
  app.exit(falhas ? 1 : 0);
});
app.on("window-all-closed", () => {});
