// Menu Principal do Sistema de Garantias: 3 botoes (CADASTRAR GARANTIA,
// PESQUISAR GARANTIA, CONTROLE), resumo do dia, aviso do
// backup no Google Drive e a oferta de atualizacao (mesma estrutura do Contas a Pagar).
import { buscarBackupDrive, buscarStatus, listarGarantias, SituacaoBackupDrive } from "../api";
import { notificar } from "../notificacoes";
import { formatarMoedaBR } from "../mascaras";
import { hojeIso } from "../filtros";
import { Tela, irPara } from "../navegacao";
import { perfilAtual } from "../perfil";
import { criarBotaoConta } from "../conta-menu";

const DESTINOS: Record<string, Tela> = {
  "cadastrar-garantia": "cadastrar-garantia",
  "pesquisar-garantias": "pesquisar-garantias",
  estatisticas: "estatisticas",
};

function registrarBotoes(): void {
  document.querySelectorAll<HTMLAnchorElement>("a[data-path]").forEach((ancora) => {
    ancora.addEventListener("click", (evento) => {
      evento.preventDefault();
      const destino = DESTINOS[ancora.dataset.path ?? ""];
      if (destino) void irPara(destino);
    });
  });
}

/** Teclas 1/2/3 (ou F1/F2/F3) abrem os botoes, na ordem da tela. */
function registrarAtalhos(): void {
  const atalhos: Record<string, string> = {
    "1": "cadastrar-garantia", F1: "cadastrar-garantia",
    "2": "pesquisar-garantias", F2: "pesquisar-garantias",
    "3": "estatisticas", F3: "estatisticas",
  };
  document.addEventListener("keydown", (evento) => {
    const alvo = atalhos[evento.key];
    if (!alvo) return;
    evento.preventDefault();
    document.querySelector<HTMLAnchorElement>(`a[data-path="${alvo}"]`)?.click();
  });
}

async function mostrarResumoDoDia(cfg: FinDeskConfig): Promise<void> {
  const hoje = hojeIso();
  const garantias = await listarGarantias(cfg);
  const doDia = garantias.filter((g) => g.dataServico === hoje);
  const doMes = garantias.filter((g) => g.dataServico.slice(0, 7) === hoje.slice(0, 7));
  const total = doMes.reduce((soma, g) => soma + Math.round(g.valor * 100), 0);
  document.getElementById("resumo-hoje")!.textContent =
    `Hoje: ${doDia.length} garantia(s) · Este mês: ${doMes.length} · ${formatarMoedaBR(total)}`;
}

// backup da abertura no Google Drive: avisa so se falhar (uma vez por sessao)
async function conferirBackupDrive(cfg: FinDeskConfig): Promise<void> {
  try {
    if (sessionStorage.getItem("findesk:backup-drive-avisado")) return;
  } catch {
    // sem sessionStorage: segue e avisa
  }
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const s: SituacaoBackupDrive | null = await buscarBackupDrive(cfg).catch(() => null);
    if (!s) return;
    document.body.dataset.backupDrive = s.estado;
    if (s.estado === "erro") {
      notificar(`Backup no Google Drive: ${s.mensagem}`, "erro");
      try {
        sessionStorage.setItem("findesk:backup-drive-avisado", "1");
      } catch {
        // ignora
      }
      return;
    }
    if (s.estado !== "aguardando" && s.estado !== "executando") return;
    await new Promise((ok) => setTimeout(ok, 1500));
  }
}

// atualizacao pelo Google Drive: aviso fixo com o botao ATUALIZAR
async function oferecerAtualizacao(): Promise<void> {
  const nova = await window.finDesk?.atualizacaoDisponivel?.().catch(() => null);
  if (!nova) return;
  document.body.dataset.atualizacao = nova.versao;
  const novidades = nova.novidades ? ` ${nova.novidades}` : "";
  notificar(`Nova versão ${nova.versao} disponível (você usa a ${nova.atual}).${novidades}`, "info", {
    rotulo: "Atualizar",
    aoClicar: () => {
      notificar("Baixando e conferindo a atualização. O sistema vai fechar e abrir de novo sozinho (os dados ficam).", "info", undefined, { fixa: true });
      void window.finDesk!.instalarAtualizacao().then((ok) => {
        if (!ok) notificar("Não foi possível baixar a atualização. Confira a internet e tente de novo.", "erro");
      });
    },
  }, { fixa: true });
}

async function iniciar(): Promise<void> {
  try {
    if (!window.finDesk) throw new Error("configuração indisponível");
    const cfg = await window.finDesk.config();
    // versao instalada no rodape do Menu (para conferir se a atualizacao entrou)
    if (cfg.versao) document.getElementById("versao-sistema")!.textContent = `Sistema de Garantias · versão ${cfg.versao}`;
    await buscarStatus(cfg);
    document.body.dataset.apiStatus = "ok";
    void mostrarResumoDoDia(cfg).catch(() => undefined);
    void conferirBackupDrive(cfg);
    void oferecerAtualizacao();
  } catch (erro) {
    document.body.dataset.apiStatus = "erro";
    console.warn("[Garantias] API indisponível:", erro instanceof Error ? erro.message : erro);
  }
}

/** Sem perfil escolhido, volta para "Quem esta usando?" (como na Netflix). */
function mostrarPerfil(): boolean {
  const perfil = perfilAtual();
  if (!perfil) {
    void window.finDesk?.navegar("perfis");
    return false;
  }
  // um botao so para a conta: MINHA CONTA ou SAIR E TROCAR DE CONTA
  document.getElementById("menu-conta")!.replaceChildren(criarBotaoConta(perfil, "menu-perfil"));
  document.body.dataset.perfil = perfil.nome;
  return true;
}

export function iniciarMenu(): void {
  if (!mostrarPerfil()) return;
  registrarBotoes();
  registrarAtalhos();
  void iniciar();
}
