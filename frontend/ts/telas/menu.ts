// Menu Principal do Sistema de Garantias: 3 botoes (CADASTRAR GARANTIA,
// PESQUISAR GARANTIA, CONTROLE), resumo do dia, aviso do
// backup no Google Drive e a oferta de atualizacao (mesma estrutura do Contas a Pagar).
import { buscarBackupDrive, buscarStatus, listarGarantias, SituacaoBackupDrive } from "../api";
import { notificar } from "../notificacoes";
import { avisar, confirmar, mostrarProgresso } from "../dialogos";
import { formatarMoedaBR } from "../mascaras";
import { hojeIso } from "../filtros";
import { Tela, irPara } from "../navegacao";
import { perfilAtual } from "../perfil";
import { criarBotaoConta } from "../conta-menu";
import { mostrarNovidades } from "../novidades";

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
function megas(bytes: number): string {
  return (bytes / (1024 * 1024)).toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}

/** Versao nova no GitHub: pop-up no meio da tela; ao ATUALIZAR, barra de carregamento ate fechar. */
async function oferecerAtualizacao(): Promise<void> {
  const nova = await window.finDesk?.atualizacaoDisponivel?.().catch(() => null);
  if (!nova) return;
  document.body.dataset.atualizacao = nova.versao;
  const quer = await confirmar({
    titulo: `Nova versão ${nova.versao}`,
    mensagem: `Você usa a ${nova.atual}. Atualizar agora? O sistema fecha e abre de novo sozinho; os dados ficam (antes de mudar o banco ele faz um backup).`,
    detalhes: nova.novidades || undefined,
    textoConfirmar: "ATUALIZAR",
    textoCancelar: "AGORA NÃO",
    icone: "system_update",
  });
  if (!quer) return;
  const progresso = mostrarProgresso(`Atualizando para a versão ${nova.versao}`, "Começando o download...");
  document.body.dataset.atualizando = "true";
  window.finDesk!.onProgressoAtualizacao?.(({ recebidos, total }) => {
    if (total > 0 && recebidos >= total) {
      progresso.atualizar(1, "Download concluído. Conferindo e instalando: o sistema vai fechar e abrir de novo sozinho.");
    } else if (total > 0) {
      progresso.atualizar(recebidos / total, `Baixando... ${Math.floor((recebidos / total) * 100)}% (${megas(recebidos)} de ${megas(total)} MB)`);
    } else {
      progresso.atualizar(null, `Baixando... ${megas(recebidos)} MB`);
    }
  });
  const ok = await window.finDesk!.instalarAtualizacao();
  if (ok) {
    progresso.atualizar(1, "Instalando: o sistema vai fechar e abrir de novo sozinho. Não desligue o computador.");
    return;
  }
  progresso.fechar();
  delete document.body.dataset.atualizando;
  await avisar({ titulo: "Atualização não instalada", mensagem: "A atualização não foi feita agora. O sistema continua funcionando normalmente; tente de novo pelo aviso que aparece ao abrir o Menu.", tom: "erro" });
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
    // O QUE MUDOU primeiro; o aviso de versao nova espera (um pop-up por vez)
    void mostrarNovidades().then(() => oferecerAtualizacao());
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
