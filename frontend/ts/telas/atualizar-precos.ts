// ATUALIZAR PRECOS — tabela de precos dos servicos e pecas (editavel linha a
// linha e com reajuste em %), novo servico/peca e as listas editaveis de
// tecnicos e modelos (no VBA eram fixas no codigo).
import {
  alterarItemLista,
  buscarStatus,
  excluirItemLista,
  incluirNaLista,
  listarLista,
  listarServicos,
  reajustarPrecos,
  salvarServico,
  ErroValidacaoApi,
  NomeLista,
  ServicoDados,
} from "../api";
import { confirmar, confirmarExclusao } from "../componentes";
import { notificar } from "../notificacoes";
import { montarNavbar } from "../navbar";
import { formatarMoedaCampo, mascaraMoeda } from "../mascaras";

const LISTAS: NomeLista[] = ["tecnicos", "modelos"];

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/** "1.234,56" -> "1234.56"; vazio -> "0.00"; invalido -> null. */
function precoTexto(campo: string): string | null {
  const t = campo.trim();
  if (!t) return "0.00";
  const n = Number(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

function primeiroErro(erro: unknown, padrao: string): string {
  return erro instanceof ErroValidacaoApi ? Object.values(erro.campos)[0] ?? padrao : padrao;
}

// ---------- tabela de precos ----------

function linhaServico(s: ServicoDados): HTMLTableRowElement {
  const tr = document.createElement("tr");
  tr.dataset.id = String(s.id);
  if (!s.ativo) tr.classList.add("bg-neutral-100", "text-neutral-500");
  const nome = document.createElement("td");
  nome.className = "py-2 px-3 uppercase";
  nome.textContent = s.nome;
  const tipo = document.createElement("td");
  tipo.className = "py-2 px-3 text-center";
  const selo = document.createElement("span");
  selo.className = `selo ${s.peca ? "bg-[#e0f2fe] text-[#075985]" : "bg-[#FFE600]/40 text-[#6a5f00]"}`;
  selo.textContent = s.peca ? "Peça" : "Serviço";
  tipo.appendChild(selo);
  const precoTd = document.createElement("td");
  precoTd.className = "py-2 px-3";
  const preco = document.createElement("input");
  preco.className = "entrada-form !py-1.5 font-mono";
  preco.inputMode = "numeric";
  preco.placeholder = "0,00";
  preco.value = formatarMoedaCampo(Math.round(s.preco * 100));
  preco.setAttribute("aria-label", `Preço de ${s.nome}`);
  mascaraMoeda(preco);
  precoTd.appendChild(preco);
  const codigoTd = document.createElement("td");
  codigoTd.className = "py-2 px-3";
  const codigo = document.createElement("input");
  codigo.className = "entrada-form !py-1.5 font-mono";
  codigo.maxLength = 30;
  codigo.value = s.codigoCupom ?? "";
  codigo.setAttribute("aria-label", `Código no cupom de ${s.nome}`);
  codigoTd.appendChild(codigo);
  const ativoTd = document.createElement("td");
  ativoTd.className = "py-2 px-3 text-center";
  const ativo = document.createElement("input");
  ativo.type = "checkbox";
  ativo.checked = s.ativo;
  ativo.className = "w-5 h-5 accent-[#1c1b1b] cursor-pointer";
  ativo.setAttribute("aria-label", `${s.nome} ativo`);
  ativoTd.appendChild(ativo);
  const acaoTd = document.createElement("td");
  acaoTd.className = "py-2 px-3";
  const salvar = document.createElement("button");
  salvar.type = "button";
  salvar.className = "btn-acao bg-white hover:bg-[#FFE600]";
  salvar.textContent = "SALVAR";
  salvar.disabled = true;
  acaoTd.appendChild(salvar);
  const mudou = (): void => {
    salvar.disabled = false;
    salvar.classList.add("bg-[#FFE600]");
  };
  preco.addEventListener("input", mudou);
  codigo.addEventListener("input", mudou);
  ativo.addEventListener("change", mudou);
  salvar.addEventListener("click", () => {
    void (async () => {
      const p = precoTexto(preco.value);
      if (p === null) {
        notificar(`Preço inválido em ${s.nome}. Exemplo: 150,00.`, "erro");
        return;
      }
      try {
        await salvarServico(await window.finDesk!.config(), { ...s, preco: p, codigoCupom: codigo.value.trim() || null, ativo: ativo.checked });
        notificar(`${s.nome}: preço salvo.`);
        await carregarPrecos();
      } catch (erro) {
        notificar(primeiroErro(erro, "Não foi possível salvar. Tente de novo."), "erro");
      }
    })();
  });
  tr.append(nome, tipo, precoTd, codigoTd, ativoTd, acaoTd);
  return tr;
}

async function carregarPrecos(): Promise<void> {
  const servicos = await listarServicos(await window.finDesk!.config());
  el("corpoPrecos").replaceChildren(...servicos.map(linhaServico));
  document.body.dataset.precosCarregados = String(servicos.length);
}

async function reajustar(): Promise<void> {
  const texto = el<HTMLInputElement>("reajuste").value.trim().replace(",", ".");
  const percentual = Number(texto);
  if (!texto || !Number.isFinite(percentual) || percentual === 0) {
    notificar("Informe o reajuste em %, por exemplo 10 (ou -5 para baixar).", "erro");
    return;
  }
  const pecas = el<HTMLInputElement>("reajuste_pecas").checked;
  const ok = await confirmar({
    titulo: "REAJUSTAR PREÇOS?",
    mensagem: `Todos os preços ativos${pecas ? "" : " (menos as peças)"} vão ${percentual > 0 ? "subir" : "baixar"} ${Math.abs(percentual)}%. A mudança fica registrada na auditoria.`,
    textoConfirmar: "REAJUSTAR",
    tom: "atencao",
  });
  if (!ok) return;
  try {
    const r = await reajustarPrecos(await window.finDesk!.config(), percentual.toString(), pecas);
    el<HTMLInputElement>("reajuste").value = "";
    notificar(`${r.atualizados} preço(s) reajustado(s).`);
    await carregarPrecos();
  } catch (erro) {
    notificar(primeiroErro(erro, "Não foi possível reajustar. Tente de novo."), "erro");
  }
}

async function incluirServico(): Promise<void> {
  const erroEl = document.querySelector<HTMLElement>('[data-erro-campo="novo"]')!;
  const nome = el<HTMLInputElement>("novo_nome").value.trim();
  const preco = precoTexto(el<HTMLInputElement>("novo_preco").value);
  const mostrar = (msg: string): void => {
    erroEl.textContent = msg;
    erroEl.classList.toggle("hidden", !msg);
  };
  if (nome.length < 2) return mostrar("Informe o nome do serviço ou da peça.");
  if (preco === null) return mostrar("Preço inválido. Exemplo: 150,00.");
  const peca = el<HTMLInputElement>("novo_peca").checked;
  try {
    await salvarServico(await window.finDesk!.config(), {
      nome, preco, codigoCupom: el<HTMLInputElement>("novo_codigo").value.trim() || null,
      pedeCarcaca: !peca && el<HTMLInputElement>("pede_carcaca").checked,
      pedeBotao: !peca && el<HTMLInputElement>("pede_botao").checked,
      pedePilha: !peca && el<HTMLInputElement>("pede_pilha").checked,
      pedeItens: !peca && el<HTMLInputElement>("pede_itens").checked,
      peca, ativo: true,
    });
    mostrar("");
    el<HTMLFormElement>("formServico").reset();
    notificar(`${nome.toUpperCase()} incluído na tabela de preços.`);
    await carregarPrecos();
  } catch (erro) {
    mostrar(primeiroErro(erro, "Não foi possível incluir. Tente de novo."));
  }
}

// ---------- tecnicos e modelos ----------

function botao(texto: string, perigo = false): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = texto;
  if (perigo) b.className = "perigo";
  return b;
}

async function carregarLista(lista: NomeLista): Promise<void> {
  const cfg = await window.finDesk!.config();
  const itens = await listarLista(cfg, lista);
  const ul = document.querySelector<HTMLElement>(`[data-itens="${lista}"]`)!;
  ul.replaceChildren(...itens.map((item) => {
    const li = document.createElement("li");
    if (!item.ativo) li.classList.add("inativo");
    const nome = document.createElement("span");
    nome.className = "nome";
    nome.textContent = item.nome;
    nome.title = item.ativo ? item.nome : `${item.nome} (desativado: não aparece no cadastro)`;
    const alternar = botao(item.ativo ? "DESATIVAR" : "ATIVAR");
    alternar.addEventListener("click", () => {
      void alterarItemLista(cfg, lista, item.id, item.nome, !item.ativo)
        .then(() => carregarLista(lista))
        .catch((erro) => notificar(primeiroErro(erro, "Não foi possível alterar."), "erro"));
    });
    const excluir = botao("EXCLUIR", true);
    excluir.addEventListener("click", () => {
      void (async () => {
        if (!(await confirmarExclusao(`"${item.nome}" da lista`))) return;
        await excluirItemLista(cfg, lista, item.id);
        notificar(`${item.nome} excluído da lista. As garantias antigas continuam com o nome.`);
        await carregarLista(lista);
      })().catch((erro) => notificar(primeiroErro(erro, "Não foi possível excluir."), "erro"));
    });
    li.append(nome, alternar, excluir);
    return li;
  }));
}

function ligarLista(lista: NomeLista): void {
  const form = document.querySelector<HTMLFormElement>(`[data-form-lista="${lista}"]`)!;
  const erroEl = document.querySelector<HTMLElement>(`[data-erro-lista="${lista}"]`)!;
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    const input = form.querySelector("input")!;
    void (async () => {
      try {
        const item = await incluirNaLista(await window.finDesk!.config(), lista, input.value);
        input.value = "";
        erroEl.classList.add("hidden");
        notificar(`${item.nome} incluído.`);
        await carregarLista(lista);
      } catch (erro) {
        erroEl.textContent = primeiroErro(erro, "Não foi possível incluir.");
        erroEl.classList.remove("hidden");
      }
    })();
  });
}

async function verificarApi(): Promise<void> {
  try {
    await buscarStatus(await window.finDesk!.config());
    document.body.dataset.apiStatus = "ok";
  } catch {
    document.body.dataset.apiStatus = "erro";
  }
}

function iniciar(): void {
  montarNavbar("atualizar-precos");
  mascaraMoeda(el<HTMLInputElement>("novo_preco"));
  el("btnReajustar").addEventListener("click", () => void reajustar());
  el<HTMLFormElement>("formServico").addEventListener("submit", (evento) => {
    evento.preventDefault();
    void incluirServico();
  });
  for (const lista of LISTAS) ligarLista(lista);
  void verificarApi();
  void Promise.all([carregarPrecos(), ...LISTAS.map(carregarLista)]).catch((erro) => {
    notificar("Não foi possível carregar os preços e as listas. Feche e abra a tela de novo.", "erro");
    console.error("[Garantias] falha ao carregar:", erro);
  });
}

export function iniciarAtualizarPrecos(): void {
  iniciar();
}
