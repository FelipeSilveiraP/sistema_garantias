// Enter = botao de enviar/concluir, em QUALQUER formulario do sistema (pedido do usuario,
// 2026-11-16). Vale em campo de texto, numero, data, caixa de selecao e caixa de marcar:
// - dentro de um <form>: envia o formulario (o mesmo que clicar no botao de enviar,
//   com as mesmas conferencias da tela);
// - fora de <form>: clica no botao indicado pelo bloco mais proximo marcado com
//   data-enter-envia="<seletor do botao>" (ex.: "APLICAR ALTERACAO", "APLICAR REAJUSTE").
// Nao muda: Shift/Ctrl/Alt+Enter, area de texto grande (Enter = nova linha), botoes e
// links (o Enter deles ja e o clique). Com um dialogo aberto, o fundo fica inerte
// (dialogos.ts) e nao recebe teclas.

const TIPOS_SEM_ENVIO = new Set(["button", "submit", "reset", "file", "image", "hidden", "color", "range"]);

/** Campo em que o Enter deve enviar (ou null quando o Enter tem outro papel ali). */
function campoQueEnvia(alvo: EventTarget | null): HTMLInputElement | HTMLSelectElement | null {
  if (alvo instanceof HTMLSelectElement) return alvo;
  if (alvo instanceof HTMLInputElement && !TIPOS_SEM_ENVIO.has(alvo.type)) return alvo;
  return null;
}

function usavel(botao: HTMLButtonElement | null): botao is HTMLButtonElement {
  return !!botao && !botao.disabled && botao.isConnected && botao.getClientRects().length > 0;
}

/**
 * O que o Enter faz neste campo: enviar o formulario, clicar num botao, ou nada.
 * Exportado para os testes (desktop/teste-enter.js).
 */
export function acaoDoEnter(campo: HTMLInputElement | HTMLSelectElement): { form: HTMLFormElement } | { botao: HTMLButtonElement } | null {
  if (campo.disabled) return null;
  if (campo.form) return { form: campo.form };
  const zona = campo.closest<HTMLElement>("[data-enter-envia]");
  if (!zona) return null;
  const seletor = zona.dataset.enterEnvia || "button";
  const botao = zona.querySelector<HTMLButtonElement>(seletor) ?? document.querySelector<HTMLButtonElement>(seletor);
  return usavel(botao) ? { botao } : null;
}

export function ligarEnterEnvia(raiz: Document = document): void {
  raiz.addEventListener("keydown", (evento) => {
    if (evento.key !== "Enter" || evento.defaultPrevented || evento.isComposing) return;
    if (evento.shiftKey || evento.ctrlKey || evento.altKey || evento.metaKey) return;
    const campo = campoQueEnvia(evento.target);
    if (!campo) return;
    const acao = acaoDoEnter(campo);
    if (!acao) return;
    evento.preventDefault();
    if ("form" in acao) {
      // requestSubmit: dispara o "submit" da tela (com as validacoes), igual ao botao
      const enviar = acao.form.querySelector<HTMLButtonElement>("button[type='submit'], button:not([type])");
      if (enviar && enviar.disabled) return;
      acao.form.requestSubmit(enviar && acao.form.contains(enviar) ? enviar : undefined);
    } else {
      acao.botao.click();
    }
  });
}
