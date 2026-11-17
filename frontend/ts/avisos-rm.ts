// Pop-ups do cupom fiscal automatico (RM Software): o processo do Electron guarda os
// avisos numa fila e a tela mostra um por vez, sem atropelar outro pop-up aberto.
import { avisar, dialogoEstaAberto } from "./dialogos";

let mostrando = false;

async function mostrarPendentes(): Promise<void> {
  if (mostrando || !window.finDesk?.avisosRm) return;
  mostrando = true;
  try {
    for (;;) {
      const avisos = await window.finDesk.avisosRm();
      if (!avisos.length) return;
      for (const aviso of avisos) {
        while (dialogoEstaAberto()) await new Promise((r) => setTimeout(r, 300));
        await avisar({ titulo: aviso.titulo, mensagem: aviso.mensagem, tom: aviso.tom, itens: aviso.itens });
      }
    }
  } finally {
    mostrando = false;
  }
}

export function iniciarAvisosRm(): void {
  window.finDesk?.onAvisoRm?.(() => void mostrarPendentes());
  void mostrarPendentes();
}
