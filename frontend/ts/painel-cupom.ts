// Cupom fiscal automatico na tela (pedido do usuario, 2026-11-19):
// - POP-UP DA AUTOMACAO no meio da tela enquanto o cupom sai (depois do OK do GARANTIA SALVA):
//   a garantia, as etapas e o botao CANCELAR, que para tudo (vale ate a nota ser enviada ao RM).
// - Parado (PARAR / freio / configuracoes.json): painel vermelho no canto de baixo, a
//   esquerda, com LIGAR DE NOVO.
import { avisar, confirmar, dialogoEstaAberto } from "./dialogos";

const ETAPAS: [string, string][] = [
  ["conectando", "Conectando ao RM"],
  ["produtos", "Procurando os produtos no RM"],
  ["total", "Conferindo o total"],
  ["venda", "Criando a venda em dinheiro"],
  ["emitindo", "Emitindo a NFC-e no RM"],
];

let atual: SituacaoCupom | null = null;
let modal: HTMLElement | null = null;
let painel: HTMLElement | null = null;
let cancelando = false;

function criar<K extends keyof HTMLElementTagNameMap>(tag: K, classe = "", texto?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function icone(nome: string, classe = ""): HTMLSpanElement {
  const i = criar("span", `material-symbols-outlined ${classe}`, nome);
  i.setAttribute("aria-hidden", "true");
  return i;
}

async function cancelar(): Promise<void> {
  if (cancelando) return;
  cancelando = true;
  const r = await window.finDesk?.cupomCancelar?.();
  if (r?.jaEnviado) {
    await avisar({
      titulo: "A NOTA JÁ TINHA SIDO ENVIADA",
      mensagem: `A NFC-e da garantia nº ${r.garantia} já tinha sido mandada ao RM quando o CANCELAR foi apertado: `
        + "ela pode ter sido emitida. Confira no RM em ÚLTIMAS VENDAS. Os cupons que estavam na fila não vão sair.",
      tom: "atencao",
    });
  }
}

function fecharModal(): void {
  modal?.remove();
  modal = null;
  cancelando = false;
  delete document.body.dataset.automacaoCupom;
}

/** Pop-up no meio da tela com as etapas e o CANCELAR. */
function desenharModal(s: SituacaoCupom): void {
  if (!modal) {
    // espera o GARANTIA SALVA (ou outro pop-up) ser fechado
    if (dialogoEstaAberto()) {
      window.setTimeout(() => atual && desenharModal(atual), 300);
      return;
    }
    modal = criar("div", "dialogo-veu");
    modal.id = "modal-cupom";
    document.body.appendChild(modal);
  }
  document.body.dataset.automacaoCupom = s.etapa ?? "fila";
  const caixa = criar("div", "dialogo dialogo--grande");
  caixa.setAttribute("role", "dialog");
  caixa.setAttribute("aria-modal", "true");
  caixa.setAttribute("aria-labelledby", "modal-cupom-titulo");
  caixa.dataset.dialogo = "atencao";

  const cab = criar("div", "dialogo__cabecalho");
  const titulo = criar("h2", "dialogo__titulo", "CUPOM FISCAL AUTOMÁTICO");
  titulo.id = "modal-cupom-titulo";
  cab.append(icone("receipt_long", "dialogo__icone"), titulo);

  const corpo = criar("div", "dialogo__corpo");
  const partes = [s.emitindo ? `Garantia nº ${s.emitindo}` : "Preparando o cupom"];
  if (s.naFila > 0) partes.push(`${s.naFila} na fila`);
  corpo.appendChild(criar("p", "dialogo__mensagem", partes.join(" · ")));
  const lista = criar("ul", "automacao-etapas");
  const indice = ETAPAS.findIndex(([chave]) => chave === s.etapa);
  ETAPAS.forEach(([chave, texto], i) => {
    const li = criar("li", "automacao-etapa");
    const feita = s.etapa === "emitida" || (indice >= 0 && i < indice);
    const agora = chave === s.etapa;
    li.classList.toggle("automacao-etapa--feita", feita);
    li.classList.toggle("automacao-etapa--agora", agora);
    li.append(icone(feita ? "check_box" : agora ? "progress_activity" : "check_box_outline_blank"), document.createTextNode(texto));
    lista.appendChild(li);
  });
  corpo.appendChild(lista);
  const jaEnviado = s.etapa === "emitindo" || s.etapa === "emitida";
  corpo.appendChild(criar("p", "dialogo__detalhes", jaEnviado
    ? "A nota já foi enviada ao RM: daqui em diante não dá mais para cancelar."
    : "CANCELAR para tudo agora: nenhuma nota é emitida e a garantia fica NÃO LANÇADO."));

  const acoes = criar("div", "dialogo__acoes");
  const botao = criar("button", "dialogo-botao dialogo-botao--acao automacao-cancelar");
  botao.type = "button";
  botao.id = "btn-cancelar-cupom";
  botao.dataset.dialogoAcao = "cancelar";
  botao.textContent = cancelando ? "CANCELANDO..." : jaEnviado ? "NOTA JÁ ENVIADA AO RM" : "CANCELAR";
  botao.disabled = cancelando || jaEnviado;
  botao.addEventListener("click", () => void cancelar());
  acoes.appendChild(botao);

  caixa.append(cab, corpo, acoes);
  modal.replaceChildren(caixa);
  if (!botao.disabled) botao.focus();
}

/** Painel vermelho (canto de baixo, a esquerda) quando o cupom automatico esta parado. */
function desenharParado(parado: boolean): void {
  if (!painel) {
    painel = criar("aside", "painel-cupom painel-cupom--parado hidden");
    painel.id = "painel-cupom";
    painel.setAttribute("aria-live", "polite");
    document.body.appendChild(painel);
  }
  painel.classList.toggle("hidden", !parado);
  if (!parado) {
    painel.replaceChildren();
    return;
  }
  const ligar = criar("button", "painel-cupom__botao painel-cupom__botao--ligar");
  ligar.type = "button";
  ligar.append(icone("play_arrow"), document.createTextNode("LIGAR DE NOVO"));
  ligar.addEventListener("click", () => void ligarDeNovo());
  painel.replaceChildren(criar("strong", "", "CUPOM AUTOMÁTICO PARADO"), criar("span", "", "Nenhum cupom fiscal sai sozinho agora."), ligar);
}

async function ligarDeNovo(): Promise<void> {
  const ok = await confirmar({
    titulo: "LIGAR O CUPOM AUTOMÁTICO?",
    mensagem: "Antes, confira no RM (ÚLTIMAS VENDAS) se não saiu cupom a mais. Depois de ligar, cada garantia salva volta a emitir o cupom fiscal sozinha.",
    textoConfirmar: "LIGAR DE NOVO",
    tom: "atencao",
  });
  if (!ok) return;
  await window.finDesk?.cupomRetomar?.();
  desenhar((await window.finDesk?.cupomEstado?.()) ?? null);
}

function desenhar(s: SituacaoCupom | null): void {
  atual = s;
  const ativo = Boolean(s && !s.parado && (s.emitindo || s.naFila > 0));
  document.body.dataset.cupom = !s ? "desligado" : s.parado ? "parado" : ativo ? "emitindo" : "livre";
  desenharParado(Boolean(s?.parado));
  if (ativo && s) desenharModal(s);
  else fecharModal();
}

export function iniciarPainelCupom(): void {
  if (!window.finDesk?.cupomEstado) return;
  window.finDesk.onEstadoCupom?.((s) => desenhar(s));
  void window.finDesk.cupomEstado().then((s) => desenhar(s)).catch(() => desenhar(null));
}
