// Caixa de escolher digitando (combobox do WAI-ARIA): o usuario digita e a lista abaixo
// mostra so os itens que combinam (todas as palavras, sem ligar para acento ou maiuscula);
// setas sobem/descem, Enter escolhe, ESC fecha, clique escolhe. Tambem da para abrir a
// lista inteira pela seta ao lado. DOM so por createElement/textContent.

export interface ItemBusca {
  valor: string;
  rotulo: string;
  /** cabecalho do grupo (ex.: a marca) */
  grupo?: string;
}

export interface CaixaBusca {
  definirItens(itens: ItemBusca[]): void;
  /** item escolhido, ou null quando o texto nao e (exatamente) um item da lista */
  escolhido(): ItemBusca | null;
  limpar(): void;
}

/** "Fiat Uno" e "FIAT UNÓ" viram "FIAT UNO". */
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

/** Itens que combinam com o que foi digitado (todas as palavras, em qualquer ordem). */
export function filtrarItens(itens: ItemBusca[], digitado: string): ItemBusca[] {
  const palavras = normalizar(digitado).split(" ").filter(Boolean);
  if (!palavras.length) return itens;
  return itens.filter((item) => {
    const alvo = normalizar(`${item.rotulo} ${item.grupo ?? ""}`);
    return palavras.every((p) => alvo.includes(p));
  });
}

export function ligarCaixaBusca(
  campo: HTMLInputElement,
  lista: HTMLUListElement,
  aoMudar: (escolhido: ItemBusca | null, texto: string) => void,
): CaixaBusca {
  let itens: ItemBusca[] = [];
  let visiveis: ItemBusca[] = [];
  let ativo = -1;
  let atual: ItemBusca | null = null;

  campo.setAttribute("role", "combobox");
  campo.setAttribute("aria-autocomplete", "list");
  campo.setAttribute("aria-expanded", "false");
  campo.setAttribute("aria-controls", lista.id);
  lista.setAttribute("role", "listbox");

  const aberta = (): boolean => !lista.classList.contains("hidden");

  function fechar(): void {
    lista.classList.add("hidden");
    campo.setAttribute("aria-expanded", "false");
    campo.removeAttribute("aria-activedescendant");
    ativo = -1;
  }

  function marcar(indice: number): void {
    ativo = indice;
    const opcoes = lista.querySelectorAll<HTMLLIElement>("[role=option]");
    opcoes.forEach((li, i) => li.setAttribute("aria-selected", String(i === indice)));
    const li = opcoes[indice];
    if (li) {
      campo.setAttribute("aria-activedescendant", li.id);
      li.scrollIntoView({ block: "nearest" });
    }
  }

  function abrir(todos = false): void {
    visiveis = todos ? itens : filtrarItens(itens, campo.value);
    lista.replaceChildren();
    let grupoAnterior: string | undefined;
    visiveis.forEach((item, i) => {
      if (item.grupo && item.grupo !== grupoAnterior) {
        const cab = document.createElement("li");
        cab.className = "caixa-busca__grupo";
        cab.setAttribute("role", "presentation");
        cab.textContent = item.grupo;
        lista.appendChild(cab);
        grupoAnterior = item.grupo;
      }
      const li = document.createElement("li");
      li.className = "caixa-busca__opcao";
      li.id = `${lista.id}-${i}`;
      li.setAttribute("role", "option");
      li.setAttribute("aria-selected", "false");
      li.dataset.valor = item.valor;
      li.textContent = item.rotulo;
      // mousedown: escolhe antes de o campo perder o foco
      li.addEventListener("mousedown", (evento) => {
        evento.preventDefault();
        escolher(item);
      });
      lista.appendChild(li);
    });
    if (!visiveis.length) {
      const vazio = document.createElement("li");
      vazio.className = "caixa-busca__vazio";
      vazio.setAttribute("role", "presentation");
      vazio.textContent = campo.value.trim()
        ? `Nenhum modelo na lista: "${campo.value.trim().toUpperCase()}" será salvo como está escrito.`
        : "Nenhum modelo cadastrado.";
      lista.appendChild(vazio);
    }
    lista.classList.remove("hidden");
    campo.setAttribute("aria-expanded", "true");
    marcar(visiveis.length && campo.value.trim() ? 0 : -1);
  }

  function escolher(item: ItemBusca): void {
    atual = item;
    campo.value = item.rotulo;
    fechar();
    aoMudar(item, item.rotulo);
  }

  /** O texto digitado bate exatamente com um item? (ex.: digitou "onix (chevrolet)") */
  function conferirTexto(): void {
    const texto = normalizar(campo.value);
    atual = itens.find((i) => normalizar(i.rotulo) === texto) ?? null;
    aoMudar(atual, campo.value);
  }

  campo.addEventListener("input", () => {
    conferirTexto();
    abrir();
  });
  campo.addEventListener("focus", () => abrir());
  campo.addEventListener("click", () => { if (!aberta()) abrir(); });
  campo.addEventListener("blur", () => fechar());
  campo.addEventListener("keydown", (evento) => {
    if (evento.key === "ArrowDown" || evento.key === "ArrowUp") {
      evento.preventDefault();
      if (!aberta()) {
        abrir();
        return;
      }
      if (!visiveis.length) return;
      const passo = evento.key === "ArrowDown" ? 1 : -1;
      marcar((ativo + passo + visiveis.length) % visiveis.length);
      return;
    }
    if (evento.key === "Enter" && aberta() && ativo >= 0 && visiveis[ativo]) {
      // Enter com um item marcado escolhe o item (nao envia o formulario)
      evento.preventDefault();
      evento.stopPropagation();
      escolher(visiveis[ativo]);
      return;
    }
    if (evento.key === "Escape" && aberta()) {
      // fecha so a lista (o ESC nao volta de tela)
      evento.preventDefault();
      evento.stopPropagation();
      fechar();
    }
  });

  return {
    definirItens(novos) {
      itens = novos;
    },
    escolhido: () => atual,
    limpar() {
      campo.value = "";
      atual = null;
      fechar();
    },
  };
}
