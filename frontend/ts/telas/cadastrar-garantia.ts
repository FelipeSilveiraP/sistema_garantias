// CADASTRAR GARANTIA — formulario simples e claro, com as regras do VBA
// (frmControleGarantias V17.1): placa de 7 letras/numeros OU "sem placa" com
// CPF; servico da tabela de precos mostra so as quantidades que ele pede
// (carcaca, botao, pilha ou itens, de 1 a 5); "OUTRO" pede a descricao.
// O valor e sugerido pela tabela de precos e pode ser alterado.
import {
  buscarStatus,
  cadastrarGarantia,
  listarLista,
  listarServicos,
  listarVeiculos,
  ErroDuplicidadeApi,
  ErroValidacaoApi,
  GarantiaEntrada,
  ServicoDados,
} from "../api";
import { confirmarDuplicidade, confirmarSaida, dialogoEstaAberto, menuLateralAberto } from "../componentes";
import { notificar } from "../notificacoes";
import { montarNavbar } from "../navbar";
import { voltar } from "../navegacao";
import { formatarDataBR, formatarMoedaBR, formatarMoedaCampo, mascaraCPF, mascaraData, mascaraMoeda, parseDataBR } from "../mascaras";
import { hojeIso } from "../filtros";
import { perfilAtual } from "../perfil";

const OUTRO = "OUTRO";
let servicos: ServicoDados[] = [];
let sujo = false;
let valorDigitado = false;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function servicoEscolhido(): ServicoDados | null {
  const v = el<HTMLSelectElement>("servico").value;
  return servicos.find((s) => String(s.id) === v) ?? null;
}

function qtd(campo: string): number {
  return Number(document.querySelector<HTMLSelectElement>(`select[data-qtd="${campo}"]`)?.value ?? "1");
}

function centavosDoCampo(): number | null {
  const texto = el<HTMLInputElement>("valor").value.trim();
  if (!texto || /^0+(,0{1,2})?$/.test(texto)) return 0;
  const limpo = texto.replace(/\./g, "").replace(",", ".");
  const n = Math.round(Number(limpo) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Preco sugerido: servico x quantidade principal + botoes + pilhas (pecas da tabela). */
function precoSugerido(s: ServicoDados): number {
  const peca = (nome: string): number => Math.round((servicos.find((p) => p.peca && p.nome === nome)?.preco ?? 0) * 100);
  const principal = s.pedeCarcaca ? qtd("qtdCarcaca") : s.pedeItens ? qtd("qtdItens") : 1;
  return Math.round(s.preco * 100) * principal
    + (s.pedeBotao ? peca("BOTÃO") * qtd("qtdBotao") : 0)
    + (s.pedePilha ? peca("PILHA") * qtd("qtdPilha") : 0);
}

function atualizarServico(): void {
  const valor = el<HTMLSelectElement>("servico").value;
  const s = servicoEscolhido();
  el("bloco-outro").classList.toggle("hidden", valor !== OUTRO);
  el("bloco-quantidades").classList.toggle("hidden", !s);
  el("q-carcaca").classList.toggle("hidden", !s?.pedeCarcaca);
  el("q-botao").classList.toggle("hidden", !s?.pedeBotao);
  el("q-pilha").classList.toggle("hidden", !s?.pedePilha);
  el("q-itens").classList.toggle("hidden", !s?.pedeItens);
  // sem nenhuma quantidade pedida (servico novo sem marcacao): esconde o bloco
  if (s && !s.pedeCarcaca && !s.pedeBotao && !s.pedePilha && !s.pedeItens) el("bloco-quantidades").classList.add("hidden");
  if (s?.pedeItens) el("q-itens-rotulo").textContent = s.nome.replace(/^TROCA (DE |DA |DO )?/, "");
  sugerirValor();
}

function sugerirValor(): void {
  const s = servicoEscolhido();
  const sugerido = s ? precoSugerido(s) : 0;
  el("valor-dica").textContent = sugerido > 0 ? `TABELA: ${formatarMoedaBR(sugerido)}` : "";
  if (!valorDigitado) el<HTMLInputElement>("valor").value = sugerido > 0 ? formatarMoedaCampo(sugerido) : "";
}

/** CPF travado (embacado, cursor de bloqueio) ate marcar "carro sem placa"; a placa trava ao contrario. */
function atualizarSemPlaca(focar = true): void {
  const sem = el<HTMLInputElement>("sem_placa").checked;
  const placa = el<HTMLInputElement>("placa");
  const cpf = el<HTMLInputElement>("cpf");
  placa.disabled = sem;
  if (sem) placa.value = "";
  placa.classList.toggle("entrada-form--desligada", sem);
  cpf.disabled = !sem;
  if (!sem) cpf.value = "";
  cpf.title = sem ? "" : "Liberado só para carro sem placa";
  el("placa-obrigatoria").classList.toggle("hidden", sem);
  el("cpf-obrigatorio").classList.toggle("hidden", !sem);
  el("cpf-dica").textContent = sem ? "11 NÚMEROS" : "SÓ PARA CARRO SEM PLACA";
  if (focar) (sem ? cpf : placa).focus();
}

function lerDados(): { dados: GarantiaEntrada; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const dataTexto = el<HTMLInputElement>("data_servico").value;
  const data = parseDataBR(dataTexto);
  if (!data) erros.dataServico = "Data inválida. Use DD/MM/AAAA.";
  else if (data > hojeIso()) erros.dataServico = "A data do serviço não pode ser no futuro.";

  const semPlaca = el<HTMLInputElement>("sem_placa").checked;
  const placa = el<HTMLInputElement>("placa").value.replace(/[-\s]/g, "").toUpperCase();
  const cpf = el<HTMLInputElement>("cpf").value.replace(/\D/g, "");
  if (!semPlaca && !/^[A-Z0-9]{7}$/.test(placa)) erros.placa = "Placa inválida: use 7 letras e números (ex.: ABC1D23).";
  if (semPlaca && cpf.length !== 11) erros.cpf = "Sem placa: informe o CPF do cliente (11 números).";

  const idVeiculo = Number(el<HTMLSelectElement>("modelo").value) || null;
  if (!idVeiculo) erros.modelo = "Escolha o modelo do carro.";
  const tecnico = el<HTMLSelectElement>("tecnico").value;
  if (!tecnico) erros.tecnico = "Selecione o técnico.";

  const valorServico = el<HTMLSelectElement>("servico").value;
  const s = servicoEscolhido();
  const outro = el<HTMLInputElement>("servico_outro").value.trim().toUpperCase();
  if (!valorServico) erros.servico = "Selecione o serviço.";
  else if (valorServico === OUTRO && outro.length < 2) erros.servico = "Descreva o serviço feito.";

  const centavos = centavosDoCampo();
  if (centavos === null) erros.valor = "Valor inválido. Exemplo: 150,00.";

  return {
    erros,
    dados: {
      dataServico: data ?? "",
      placa: semPlaca ? undefined : placa,
      semPlaca,
      cpf: semPlaca ? cpf : undefined,
      modelo: "",
      idVeiculo,
      idServico: s ? s.id : null,
      servico: s ? s.nome : outro,
      qtdCarcaca: s?.pedeCarcaca ? qtd("qtdCarcaca") : 0,
      qtdBotao: s?.pedeBotao ? qtd("qtdBotao") : 0,
      qtdPilha: s?.pedePilha ? qtd("qtdPilha") : 0,
      qtdItens: s?.pedeItens ? qtd("qtdItens") : 0,
      valor: ((centavos ?? 0) / 100).toFixed(2),
      tecnico,
      observacao: el<HTMLInputElement>("observacao").value.trim() || undefined,
      criadoPor: perfilAtual()?.nome,
    },
  };
}

function mostrarErros(erros: Record<string, string>): void {
  // erros de quantidade da API (qtdCarcaca...) aparecem no bloco de quantidades
  const mapa: Record<string, string> = { ...erros };
  for (const c of ["qtdCarcaca", "qtdBotao", "qtdPilha", "qtdItens"]) if (erros[c]) mapa.quantidade = erros[c];
  document.querySelectorAll<HTMLElement>(".campo-erro").forEach((p) => {
    const msg = mapa[p.dataset.erroCampo ?? ""];
    p.textContent = msg ?? "";
    p.classList.toggle("hidden", !msg);
  });
  const primeiro = document.querySelector<HTMLElement>(".campo-erro:not(.hidden)");
  primeiro?.closest(".campo-form")?.querySelector<HTMLElement>("input:not([type=checkbox]),select")?.focus();
}

function limpar(): void {
  el<HTMLFormElement>("form-garantia").reset();
  el<HTMLInputElement>("data_servico").value = formatarDataBR(hojeIso());
  el<HTMLInputElement>("valor").value = "";
  valorDigitado = false;
  sujo = false;
  tecnicoDoPerfil();
  atualizarSemPlaca();
  atualizarServico();
  mostrarErros({});
  el<HTMLInputElement>("placa").focus();
}

async function salvar(): Promise<void> {
  const { dados, erros } = lerDados();
  mostrarErros(erros);
  if (Object.keys(erros).length) return;
  const botao = el<HTMLButtonElement>("btn-salvar");
  botao.disabled = true;
  try {
    const cfg = await window.finDesk!.config();
    let salva;
    try {
      salva = await cadastrarGarantia(cfg, dados);
    } catch (erro) {
      if (!(erro instanceof ErroDuplicidadeApi)) throw erro;
      const e = erro.existente;
      const ok = await confirmarDuplicidade(
        `${formatarDataBR(e.dataServico)} · ${e.placa ?? "SEM PLACA"} · ${e.modelo} · ${e.servico} · ${formatarMoedaBR(Math.round(e.valor * 100))} · ${e.tecnico}`,
      );
      if (!ok) return;
      salva = await cadastrarGarantia(cfg, { ...dados, forcar: true });
    }
    document.body.dataset.garantiaSalva = String(salva.id);
    notificar(`Garantia de ${salva.placa ?? "cliente sem placa"} (${salva.modelo}) salva.`, "sucesso");
    limpar();
  } catch (erro) {
    if (erro instanceof ErroValidacaoApi) {
      mostrarErros(erro.campos);
    } else {
      notificar("Não foi possível salvar a garantia. Verifique se o sistema está aberto e tente de novo.", "erro");
      console.error("[Garantias] falha ao salvar garantia:", erro);
    }
  } finally {
    botao.disabled = false;
  }
}

function opcao(valor: string, rotulo: string): HTMLOptionElement {
  const o = document.createElement("option");
  o.value = valor;
  o.textContent = rotulo;
  return o;
}

/** O tecnico ja vem com o perfil em uso (tela "Quem esta usando?"); pode ser trocado. */
function tecnicoDoPerfil(): void {
  const perfil = perfilAtual();
  const sel = el<HTMLSelectElement>("tecnico");
  if (perfil && [...sel.options].some((o) => o.value === perfil.nome)) sel.value = perfil.nome;
}

async function carregarListas(): Promise<void> {
  try {
    const cfg = await window.finDesk!.config();
    const [tecnicos, veiculos, lista] = await Promise.all([
      listarLista(cfg, "tecnicos"), listarVeiculos(cfg), listarServicos(cfg),
    ]);
    servicos = lista;
    const selTecnico = el<HTMLSelectElement>("tecnico");
    for (const t of tecnicos.filter((t) => t.ativo)) selTecnico.appendChild(opcao(t.nome, t.nome));
    tecnicoDoPerfil();
    // modelos agrupados por marca (catalogo de CONTROLE > VEICULOS)
    const selModelo = el<HTMLSelectElement>("modelo");
    const porMarca = new Map<string, HTMLOptGroupElement>();
    for (const v of veiculos.filter((v) => v.ativo)) {
      let grupo = porMarca.get(v.marca);
      if (!grupo) {
        grupo = document.createElement("optgroup");
        grupo.label = v.marca;
        porMarca.set(v.marca, grupo);
        selModelo.appendChild(grupo);
      }
      grupo.appendChild(opcao(String(v.id), `${v.modelo} (${v.marca})`));
    }
    const selServico = el<HTMLSelectElement>("servico");
    for (const s of servicos.filter((s) => s.ativo && !s.peca)) selServico.appendChild(opcao(String(s.id), s.nome));
    selServico.appendChild(opcao(OUTRO, "OUTRO (DESCREVER)"));
    document.body.dataset.listasCarregadas = "true";
  } catch (erro) {
    document.body.dataset.listasCarregadas = "erro";
    notificar("Não foi possível carregar técnicos, modelos e serviços. Feche e abra a tela de novo.", "erro");
    console.error("[Garantias] falha ao carregar listas:", erro);
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
  const perfil = perfilAtual();
  if (!perfil) {
    void window.finDesk?.navegar("perfis");
    return;
  }
  montarNavbar("cadastrar-garantia");
  el("cadastrando-como").textContent = `Cadastrando como ${perfil.nome}`;
  mascaraData(el<HTMLInputElement>("data_servico"));
  mascaraCPF(el<HTMLInputElement>("cpf"));
  mascaraMoeda(el<HTMLInputElement>("valor"));
  el<HTMLInputElement>("data_servico").value = formatarDataBR(hojeIso());
  document.querySelectorAll<HTMLSelectElement>("select[data-qtd]").forEach((sel) => {
    for (let i = 1; i <= 5; i++) sel.appendChild(opcao(String(i), String(i)));
    sel.addEventListener("change", sugerirValor);
  });
  el("servico").addEventListener("change", atualizarServico);
  el("sem_placa").addEventListener("change", () => atualizarSemPlaca());
  atualizarSemPlaca(false);
  el("valor").addEventListener("input", () => {
    valorDigitado = el<HTMLInputElement>("valor").value.trim() !== "";
  });
  const form = el<HTMLFormElement>("form-garantia");
  form.addEventListener("input", () => {
    sujo = true;
  });
  form.addEventListener("submit", (evento) => {
    evento.preventDefault();
    void salvar();
  });
  el("btn-limpar").addEventListener("click", limpar);

  // F10 salva; ESC com dados digitados pergunta antes de sair (como no Inserir Conta)
  document.addEventListener("keydown", (evento) => {
    if (dialogoEstaAberto() || menuLateralAberto()) return;
    if (evento.key === "F10") {
      evento.preventDefault();
      void salvar();
    }
    if (evento.key !== "Escape" || !sujo) return;
    evento.preventDefault();
    void confirmarSaida().then((ok) => {
      if (ok) void voltar();
    });
  }, true);
  let navegacaoConfirmada = false;
  document.addEventListener("click", (evento) => {
    const alvo = (evento.target as HTMLElement).closest<HTMLElement>("[data-nav]");
    if (!alvo || !sujo || navegacaoConfirmada || dialogoEstaAberto()) return;
    evento.preventDefault();
    evento.stopPropagation();
    navegacaoConfirmada = true;
    void confirmarSaida().then((ok) => {
      if (ok) alvo.click();
      navegacaoConfirmada = false;
    });
  }, true);

  void verificarApi();
  void carregarListas().then(() => el<HTMLInputElement>("placa").focus());
  console.info("[Garantias] cadastro de garantia iniciado");
}

export function iniciarCadastrarGarantia(): void {
  iniciar();
}
