// Cliente HTTP da API local (127.0.0.1 + token por execucao no header X-FinDesk-Token).

export interface StatusApi {
  status: string;
  app: string;
  fase: string;
}

export interface GarantiaDados {
  id: number;
  /** aaaa-mm-dd */
  dataServico: string;
  placa: string | null;
  semPlaca: boolean;
  cpf: string | null;
  modelo: string;
  idServico: number | null;
  servico: string;
  qtdCarcaca: number;
  qtdBotao: number;
  qtdPilha: number;
  qtdItens: number;
  valor: number;
  tecnico: string;
  observacao: string | null;
  codigoCupom: string | null;
  cupomStatus: "NAO_LANCADO" | "LANCADO" | "DISPENSADO";
  cupomLancadoEm: string | null;
  origem: "SISTEMA" | "LEGADO";
  /** perfil (tecnico) que cadastrou; nulo no legado */
  criadoPor: string | null;
  idVeiculo: number | null;
}

export interface GarantiaEntrada {
  dataServico: string;
  placa?: string;
  semPlaca: boolean;
  cpf?: string;
  modelo: string;
  /** null + servico preenchido = OUTRO (texto livre) */
  idServico: number | null;
  servico?: string;
  qtdCarcaca: number;
  qtdBotao: number;
  qtdPilha: number;
  qtdItens: number;
  /** "150.00" */
  valor: string;
  tecnico: string;
  observacao?: string;
  forcar?: boolean;
  criadoPor?: string;
  /** veiculo do catalogo (o modelo e gravado como "MARCA MODELO") */
  idVeiculo?: number | null;
}

export interface ServicoDados {
  id: number;
  nome: string;
  preco: number;
  codigoCupom: string | null;
  pedeCarcaca: boolean;
  pedeBotao: boolean;
  pedePilha: boolean;
  pedeItens: boolean;
  peca: boolean;
  ativo: boolean;
}

export interface VeiculoDados {
  id: number;
  idMarca: number;
  marca: string;
  modelo: string;
  ativo: boolean;
  /** quantas garantias usam esse veiculo */
  garantias: number;
}

export interface ItemListaDados {
  id: number;
  nome: string;
  ativo: boolean;
}

export type NomeLista = "tecnicos" | "modelos";

export interface GrupoEstatistica {
  nome: string;
  quantidade: number;
  totalCentavos: number;
}

export interface ResumoEstatistica {
  quantidade: number;
  totalCentavos: number;
  semCupom: number;
  semPlaca: number;
  porMes: { mes: string; quantidade: number; totalCentavos: number }[];
  porServico: GrupoEstatistica[];
  porTecnico: GrupoEstatistica[];
  porModelo: GrupoEstatistica[];
}

export interface ResultadoImportacao {
  lidas: number;
  importadas: number;
  jaImportadas: number;
}

export interface SituacaoBackupDrive {
  estado: "aguardando" | "executando" | "ok" | "erro" | "desligado";
  mensagem: string;
  arquivo: string | null;
  quando: string | null;
}

export class ErroValidacaoApi extends Error {
  constructor(public campos: Record<string, string>) {
    super("dados invalidos");
  }
}

export class ErroApi extends Error {
  /** corpo da resposta de erro (ex.: tentativasRestantes, minutos) */
  constructor(public status: number, public corpo: Record<string, unknown> = {}) {
    super(`HTTP ${status}`);
  }
}

export class ErroDuplicidadeApi extends Error {
  constructor(public existente: GarantiaDados) {
    super("possivel duplicidade");
  }
}

/** Sessao do perfil (token devolvido ao entrar com o PIN); vai em toda requisicao. */
function sessao(): Record<string, string> {
  try {
    const p = JSON.parse(sessionStorage.getItem("garantias.perfil") ?? "null") as { token?: string } | null;
    return p?.token ? { "X-Garantias-Sessao": p.token } : {};
  } catch {
    return {};
  }
}

function url(cfg: FinDeskConfig, caminho: string): string {
  return `http://127.0.0.1:${cfg.port}${caminho}`;
}

async function get<T>(cfg: FinDeskConfig, caminho: string): Promise<T> {
  const resposta = await fetch(url(cfg, caminho), { headers: { "X-FinDesk-Token": cfg.token, ...sessao() } });
  if (!resposta.ok) throw new ErroApi(resposta.status, await resposta.json().catch(() => ({})));
  return (await resposta.json()) as T;
}

/** POST/PUT/DELETE com JSON: 400 vira ErroValidacaoApi (campo -> mensagem); 409 de duplicidade, ErroDuplicidadeApi. */
async function enviar<T>(cfg: FinDeskConfig, metodo: string, caminho: string, corpo?: unknown): Promise<T> {
  const resposta = await fetch(url(cfg, caminho), {
    method: metodo,
    headers: { "X-FinDesk-Token": cfg.token, "Content-Type": "application/json", ...sessao() },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  if (resposta.status === 400) {
    const erro = (await resposta.json().catch(() => ({}))) as { campos?: Record<string, string> };
    throw new ErroValidacaoApi(erro.campos ?? {});
  }
  if (resposta.status === 409) {
    const erro = (await resposta.json().catch(() => ({}))) as { tipo?: string; existente?: GarantiaDados };
    if (erro.tipo === "possivel_duplicata" && erro.existente) throw new ErroDuplicidadeApi(erro.existente);
    throw new ErroApi(409);
  }
  if (!resposta.ok) throw new ErroApi(resposta.status, await resposta.json().catch(() => ({})));
  return resposta.status === 204 ? (undefined as T) : ((await resposta.json()) as T);
}

export function buscarStatus(cfg: FinDeskConfig): Promise<StatusApi> {
  return get<StatusApi>(cfg, "/api/status");
}

/** Resultado do backup em planilha na pasta do Google Drive, feito na abertura. */
export function buscarBackupDrive(cfg: FinDeskConfig): Promise<SituacaoBackupDrive> {
  return get<SituacaoBackupDrive>(cfg, "/api/backup-drive");
}

// ---------- garantias ----------

export function listarGarantias(cfg: FinDeskConfig): Promise<GarantiaDados[]> {
  return get<GarantiaDados[]>(cfg, "/api/garantias");
}

export function cadastrarGarantia(cfg: FinDeskConfig, dados: GarantiaEntrada): Promise<GarantiaDados> {
  return enviar<GarantiaDados>(cfg, "POST", "/api/garantias", dados);
}

export function atualizarGarantia(cfg: FinDeskConfig, id: number, dados: GarantiaEntrada): Promise<GarantiaDados> {
  return enviar<GarantiaDados>(cfg, "PUT", `/api/garantias/${id}`, dados);
}

export function excluirGarantia(cfg: FinDeskConfig, id: number): Promise<void> {
  return enviar<void>(cfg, "DELETE", `/api/garantias/${id}`);
}

/** Estrutura do cupom fiscal (SAT web): a automacao vira depois. */
export function marcarCupom(cfg: FinDeskConfig, id: number, status: GarantiaDados["cupomStatus"]): Promise<GarantiaDados> {
  return enviar<GarantiaDados>(cfg, "PUT", `/api/garantias/${id}/cupom`, { status });
}

// ---------- tabela de precos e listas ----------

export function listarServicos(cfg: FinDeskConfig): Promise<ServicoDados[]> {
  return get<ServicoDados[]>(cfg, "/api/servicos");
}

export function salvarServico(cfg: FinDeskConfig, dados: Omit<ServicoDados, "id" | "preco"> & { id?: number; preco: string }): Promise<ServicoDados> {
  return dados.id
    ? enviar<ServicoDados>(cfg, "PUT", `/api/servicos/${dados.id}`, dados)
    : enviar<ServicoDados>(cfg, "POST", "/api/servicos", dados);
}

export function excluirServico(cfg: FinDeskConfig, id: number): Promise<void> {
  return enviar<void>(cfg, "DELETE", `/api/servicos/${id}`);
}

export function listarVeiculos(cfg: FinDeskConfig): Promise<VeiculoDados[]> {
  return get<VeiculoDados[]>(cfg, "/api/veiculos");
}

export function listarMarcas(cfg: FinDeskConfig): Promise<string[]> {
  return get<string[]>(cfg, "/api/marcas");
}

export function salvarVeiculo(cfg: FinDeskConfig, dados: { id?: number; marca: string; modelo: string; ativo?: boolean }): Promise<VeiculoDados> {
  return dados.id
    ? enviar<VeiculoDados>(cfg, "PUT", `/api/veiculos/${dados.id}`, dados)
    : enviar<VeiculoDados>(cfg, "POST", "/api/veiculos", dados);
}

export function excluirVeiculo(cfg: FinDeskConfig, id: number): Promise<void> {
  return enviar<void>(cfg, "DELETE", `/api/veiculos/${id}`);
}

export function reajustarPrecos(cfg: FinDeskConfig, percentual: string, incluirPecas: boolean): Promise<{ atualizados: number }> {
  return enviar<{ atualizados: number }>(cfg, "POST", "/api/servicos/reajuste", { percentual, incluirPecas });
}

export function listarLista(cfg: FinDeskConfig, lista: NomeLista): Promise<ItemListaDados[]> {
  return get<ItemListaDados[]>(cfg, `/api/listas/${lista}`);
}

export function incluirNaLista(cfg: FinDeskConfig, lista: NomeLista, nome: string): Promise<ItemListaDados> {
  return enviar<ItemListaDados>(cfg, "POST", `/api/listas/${lista}`, { nome });
}

export function alterarItemLista(cfg: FinDeskConfig, lista: NomeLista, id: number, nome: string, ativo: boolean): Promise<void> {
  return enviar<void>(cfg, "PUT", `/api/listas/${lista}/${id}`, { nome, ativo });
}

export function excluirItemLista(cfg: FinDeskConfig, lista: NomeLista, id: number): Promise<void> {
  return enviar<void>(cfg, "DELETE", `/api/listas/${lista}/${id}`);
}

// ---------- graficos e legado ----------

export function buscarEstatisticas(cfg: FinDeskConfig, de: string, ate: string): Promise<ResumoEstatistica> {
  return get<ResumoEstatistica>(cfg, `/api/estatisticas?de=${encodeURIComponent(de)}&ate=${encodeURIComponent(ate)}`);
}

export function importarPlanilhaLegada(cfg: FinDeskConfig, nomeArquivo: string, conteudoBase64: string): Promise<ResultadoImportacao> {
  return enviar<ResultadoImportacao>(cfg, "POST", "/api/legado/importar", { nomeArquivo, conteudoBase64 });
}

// ---------- contas de usuario (perfis com PIN) ----------

export interface PerfilConta {
  id: number;
  nome: string;
  temFoto: boolean;
  admin: boolean;
}

export interface SessaoConta {
  token: string;
  id: number;
  nome: string;
  admin: boolean;
}

export interface UsuarioDados {
  id: number;
  nome: string;
  login: string;
  email: string | null;
  admin: boolean;
  ativo: boolean;
  temFoto: boolean;
  acessos: number;
  ultimoAcesso: string | null;
  bloqueado: boolean;
  criadoEm: string;
}

export interface AcessoDados {
  id: number;
  idUsuario: number | null;
  nome: string;
  momento: string;
  tipo: string;
}

export interface UsuarioEntrada {
  nome?: string;
  login?: string;
  email?: string;
  pin?: string;
  admin?: boolean;
  ativo?: boolean;
  fotoBase64?: string;
}

export function listarPerfis(cfg: FinDeskConfig): Promise<{ primeiroAcesso: boolean; perfis: PerfilConta[] }> {
  return get(cfg, "/api/perfis");
}

/** Foto da conta como data URL (a CSP so aceita imagem local ou data:). */
export async function fotoDoPerfil(cfg: FinDeskConfig, id: number): Promise<string | null> {
  const resposta = await fetch(url(cfg, `/api/perfis/${id}/foto`), { headers: { "X-FinDesk-Token": cfg.token } });
  if (!resposta.ok) return null;
  const blob = await resposta.blob();
  return new Promise((ok) => {
    const leitor = new FileReader();
    leitor.onload = () => ok(String(leitor.result));
    leitor.onerror = () => ok(null);
    leitor.readAsDataURL(blob);
  });
}

export function criarPrimeiroAdmin(cfg: FinDeskConfig, dados: UsuarioEntrada): Promise<SessaoConta> {
  return enviar(cfg, "POST", "/api/perfis/primeiro-admin", dados);
}

export function entrarComPin(cfg: FinDeskConfig, idUsuario: number, pin: string): Promise<SessaoConta> {
  return enviar(cfg, "POST", "/api/sessao", { idUsuario, pin });
}

export function sairDaSessao(cfg: FinDeskConfig): Promise<void> {
  return enviar(cfg, "DELETE", "/api/sessao");
}

export function esqueciPin(cfg: FinDeskConfig, login: string): Promise<{ enviadoPara: string }> {
  return enviar(cfg, "POST", "/api/sessao/esqueci-pin", { login });
}

export function redefinirPin(cfg: FinDeskConfig, login: string, codigo: string, novoPin: string): Promise<void> {
  return enviar(cfg, "POST", "/api/sessao/redefinir-pin", { login, codigo, novoPin });
}

export function minhaConta(cfg: FinDeskConfig): Promise<UsuarioDados> {
  return get(cfg, "/api/usuarios/eu");
}

export function trocarMeuPin(cfg: FinDeskConfig, pinAtual: string, novoPin: string): Promise<void> {
  return enviar(cfg, "PUT", "/api/usuarios/eu/pin", { pinAtual, novoPin });
}

export function listarUsuarios(cfg: FinDeskConfig): Promise<UsuarioDados[]> {
  return get(cfg, "/api/usuarios");
}

export function cadastrarUsuario(cfg: FinDeskConfig, dados: UsuarioEntrada): Promise<UsuarioDados> {
  return enviar(cfg, "POST", "/api/usuarios", dados);
}

export function atualizarUsuario(cfg: FinDeskConfig, id: number, dados: UsuarioEntrada): Promise<UsuarioDados> {
  return enviar(cfg, "PUT", `/api/usuarios/${id}`, dados);
}

export function novoPinDoUsuario(cfg: FinDeskConfig, id: number, novoPin: string): Promise<void> {
  return enviar(cfg, "PUT", `/api/usuarios/${id}/pin`, { novoPin });
}

export function trocarFotoDoUsuario(cfg: FinDeskConfig, id: number, fotoBase64: string | null): Promise<void> {
  return enviar(cfg, "PUT", `/api/usuarios/${id}/foto`, { fotoBase64 });
}

export function excluirUsuario(cfg: FinDeskConfig, id: number): Promise<void> {
  return enviar(cfg, "DELETE", `/api/usuarios/${id}`);
}

export function listarAcessos(cfg: FinDeskConfig, id?: number, limite = 100): Promise<AcessoDados[]> {
  return get(cfg, `/api/usuarios/acessos?limite=${limite}${id ? `&id=${id}` : ""}`);
}

export function configEmail(cfg: FinDeskConfig): Promise<{ remetente: string | null; configurado: boolean }> {
  return get(cfg, "/api/email-config");
}

export function gravarConfigEmail(cfg: FinDeskConfig, remetente: string, senhaApp: string): Promise<void> {
  return enviar(cfg, "PUT", "/api/email-config", { remetente, senhaApp });
}

export function testarEmail(cfg: FinDeskConfig, destino: string): Promise<void> {
  return enviar(cfg, "POST", "/api/email-config/teste", { destino });
}
