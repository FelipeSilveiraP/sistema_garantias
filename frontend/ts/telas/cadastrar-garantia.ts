// CADASTRAR GARANTIA — formulario simples e claro, com as regras do VBA
// (frmControleGarantias V17.1): placa de 7 letras/numeros OU "sem placa" com
// CPF; produtos em linhas (caixa + quantidade de 1 a 5 + botao + para acrescentar
// outro abaixo); "OUTRO" troca a caixa por um campo de texto.
// O valor e digitado por quem atende (sem preenchimento automatico pela tabela).
import { CaixaBusca, CaixaSobreSelect, caixaSobreSelect, ligarCaixaBusca } from "../caixa-busca";
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
import { avisar, confirmarDuplicidade, confirmarSaida, dialogoEstaAberto, menuLateralAberto } from "../componentes";
import { notificar } from "../notificacoes";
import { montarNavbar } from "../navbar";
import { voltar } from "../navegacao";
import {
  cpfValido, formatarDataBR, formatarMoedaBR, limparPlaca, mascaraCPF, mascaraData, mascaraMoeda,
  parseDataBR, placaValida,
} from "../mascaras";
import { hojeIso } from "../filtros";
import { perfilAtual } from "../perfil";

const OUTRO = "OUTRO";
let caixaModelo: CaixaBusca | null = null;
let caixaTecnico: CaixaSobreSelect | null = null;
let servicos: ServicoDados[] = [];
let sujo = false;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function centavosDoCampo(): number | null {
  const texto = el<HTMLInputElement>("valor").value.trim();
  if (!texto || /^0+(,0{1,2})?$/.test(texto)) return 0;
  const limpo = texto.replace(/\./g, "").replace(",", ".");
  const n = Math.round(Number(limpo) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

// ---------- produtos: uma linha por produto, com + para acrescentar ----------

const MAX_PRODUTOS = 10;

interface LinhaProduto {
  idServico: number | null;
  descricao: string;
  quantidade: number;
  outro: boolean;
}

function linhasProduto(): HTMLLIElement[] {
  return [...document.querySelectorAll<HTMLLIElement>("#produtos > li")];
}

function lerLinha(li: HTMLLIElement): LinhaProduto {
  const valor = li.querySelector<HTMLSelectElement>(".produto-caixa")!.value;
  const outro = valor === OUTRO;
  return {
    idServico: !outro && valor ? Number(valor) : null,
    descricao: outro ? li.querySelector<HTMLInputElement>(".produto-outro input")!.value.trim().toUpperCase() : "",
    quantidade: Number(li.querySelector<HTMLSelectElement>(".produto-qtd")!.value) || 1,
    outro,
  };
}

function botaoIcone(classe: string, icone: string, rotulo: string): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = classe;
  b.title = rotulo;
  b.setAttribute("aria-label", rotulo);
  const i = document.createElement("span");
  i.className = "material-symbols-outlined";
  i.setAttribute("aria-hidden", "true");
  i.textContent = icone;
  b.appendChild(i);
  return b;
}

function atualizarBotoesLinhas(): void {
  const linhas = linhasProduto();
  linhas.forEach((li, n) => {
    li.querySelector<HTMLButtonElement>(".produto-tirar")!.classList.toggle("invisible", linhas.length === 1);
    li.querySelector<HTMLButtonElement>(".produto-mais")!.disabled = linhas.length >= MAX_PRODUTOS;
    li.querySelector<HTMLSelectElement>(".produto-caixa")!.setAttribute("aria-label", `Produto ${n + 1}`);
    li.querySelector<HTMLInputElement>(".caixa-busca__campo")?.setAttribute("aria-label", `Produto ${n + 1}`);
  });
}

/** Nova linha de produto (logo abaixo de `depois`, ou no fim). */
function novaLinha(depois?: HTMLLIElement): HTMLLIElement {
  const li = document.createElement("li");
  li.className = "produto-linha";
  const caixa = document.createElement("select");
  caixa.className = "entrada-form produto-caixa";
  caixa.appendChild(opcao("", "Selecione o produto..."));
  for (const s of servicos.filter((s) => s.ativo)) caixa.appendChild(opcao(String(s.id), s.nome));
  caixa.appendChild(opcao(OUTRO, "OUTRO (DESCREVER)"));
  // digita e a lista mostra os produtos que combinam (a <select> fica escondida guardando o valor)
  const busca = caixaSobreSelect(caixa, "Digite ou escolha o produto...", "produtos");
  busca.envoltorio.classList.add("produto-busca");

  // OUTRO: campo de texto no lugar da caixa, com botao de volta a lista
  const outro = document.createElement("div");
  outro.className = "servico-outro produto-outro hidden";
  const texto = document.createElement("input");
  texto.className = "entrada-form uppercase";
  texto.type = "text";
  texto.maxLength = 120;
  texto.autocomplete = "off";
  texto.placeholder = "Escreva o que foi feito";
  texto.setAttribute("aria-label", "Descreva o produto ou serviço");
  const voltar = botaoIcone("servico-outro__voltar", "format_list_bulleted", "Voltar à lista de produtos");
  outro.append(texto, voltar);

  const qtd = document.createElement("select");
  qtd.className = "entrada-form produto-qtd";
  qtd.setAttribute("aria-label", "Quantidade");
  for (let n = 1; n <= 5; n++) qtd.appendChild(opcao(String(n), `${n}x`));

  const mais = botaoIcone("produto-mais", "add", "Acrescentar outro produto");
  const tirar = botaoIcone("produto-tirar", "close", "Tirar este produto");
  li.append(busca.envoltorio, outro, qtd, mais, tirar);

  caixa.addEventListener("change", () => {
    if (caixa.value === OUTRO) {
      busca.envoltorio.classList.add("hidden");
      outro.classList.remove("hidden");
      texto.focus();
    }
  });
  voltar.addEventListener("click", () => {
    texto.value = "";
    caixa.value = "";
    busca.sincronizar();
    outro.classList.add("hidden");
    busca.envoltorio.classList.remove("hidden");
    busca.campo.focus();
  });
  mais.addEventListener("click", () => {
    if (linhasProduto().length >= MAX_PRODUTOS) return;
    const nova = novaLinha(li);
    nova.querySelector<HTMLInputElement>(".caixa-busca__campo")!.focus();
  });
  tirar.addEventListener("click", () => {
    if (linhasProduto().length === 1) return;
    const vizinha = (li.previousElementSibling ?? li.nextElementSibling) as HTMLLIElement | null;
    li.remove();
    atualizarBotoesLinhas();
    vizinha?.querySelector<HTMLInputElement>(".caixa-busca__campo")?.focus();
  });

  const lista = el("produtos");
  if (depois) depois.after(li);
  else lista.appendChild(li);
  atualizarBotoesLinhas();
  return li;
}

function reiniciarProdutos(): void {
  el("produtos").replaceChildren();
  novaLinha();
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

/** Regra propria (sem consulta externa), igual a do servidor e do banco. `completo` = cobrar tambem o tamanho. */
function erroPlaca(placa: string, completo: boolean): string | null {
  if (!placa) return completo ? "Informe a placa (ou marque CARRO SEM PLACA)." : null;
  if (placa.length > 7) return "A placa tem só 7 letras e números.";
  if (!/^[A-Z]*$/.test(placa.slice(0, 3))) return "A placa começa com 3 letras (ex.: ABC1234 ou ABC1D23).";
  if (placa.length > 3 && !/[0-9]/.test(placa[3])) return "O 4º caractere da placa é um número (ex.: ABC1234).";
  if (placa.length > 5 && !/^[0-9]+$/.test(placa.slice(5))) return "A placa termina com 2 números (ex.: ABC1D23).";
  if (placa.length < 7) return completo ? "Placa incompleta: são 7 letras e números (ex.: ABC1D23)." : null;
  return placaValida(placa) ? null : "Placa inválida: use ABC1234 (antiga) ou ABC1D23 (Mercosul).";
}

function erroCpf(cpf: string, completo: boolean): string | null {
  if (cpf.length < 11) return completo ? "Sem placa: informe o CPF do cliente (11 números)." : null;
  return cpfValido(cpf) ? null : "CPF inválido: confira os números (os 2 últimos não batem).";
}

function marcarErro(campo: string, mensagem: string | null): void {
  const p = document.querySelector<HTMLElement>(`.campo-erro[data-erro-campo="${campo}"]`);
  if (p) {
    p.textContent = mensagem ?? "";
    p.classList.toggle("hidden", !mensagem);
  }
  el(campo).classList.toggle("entrada-form--erro", Boolean(mensagem));
}

/** Avisa enquanto digita: placa e CPF conferidos a cada tecla; ao sair do campo, cobra o que falta. */
function validarAoDigitar(): void {
  const placa = el<HTMLInputElement>("placa");
  const cpf = el<HTMLInputElement>("cpf");
  const digitosCpf = (): string => cpf.value.replace(/\D/g, "");
  placa.addEventListener("input", () => marcarErro("placa", erroPlaca(limparPlaca(placa.value), false)));
  placa.addEventListener("blur", () => {
    if (!placa.disabled && placa.value.trim()) marcarErro("placa", erroPlaca(limparPlaca(placa.value), true));
  });
  cpf.addEventListener("input", () => marcarErro("cpf", erroCpf(digitosCpf(), false)));
  cpf.addEventListener("blur", () => {
    if (!cpf.disabled && cpf.value.trim()) marcarErro("cpf", erroCpf(digitosCpf(), true));
  });
}

function lerDados(): { dados: GarantiaEntrada; erros: Record<string, string> } {
  const erros: Record<string, string> = {};
  const dataTexto = el<HTMLInputElement>("data_servico").value;
  const data = parseDataBR(dataTexto);
  if (!data) erros.dataServico = "Data inválida. Use DD/MM/AAAA.";
  else if (data > hojeIso()) erros.dataServico = "A data do serviço não pode ser no futuro.";

  const semPlaca = el<HTMLInputElement>("sem_placa").checked;
  const placa = limparPlaca(el<HTMLInputElement>("placa").value);
  const cpf = el<HTMLInputElement>("cpf").value.replace(/\D/g, "");
  const erroDoCampo = semPlaca ? erroCpf(cpf, true) : erroPlaca(placa, true);
  if (erroDoCampo) erros[semPlaca ? "cpf" : "placa"] = erroDoCampo;

  const modeloOutro = el<HTMLSelectElement>("modelo").value === OUTRO;
  const idVeiculo = modeloOutro ? null : Number(el<HTMLSelectElement>("modelo").value) || null;
  const modeloTexto = el<HTMLInputElement>("modelo_outro").value.trim().toUpperCase();
  if (modeloOutro && modeloTexto.length < 2) erros.modelo = "Escreva o modelo do carro.";
  else if (!modeloOutro && !idVeiculo) erros.modelo = "Escolha o modelo do carro.";
  const tecnico = el<HTMLSelectElement>("tecnico").value;
  if (!tecnico) erros.tecnico = "Selecione o técnico.";

  const produtos = linhasProduto().map(lerLinha).filter((l) => l.outro || l.idServico !== null);
  if (!produtos.length) erros.servico = "Escolha pelo menos um produto.";
  else if (produtos.some((l) => l.outro && l.descricao.length < 2)) erros.servico = "Descreva o produto em OUTRO.";

  const centavos = centavosDoCampo();
  if (centavos === null) erros.valor = "Valor inválido. Exemplo: 150,00.";

  return {
    erros,
    dados: {
      dataServico: data ?? "",
      placa: semPlaca ? undefined : placa,
      semPlaca,
      cpf: semPlaca ? cpf : undefined,
      modelo: modeloOutro ? modeloTexto : "",
      idVeiculo,
      idServico: null,
      qtdCarcaca: 0,
      qtdBotao: 0,
      qtdPilha: 0,
      qtdItens: 0,
      itens: produtos.map((l) => ({ idServico: l.idServico, descricao: l.outro ? l.descricao : undefined, quantidade: l.quantidade })),
      valor: ((centavos ?? 0) / 100).toFixed(2),
      tecnico,
      observacao: el<HTMLInputElement>("observacao").value.trim() || undefined,
      criadoPor: perfilAtual()?.nome,
    },
  };
}

function mostrarErros(erros: Record<string, string>): void {
  // erros de quantidade da API (qtdCarcaca...) aparecem nos produtos
  const mapa: Record<string, string> = { ...erros };
  for (const c of ["qtdCarcaca", "qtdBotao", "qtdPilha", "qtdItens"]) if (erros[c]) mapa.servico = erros[c];
  document.querySelectorAll<HTMLElement>(".campo-erro").forEach((p) => {
    const msg = mapa[p.dataset.erroCampo ?? ""];
    p.textContent = msg ?? "";
    p.classList.toggle("hidden", !msg);
  });
  for (const campo of ["placa", "cpf"]) el(campo).classList.toggle("entrada-form--erro", Boolean(mapa[campo]));
  if (mapa.observacao) abrirObservacao(true);
  const primeiro = document.querySelector<HTMLElement>(".campo-erro:not(.hidden)");
  primeiro?.closest(".campo-form")?.querySelector<HTMLElement>("input:not([type=checkbox]),select")?.focus();
}

function limpar(): void {
  el<HTMLFormElement>("form-garantia").reset();
  el<HTMLInputElement>("data_servico").value = formatarDataBR(hojeIso());
  el<HTMLInputElement>("valor").value = "";
  sujo = false;
  abrirObservacao(false);
  trocarModeloOutro(false);
  tecnicoDoPerfil();
  atualizarSemPlaca();
  reiniciarProdutos();
  mostrarErros({});
  el<HTMLInputElement>("placa").focus();
}

/** Depois de salvar: a tela volta para o comeco do formulario (pedido do usuario). */
function voltarAoTopo(): void {
  // quem rola pode ser a janela ou uma area da pagina: zera todas acima do formulario
  for (let n: HTMLElement | null = el("form-garantia"); n; n = n.parentElement) n.scrollTop = 0;
  document.scrollingElement?.scrollTo({ top: 0 });
  window.scrollTo({ top: 0 });
}

/** Pop-up "CONFIRA OS DADOS" com a lista do que esta errado; ao fechar, marca os campos e foca o primeiro. */
async function avisarConfira(mensagem: string, erros: Record<string, string>): Promise<void> {
  await avisar({ titulo: "CONFIRA OS DADOS", mensagem, itens: Object.values(erros), tom: "atencao", textoOk: "CORRIGIR" });
  mostrarErros(erros);
}

async function salvar(): Promise<void> {
  const { dados, erros } = lerDados();
  mostrarErros({});
  if (Object.keys(erros).length) {
    await avisarConfira("A garantia ainda não foi salva. Corrija o que está abaixo:", erros);
    return;
  }
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
    limpar();
    voltarAoTopo();
    await avisar({
      grande: true,
      titulo: "GARANTIA SALVA",
      mensagem: `A garantia de ${salva.placa ?? "cliente sem placa"} foi salva.`,
      detalhes: `${formatarDataBR(salva.dataServico)} · ${salva.modelo} · ${salva.servico} · `
        + `${formatarMoedaBR(Math.round(salva.valor * 100))} · ${salva.tecnico}`,
      tom: "sucesso",
    });
    voltarAoTopo();
    el<HTMLInputElement>("placa").focus({ preventScroll: true });
  } catch (erro) {
    if (erro instanceof ErroValidacaoApi) {
      await avisarConfira("O sistema recusou a garantia. Corrija o que está abaixo:", erro.campos);
    } else {
      await avisar({
        titulo: "NÃO FOI POSSÍVEL SALVAR",
        mensagem: "A garantia não foi salva. Verifique se o sistema está aberto e tente de novo. O que você digitou continua na tela.",
        tom: "erro",
      });
      console.error("[Garantias] falha ao salvar garantia:", erro);
    }
  } finally {
    botao.disabled = false;
  }
}

/** Limpa o modelo (caixa de digitar + escolha guardada). */
function trocarModeloOutro(_outro: boolean): void {
  el("bloco-modelo-outro").classList.add("hidden");
  el<HTMLInputElement>("modelo_outro").value = "";
  el<HTMLSelectElement>("modelo").value = "";
  caixaModelo?.limpar();
}

/** Observacao: a seta sobre a linha expande o cadastro para baixo com o campo. */
function abrirObservacao(aberta: boolean): void {
  el("bloco-observacao").classList.toggle("aberta", aberta);
  el("btn-observacao").setAttribute("aria-expanded", String(aberta));
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
  caixaTecnico?.sincronizar();
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
    caixaTecnico?.atualizarItens();
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
    caixaModelo?.definirItens(veiculos.filter((v) => v.ativo).map((v) => ({ valor: String(v.id), rotulo: `${v.modelo} (${v.marca})`, grupo: v.marca })));
    selModelo.appendChild(opcao(OUTRO, "OUTRO (DESCREVER)"));
    reiniciarProdutos();
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
  mascaraData(el<HTMLInputElement>("data_servico"));
  mascaraCPF(el<HTMLInputElement>("cpf"));
  mascaraMoeda(el<HTMLInputElement>("valor"));
  el<HTMLInputElement>("data_servico").value = formatarDataBR(hojeIso());
  el("btn-observacao").addEventListener("click", () => {
    const aberta = !el("bloco-observacao").classList.contains("aberta");
    abrirObservacao(aberta);
    if (aberta) el<HTMLInputElement>("observacao").focus();
  });
  // modelo: digita e escolhe; o que estiver fora da lista vai como OUTRO (escrito)
  // tecnico: digita e a lista mostra os tecnicos que combinam
  caixaTecnico = caixaSobreSelect(el<HTMLSelectElement>("tecnico"), "Digite ou escolha o técnico...", "técnicos");
  caixaModelo = ligarCaixaBusca(el<HTMLInputElement>("modelo_busca"), el<HTMLUListElement>("lista-modelos"), (item, texto) => {
    const sel = el<HTMLSelectElement>("modelo");
    sel.value = item ? item.valor : texto.trim() ? OUTRO : "";
    el<HTMLInputElement>("modelo_outro").value = item ? "" : texto.trim().toUpperCase();
    sujo = true;
  });
  el("btn-lista-modelos").addEventListener("mousedown", (evento) => {
    evento.preventDefault();
    const campo = el<HTMLInputElement>("modelo_busca");
    if (document.activeElement === campo && !el("lista-modelos").classList.contains("hidden")) campo.blur();
    else campo.focus();
  });
  validarAoDigitar();
  el("sem_placa").addEventListener("change", () => atualizarSemPlaca());
  atualizarSemPlaca(false);
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
