// CONTROLE > Cadastrar tecnico / veiculo / produto (tabela de valores).
// Um formulario por tela (form-tecnico, form-veiculo, form-produto), mesma logica:
// valida, salva na API, avisa e limpa para o proximo cadastro.
import {
  buscarStatus,
  incluirNaLista,
  listarMarcas,
  salvarServico,
  salvarVeiculo,
  ErroValidacaoApi,
} from "../api";
import { notificar } from "../notificacoes";
import { montarNavbar } from "../navbar";
import { mascaraMoeda } from "../mascaras";

type TelaForm = "form-tecnico" | "form-veiculo" | "form-produto";
const NOVA_MARCA = "__nova__";

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function valor(id: string): string {
  return el<HTMLInputElement>(id).value.trim();
}

function marcado(id: string): boolean {
  return el<HTMLInputElement>(id).checked;
}

function mostrarErros(erros: Record<string, string>): void {
  document.querySelectorAll<HTMLElement>(".campo-erro").forEach((p) => {
    const msg = erros[p.dataset.erroCampo ?? ""];
    p.textContent = msg ?? "";
    p.classList.toggle("hidden", !msg);
  });
}

/** "1.234,56" -> "1234.56"; vazio -> "0.00"; invalido -> null. */
function preco(texto: string): string | null {
  if (!texto) return "0.00";
  const n = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 ? n.toFixed(2) : null;
}

async function salvar(tela: TelaForm): Promise<void> {
  const cfg = await window.finDesk!.config();
  if (tela === "form-tecnico") {
    if (!valor("nome")) return mostrarErros({ nome: "Informe o nome do técnico." });
    const t = await incluirNaLista(cfg, "tecnicos", valor("nome"));
    notificar(`Técnico ${t.nome} cadastrado. Ele já aparece na tela de perfis.`);
    return;
  }
  if (tela === "form-veiculo") {
    const escolhida = el<HTMLSelectElement>("marca").value;
    const marca = escolhida === NOVA_MARCA ? valor("marca_nova") : escolhida;
    const erros: Record<string, string> = {};
    if (!marca) erros.marca = "Escolha a marca (ou digite a nova marca).";
    if (!valor("modelo")) erros.modelo = "Informe o modelo.";
    if (Object.keys(erros).length) return mostrarErros(erros);
    const v = await salvarVeiculo(cfg, { marca, modelo: valor("modelo") });
    notificar(`Veículo ${v.marca} ${v.modelo} cadastrado.`);
    await carregarMarcas();
    return;
  }
  const p = preco(valor("preco"));
  const erros: Record<string, string> = {};
  if (valor("nome").length < 2) erros.nome = "Informe o nome do serviço ou da peça.";
  if (p === null) erros.preco = "Preço inválido. Exemplo: 150,00.";
  if (Object.keys(erros).length) return mostrarErros(erros);
  const peca = marcado("peca");
  const s = await salvarServico(cfg, {
    nome: valor("nome"), preco: p!, codigoCupom: valor("codigoCupom") || null,
    pedeCarcaca: !peca && marcado("pedeCarcaca"), pedeBotao: !peca && marcado("pedeBotao"),
    pedePilha: !peca && marcado("pedePilha"), pedeItens: !peca && marcado("pedeItens"), peca, ativo: true,
  });
  notificar(`${s.nome} incluído na tabela de valores.`);
}

async function carregarMarcas(): Promise<void> {
  const sel = el<HTMLSelectElement>("marca");
  const marcas = await listarMarcas(await window.finDesk!.config());
  const primeira = sel.options[0];
  sel.replaceChildren(primeira, ...marcas.map((m) => {
    const o = document.createElement("option");
    o.value = m;
    o.textContent = m;
    return o;
  }));
  const nova = document.createElement("option");
  nova.value = NOVA_MARCA;
  nova.textContent = "+ NOVA MARCA...";
  sel.appendChild(nova);
}

function limpar(): void {
  el<HTMLFormElement>("form-cadastro").reset();
  el("marca_nova")?.classList.add("hidden");
  mostrarErros({});
  document.querySelector<HTMLElement>("#form-cadastro input:not([type=checkbox]), #form-cadastro select")?.focus();
}

export function iniciarFormCadastro(tela: string): void {
  const t = tela as TelaForm;
  montarNavbar(t);
  if (t === "form-produto") mascaraMoeda(el<HTMLInputElement>("preco"));
  if (t === "form-veiculo") {
    el("marca").addEventListener("change", () => {
      const nova = el<HTMLSelectElement>("marca").value === NOVA_MARCA;
      el("marca_nova").classList.toggle("hidden", !nova);
      if (nova) el("marca_nova").focus();
    });
    void carregarMarcas();
  }
  el("btn-limpar").addEventListener("click", limpar);
  el<HTMLFormElement>("form-cadastro").addEventListener("submit", (evento) => {
    evento.preventDefault();
    void (async () => {
      try {
        mostrarErros({});
        const antes = document.querySelectorAll(".campo-erro:not(.hidden)").length;
        await salvar(t);
        if (document.querySelectorAll(".campo-erro:not(.hidden)").length === antes) {
          document.body.dataset.cadastroSalvo = String(Date.now());
          limpar();
        }
      } catch (erro) {
        if (erro instanceof ErroValidacaoApi) mostrarErros(erro.campos);
        else notificar("Não foi possível salvar. Tente de novo.", "erro");
        console.error("[Garantias] falha no cadastro:", erro);
      }
    })();
  });
  void window.finDesk!.config().then((cfg) => buscarStatus(cfg))
    .then(() => { document.body.dataset.apiStatus = "ok"; })
    .catch(() => { document.body.dataset.apiStatus = "erro"; });
  document.querySelector<HTMLElement>("#form-cadastro input:not([type=checkbox]), #form-cadastro select")?.focus();
}
