// CONTROLE > Todos os tecnicos / veiculos / produtos: tabela como o Controle do
// Contas a Pagar (pesquisa, filtros, selos, area de edicao com "Alterar um campo",
// ativar/desativar e excluir). Uma configuracao por tela.
import { recolherTabela } from "../tabela-recolhivel";
import {
  alterarItemLista,
  buscarStatus,
  excluirItemLista,
  excluirServico,
  excluirVeiculo,
  listarLista,
  listarMarcas,
  listarServicos,
  listarVeiculos,
  salvarServico,
  salvarVeiculo,
  ErroApi,
  ErroValidacaoApi,
  ItemListaDados,
  ServicoDados,
  VeiculoDados,
} from "../api";
import { criarEditorCampo, CampoEditavel, EditorCampo } from "../editor-registro";
import { confirmarExclusao } from "../componentes";
import { notificar } from "../notificacoes";
import { montarNavbar } from "../navbar";
import { irPara, Tela } from "../navegacao";
import { formatarMoedaBR } from "../mascaras";
import { correspondeBusca } from "../filtros";
import { criarAvatar } from "../perfil";

type Filtro = "TODOS" | "ATIVOS" | "INATIVOS";

interface Coluna<T> {
  titulo: string;
  classe?: string;
  /** texto simples, ou um no (selo, bolinha) */
  valor: (item: T) => string | HTMLElement;
}

interface Config<T extends { id: number; ativo: boolean }> {
  formulario: Tela;
  nome: (item: T) => string;
  colunas: Coluna<T>[];
  pesquisa: (item: T) => (string | null)[];
  carregar: (cfg: FinDeskConfig) => Promise<T[]>;
  campos: () => CampoEditavel[];
  valorCampo: (item: T, campo: string) => string;
  aplicar: (cfg: FinDeskConfig, item: T, campo: string, valor: string) => Promise<void>;
  alternarAtivo: (cfg: FinDeskConfig, item: T) => Promise<void>;
  excluir: (cfg: FinDeskConfig, item: T) => Promise<void>;
  /** aviso extra na confirmacao de exclusao */
  avisoExclusao?: (item: T) => string;
}

function selo(texto: string, classe: string): HTMLSpanElement {
  const s = document.createElement("span");
  s.className = `selo ${classe}`;
  s.textContent = texto;
  return s;
}

const seloAtivo = (ativo: boolean): HTMLSpanElement =>
  ativo ? selo("Ativo", "bg-[#006c46]/10 text-[#006c46]") : selo("Desativado", "bg-neutral-200 text-neutral-700");

function precoTexto(texto: string): string | null {
  const t = texto.replace(/R\$\s?/, "").trim();
  if (!t) return "0.00";
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

let marcas: string[] = [];

const TECNICOS: Config<ItemListaDados> = {
  formulario: "form-tecnico",
  nome: (t) => t.nome,
  colunas: [
    { titulo: "", classe: "w-16", valor: (t) => criarAvatar(t, "pequena") },
    { titulo: "TÉCNICO", valor: (t) => t.nome },
    { titulo: "SITUAÇÃO", classe: "text-center", valor: (t) => seloAtivo(t.ativo) },
  ],
  pesquisa: (t) => [t.nome],
  carregar: (cfg) => listarLista(cfg, "tecnicos"),
  campos: () => [{ valor: "nome", rotulo: "Nome do técnico" }],
  valorCampo: (t) => t.nome,
  aplicar: (cfg, t, _campo, valor) => alterarItemLista(cfg, "tecnicos", t.id, valor, t.ativo),
  alternarAtivo: (cfg, t) => alterarItemLista(cfg, "tecnicos", t.id, t.nome, !t.ativo),
  excluir: (cfg, t) => excluirItemLista(cfg, "tecnicos", t.id),
  avisoExclusao: () => "As garantias continuam com o nome do técnico.",
};

const VEICULOS: Config<VeiculoDados> = {
  formulario: "form-veiculo",
  nome: (v) => `${v.marca} ${v.modelo}`,
  colunas: [
    { titulo: "MARCA", valor: (v) => v.marca },
    { titulo: "MODELO", valor: (v) => v.modelo },
    { titulo: "GARANTIAS", classe: "text-right font-mono", valor: (v) => String(v.garantias) },
    { titulo: "SITUAÇÃO", classe: "text-center", valor: (v) => seloAtivo(v.ativo) },
  ],
  pesquisa: (v) => [v.marca, v.modelo],
  carregar: async (cfg) => {
    marcas = await listarMarcas(cfg);
    return listarVeiculos(cfg);
  },
  campos: () => [
    { valor: "marca", rotulo: "Marca", opcoes: () => marcas.map((m) => ({ valor: m, rotulo: m })) },
    { valor: "modelo", rotulo: "Modelo" },
  ],
  valorCampo: (v, campo) => (campo === "marca" ? v.marca : v.modelo),
  aplicar: async (cfg, v, campo, valor) => {
    await salvarVeiculo(cfg, { id: v.id, marca: campo === "marca" ? valor : v.marca, modelo: campo === "modelo" ? valor : v.modelo, ativo: v.ativo });
  },
  alternarAtivo: async (cfg, v) => {
    await salvarVeiculo(cfg, { id: v.id, marca: v.marca, modelo: v.modelo, ativo: !v.ativo });
  },
  excluir: (cfg, v) => excluirVeiculo(cfg, v.id),
  avisoExclusao: (v) => (v.garantias ? `${v.garantias} garantia(s) continuam com o nome do veículo.` : ""),
};

const PRODUTOS: Config<ServicoDados> = {
  formulario: "form-produto",
  nome: (s) => s.nome,
  colunas: [
    { titulo: "SERVIÇO / PEÇA", valor: (s) => s.nome },
    { titulo: "TIPO", classe: "text-center", valor: (s) => (s.peca ? selo("Peça", "bg-[#e0f2fe] text-[#075985]") : selo("Serviço", "bg-[#FFE600]/40 text-[#6a5f00]")) },
    { titulo: "PREÇO", classe: "text-right font-mono whitespace-nowrap", valor: (s) => formatarMoedaBR(Math.round(s.preco * 100)) },
    { titulo: "CÓDIGO NO CUPOM", classe: "font-mono", valor: (s) => s.codigoCupom ?? "—" },
    { titulo: "NOME NO RM (PADRÃO)", valor: (s) => s.nomeRm ?? "—" },
    { titulo: "SITUAÇÃO", classe: "text-center", valor: (s) => seloAtivo(s.ativo) },
  ],
  pesquisa: (s) => [s.nome, s.codigoCupom, s.nomeRm ?? null],
  carregar: listarServicos,
  campos: () => [
    { valor: "nome", rotulo: "Nome" },
    { valor: "preco", rotulo: "Preço (R$)", mascara: "moeda" },
    { valor: "codigoCupom", rotulo: "Código no cupom" },
    { valor: "nomeRm", rotulo: "Nome no RM (padrão)" },
  ],
  valorCampo: (s, campo) =>
    campo === "preco" ? formatarMoedaBR(Math.round(s.preco * 100)).replace("R$ ", "") : campo === "codigoCupom" ? s.codigoCupom ?? "" : campo === "nomeRm" ? s.nomeRm ?? "" : s.nome,
  aplicar: async (cfg, s, campo, valor) => {
    const p = campo === "preco" ? precoTexto(valor) : s.preco.toFixed(2);
    if (p === null) throw new ErroValidacaoApi({ preco: "Preço inválido. Exemplo: 150,00." });
    await salvarServico(cfg, {
      ...s, preco: p, nome: campo === "nome" ? valor : s.nome, codigoCupom: campo === "codigoCupom" ? valor || null : s.codigoCupom,
      nomeRm: campo === "nomeRm" ? valor || null : s.nomeRm ?? null,
    });
  },
  alternarAtivo: async (cfg, s) => {
    await salvarServico(cfg, { ...s, preco: s.preco.toFixed(2), ativo: !s.ativo });
  },
  excluir: (cfg, s) => excluirServico(cfg, s.id),
};

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function montar<T extends { id: number; ativo: boolean }>(tela: Tela, cfgTela: Config<T>): void {
  let itens: T[] = [];
  let filtro: Filtro = "TODOS";
  let pesquisa = "";
  let selecionadoId: number | null = null;
  const selecionado = (): T | undefined => itens.find((i) => i.id === selecionadoId);

  const cab = el("cabecalho");
  for (const c of cfgTela.colunas) {
    const th = document.createElement("th");
    th.className = `py-3 px-3 whitespace-nowrap ${c.classe ?? ""}`;
    th.textContent = c.titulo;
    cab.appendChild(th);
  }

  const editor: EditorCampo = criarEditorCampo(cfgTela.campos, (campo) => {
    const item = selecionado();
    return item ? cfgTela.valorCampo(item, campo) : "";
  });

  const render = (): void => {
    const corpo = el("tableBody");
    corpo.replaceChildren();
    const lista = itens.filter((i) => (filtro === "ATIVOS" ? i.ativo : filtro === "INATIVOS" ? !i.ativo : true)
      && correspondeBusca(pesquisa, cfgTela.pesquisa(i)));
    for (const item of lista) {
      const tr = document.createElement("tr");
      tr.className = "linha-cadastro cursor-pointer transition-colors hover:bg-[#fff9d6]";
      tr.dataset.id = String(item.id);
      if (!item.ativo) tr.classList.add("text-neutral-500");
      if (item.id === selecionadoId) tr.classList.add("bg-[#FFE600]", "border-l-8", "border-l-[#1c1b1b]");
      for (const c of cfgTela.colunas) {
        const td = document.createElement("td");
        td.className = `py-2.5 px-3 ${c.classe ?? ""}`;
        const v = c.valor(item);
        if (typeof v === "string") td.textContent = v;
        else td.appendChild(v);
        tr.appendChild(td);
      }
      tr.addEventListener("click", () => selecionar(item.id));
      corpo.appendChild(tr);
    }
    if (!lista.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = cfgTela.colunas.length;
      td.className = "py-6 px-3 text-center font-mono text-xs font-bold uppercase text-neutral-500";
      td.textContent = itens.length ? "Nada encontrado com essa pesquisa e esse filtro." : "Nenhum cadastro ainda. Use CADASTRAR.";
      tr.appendChild(td);
      corpo.appendChild(tr);
    }
    el("contador").textContent = `${lista.length} de ${itens.length} registro(s)`;
    // so as 5 primeiras; EXPANDIR TABELA mostra todas (a selecionada nunca some)
    recolherTabela("cadastros", corpo, corpo.closest("table")!.parentElement as HTMLElement, selecionadoId);
    el("selectionEmptyState").classList.toggle("hidden", selecionadoId !== null);
  };

  const selecionar = (id: number): void => {
    selecionadoId = id;
    const item = selecionado();
    if (!item) return;
    el("editorContainer").classList.remove("hidden");
    el("editorRecordName").textContent = cfgTela.nome(item);
    el("btnAtivoTexto").textContent = item.ativo ? "DESATIVAR" : "ATIVAR";
    editor.atualizar();
    render();
  };

  const fechar = (): void => {
    selecionadoId = null;
    el("editorContainer").classList.add("hidden");
    editor.erro();
    render();
  };

  const recarregar = async (): Promise<void> => {
    itens = await cfgTela.carregar(await window.finDesk!.config());
    if (selecionadoId !== null && !itens.some((i) => i.id === selecionadoId)) fechar();
    else if (selecionadoId !== null) selecionar(selecionadoId);
    else render();
    document.body.dataset.registros = String(itens.length);
  };

  el("searchInput").addEventListener("input", () => {
    pesquisa = el<HTMLInputElement>("searchInput").value.trim();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>(".filter-btn").forEach((b) => {
    b.addEventListener("click", () => {
      filtro = b.dataset.filter as Filtro;
      document.querySelectorAll(".filter-btn").forEach((x) => x.classList.toggle("active-filter", x === b));
      render();
    });
  });
  el("btnNovo").addEventListener("click", () => void irPara(cfgTela.formulario));
  el("btnClearSelection").addEventListener("click", fechar);
  el("btnApplyChange").addEventListener("click", () => {
    const item = selecionado();
    if (!item) return;
    const valor = editor.ler().trim();
    if (!valor && editor.campo() !== "codigoCupom" && editor.campo() !== "nomeRm") {
      editor.erro("Informe o novo valor.");
      return;
    }
    void (async () => {
      try {
        await cfgTela.aplicar(await window.finDesk!.config(), item, editor.campo(), valor);
        editor.erro();
        await recarregar();
        notificar("Alteração salva.");
      } catch (erro) {
        editor.erro(erro instanceof ErroValidacaoApi ? Object.values(erro.campos)[0] ?? "Dados inválidos." : "Não foi possível salvar. Tente de novo.");
      }
    })();
  });
  el("btnAtivo").addEventListener("click", () => {
    const item = selecionado();
    if (!item) return;
    void (async () => {
      await cfgTela.alternarAtivo(await window.finDesk!.config(), item);
      await recarregar();
      notificar(item.ativo ? `${cfgTela.nome(item)} desativado: não aparece mais no cadastro da garantia.` : `${cfgTela.nome(item)} ativado.`);
    })().catch(() => notificar("Não foi possível alterar. Tente de novo.", "erro"));
  });
  el("btnExcluir").addEventListener("click", () => {
    const item = selecionado();
    if (!item) return;
    void (async () => {
      if (!(await confirmarExclusao(`"${cfgTela.nome(item)}"`))) return;
      try {
        await cfgTela.excluir(await window.finDesk!.config(), item);
        fechar();
        await recarregar();
        const aviso = cfgTela.avisoExclusao?.(item);
        notificar(`${cfgTela.nome(item)} excluído.${aviso ? ` ${aviso}` : ""}`);
      } catch (erro) {
        notificar(erro instanceof ErroApi && erro.status === 409
          ? "Não dá para excluir: já foi usado em garantias. Use DESATIVAR."
          : "Não foi possível excluir. Tente de novo.", "erro");
      }
    })();
  });

  void recarregar().catch((erro) => {
    notificar("Não foi possível carregar a lista. Feche e abra a tela de novo.", "erro");
    console.error("[Garantias] falha ao carregar:", erro);
  });
  void window.finDesk!.config().then((cfg) => buscarStatus(cfg))
    .then(() => { document.body.dataset.apiStatus = "ok"; })
    .catch(() => { document.body.dataset.apiStatus = "erro"; });
  console.info(`[Garantias] ${tela} iniciada`);
}

export function iniciarTodosCadastro(tela: string): void {
  montarNavbar(tela as Tela);
  if (tela === "todos-tecnicos") montar(tela, TECNICOS);
  else if (tela === "todos-veiculos") montar(tela, VEICULOS);
  else montar(tela as Tela, PRODUTOS);
}
