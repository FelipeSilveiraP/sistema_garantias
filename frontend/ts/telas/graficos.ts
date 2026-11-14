// GRAFICOS do Sistema de Garantias: totais do periodo, garantias por mes e os
// rankings de servicos, tecnicos e modelos (dados reais do SQLite).
import { buscarStatus, buscarEstatisticas, GrupoEstatistica, ResumoEstatistica } from "../api";
import { montarNavbar } from "../navbar";
import { formatarMoedaBR } from "../mascaras";
import { isoLocal } from "../filtros";
import { imprimirRelatorio } from "../impressao";

let periodo: "mes" | "trimestre" | "ano" = "mes";
const NOMES_MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function limites(): { de: string; ate: string } {
  const hoje = new Date();
  const ano = hoje.getFullYear();
  const mes = hoje.getMonth();
  if (periodo === "ano") return { de: `${ano}-01-01`, ate: `${ano}-12-31` };
  const inicio = periodo === "trimestre" ? new Date(ano, mes - 2, 1) : new Date(ano, mes, 1);
  return { de: isoLocal(inicio), ate: isoLocal(new Date(ano, mes + 1, 0)) };
}

function seisMeses(): { de: string; ate: string; meses: string[] } {
  const hoje = new Date();
  const meses: string[] = [];
  for (let i = 5; i >= 0; i--) meses.push(isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() - i, 1)).slice(0, 7));
  return { de: `${meses[0]}-01`, ate: isoLocal(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)), meses };
}

function vazio(area: HTMLElement, texto: string): void {
  const p = document.createElement("p");
  p.className = "font-mono text-sm font-bold text-neutral-500 uppercase self-center";
  p.textContent = texto;
  area.replaceChildren(p);
}

function renderKpis(r: ResumoEstatistica): void {
  el("kpiQuantidade").textContent = String(r.quantidade);
  el("kpiQuantidadeSub").textContent = `${r.semPlaca} sem placa (identificados pelo CPF)`;
  el("kpiTotal").textContent = formatarMoedaBR(r.totalCentavos);
  el("kpiTotalSub").textContent = r.quantidade ? `Média de ${formatarMoedaBR(Math.round(r.totalCentavos / r.quantidade))} por garantia` : "—";
  el("kpiSemCupom").textContent = String(r.semCupom);
  el("kpiSemCupomSub").textContent = "Garantias do sistema ainda sem cupom lançado";
}

function renderMensal(r: ResumoEstatistica, meses: string[]): void {
  const area = el("graficoMensal");
  area.replaceChildren();
  const porMes = new Map(r.porMes.map((m) => [m.mes, m]));
  const dados = meses.map((mes) => porMes.get(mes) ?? { mes, quantidade: 0, totalCentavos: 0 });
  const maximo = Math.max(...dados.map((m) => m.quantidade), 1);
  if (dados.every((m) => m.quantidade === 0)) {
    vazio(area, "Sem garantias nos últimos 6 meses.");
    return;
  }
  for (const item of dados) {
    const coluna = document.createElement("div");
    coluna.className = "flex flex-col items-center gap-1 min-w-[3rem] flex-1";
    const numero = document.createElement("span");
    numero.className = "font-mono text-xs font-bold";
    numero.textContent = String(item.quantidade);
    const barra = document.createElement("div");
    barra.className = "w-8 bg-[#FFE600] border-2 border-black";
    barra.style.height = `${item.quantidade > 0 ? Math.max(6, Math.round((item.quantidade / maximo) * 120)) : 2}px`;
    barra.title = `${item.quantidade} garantia(s) · ${formatarMoedaBR(item.totalCentavos)}`;
    const rotulo = document.createElement("span");
    rotulo.className = "font-mono text-[10px] font-bold uppercase";
    const [a, m] = item.mes.split("-").map(Number);
    rotulo.textContent = `${NOMES_MES[m - 1]}/${String(a).slice(2)}`;
    coluna.append(numero, barra, rotulo);
    area.appendChild(coluna);
  }
}

function renderBarras(id: string, grupos: GrupoEstatistica[], cor: string): void {
  const area = el(id);
  area.replaceChildren();
  if (!grupos.length) {
    vazio(area, "Nenhuma garantia no período.");
    return;
  }
  const maximo = Math.max(...grupos.map((g) => g.quantidade), 1);
  for (const g of grupos) {
    const linha = document.createElement("div");
    linha.className = "flex items-center gap-3";
    const nome = document.createElement("span");
    nome.className = "w-44 shrink-0 font-mono text-xs font-bold uppercase truncate";
    nome.textContent = g.nome;
    nome.title = g.nome;
    const trilho = document.createElement("div");
    trilho.className = "flex-1 h-6 bg-white border-2 border-black";
    const barra = document.createElement("div");
    barra.className = `h-full ${cor} border-r-2 border-black`;
    barra.style.width = `${Math.max(4, Math.round((g.quantidade / maximo) * 100))}%`;
    trilho.appendChild(barra);
    const qtd = document.createElement("span");
    qtd.className = "w-10 shrink-0 font-mono text-xs font-bold text-right";
    qtd.textContent = String(g.quantidade);
    linha.append(nome, trilho, qtd);
    area.appendChild(linha);
  }
}

function renderRanking(id: string, grupos: GrupoEstatistica[], cor: string): void {
  const lista = el(id);
  lista.replaceChildren();
  if (!grupos.length) {
    vazio(lista, "Nenhuma garantia no período.");
    return;
  }
  grupos.forEach((g, i) => {
    const li = document.createElement("li");
    li.className = "flex items-center gap-3 border-b-2 border-black/10 pb-2";
    const pos = document.createElement("span");
    pos.className = `w-7 h-7 shrink-0 flex items-center justify-center ${cor} border-2 border-black font-mono text-xs font-bold`;
    pos.textContent = String(i + 1);
    const nome = document.createElement("span");
    nome.className = "flex-1 min-w-0 font-bold text-sm uppercase truncate";
    nome.textContent = g.nome;
    const valor = document.createElement("span");
    valor.className = "shrink-0 font-mono text-xs font-bold";
    valor.textContent = `${g.quantidade} · ${formatarMoedaBR(g.totalCentavos)}`;
    li.append(pos, nome, valor);
    lista.appendChild(li);
  });
}

async function carregar(): Promise<void> {
  try {
    const cfg = await window.finDesk!.config();
    const { de, ate } = limites();
    const seis = seisMeses();
    const [resumo, fluxo] = await Promise.all([buscarEstatisticas(cfg, de, ate), buscarEstatisticas(cfg, seis.de, seis.ate)]);
    renderKpis(resumo);
    renderMensal(fluxo, seis.meses);
    renderBarras("graficoServicos", resumo.porServico, "bg-[#FFE600]");
    renderRanking("graficoTecnicos", resumo.porTecnico, "bg-[#00FF66]");
    renderRanking("graficoModelos", resumo.porModelo, "bg-[#38BDF8]");
    document.body.dataset.resumoCarregado = "true";
  } catch (erro) {
    console.error("[Garantias] falha ao carregar os graficos:", erro);
    document.body.dataset.resumoCarregado = "erro";
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
  montarNavbar("graficos");
  document.querySelectorAll<HTMLButtonElement>(".periodo-btn").forEach((botao) => {
    botao.addEventListener("click", () => {
      periodo = (botao.dataset.periodo ?? "mes") as "mes" | "trimestre" | "ano";
      document.querySelectorAll<HTMLButtonElement>(".periodo-btn").forEach((b) => {
        const ativo = b === botao;
        b.classList.toggle("bg-[#00FF66]", ativo);
        b.classList.toggle("border-2", ativo);
        b.classList.toggle("border-black", ativo);
        b.classList.toggle("shadow-[2px_2px_0px_0px_#000]", ativo);
        b.classList.toggle("bg-white", !ativo);
      });
      void carregar();
    });
  });
  el("btn-imprimir").addEventListener("click", () => void imprimirRelatorio("Graficos"));
  void verificarApi();
  void carregar();
}

export function iniciarGraficos(): void {
  iniciar();
}
