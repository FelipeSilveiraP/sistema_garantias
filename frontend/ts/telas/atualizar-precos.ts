// ATUALIZAR PRECOS — tabela de precos dos servicos e pecas, editavel linha a
// linha e com reajuste em %. Cadastro de produtos, tecnicos e veiculos: CONTROLE.
import {
  buscarStatus,
  listarServicos,
  reajustarPrecos,
  salvarServico,
  ServicoDados,
  ErroValidacaoApi,
} from "../api";
import { confirmar } from "../componentes";
import { notificar } from "../notificacoes";
import { montarNavbar } from "../navbar";
import { formatarMoedaBR, formatarMoedaCampo, mascaraMoeda } from "../mascaras";


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
  const tipo = el<HTMLSelectElement>("reajuste_tipo").value === "valor" ? "valor" : "percentual";
  const emReais = tipo === "valor";
  const texto = el<HTMLInputElement>("reajuste").value.trim().replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const percentual = Number(texto);
  if (!texto || !Number.isFinite(percentual) || percentual === 0 || (emReais && !/^-?\d+(\.\d{1,2})?$/.test(texto))) {
    notificar(emReais ? "Informe o valor em R$, por exemplo 5,00 (ou -2,50 para baixar)." : "Informe o reajuste em %, por exemplo 10 (ou -5 para baixar).", "erro");
    return;
  }
  const pecas = el<HTMLInputElement>("reajuste_pecas").checked;
  const ok = await confirmar({
    titulo: "REAJUSTAR PREÇOS?",
    mensagem: `Todos os preços ativos${pecas ? "" : " (menos as peças)"} vão ${percentual > 0 ? "subir" : "baixar"} `
      + `${emReais ? formatarMoedaBR(Math.round(Math.abs(percentual) * 100)) : `${Math.abs(percentual)}%`}`
      + `${emReais && percentual < 0 ? " (nenhum fica abaixo de R$ 0,00)" : ""}. A mudança fica registrada na auditoria.`,
    textoConfirmar: "REAJUSTAR",
    tom: "atencao",
  });
  if (!ok) return;
  try {
    const r = await reajustarPrecos(await window.finDesk!.config(), emReais ? percentual.toFixed(2) : percentual.toString(), pecas, tipo);
    el<HTMLInputElement>("reajuste").value = "";
    notificar(`${r.atualizados} preço(s) reajustado(s).`);
    await carregarPrecos();
  } catch (erro) {
    notificar(primeiroErro(erro, "Não foi possível reajustar. Tente de novo."), "erro");
  }
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
  el("btnReajustar").addEventListener("click", () => void reajustar());
  void verificarApi();
  void carregarPrecos().catch((erro) => {
    notificar("Não foi possível carregar os preços. Feche e abra a tela de novo.", "erro");
    console.error("[Garantias] falha ao carregar:", erro);
  });
}

export function iniciarAtualizarPrecos(): void {
  iniciar();
}
