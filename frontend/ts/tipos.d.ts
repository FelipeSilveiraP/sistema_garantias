interface FinDeskConfig {
  port: number;
  token: string;
}

type TelaFinDesk =
  | "menu"
  | "cadastrar-garantia"
  | "pesquisar-garantias"
  | "estatisticas"
  | "graficos"
  | "atualizar-precos";

interface Window {
  finDesk?: {
    config: () => Promise<FinDeskConfig>;
    navegar: (tela: TelaFinDesk) => Promise<void>;
    estadoInicializacao: () => Promise<{ estado: "aguardando" | "pronto" | "falhou" }>;
    onInicializacao: (callback: (estado: { estado: "aguardando" | "pronto" | "falhou" }) => void) => void;
    reiniciarBackend: () => Promise<{ ok: boolean }>;
    repararFoco: () => Promise<boolean>;
    fecharAplicativo: () => Promise<void>;
    salvarNota: (nome: string, bytes: Uint8Array) => Promise<{ ok: boolean; caminho?: string }>;
    abrirNota: (caminho: string) => Promise<boolean>;
    abrirArquivo: (caminho: string) => Promise<boolean>;
    imprimirPdf: (
      nome: string,
      opcoes?: { retrato?: boolean; anexoPdf?: Uint8Array; formal?: boolean },
    ) => Promise<{ ok: boolean; caminho?: string; anexoIncluido?: boolean }>;
    atualizacaoDisponivel: () => Promise<{ versao: string; atual: string; novidades: string } | null>;
    instalarAtualizacao: () => Promise<boolean>;
  };
}
