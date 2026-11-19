// Painel do cupom fiscal (canto de baixo, a esquerda), em todas as telas (pedido do usuario,
// 2026-11-19): enquanto um cupom sai, mostra qual garantia e o botao vermelho PARAR TUDO;
// parado (pelo botao, pelo freio de seguranca ou pelo configuracoes.json), mostra
// CUPOM AUTOMATICO PARADO e o botao LIGAR DE NOVO. Sem cupom saindo, some.
import { avisar, confirmar } from "./dialogos";

let painel: HTMLElement | null = null;

function botao(texto: string, classe: string, icone: string, acao: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = `painel-cupom__botao ${classe}`;
  const i = document.createElement("span");
  i.className = "material-symbols-outlined";
  i.setAttribute("aria-hidden", "true");
  i.textContent = icone;
  b.append(i, document.createTextNode(texto));
  b.addEventListener("click", acao);
  return b;
}

async function pararTudo(): Promise<void> {
  // emergencia: para NA HORA (sem perguntar antes)
  const r = await window.finDesk?.cupomParar?.();
  desenhar((await window.finDesk?.cupomEstado?.()) ?? null);
  await avisar({
    titulo: "CUPOM AUTOMÁTICO PARADO",
    mensagem: "Nenhum cupom fiscal novo vai sair até alguém clicar em LIGAR DE NOVO (vale também depois de fechar e abrir o sistema)."
      + (r?.emAndamento ? ` O cupom da garantia nº ${r.emAndamento} já estava sendo enviado ao RM: confira no RM em ÚLTIMAS VENDAS.` : "")
      + " As garantias sem cupom ficam NÃO LANÇADO: faça no PDV do RM e marque LANÇADO em PESQUISAR GARANTIA.",
    tom: "atencao",
  });
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
  if (!painel) {
    painel = document.createElement("aside");
    painel.id = "painel-cupom";
    painel.className = "painel-cupom hidden";
    painel.setAttribute("aria-live", "polite");
    document.body.appendChild(painel);
  }
  const ativo = Boolean(s && !s.parado && (s.emitindo || s.naFila > 0));
  const visivel = Boolean(s && (s.parado || ativo));
  painel.classList.toggle("hidden", !visivel);
  painel.classList.toggle("painel-cupom--parado", Boolean(s?.parado));
  document.body.dataset.cupom = !s ? "desligado" : s.parado ? "parado" : ativo ? "emitindo" : "livre";
  if (!s || !visivel) {
    painel.replaceChildren();
    return;
  }
  const titulo = document.createElement("strong");
  const texto = document.createElement("span");
  if (s.parado) {
    titulo.textContent = "CUPOM AUTOMÁTICO PARADO";
    texto.textContent = "Nenhum cupom fiscal sai sozinho agora.";
    painel.replaceChildren(titulo, texto, botao("LIGAR DE NOVO", "painel-cupom__botao--ligar", "play_arrow", () => void ligarDeNovo()));
  } else {
    titulo.textContent = "EMITINDO CUPOM FISCAL";
    const partes = [];
    if (s.emitindo) partes.push(`garantia nº ${s.emitindo}`);
    if (s.naFila > 0) partes.push(`${s.naFila} na fila`);
    texto.textContent = partes.join(" · ");
    painel.replaceChildren(titulo, texto, botao("PARAR TUDO", "painel-cupom__botao--parar", "block", () => void pararTudo()));
  }
}

export function iniciarPainelCupom(): void {
  if (!window.finDesk?.cupomEstado) return;
  window.finDesk.onEstadoCupom?.((s) => desenhar(s));
  void window.finDesk.cupomEstado().then((s) => desenhar(s)).catch(() => desenhar(null));
}
