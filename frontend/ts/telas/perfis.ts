// "Quem esta usando?" — antes do Menu, cada tecnico clica na sua bolinha (como
// os perfis da Netflix). O perfil fica na sessao e vai em cada garantia cadastrada.
// Teclas 1 a 9 escolhem o perfil na ordem da tela.
import { buscarStatus, listarLista, ItemListaDados } from "../api";
import { criarAvatar, definirPerfil, perfilAtual } from "../perfil";
import { menuPrincipal } from "../navegacao";

function escolher(item: ItemListaDados): void {
  definirPerfil({ id: item.id, nome: item.nome });
  document.body.dataset.perfil = item.nome;
  void menuPrincipal();
}

function cartao(item: ItemListaDados, indice: number): HTMLLIElement {
  const li = document.createElement("li");
  const botao = document.createElement("button");
  botao.type = "button";
  botao.className = "perfil-cartao";
  botao.dataset.perfil = item.nome;
  botao.setAttribute("aria-label", `Entrar como ${item.nome}`);
  if (perfilAtual()?.id === item.id) botao.classList.add("perfil-cartao--atual");
  const nome = document.createElement("span");
  nome.className = "perfil-nome";
  nome.textContent = item.nome;
  const tecla = document.createElement("span");
  tecla.className = "perfil-tecla";
  tecla.textContent = indice < 9 ? String(indice + 1) : "";
  botao.append(criarAvatar(item, "grande"), nome, tecla);
  botao.addEventListener("click", () => escolher(item));
  li.appendChild(botao);
  return li;
}

async function carregar(): Promise<void> {
  const erro = document.getElementById("perfis-erro")!;
  try {
    const cfg = await window.finDesk!.config();
    await buscarStatus(cfg);
    document.body.dataset.apiStatus = "ok";
    const tecnicos = (await listarLista(cfg, "tecnicos")).filter((t) => t.ativo);
    const grade = document.getElementById("perfis")!;
    grade.replaceChildren(...tecnicos.map(cartao));
    document.body.dataset.perfisCarregados = String(tecnicos.length);
    if (!tecnicos.length) {
      erro.textContent = "Nenhum técnico ativo. Inclua os técnicos em Atualizar Preços.";
      erro.classList.remove("hidden");
    }
    document.addEventListener("keydown", (evento) => {
      const n = Number(evento.key);
      if (!Number.isInteger(n) || n < 1 || n > Math.min(9, tecnicos.length)) return;
      evento.preventDefault();
      escolher(tecnicos[n - 1]);
    });
    (grade.querySelector<HTMLButtonElement>(".perfil-cartao--atual") ?? grade.querySelector<HTMLButtonElement>("button"))?.focus();
  } catch (falha) {
    document.body.dataset.apiStatus = "erro";
    erro.textContent = "Não foi possível carregar os técnicos. Feche e abra o sistema de novo.";
    erro.classList.remove("hidden");
    console.error("[Garantias] falha ao carregar os perfis:", falha);
  }
}

export function iniciarPerfis(): void {
  void carregar();
}
