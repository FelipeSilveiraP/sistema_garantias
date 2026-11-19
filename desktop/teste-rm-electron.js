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
// atraso na pesquisa de produtos (para dar tempo de apertar CANCELAR no meio)
let atrasoProdutos = 0;
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
        // como o PDV do RM: botao "Ultimas vendas" abre a lista com o botao CUPOM de cada venda,
        // que pede os dados do cupom ao RM e abre a impressao (aqui: so dispara o afterprint)
        const ultimas = document.createElement("button");
        ultimas.textContent = " Últimas vendas";
        // o "navegador": window.print() abre a janela de impressao (aqui, so marca que abriu)
        window.print = () => { window.__dialogoImpressao = "aberto"; };
        ultimas.onclick = () => {
          const cupom = document.createElement("button");
          cupom.setAttribute("aria-label", "Cupom: item 1 — venda #279");
          cupom.textContent = "Cupom";
          // como o RM: pede os dados, monta o cupom DELE na pagina e chama a impressao
          cupom.onclick = () => fetch(API + "/v1/pdv/vendas/venda-x/cupom-dados", { headers: h }).then(() => {
            const papel = document.createElement("div");
            papel.id = "cupom-do-rm";
            papel.textContent = "CUPOM MONTADO PELO RM";
            document.body.appendChild(papel);
            setTimeout(() => { window.print(); papel.remove(); }, 0);
          });
          document.body.appendChild(cupom);
        };
        document.body.appendChild(ultimas);
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
        setTimeout(() => responder(200, { items: produtos.filter((p) => p.descricao.includes(q)) }), atrasoProdutos);
        return undefined;
      }
      const b = corpo ? JSON.parse(corpo) : {};
      if (url.pathname === "/v1/pdv/totais") {
        return responder(200, { valorTotal: b.itens.reduce((s, i) => s + i.quantidade * i.valorUnitario, 0) });
      }
      if (url.pathname === "/v1/pdv/vendas") return responder(201, { id: "venda-" + b.vendaUuid.slice(0, 8), status: "rascunho" });
      const m = /^\/v1\/pdv\/vendas\/([^/]+)\/(emitir|cupom-dados)$/.exec(url.pathname);
      if (m && m[2] === "emitir") {
        return responder(200, { id: m[1], status: "autorizada", numero: 262, vendaNumero: 279, chaveAcesso: "35261168244470000134650010000002629148690252" });
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
  const situacoes = [];
  let apertos = 0;
  const { criarRm } = require("./rm");
  let encerrando = false;
  const rm = criarRm({
    registrarLog: (nivel, msg) => { if (process.env.DEBUG_RM) console.log(nivel, msg); },
    backend: () => ({ porta: backend.porta, token: backend.token }),
    avisar: (a) => avisos.push(a),
    encerrando: () => encerrando,
    aoMudar: (situacao) => situacoes.push(situacao),
    // no teste: "apertar IMPRIMIR" na janela de impressao do navegador falso
    apertarImprimir: async () => {
      const w = janelaRm();
      const abriu = await ate(async () => (await w.webContents.executeJavaScript("window.__dialogoImpressao === 'aberto'")) === true, 10000);
      if (!abriu) return false;
      apertos++;
      await w.webContents.executeJavaScript("window.__dialogoImpressao = 'impresso'; window.dispatchEvent(new Event('afterprint')); true");
      return true;
    },
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
    teste("impressao PELO RM: abre ULTIMAS VENDAS e aperta o CUPOM da venda #279 (o RM pede o cupom-dados)",
      await ate(() => registro.some((r) => r.caminho.endsWith("/cupom-dados")), 15000), JSON.stringify(registro.map((r) => r.caminho).slice(-4)));
    teste("o RM abre a janela de impressao do navegador e o sistema so aperta IMPRIMIR",
      await ate(() => apertos === 1, 15000), String(apertos));
    teste("o sistema nao monta cupom nem imprime por conta propria: so existe a janela do RM, nenhum arquivo",
      !fs.existsSync(PASTA_PDF) && BrowserWindow.getAllWindows().every((w) => w.webContents.getURL().startsWith(process.env.FINDESK_RM_APP)));
    teste("depois de imprimir a janela do RM some de novo", await ate(() => !janelaRm().isVisible(), 10000));
    teste("a janela do RM tem o titulo fixo (para achar a janela de impressao)", janelaRm().getTitle() === "RM SOFTWARE - SISTEMA DE GARANTIAS", janelaRm().getTitle());
    const prefs = JSON.parse(fs.readFileSync(path.join(app.getPath("userData"), "Partitions", "rm", "Preferences"), "utf8"));
    teste("navegador do RM lembra a Daruma DR700 como impressora",
      JSON.parse(prefs.printing.print_preview_sticky_settings.appState).recentDestinations[0].id === "Daruma DR700");
    teste("tudo certo: nenhum pop-up de problema", avisos.length === 0, JSON.stringify(avisos));
    teste("pop-up da automacao: mostra as etapas ate a impressao",
      ["conectando", "produtos", "total", "venda", "emitindo", "emitida", "imprimindo"].every((e) => situacoes.some((x) => x.etapa === e)), JSON.stringify(situacoes.map((x) => x.etapa)));

    // 4) mandar de novo a mesma garantia nao cria outra venda
    rm.emitir(g1.id);
    await esperar(1500);
    teste("garantia ja lançada nao emite de novo", registro.filter((r) => r.caminho === "/v1/pdv/vendas").length === 1);

    // 4b) FREIO DE SEGURANCA: mais de 3 NFC-e em 5 minutos -> o 4o nao sai e tudo para
    const vendas = () => registro.filter((r) => r.caminho.endsWith("/emitir")).length;
    const status = async (g) => (await api("GET", `/api/garantias/${g.id}`)).cupomStatus;
    const g4 = await nova("120.00", [{ idServico: carcaca.id, quantidade: 1 }]);
    const g5 = await nova("120.00", [{ idServico: carcaca.id, quantidade: 1 }]);
    const g6 = await nova("120.00", [{ idServico: carcaca.id, quantidade: 1 }]);
    avisos.length = 0;
    situacoes.length = 0;
    rm.emitir(g4.id);
    rm.emitir(g5.id);
    rm.emitir(g6.id);
    teste("painel do cupom: mostra a garantia saindo e a fila", await ate(() => situacoes.some((x) => x.emitindo === g4.id && x.naFila >= 1), 5000),
      JSON.stringify(situacoes.slice(0, 4)));
    const freou = await ate(() => avisos.some((a) => a.titulo === "FREIO DE SEGURANÇA: CUPOM PARADO"), 30000);
    teste("freio: 3 cupons em 5 minutos, o 4o NAO sai e o cupom automatico para", freou && rm.situacao().parado
      && (await status(g4)) === "LANCADO" && (await status(g5)) === "LANCADO" && (await status(g6)) === "NAO_LANCADO", JSON.stringify(avisos));
    const emitidasAntes = vendas();
    avisos.length = 0;
    teste("parado: salvar outra garantia NAO emite e avisa CUPOM AUTOMATICO PARADO",
      rm.emitir(g6.id) === false && avisos.some((a) => a.titulo === "CUPOM AUTOMÁTICO PARADO") && vendas() === emitidasAntes);

    // LIGAR DE NOVO: volta a emitir (contagem do freio zerada)
    rm.retomar();
    rm.emitir(g6.id);
    teste("LIGAR DE NOVO: o cupom volta a sair", await ate(async () => (await status(g6)) === "LANCADO", 30000) && !rm.situacao().parado);

    // PARAR TUDO com cupons na fila: nenhum sai, um aviso so com as garantias sem cupom
    const g7 = await nova("120.00", [{ idServico: carcaca.id, quantidade: 1 }]);
    const g8 = await nova("120.00", [{ idServico: carcaca.id, quantidade: 1 }]);
    avisos.length = 0;
    const antesParar = vendas();
    rm.emitir(g7.id);
    rm.emitir(g8.id);
    const parou = rm.parar();
    teste("PARAR TUDO: nenhum cupom da fila sai e um aviso lista as garantias sem cupom",
      await ate(() => avisos.some((a) => a.titulo === "CUPONS NÃO EMITIDOS (PARADO)"), 15000) && vendas() === antesParar
        && (await status(g7)) === "NAO_LANCADO" && (await status(g8)) === "NAO_LANCADO" && rm.situacao().parado && rm.situacao().naFila === 0,
      JSON.stringify({ parou, avisos, vendas: vendas() - antesParar }));
    rm.retomar();

    // CANCELAR no meio (procurando os produtos): nada vai ao RM e a garantia fica NAO LANCADO
    const g9 = await nova("120.00", [{ idServico: carcaca.id, quantidade: 1 }]);
    avisos.length = 0;
    situacoes.length = 0;
    atrasoProdutos = 1500;
    const vendasAntes = registro.filter((r) => r.caminho === "/v1/pdv/vendas").length;
    rm.emitir(g9.id);
    await ate(() => situacoes.some((x) => x.etapa === "produtos"), 15000);
    const cancelou = rm.cancelar();
    const avisouCancel = await ate(() => avisos.some((a) => a.titulo === "CUPOM CANCELADO"), 15000);
    atrasoProdutos = 0;
    teste("CANCELAR no meio: nenhuma venda no RM, garantia NAO LANÇADO, aviso CUPOM CANCELADO",
      avisouCancel && cancelou && cancelou.jaEnviado === false && registro.filter((r) => r.caminho === "/v1/pdv/vendas").length === vendasAntes
        && (await status(g9)) === "NAO_LANCADO" && !rm.situacao().parado, JSON.stringify({ cancelou, avisos }));
    // depois do CANCELAR, a proxima garantia sai normalmente (nao fica parado)
    rm.emitir(g9.id);
    teste("depois do CANCELAR o cupom seguinte sai normalmente", await ate(async () => (await status(g9)) === "LANCADO", 30000));
    rm.retomar(); // zera o freio para o resto do teste

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
