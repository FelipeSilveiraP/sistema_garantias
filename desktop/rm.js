// Ligacao do Sistema de Garantias com o RM Software (cupom fiscal automatico).
//
// - Uma janela ESCONDIDA abre o PDV do RM (app.rmsoftware.dev.br/app/pdv) numa sessao
//   so dela ("persist:rm"), que guarda o login como o Chrome guarda.
// - O login e feito na propria pagina do RM: o sistema nunca le, guarda ou registra
//   e-mail ou senha. Se o RM pedir login, a janela aparece e o pop-up avisa.
// - O "cracha" (Authorization) que a pagina do RM manda a cada pedido fica so na
//   memoria, para os pedidos do cupom; nunca vai para arquivo ou log.
// - Os pedidos ao RM rodam DENTRO da pagina do RM (fetch na janela escondida): mesma
//   origem, mesmo navegador, o RM ve o mesmo que veria do operador.
const { BrowserWindow, session } = require("electron");
const fs = require("fs");
const path = require("path");
const { emitirNoRm, ErroDefinitivo, ErroTemporario } = require("./rm-cupom");

const RM_APP = process.env.FINDESK_RM_APP || "https://app.rmsoftware.dev.br";
const RM_API = process.env.FINDESK_RM_API || "https://api.rmsoftware.dev.br";
const PARTICAO = "persist:rm";
const ESPERA_CONEXAO_MS = Number(process.env.FINDESK_RM_ESPERA_MS) || 30000;
const ESPERA_PEDIDO_MS = 30000;
// FREIO DE SEGURANCA (pedido do usuario, 2026-11-19): mais de 3 NFC-e em 5 minutos e
// estranho para a loja; o 4o cupom NAO sai e o cupom automatico para ate alguem religar.
const FREIO_QUANTIDADE = Number(process.env.FINDESK_RM_FREIO) || 3;
const FREIO_JANELA_MS = 5 * 60 * 1000;

/**
 * @param {object} o
 * @param {(nivel: string, msg: string) => void} o.registrarLog
 * @param {() => {porta: number, token: string}} o.backend  servidor interno (Spring)
 * @param {(aviso: object) => void} o.avisar  pop-up na tela do sistema
 * @param {() => boolean} o.encerrando  o sistema esta fechando
 */
/** CANCELAR apertado no pop-up da automacao: nada mais e mandado ao RM. */
class Cancelado extends ErroDefinitivo {}

function criarRm({ registrarLog, backend, avisar, encerrando, aoMudar = () => {}, paradoNoInicio = false }) {
  let janelaRm = null;
  let autorizacao = null;
  const contexto = { companyId: null, tabelaPrecoId: null };
  let estado = "desconectado";
  let esperando = [];
  let fila = Promise.resolve();
  let sessaoPronta = false;
  // PARAR TUDO / freio: nenhum cupom novo sai ate alguem religar (LIGAR DE NOVO)
  let parado = paradoNoInicio;
  let emitindo = null;
  let naFila = 0;
  let pulados = [];
  let emitidas = [];
  // CANCELAR do pop-up da automacao: o cupom atual e os da fila nao saem
  let cancelarFila = false;
  // etapa do cupom atual (pop-up da automacao): conectando, produtos, total, venda, emitindo, emitida
  let etapa = null;

  /** Situacao do cupom para a tela (pop-up da automacao e painel de parado). */
  function situacao() {
    return { parado, emitindo, naFila, etapa };
  }
  function mudarEtapa(nova) {
    if (etapa === nova) return;
    etapa = nova;
    publicar();
  }
  function publicar() {
    try {
      aoMudar(situacao());
    } catch {
      // a tela pode estar trocando de pagina
    }
  }

  function definirEstado(novo) {
    if (estado === novo) return;
    estado = novo;
    registrarLog("INFO", `[rm] estado: ${novo}`);
    if (!janelaRm || janelaRm.isDestroyed()) return;
    if (novo === "login") {
      // a pagina do RM pede e-mail e senha: a janela aparece para alguem entrar
      janelaRm.show();
      janelaRm.focus();
    } else if (novo === "conectado" && janelaRm.isVisible()) {
      janelaRm.hide();
    }
    if (novo !== "conectando") esperando.splice(0).forEach((f) => f(novo));
  }

  function prepararSessao() {
    if (sessaoPronta) return;
    sessaoPronta = true;
    const ses = session.fromPartition(PARTICAO);
    ses.webRequest.onBeforeSendHeaders((det, responder) => {
      if (det.url.startsWith(RM_API)) {
        for (const [nome, valor] of Object.entries(det.requestHeaders)) {
          if (nome.toLowerCase() === "authorization" && valor) autorizacao = valor;
        }
        try {
          const p = new URL(det.url).searchParams;
          if (p.get("companyId")) contexto.companyId = p.get("companyId");
          if (p.get("tabelaPrecoId")) contexto.tabelaPrecoId = p.get("tabelaPrecoId");
        } catch {
          // endereco estranho: ignora
        }
      }
      responder({ requestHeaders: det.requestHeaders });
    });
    ses.webRequest.onCompleted((det) => {
      if (det.method !== "GET" || !det.url.startsWith(`${RM_API}/v1/auth/me`)) return;
      if (det.statusCode === 200) definirEstado("conectado");
      else if (det.statusCode === 401 || det.statusCode === 403) definirEstado("login");
    });
  }

  function criarJanela() {
    if (janelaRm && !janelaRm.isDestroyed()) return;
    prepararSessao();
    janelaRm = new BrowserWindow({
      width: 520,
      height: 720,
      show: false,
      center: true,
      title: "RM Software — entre para o cupom fiscal sair sozinho",
      autoHideMenuBar: true,
      webPreferences: {
        partition: PARTICAO,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    janelaRm.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    // so paginas do proprio RM
    janelaRm.webContents.on("will-navigate", (evento, url) => {
      if (!url.startsWith(RM_APP)) evento.preventDefault();
    });
    const conferirEndereco = (_evento, url) => {
      try {
        if (!new URL(url).pathname.startsWith("/app")) definirEstado("login");
      } catch {
        // ignora
      }
    };
    janelaRm.webContents.on("did-navigate", conferirEndereco);
    janelaRm.webContents.on("did-navigate-in-page", conferirEndereco);
    janelaRm.webContents.on("did-fail-load", (_evento, codigo, _descricao, _url, principal) => {
      if (principal && codigo !== -3) definirEstado("fora");
    });
    // fechar a janela do RM so a esconde (o login continua guardado)
    janelaRm.on("close", (evento) => {
      if (!encerrando()) {
        evento.preventDefault();
        janelaRm.hide();
      }
    });
  }

  function aguardarEstado() {
    if (estado !== "conectando") return Promise.resolve(estado);
    return new Promise((resolver) => {
      const tempo = setTimeout(() => {
        esperando = esperando.filter((f) => f !== fim);
        resolver(estado === "conectando" ? "fora" : estado);
      }, ESPERA_CONEXAO_MS);
      const fim = (novo) => {
        clearTimeout(tempo);
        resolver(novo);
      };
      esperando.push(fim);
    });
  }

  /** Abre (ou recarrega) o PDV do RM escondido e espera: conectado, login ou fora. */
  async function conectar(recarregar = false) {
    criarJanela();
    if (!recarregar && estado === "conectado" && autorizacao && contexto.tabelaPrecoId) return "conectado";
    // alguem esta entrando no RM na janela: nao recarrega por cima
    if (estado === "login" && janelaRm.isVisible()) return "login";
    autorizacao = null;
    estado = "conectando";
    janelaRm.loadURL(`${RM_APP}/app/pdv`).catch(() => {
      // a falha chega por did-fail-load
    });
    const final = await aguardarEstado();
    if (final === "conectado") {
      // o PDV pede a lista de produtos logo depois: dela vem a tabela de precos
      for (let i = 0; i < 50 && !(autorizacao && contexto.tabelaPrecoId); i++) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (final === "fora") estado = "fora";
    return final;
  }

  /** Pedido ao RM feito pela pagina do RM. Devolve { status, dados } (status 0 = sem resposta). */
  async function chamar(metodo, caminho, corpo) {
    if (!janelaRm || janelaRm.isDestroyed()) return { status: 0, dados: null };
    const cabecalhos = {};
    if (autorizacao) cabecalhos.authorization = autorizacao;
    if (corpo !== undefined) cabecalhos["content-type"] = "application/json";
    const opcoes = { method: metodo, headers: cabecalhos };
    if (corpo !== undefined) opcoes.body = JSON.stringify(corpo);
    const codigo = `(async () => {
      try {
        const r = await fetch(${JSON.stringify(RM_API + caminho)}, ${JSON.stringify(opcoes)});
        return { status: r.status, texto: await r.text() };
      } catch { return { status: 0, texto: "" }; }
    })()`;
    let tempo;
    const resposta = await Promise.race([
      janelaRm.webContents.executeJavaScript(codigo, true).catch(() => ({ status: 0, texto: "" })),
      new Promise((r) => { tempo = setTimeout(() => r({ status: 0, texto: "" }), ESPERA_PEDIDO_MS); }),
    ]);
    clearTimeout(tempo);
    let dados = null;
    try {
      dados = JSON.parse(resposta.texto);
    } catch {
      // resposta sem JSON
    }
    return { status: resposta.status, dados };
  }

  /** Pedido ao servidor interno (Spring). */
  async function servidor(metodo, caminho, corpo) {
    const { porta, token } = backend();
    try {
      const r = await fetch(`http://127.0.0.1:${porta}${caminho}`, {
        method: metodo,
        headers: { "X-FinDesk-Token": token, ...(corpo ? { "Content-Type": "application/json" } : {}) },
        body: corpo ? JSON.stringify(corpo) : undefined,
      });
      let dados = null;
      try {
        dados = await r.json();
      } catch {
        // sem corpo
      }
      return { status: r.status, dados };
    } catch {
      return { status: 0, dados: null };
    }
  }

  function moeda(valor) {
    return `R$ ${Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function avisarManual(idGarantia, motivo, pedido) {
    const itens = pedido && pedido.itens && pedido.itens.length
      ? pedido.itens.map((i) => `${i.quantidade}x ${i.nomeRm} — ${moeda(i.valorUnitario)} cada`)
      : [];
    if (pedido && pedido.total) itens.push(`TOTAL: ${moeda(pedido.total)} (dinheiro)`);
    avisar({
      titulo: "FAÇA O CUPOM NO RM",
      mensagem: `O cupom fiscal da garantia nº ${idGarantia} não saiu sozinho (${motivo}). `
        + "A garantia está salva. Faça o cupom manualmente no PDV do RM e depois marque LANÇADO em PESQUISAR GARANTIA.",
      itens,
      tom: "erro",
    });
  }

  async function processar(idGarantia) {
    const lido = await servidor("GET", `/api/garantias/${idGarantia}/cupom-rm`);
    if (lido.status !== 200 || !lido.dados) {
      const motivo = lido.dados && lido.dados.campos && lido.dados.campos.cupom;
      registrarLog("WARN", `[rm] garantia ${idGarantia}: pedido do cupom recusado (${lido.status})`);
      avisarManual(idGarantia, String(motivo || "não foi possível ler a garantia").replace(/\.$/, ""), null);
      return;
    }
    const pedido = lido.dados;
    if (pedido.status !== "NAO_LANCADO") return;

    // freio: cupons demais em pouco tempo = algo errado; para tudo antes de emitir outro
    const agora = Date.now();
    emitidas = emitidas.filter((t) => agora - t < FREIO_JANELA_MS);
    if (emitidas.length >= FREIO_QUANTIDADE) {
      registrarLog("WARN", `[rm] FREIO: ${emitidas.length} cupons em 5 minutos; garantia ${idGarantia} nao emitida e cupom automatico parado`);
      parado = true;
      publicar();
      avisar({
        titulo: "FREIO DE SEGURANÇA: CUPOM PARADO",
        mensagem: `Saíram ${emitidas.length} cupons fiscais em menos de 5 minutos e o sistema parou o cupom automático `
          + `por segurança. O cupom da garantia nº ${idGarantia} NÃO foi emitido. Confira no RM em ÚLTIMAS VENDAS. `
          + "Se estiver tudo certo, clique em LIGAR DE NOVO no painel do cupom (canto de baixo, à esquerda).",
        tom: "erro",
      });
      return;
    }

    const memoria = {};
    let nota = null;
    // cada pedido ao RM passa por aqui: mostra a etapa no pop-up e respeita o CANCELAR
    // (que so vale ANTES de mandar emitir a NFC-e)
    const chamarComEtapas = (metodo, caminho, corpo) => {
      if (cancelarFila || parado) return Promise.reject(new Cancelado("cancelado"));
      if (caminho.startsWith("/v1/produtos")) mudarEtapa("produtos");
      else if (caminho === "/v1/pdv/totais") mudarEtapa("total");
      else if (caminho === "/v1/pdv/vendas") mudarEtapa("venda");
      else if (caminho.endsWith("/emitir")) mudarEtapa("emitindo");
      return chamar(metodo, caminho, corpo);
    };
    let ultimoErro = null;
    // 1a tentativa; se falhar por conexao/login, reconecta e tenta mais UMA vez
    for (let tentativa = 1; tentativa <= 2 && !nota; tentativa++) {
      // PARAR TUDO apertado enquanto conectava: nao manda nada ao RM
      if (parado || cancelarFila) {
        pulados.push(idGarantia);
        return;
      }
      try {
        mudarEtapa("conectando");
        const situacao = await conectar(tentativa > 1);
        // login: outra tentativa nao resolve (a janela do RM abriu para alguem entrar)
        if (situacao === "login") throw new ErroDefinitivo("o RM pediu para entrar de novo; entre na janela do RM que abriu");
        if (situacao !== "conectado") throw new ErroTemporario("sem conexão com o RM");
        nota = await emitirNoRm(pedido, chamarComEtapas, contexto, memoria);
      } catch (erro) {
        ultimoErro = erro;
        registrarLog("WARN", `[rm] garantia ${idGarantia}: tentativa ${tentativa} falhou: ${erro && erro.message}`);
        if (erro instanceof ErroDefinitivo) break;
      }
    }
    if (!nota && ultimoErro instanceof Cancelado) {
      registrarLog("INFO", `[rm] garantia ${idGarantia}: cupom CANCELADO pelo operador antes de emitir`);
      avisar({
        titulo: "CUPOM CANCELADO",
        mensagem: `A automação do cupom da garantia nº ${idGarantia} foi cancelada: nenhuma NFC-e foi emitida. `
          + "A garantia está salva como NÃO LANÇADO. Se precisar, faça o cupom no PDV do RM e marque LANÇADO em PESQUISAR GARANTIA.",
        tom: "atencao",
      });
      return;
    }
    if (!nota) {
      avisarManual(idGarantia, ((ultimoErro && ultimoErro.message) || "erro desconhecido").replace(/\.$/, ""), pedido);
      return;
    }
    emitidas.push(Date.now());
    mudarEtapa("emitida");
    registrarLog("INFO", `[rm] garantia ${idGarantia}: NFC-e ${nota.numero} emitida (${nota.status})`);

    const gravado = await servidor("POST", `/api/garantias/${idGarantia}/cupom-rm/emitido`, { nfce: nota.numero, chave: nota.chave });
    if (gravado.status !== 200) {
      avisar({
        titulo: "CUPOM EMITIDO — MARQUE NA GARANTIA",
        mensagem: `A NFC-e nº ${nota.numero} da garantia nº ${idGarantia} foi emitida no RM, mas o sistema não conseguiu `
          + "marcar a garantia. Marque LANÇADO em PESQUISAR GARANTIA. NÃO emita o cupom de novo.",
        tom: "atencao",
      });
    }
    // REGRA PERMANENTE (usuario, 2026-11-19): o sistema NUNCA desenha nem imprime nota ou
    // cupom fiscal. So manda a requisicao ao RM; o documento e a impressao sao do RM.
    avisar({
      titulo: "CUPOM FISCAL EMITIDO",
      mensagem: `NFC-e nº ${nota.numero} da garantia nº ${idGarantia} emitida pelo RM e garantia marcada LANÇADO. `
        + "Imprima pelo RM em ÚLTIMAS VENDAS. NÃO emita de novo.",
      tom: "sucesso",
    });
  }

  return {
    situacao,
    /** PARAR TUDO: nenhum cupom novo sai; os da fila ficam NAO LANCADO. */
    parar(motivo = "botão PARAR TUDO") {
      const estava = emitindo;
      parado = true;
      registrarLog("WARN", `[rm] cupom automatico PARADO (${motivo})${estava ? `; garantia ${estava} estava em andamento` : ""}`);
      publicar();
      return { emAndamento: estava };
    },
    /** CANCELAR (pop-up da automacao): o cupom atual e os da fila nao saem; os proximos saem normalmente. */
    cancelar() {
      if (!emitindo && naFila === 0) return null;
      const jaEnviado = etapa === "emitindo" || etapa === "emitida";
      cancelarFila = true;
      registrarLog("WARN", `[rm] CANCELAR apertado (garantia ${emitindo || "-"}, etapa ${etapa || "-"}, ${naFila} na fila)`);
      publicar();
      return { garantia: emitindo, jaEnviado };
    },
    /** LIGAR DE NOVO: volta a emitir (e zera a contagem do freio). */
    retomar() {
      parado = false;
      emitidas = [];
      registrarLog("INFO", "[rm] cupom automatico LIGADO de novo");
      publicar();
    },
    /** Ao abrir o sistema: conecta escondido e so avisa se houver problema. */
    async iniciar() {
      if (parado) return; // desligado: nem conecta (liga ao clicar em LIGAR DE NOVO)
      const situacao = await conectar();
      if (situacao === "login") {
        avisar({
          titulo: "ENTRE NO RM SOFTWARE",
          mensagem: "A janela do RM abriu. Entre com o e-mail e a senha da loja (só desta vez): "
            + "depois disso o cupom fiscal de cada garantia sai sozinho.",
          tom: "atencao",
        });
      } else if (situacao === "fora") {
        avisar({
          titulo: "RM SOFTWARE FORA DO AR",
          mensagem: "Não foi possível conectar ao RM (sem internet ou o RM está fora do ar). O sistema tenta de novo "
            + "a cada garantia; se não conseguir, avisa para fazer o cupom manualmente.",
          tom: "erro",
        });
      }
    },
    /** Depois de salvar a garantia: emite em segundo plano, uma por vez. */
    emitir(idGarantia) {
      const id = Number(idGarantia);
      if (!Number.isInteger(id) || id <= 0) return false;
      if (parado) {
        avisar({
          titulo: "CUPOM AUTOMÁTICO PARADO",
          mensagem: `O cupom automático está parado: o cupom da garantia nº ${id} NÃO foi emitido. `
            + "Faça o cupom no PDV do RM e marque LANÇADO em PESQUISAR GARANTIA, ou clique em LIGAR DE NOVO no painel do cupom.",
          tom: "atencao",
        });
        return false;
      }
      naFila++;
      publicar();
      fila = fila.then(async () => {
        naFila--;
        if (parado || cancelarFila) {
          pulados.push(id);
        } else {
          emitindo = id;
          publicar();
          try {
            await processar(id);
          } finally {
            emitindo = null;
            etapa = null;
          }
        }
        if (naFila === 0) cancelarFila = false;
        publicar();
        // terminou a fila depois de um PARAR: um aviso so, com as garantias sem cupom
        if (naFila === 0 && pulados.length) {
          const lista = pulados.splice(0);
          avisar({
            titulo: parado ? "CUPONS NÃO EMITIDOS (PARADO)" : "CUPONS CANCELADOS",
            mensagem: `${parado ? "Com o cupom automático parado" : "Com a automação cancelada"}, estas garantias ficaram SEM cupom (NÃO LANÇADO): nº ${lista.join(", nº ")}. `
              + "Faça no PDV do RM e marque LANÇADO em PESQUISAR GARANTIA.",
            tom: "atencao",
          });
        }
      }).catch((erro) => {
        emitindo = null;
        publicar();
        registrarLog("ERROR", `[rm] falha inesperada no cupom da garantia ${id}: ${erro && erro.stack ? erro.stack : erro}`);
        avisarManual(id, "erro inesperado", null);
      });
      return true;
    },
  };
}

module.exports = { criarRm };
