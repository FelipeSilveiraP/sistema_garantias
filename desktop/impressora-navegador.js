// Impressora LEMBRADA pelo navegador da janela do RM (pedido do usuario, 2026-11-19: tem
// que ser a "Daruma DR700"). E o mesmo que o operador faz no Chrome uma vez (o proprio RM
// orienta: escolher a termica, margens Nenhuma, sem cabecalhos e rodapes; "o navegador repete
// essa escolha nas proximas"). Aqui a escolha fica gravada nas preferencias do navegador da
// janela do RM ANTES de ela abrir: a janela de impressao do navegador ja abre com a Daruma.
// O nosso sistema nao imprime nada: quem imprime e o navegador, com o cupom do RM.
// Sem Electron (testado em desktop/teste-rm-cupom.js).
const fs = require("fs");
const path = require("path");

const IMPRESSORA_CUPOM = process.env.FINDESK_IMPRESSORA_CUPOM || "Daruma DR700";

/** "Ultima impressora usada" no formato do navegador (print preview sticky settings). */
function estadoImpressao(impressora) {
  return {
    version: 2,
    recentDestinations: [{ id: impressora, origin: "local", account: "", capabilities: null, displayName: impressora, extensionId: "", extensionName: "" }],
    marginsType: 1, // Nenhuma
    isHeaderFooterEnabled: false, // sem cabecalhos e rodapes
    isCssBackgroundEnabled: false,
    scaleType: 0, // padrao (100)
    scaling: "100",
  };
}

/**
 * Grava a impressora do cupom nas preferencias do navegador da sessao `pastaSessao`
 * (ex.: <dados do app>/Partitions/rm). Mantem o resto das preferencias. Devolve true se gravou.
 */
function lembrarImpressoraDoCupom(pastaSessao, impressora = IMPRESSORA_CUPOM) {
  const arquivo = path.join(pastaSessao, "Preferences");
  let prefs = {};
  try {
    if (fs.existsSync(arquivo)) prefs = JSON.parse(fs.readFileSync(arquivo, "utf8"));
  } catch {
    prefs = {}; // arquivo estragado: o navegador recria
  }
  prefs.printing = prefs.printing || {};
  prefs.printing.print_preview_sticky_settings = { appState: JSON.stringify(estadoImpressao(impressora)) };
  try {
    fs.mkdirSync(pastaSessao, { recursive: true });
    fs.writeFileSync(arquivo, JSON.stringify(prefs));
    return true;
  } catch {
    return false;
  }
}

/** "Daruma  DR700" == "daruma dr700": compara sem acento, caixa ou espaco duplo. */
function normalizarNome(texto) {
  return String(texto || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Impressora do Windows em que o cupom do RM sai: a configurada em `configuracoes.json`
 * ("impressoraCupom"; padrao Daruma DR700). No computador de desenvolvimento use
 * "Microsoft Print to PDF" (o "Salvar como PDF" do Windows). Devolve a impressora ou null.
 */
function escolherImpressora(impressoras, alvo = IMPRESSORA_CUPOM) {
  const n = normalizarNome(alvo);
  const exata = impressoras.find((p) => normalizarNome(p.name) === n || normalizarNome(p.displayName) === n);
  if (exata) return exata;
  // so a Daruma (padrao) aceita o nome parecido (ex.: "Daruma DR700 (Copiar 1)")
  if (n === normalizarNome(IMPRESSORA_CUPOM)) return impressoras.find((p) => /daruma/i.test(`${p.name} ${p.displayName || ""}`)) || null;
  return null;
}

module.exports = { IMPRESSORA_CUPOM, lembrarImpressoraDoCupom, estadoImpressao, escolherImpressora };
