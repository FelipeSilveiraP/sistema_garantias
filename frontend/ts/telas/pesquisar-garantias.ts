// PESQUISAR GARANTIA — como o Controle do Contas a Pagar: pesquisa livre (placa,
// CPF, modelo, servico, tecnico, data ou valor), filtros de periodo, tabela com
// selos arredondados e a area de edicao ("Alterar um campo", cupom fiscal,
// imprimir e excluir). Tambem importa a planilha antiga GARANTIAS-AAAA.xlsm.
import {
  atualizarGarantia,
  buscarStatus,
  excluirGarantia,
  importarPlanilhaLegada,
  listarGarantias,
  listarLista,
  listarVeiculos,
  marcarCupom,
  ErroValidacaoApi,
  GarantiaDados,
  GarantiaEntrada,
  ItemListaDados,
  VeiculoDados,
} from "../api";
import { criarEditorCampo, EditorCampo } from "../editor-registro";
import { confirmar, confirmarExclusao } from "../componentes";
import { notificar } from "../notificacoes";
import { imprimirDocumento, cabecalhoFolha, tabelaCampos, assinaturas, criar } from "../impressao";
import { ligarExpansaoColunas } from "../tabela-colunas";
import { montarNavbar } from "../navbar";
import { formatarCPF, formatarDataBR, formatarMoedaBR, parseDataBR } from "../mascaras";
import { correspondeBusca, hojeIso } from "../filtros";
import { criarAvatar } from "../perfil";
import { recolherTabela } from "../tabela-recolhivel";

type Filtro = "MES" | "ANO" | "TODOS" | "SEMCUPOM";

const ROTULO_CUPOM: Record<GarantiaDados["cupomStatus"], { texto: string; classe: string }> = {
  NAO_LANCADO: { texto: "Pendente", classe: "bg-[#fde400]/30 text-[#6a5f00]" },
  LANCADO: { texto: "Lançado", classe: "bg-[#006c46]/10 text-[#006c46]" },
  DISPENSADO: { texto: "Sem cupom", classe: "bg-neutral-200 text-neutral-700" },
};

let garantias: GarantiaDados[] = [];
let tecnicos: ItemListaDados[] = [];
let veiculos: VeiculoDados[] = [];
let filtro: Filtro = "MES";
let pesquisa = "";
let selecionadoId: number | null = null;
let editor: EditorCampo;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function selecionada(): GarantiaDados | undefined {
  return garantias.find((g) => g.id === selecionadoId);
}

function centavos(g: GarantiaDados): number {
  return Math.round(g.valor * 100);
}

/** Quantidades como no VBA: "(2 Carc / 1 P)". */
function servicoComQuantidade(g: GarantiaDados): string {
  const partes: string[] = [];
  if (g.qtdCarcaca) partes.push(`${g.qtdCarcaca} carc.`);
  if (g.qtdBotao) partes.push(`${g.qtdBotao} botão`);
  if (g.qtdPilha) partes.push(`${g.qtdPilha} pilha`);
  if (g.qtdItens) partes.push(`${g.qtdItens} un.`);
  return partes.length ? `${g.servico} (${partes.join(" / ")})` : g.servico;
}

function filtradas(): GarantiaDados[] {
  const hoje = hojeIso();
  return garantias.filter((g) => {
    if (filtro === "MES" && g.dataServico.slice(0, 7) !== hoje.slice(0, 7)) return false;
    if (filtro === "ANO" && g.dataServico.slice(0, 4) !== hoje.slice(0, 4)) return false;
    if (filtro === "SEMCUPOM" && !(g.cupomStatus === "NAO_LANCADO" && g.origem === "SISTEMA")) return false;
    return correspondeBusca(pesquisa, [g.placa ?? "SEM PLACA", g.cpf, g.modelo, g.servico, g.tecnico, g.observacao,
      formatarDataBR(g.dataServico)], g.valor);
  });
}

function td(texto: string, classe: string): HTMLTableCellElement {
  const c = document.createElement("td");
  c.className = classe;
  c.textContent = texto;
  return c;
}

function seloTd(texto: string, classeSelo: string, classeTd: string): HTMLTableCellElement {
  const c = document.createElement("td");
  c.className = classeTd;
  const s = document.createElement("span");
  s.className = `selo ${classeSelo}`;
  s.textContent = texto;
  c.appendChild(s);
  return c;
}

/** Bolinha + nome do perfil que cadastrou (planilha antiga: sem perfil). */
function cadastradaPor(g: GarantiaDados): HTMLTableCellElement {
  const c = document.createElement("td");
  c.className = "col-extra py-3 px-3 whitespace-nowrap text-xs";
  if (!g.criadoPor) {
    c.textContent = g.origem === "LEGADO" ? "Planilha antiga" : "—";
    return c;
  }
  const t = tecnicos.find((x) => x.nome === g.criadoPor);
  const caixa = document.createElement("span");
  caixa.className = "inline-flex items-center gap-2";
  const nome = document.createElement("span");
  nome.textContent = g.criadoPor;
  caixa.append(criarAvatar({ id: t?.id ?? 0, nome: g.criadoPor }, "pequena"), nome);
  c.appendChild(caixa);
  return c;
}

/** Tabela com altura de 5 garantias e rolagem por dentro (tabela-recolhivel.ts). */

function renderTabela(): void {
  const corpo = el("tableBody");
  corpo.replaceChildren();
  const lista = filtradas();
  for (const g of lista) {
    const tr = document.createElement("tr");
    tr.className = "linha-garantia cursor-pointer transition-colors hover:bg-[#fff9d6]";
    tr.dataset.id = String(g.id);
    if (selecionadoId === g.id) tr.classList.add("bg-[#FFE600]", "border-l-8", "border-l-[#1c1b1b]");
    const cupom = ROTULO_CUPOM[g.cupomStatus];
    tr.append(
      td(formatarDataBR(g.dataServico), "py-3 px-3 font-mono font-bold whitespace-nowrap"),
      g.placa ? td(g.placa, "py-3 px-3 font-mono font-bold whitespace-nowrap")
        : seloTd("Sem placa", "bg-neutral-100 text-neutral-700", "py-3 px-3 whitespace-nowrap"),
      td(g.modelo, "py-3 px-3"),
      td(servicoComQuantidade(g), "py-3 px-3"),
      td(formatarMoedaBR(centavos(g)), "py-3 px-3 text-right font-mono font-bold whitespace-nowrap"),
      td(g.tecnico, "py-3 px-3 whitespace-nowrap"),
      g.origem === "LEGADO" ? seloTd("Planilha", "bg-[#e0f2fe] text-[#075985]", "py-3 px-3 text-center whitespace-nowrap")
        : seloTd(cupom.texto, cupom.classe, "py-3 px-3 text-center whitespace-nowrap"),
      td(g.cpf ? formatarCPF(g.cpf) : "—", "col-extra py-3 px-3 font-mono text-xs whitespace-nowrap"),
      td(g.observacao ?? "", "col-extra py-3 px-3 text-xs"),
      cadastradaPor(g),
      document.createElement("td"),
    );
    tr.addEventListener("click", () => selecionar(g.id));
    corpo.appendChild(tr);
  }
  if (!lista.length) {
    const tr = document.createElement("tr");
    const c = td(garantias.length ? "Nenhuma garantia encontrada com essa pesquisa e esse filtro."
      : "Nenhuma garantia cadastrada. Use CADASTRAR GARANTIA ou IMPORTAR PLANILHA ANTIGA.",
    "py-6 px-3 text-center font-mono text-xs font-bold uppercase text-neutral-500");
    c.colSpan = 11;
    tr.appendChild(c);
    corpo.appendChild(tr);
  }
  const total = lista.reduce((s, g) => s + centavos(g), 0);
  el("contador").textContent = `${lista.length} garantia(s) · ${formatarMoedaBR(total)}`;
  recolherTabela("garantias", corpo, undefined, selecionadoId);
  el("selectionEmptyState").classList.toggle("hidden", selecionadoId !== null);
}

function selecionar(id: number): void {
  const g = garantias.find((x) => x.id === id);
  if (!g) return;
  selecionadoId = id;
  el("editorContainer").classList.remove("hidden");
  el("editorRecordName").textContent = `${g.placa ?? "SEM PLACA"} · ${g.modelo} · ${formatarDataBR(g.dataServico)}`;
  el<HTMLButtonElement>("btnCupomLancado").disabled = g.cupomStatus === "LANCADO";
  el<HTMLButtonElement>("btnCupomDispensado").disabled = g.cupomStatus === "DISPENSADO";
  el<HTMLButtonElement>("btnCupomPendente").disabled = g.cupomStatus === "NAO_LANCADO";
  editor.atualizar();
  renderTabela();
}

function fecharEdicao(): void {
  selecionadoId = null;
  el("editorContainer").classList.add("hidden");
  editor.erro();
  renderTabela();
}

async function recarregar(): Promise<void> {
  const cfg = await window.finDesk!.config();
  [garantias, tecnicos, veiculos] = await Promise.all([listarGarantias(cfg), listarLista(cfg, "tecnicos"), listarVeiculos(cfg)]);
  renderTabela();
  if (selecionadoId !== null) {
    if (garantias.some((g) => g.id === selecionadoId)) selecionar(selecionadoId);
    else fecharEdicao();
  }
  document.body.dataset.garantiasCarregadas = String(garantias.length);
}

function valorAtual(g: GarantiaDados, campo: string): string {
  switch (campo) {
    case "dataServico": return formatarDataBR(g.dataServico);
    case "placa": return g.placa ?? "";
    case "cpf": return g.cpf ? formatarCPF(g.cpf) : "";
    case "veiculo": return g.idVeiculo ? String(g.idVeiculo) : "";
    case "servico": return g.servico;
    case "valor": return formatarMoedaBR(centavos(g)).replace("R$ ", "");
    case "tecnico": return g.tecnico;
    default: return g.observacao ?? "";
  }
}

/** Dados atuais no formato do PUT (a edicao troca um campo por vez). */
function entradaDe(g: GarantiaDados): GarantiaEntrada {
  return {
    dataServico: g.dataServico, placa: g.placa ?? undefined, semPlaca: g.semPlaca, cpf: g.cpf ?? undefined,
    modelo: g.modelo, idVeiculo: g.idVeiculo, idServico: g.idServico, servico: g.servico, qtdCarcaca: g.qtdCarcaca, qtdBotao: g.qtdBotao,
    qtdPilha: g.qtdPilha, qtdItens: g.qtdItens, valor: g.valor.toFixed(2), tecnico: g.tecnico,
    observacao: g.observacao ?? undefined,
  };
}

async function aplicarAlteracao(): Promise<void> {
  const g = selecionada();
  if (!g) return;
  const campo = editor.campo();
  const bruto = editor.ler().trim();
  const dados = entradaDe(g);
  let erro = "";
  switch (campo) {
    case "dataServico": {
      const iso = parseDataBR(bruto);
      if (!iso) erro = "Data inválida. Use DD/MM/AAAA.";
      else dados.dataServico = iso;
      break;
    }
    case "placa": {
      const placa = bruto.replace(/[-\s]/g, "").toUpperCase();
      if (placa === "" || placa === "SEMPLACA") {
        if (!(g.cpf ?? "").length) erro = "Para deixar sem placa, preencha antes o CPF do cliente.";
        dados.semPlaca = true;
        dados.placa = undefined;
      } else {
        dados.semPlaca = false;
        dados.placa = placa;
      }
      break;
    }
    case "cpf": dados.cpf = bruto.replace(/\D/g, "") || undefined; break;
    case "veiculo": {
      const id = Number(bruto);
      if (!id) erro = "Escolha o modelo do carro.";
      else dados.idVeiculo = id;
      break;
    }
    case "servico": {
      // trocar o texto do servico vira "OUTRO" (as quantidades ficam no texto)
      dados.idServico = null;
      dados.servico = bruto;
      dados.qtdCarcaca = 0; dados.qtdBotao = 0; dados.qtdPilha = 0; dados.qtdItens = 0;
      break;
    }
    case "valor": {
      const limpo = bruto.replace(/R\$\s?/, "").replace(/\./g, "").replace(",", ".");
      const n = Number(limpo || "0");
      if (!Number.isFinite(n) || n < 0) erro = "Valor inválido. Exemplo: 150,00.";
      else dados.valor = n.toFixed(2);
      break;
    }
    case "tecnico": dados.tecnico = bruto; break;
    default: dados.observacao = bruto || undefined;
  }
  editor.erro(erro || undefined);
  if (erro) return;
  try {
    await atualizarGarantia(await window.finDesk!.config(), g.id, dados);
    await recarregar();
    notificar("Alteração salva.");
  } catch (falha) {
    if (falha instanceof ErroValidacaoApi) {
      editor.erro(Object.values(falha.campos)[0] ?? "Dados inválidos.");
    } else {
      editor.erro("Não foi possível salvar a alteração. Tente de novo.");
      console.error("[Garantias] falha na edicao:", falha);
    }
  }
}

async function cupom(status: GarantiaDados["cupomStatus"]): Promise<void> {
  const g = selecionada();
  if (!g) return;
  try {
    await marcarCupom(await window.finDesk!.config(), g.id, status);
    await recarregar();
    notificar(status === "LANCADO" ? "Cupom fiscal marcado como lançado." : status === "DISPENSADO"
      ? "Garantia marcada como sem cupom fiscal." : "Cupom fiscal voltou a pendente.");
  } catch (erro) {
    notificar("Não foi possível atualizar o cupom. Tente de novo.", "erro");
    console.error("[Garantias] falha no cupom:", erro);
  }
}

async function excluir(): Promise<void> {
  const g = selecionada();
  if (!g) return;
  if (!(await confirmarExclusao(`a garantia de ${g.placa ?? "cliente sem placa"} (${g.modelo}, ${formatarDataBR(g.dataServico)})`))) return;
  try {
    await excluirGarantia(await window.finDesk!.config(), g.id);
    fecharEdicao();
    await recarregar();
    notificar("Garantia excluída.");
  } catch (erro) {
    notificar("Não foi possível excluir a garantia. Tente de novo.", "erro");
    console.error("[Garantias] falha ao excluir:", erro);
  }
}

// ---------- impressao (PDF aberto no leitor, sem a janela nativa de impressao) ----------

async function imprimirGarantia(): Promise<void> {
  const g = selecionada();
  if (!g) return;
  await imprimirDocumento(`Garantia ${g.placa ?? "sem placa"}`, (folha) => {
    const p = criar("section", "folha__pagina");
    p.append(cabecalhoFolha("Comprovante de garantia"), tabelaCampos([
      ["Data do serviço", formatarDataBR(g.dataServico)],
      ["Placa", g.placa ?? "Sem placa"],
      ["CPF do cliente", g.cpf ? formatarCPF(g.cpf) : "—"],
      ["Modelo do carro", g.modelo],
      ["Serviço", servicoComQuantidade(g)],
      ["Valor", formatarMoedaBR(centavos(g))],
      ["Técnico", g.tecnico],
      ["Observação", g.observacao ?? "—"],
    ]), assinaturas(["Técnico responsável", "Cliente"]));
    folha.appendChild(p);
  }, { retrato: true });
}

async function imprimirLista(): Promise<void> {
  const lista = filtradas();
  await imprimirDocumento("Lista de garantias", (folha) => {
    const p = criar("section", "folha__pagina");
    p.append(cabecalhoFolha("Relação de garantias"), criar("p", "folha__nota",
      `${lista.length} garantia(s)${pesquisa ? ` · Pesquisa: "${pesquisa}"` : ""}`));
    const tabela = criar("table", "folha__lista");
    const cab = criar("tr");
    for (const [t, num] of [["Data", false], ["Placa", false], ["Modelo", false], ["Serviço", false], ["Valor", true], ["Técnico", false]] as [string, boolean][]) {
      cab.appendChild(criar("th", num ? "folha__num" : "", t));
    }
    const thead = criar("thead");
    thead.appendChild(cab);
    const corpo = criar("tbody");
    let total = 0;
    for (const g of lista) {
      total += centavos(g);
      const tr = criar("tr");
      tr.append(criar("td", "", formatarDataBR(g.dataServico)), criar("td", "", g.placa ?? "Sem placa"),
        criar("td", "", g.modelo), criar("td", "", servicoComQuantidade(g)),
        criar("td", "folha__num", formatarMoedaBR(centavos(g))), criar("td", "", g.tecnico));
      corpo.appendChild(tr);
    }
    const rodape = criar("tfoot");
    const trTotal = criar("tr");
    const rotulo = criar("td", "", "Total");
    rotulo.colSpan = 4;
    trTotal.append(rotulo, criar("td", "folha__num", formatarMoedaBR(total)), criar("td"));
    rodape.appendChild(trTotal);
    tabela.append(thead, corpo, rodape);
    p.appendChild(tabela);
    folha.appendChild(p);
  });
}

// ---------- importacao da planilha antiga ----------

function paraBase64(bytes: Uint8Array): string {
  let binario = "";
  for (let k = 0; k < bytes.length; k += 0x8000) binario += String.fromCharCode(...bytes.subarray(k, k + 0x8000));
  return btoa(binario);
}

async function importar(arquivo: File | undefined): Promise<void> {
  if (!arquivo) return;
  if (!/\.xls[xm]$/i.test(arquivo.name)) {
    notificar("Escolha a planilha GARANTIAS-AAAA.xlsm (ou .xlsx).", "erro");
    return;
  }
  if (arquivo.size > 30 * 1024 * 1024) {
    notificar("Planilha grande demais (o limite é 30 MB).", "erro");
    return;
  }
  const ok = await confirmar({
    titulo: "IMPORTAR PLANILHA ANTIGA?",
    mensagem: `As garantias das abas de meses de "${arquivo.name}" serão copiadas para o sistema. Importar o mesmo arquivo de novo não duplica nada.`,
    textoConfirmar: "IMPORTAR",
    tom: "normal",
  });
  if (!ok) return;
  try {
    const bytes = new Uint8Array(await arquivo.arrayBuffer());
    const r = await importarPlanilhaLegada(await window.finDesk!.config(), arquivo.name, paraBase64(bytes));
    filtro = "TODOS";
    marcarFiltro();
    await recarregar();
    notificar(`Planilha importada: ${r.importadas} garantia(s) nova(s)` + (r.jaImportadas ? `, ${r.jaImportadas} já estavam no sistema.` : "."));
  } catch (erro) {
    if (erro instanceof ErroValidacaoApi) notificar(Object.values(erro.campos)[0] ?? "Planilha recusada.", "erro");
    else notificar("Não foi possível importar a planilha. Tente de novo.", "erro");
    console.error("[Garantias] falha na importacao:", erro);
  }
}

function marcarFiltro(): void {
  document.querySelectorAll<HTMLButtonElement>(".filter-btn").forEach((b) => {
    b.classList.toggle("active-filter", b.dataset.filter === filtro);
  });
}

function montarEditor(): EditorCampo {
  return criarEditorCampo([
    { valor: "dataServico", rotulo: "Data do serviço", mascara: "data" },
    { valor: "placa", rotulo: "Placa (vazio = sem placa)" },
    { valor: "cpf", rotulo: "CPF do cliente", mascara: "cpf" },
    {
      valor: "veiculo", rotulo: "Modelo do carro",
      opcoes: () => veiculos.filter((v) => v.ativo).map((v) => ({ valor: String(v.id), rotulo: `${v.marca} ${v.modelo}` })),
    },
    { valor: "servico", rotulo: "Serviço (texto)" },
    { valor: "valor", rotulo: "Valor (R$)", mascara: "moeda" },
    { valor: "tecnico", rotulo: "Técnico", opcoes: () => tecnicos.filter((t) => t.ativo).map((t) => ({ valor: t.nome, rotulo: t.nome })) },
    { valor: "observacao", rotulo: "Observação" },
  ], (campo) => {
    const g = selecionada();
    return g ? valorAtual(g, campo) : "";
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
  montarNavbar("pesquisar-garantias");
  ligarExpansaoColunas(el("tabela"), el("btnExpandirColunas"));
  el("searchInput").addEventListener("input", () => {
    pesquisa = el<HTMLInputElement>("searchInput").value.trim();
    // pesquisando, procura em todas as garantias (como a busca do VBA, em todas as abas)
    if (pesquisa && filtro === "MES") {
      filtro = "TODOS";
      marcarFiltro();
    }
    renderTabela();
  });
  document.querySelectorAll<HTMLButtonElement>(".filter-btn").forEach((b) => {
    b.addEventListener("click", () => {
      filtro = b.dataset.filter as Filtro;
      marcarFiltro();
      renderTabela();
    });
  });
  editor = montarEditor();
  el("btnClearSelection").addEventListener("click", fecharEdicao);
  el("btnApplyChange").addEventListener("click", () => void aplicarAlteracao());
  el("btnExcluir").addEventListener("click", () => void excluir());
  el("btnCupomLancado").addEventListener("click", () => void cupom("LANCADO"));
  el("btnCupomDispensado").addEventListener("click", () => void cupom("DISPENSADO"));
  el("btnCupomPendente").addEventListener("click", () => void cupom("NAO_LANCADO"));
  el("btnImprimir").addEventListener("click", () => void imprimirGarantia());
  el("btnImprimirLista").addEventListener("click", () => void imprimirLista());
  const input = el<HTMLInputElement>("inputPlanilha");
  el("btnImportar").addEventListener("click", () => input.click());
  input.addEventListener("change", () => {
    const arquivo = input.files?.[0];
    input.value = "";
    void importar(arquivo);
  });
  void verificarApi();
  void recarregar().then(() => el<HTMLInputElement>("searchInput").focus());
  console.info("[Garantias] pesquisa de garantias iniciada");
}

export function iniciarPesquisarGarantias(): void {
  iniciar();
}
