interface FinDeskConfig {
  port: number;
  token: string;
  /** versao instalada (package.json), mostrada no Menu */
  versao?: string;
}

type TelaFinDesk =
  | "perfis"
  | "menu"
  | "cadastrar-garantia"
  | "pesquisar-garantias"
  | "estatisticas"
  | "graficos"
  | "atualizar-precos"
  | "controle"
  | "tecnicos"
  | "veiculos"
  | "produtos"
  | "form-tecnico"
  | "form-veiculo"
  | "form-produto"
  | "todos-tecnicos"
  | "todos-veiculos"
  | "todos-produtos"
  | "contas";

/** Pop-up pedido pelo processo do RM (conexao, cupom que nao saiu, impressora). */
interface AvisoRm {
  titulo: string;
  mensagem: string;
  tom: "sucesso" | "erro" | "atencao";
  itens?: string[];
}

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
    onProgressoAtualizacao?: (callback: (progresso: { recebidos: number; total: number }) => void) => void;
    /** cupom fiscal no RM Software, em segundo plano (desktop/rm.js) */
    emitirCupom?: (idGarantia: number) => Promise<boolean>;
    cupomEstado?: () => Promise<SituacaoCupom | null>;
    cupomParar?: () => Promise<{ emAndamento: number | null } | null>;
    cupomRetomar?: () => Promise<boolean>;
    cupomCancelar?: () => Promise<{ garantia: number | null; jaEnviado: boolean } | null>;
    onEstadoCupom?: (callback: (situacao: SituacaoCupom) => void) => void;
    avisosRm?: () => Promise<AvisoRm[]>;
    onAvisoRm?: (callback: () => void) => void;
  };
}

/** Situacao do cupom fiscal automatico (painel do cupom). */
interface SituacaoCupom {
  parado: boolean;
  /** garantia cujo cupom esta saindo agora */
  emitindo: number | null;
  /** quantos cupons esperam na fila */
  naFila: number;
  /** etapa do cupom atual: conectando, produtos, total, venda, emitindo, emitida */
  etapa: string | null;
}
