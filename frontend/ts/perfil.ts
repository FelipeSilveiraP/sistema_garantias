// Perfil em uso (tela "Quem esta usando?", como na Netflix): o tecnico escolhido
// fica na sessao da janela ate o sistema fechar (ao abrir de novo, pergunta de novo).
// Cada garantia cadastrada guarda esse perfil em "criadoPor".

export interface Perfil {
  id: number;
  nome: string;
}

const CHAVE = "garantias.perfil";

/** Cores neobrutalistas das bolinhas (sempre a mesma cor para o mesmo tecnico). */
const CORES = ["#FFE600", "#38BDF8", "#00FF66", "#FF8C00", "#FF5E89", "#A78BFA", "#FF3B30", "#2DD4BF"];

export function perfilAtual(): Perfil | null {
  try {
    const bruto = sessionStorage.getItem(CHAVE);
    if (!bruto) return null;
    const p = JSON.parse(bruto) as Perfil;
    return typeof p?.nome === "string" && p.nome ? p : null;
  } catch {
    return null;
  }
}

export function definirPerfil(perfil: Perfil): void {
  try {
    sessionStorage.setItem(CHAVE, JSON.stringify(perfil));
  } catch {
    // sem sessionStorage: o cadastro continua pedindo o tecnico
  }
}

export function limparPerfil(): void {
  try {
    sessionStorage.removeItem(CHAVE);
  } catch {
    // ignora
  }
}

/** "CARLOS H." -> "CH"; "FELIPE" -> "FE". */
export function iniciais(nome: string): string {
  const partes = nome.replace(/[^\p{L}\s]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (partes.length >= 2) return (partes[0][0] + partes[1][0]).toUpperCase();
  return (partes[0] ?? "?").slice(0, 2).toUpperCase();
}

export function corDoPerfil(id: number): string {
  return CORES[Math.abs(id) % CORES.length];
}

/** Bolinha com as iniciais (tamanho pelo CSS: perfil-avatar--grande / --pequena). */
export function criarAvatar(perfil: Perfil, tamanho: "grande" | "pequena"): HTMLSpanElement {
  const bolinha = document.createElement("span");
  bolinha.className = `perfil-avatar perfil-avatar--${tamanho}`;
  bolinha.style.backgroundColor = corDoPerfil(perfil.id);
  bolinha.textContent = iniciais(perfil.nome);
  bolinha.setAttribute("aria-hidden", "true");
  return bolinha;
}
