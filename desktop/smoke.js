// SMOKE do Sistema de Garantias: abre o app de verdade com banco e Downloads
// temporarios, passa por todas as telas, cadastra, pesquisa, edita, marca o
// cupom, exclui, importa uma planilha no formato do legado e confere os
// graficos e a tabela de precos. Grava capturas em docs/responsivo/.
// Uso: npx electron desktop/smoke.js   (exige o jar e o frontend ja buildados)
const { app, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const os = require("os");

const PASTA = fs.mkdtempSync(path.join(os.tmpdir(), "garantias-smoke-"));
process.env.FINDESK_DB_PATH = path.join(PASTA, "garantias-smoke.db");
app.setPath("downloads", path.join(PASTA, "downloads"));
const abertos = [];
shell.openPath = async (alvo) => {
  abertos.push(alvo);
  return "";
};
const CAPTURAS = path.join(__dirname, "..", "docs", "responsivo");
fs.mkdirSync(CAPTURAS, { recursive: true });
require("./main.js");

const resultados = [];
const errosConsole = [];
let janela = null;
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const js = (codigo) => janela.webContents.executeJavaScript(codigo);

function teste(nome, ok, detalhe = "") {
  resultados.push({ nome, ok: Boolean(ok) });
  console.log(`${ok ? "[OK]    " : "[FALHA]"} ${nome}${detalhe ? " — " + detalhe : ""}`);
}

async function esperarPredicado(codigo, ms = 10000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try {
      if (await js(codigo)) return true;
    } catch {
      // trocando de pagina
    }
    await esperar(120);
  }
  return false;
}

const telaPronta = (tela) => esperarPredicado(`document.body.dataset.tela === '${tela}' && document.body.dataset.pronto === 'true'`, 15000);

async function ir(tela) {
  await js(`window.finDesk.navegar('${tela}')`);
  return telaPronta(tela);
}

async function capturar(nome) {
  await esperar(500);
  fs.writeFileSync(path.join(CAPTURAS, `${nome}.png`), (await janela.webContents.capturePage()).toPNG());
}

const texto = (sel) => js(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);

/** Planilha minima no formato do GARANTIAS-AAAA.xlsm (gerada pelo proprio backend de teste nao: aqui um xlsx feito a mao). */
function planilhaLegada() {
  const zlib = require("zlib");
  const arquivos = {
    "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "xl/workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="JANEIRO" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'
      + '<row r="1"><c r="A1" t="inlineStr"><is><t>DATA</t></is></c><c r="B1" t="inlineStr"><is><t>PLACA</t></is></c></row>'
      + '<row r="2"><c r="A2"><v>46027</v></c><c r="B2" t="inlineStr"><is><t>LEG1A23</t></is></c><c r="C2" t="inlineStr"><is><t>RENEGADE</t></is></c><c r="D2" t="inlineStr"><is><t>01 TROCA DE CARCACA</t></is></c><c r="F2"><v>240</v></c><c r="G2" t="inlineStr"><is><t>FELIPE</t></is></c></row>'
      + "</sheetData></worksheet>",
  };
  // zip "stored" (sem compressao), suficiente para o leitor do backend
  const partes = [];
  const central = [];
  let deslocamento = 0;
  const crc32 = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  for (const [nome, conteudo] of Object.entries(arquivos)) {
    const dados = Buffer.from(conteudo, "utf8");
    const nomeBuf = Buffer.from(nome, "utf8");
    const crc = crc32(dados);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dados.length, 18); local.writeUInt32LE(dados.length, 22); local.writeUInt16LE(nomeBuf.length, 26);
    partes.push(local, nomeBuf, dados);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(dados.length, 20); c.writeUInt32LE(dados.length, 24); c.writeUInt16LE(nomeBuf.length, 28);
    c.writeUInt32LE(deslocamento, 42);
    central.push(c, nomeBuf);
    deslocamento += 30 + nomeBuf.length + dados.length;
  }
  const centralBuf = Buffer.concat(central);
  const fim = Buffer.alloc(22);
  fim.writeUInt32LE(0x06054b50, 0); fim.writeUInt16LE(Object.keys(arquivos).length, 8);
  fim.writeUInt16LE(Object.keys(arquivos).length, 10); fim.writeUInt32LE(centralBuf.length, 12); fim.writeUInt32LE(deslocamento, 16);
  void zlib;
  return Buffer.concat([...partes, centralBuf, fim]);
}

async function executar() {
  while (!janela) await esperar(100);
  janela.setContentSize(1366, 820);
  teste("Primeira abertura pede a conta do administrador", await telaPronta("perfis") && await esperarPredicado("document.body.dataset.primeiroAcesso === 'true'", 30000));
  await capturar("primeiro-admin-1366x820");
  await js(`(() => { const v = (id, t) => { document.getElementById(id).value = t; }; v('adm_nome', 'Felipe'); v('adm_login', 'felipe');
    v('adm_email', 'felipe@exemplo.com'); v('adm_pin', '1234'); v('adm_pin2', '4321'); document.querySelector('#form-admin button[type=submit]').click(); })()`);
  teste("PINs diferentes não criam o admin", await esperarPredicado("!document.querySelector('[data-erro-campo=pin2]').classList.contains('hidden')", 3000));
  await js(`(() => { document.getElementById('adm_pin2').value = '1234'; document.querySelector('#form-admin button[type=submit]').click(); })()`);
  teste("Admin criado entra direto no Menu", await telaPronta("menu") && await esperarPredicado("document.body.dataset.perfil === 'FELIPE'"));
  await ir("perfis");
  teste("Voltar aos perfis mostra a bolinha do admin", await esperarPredicado("Number(document.body.dataset.perfisCarregados) === 1"));
  teste("Bolinhas são círculos", await js("getComputedStyle(document.querySelector('.perfil-avatar')).borderTopLeftRadius !== '0px'"));
  await js("document.querySelector('.perfil-cartao[data-perfil=\"FELIPE\"]').click()");
  teste("Clicar na bolinha abre o pop-up do PIN", await esperarPredicado("document.body.dataset.pinAberto === 'true'", 3000));
  await js("(() => { document.getElementById('pin-campo').value = '9999'; document.getElementById('pin-entrar').click(); })()");
  teste("PIN errado avisa quantas tentativas faltam", await esperarPredicado("document.getElementById('pin-erro').textContent.includes('4 tentativa')", 5000));
  await capturar("perfis-pin-1366x820");
  await js("(() => { document.getElementById('pin-campo').value = '1234'; document.getElementById('pin-entrar').click(); })()");
  teste("PIN certo entra no Menu com o perfil", await telaPronta("menu") && await esperarPredicado("document.body.dataset.perfil === 'FELIPE'"));
  teste("Menu tem exatamente 3 botões quadrados", await js("[...document.querySelectorAll('a[data-path]')].every(a => Math.abs(a.offsetWidth - a.offsetHeight) <= 2)") && (await js("document.querySelectorAll('a[data-path]').length")) === 3);
  teste("Terceiro botão: Atualização e estatística", (await texto("a[data-path=estatisticas]")).toUpperCase().includes("ATUALIZAÇÃO E ESTATÍSTICA"));
  teste("Pesquisar é vermelho", (await js("getComputedStyle(document.querySelector('a[data-path=pesquisar-garantias]')).backgroundColor")) === "rgb(255, 59, 48)");
  await capturar("menu-1366x820");

  // ---------- CADASTRAR ----------
  await js("document.querySelector('a[data-path=\"cadastrar-garantia\"]').click()");
  teste("CADASTRAR GARANTIA abre o formulário", await telaPronta("cadastrar-garantia"));
  teste("Técnicos, modelos e serviços carregados", await esperarPredicado("document.body.dataset.listasCarregadas === 'true'"));
  teste("Técnicos iniciais do VBA", (await js("[...document.querySelectorAll('#tecnico option')].map(o => o.value).join(',')")).includes("RENATO"));
  await js(`(() => { const s = document.getElementById('servico'); s.value = [...s.options].find(o => o.textContent === 'TROCA CARCAÇA+PILHA').value; s.dispatchEvent(new Event('change')); })()`);
  teste("Serviço com pilha mostra carcaça e pilha (e esconde botão)",
    await js("!document.getElementById('q-carcaca').classList.contains('hidden') && !document.getElementById('q-pilha').classList.contains('hidden') && document.getElementById('q-botao').classList.contains('hidden')"));
  teste("Valor sugerido pela tabela (pilha R$ 12,00)", (await js("document.getElementById('valor').value")) === "12,00", await js("document.getElementById('valor').value"));
  // OUTRO: o campo de texto entra no lugar da caixa; o botao volta para a lista
  await js(`(() => { const s = document.getElementById('servico'); s.value = 'OUTRO'; s.dispatchEvent(new Event('change')); })()`);
  teste("Serviço OUTRO troca a caixa pelo campo de texto",
    await js("document.getElementById('servico').classList.contains('hidden') && !document.getElementById('bloco-outro').classList.contains('hidden') && document.activeElement.id === 'servico_outro'"));
  await capturar("cadastrar-garantia-outro-1366x820");
  await js("document.getElementById('btn-voltar-lista').click()");
  teste("Botão da lista volta para a caixa de serviços",
    await js("!document.getElementById('servico').classList.contains('hidden') && document.getElementById('bloco-outro').classList.contains('hidden') && document.getElementById('servico').value === ''"));
  await js(`(() => { const s = document.getElementById('servico'); s.value = [...s.options].find(o => o.textContent === 'TROCA CARCAÇA+PILHA').value; s.dispatchEvent(new Event('change')); })()`);
  // observacao escondida atras da seta; o clique deixa aberta
  teste("Observação começa escondida atrás da seta", await js("document.getElementById('observacao').offsetParent === null && !!document.getElementById('btn-observacao')"));
  await js("document.getElementById('btn-observacao').click()");
  teste("Clique na seta abre a observação", await js("document.getElementById('observacao').offsetParent !== null && document.getElementById('btn-observacao').getAttribute('aria-expanded') === 'true'"));
  // placa e CPF conferidos enquanto digita (regra propria, sem consulta externa)
  await js("(() => { const p = document.getElementById('placa'); p.value = '1AB'; p.dispatchEvent(new Event('input')); })()");
  teste("Placa começando com número avisa na hora", await js("!document.querySelector('[data-erro-campo=placa]').classList.contains('hidden') && document.getElementById('placa').classList.contains('entrada-form--erro')"));
  await js("(() => { const p = document.getElementById('placa'); p.value = 'ABC1D23'; p.dispatchEvent(new Event('input')); })()");
  teste("Placa Mercosul certa limpa o aviso", await js("document.querySelector('[data-erro-campo=placa]').classList.contains('hidden')"));
  await js("(() => { const p = document.getElementById('placa'); p.value = ''; p.dispatchEvent(new Event('input')); })()");
  await js("document.getElementById('sem_placa').click()");
  await js("(() => { const c = document.getElementById('cpf'); c.value = '529.982.247-24'; c.dispatchEvent(new Event('input')); })()");
  teste("CPF com dígito errado avisa na hora", (await texto("[data-erro-campo=cpf]")).includes("CPF inválido"));
  await js("(() => { const c = document.getElementById('cpf'); c.value = '529.982.247-25'; c.dispatchEvent(new Event('input')); })()");
  teste("CPF certo limpa o aviso", await js("document.querySelector('[data-erro-campo=cpf]').classList.contains('hidden')"));
  await js("document.getElementById('sem_placa').click()");

  await js("document.getElementById('btn-salvar').click()");
  teste("Sem placa e modelo: pop-up CONFIRA OS DADOS com a lista",
    await esperarPredicado("document.querySelector('[data-dialogo=atencao] [data-dialogo-titulo]')?.textContent === 'CONFIRA OS DADOS' && document.querySelectorAll('[data-dialogo-lista] li').length >= 2 && !document.body.dataset.garantiaSalva", 3000));
  await capturar("cadastrar-garantia-confira-1366x820");
  await js("document.querySelector('[data-dialogo-acao=confirmar]').click()");
  teste("Ao fechar o pop-up, os erros ficam nos campos",
    await esperarPredicado("!document.querySelector('[data-dialogo]') && !document.querySelector('[data-erro-campo=placa]').classList.contains('hidden')", 3000));
  teste("Técnico já vem com o perfil", (await js("document.getElementById('tecnico').value")) === "FELIPE");
  teste("CPF travado até marcar carro sem placa", await js("document.getElementById('cpf').disabled"));
  await js("document.getElementById('sem_placa').click()");
  teste("Carro sem placa libera o CPF", await js("!document.getElementById('cpf').disabled && document.getElementById('placa').disabled"));
  await js("document.getElementById('sem_placa').click()");
  await js(`(() => { document.getElementById('placa').value = 'smk-1a23'; (() => { const s = document.getElementById('modelo'); s.value = [...s.options].find(o => o.textContent === 'ONIX (CHEVROLET)').value; })();
    document.getElementById('tecnico').value = 'FELIPE'; document.getElementById('observacao').value = 'chave canivete';
    const v = document.getElementById('valor'); v.value = '130,00'; v.dispatchEvent(new Event('input')); })()`);
  await capturar("cadastrar-garantia-1366x820");
  await js("document.getElementById('btn-salvar').click()");
  teste("SALVAR GARANTIA grava", await esperarPredicado("!!document.body.dataset.garantiaSalva", 6000));
  teste("Pop-up GARANTIA SALVA (verde) aparece",
    await esperarPredicado("document.querySelector('[data-dialogo=sucesso] [data-dialogo-titulo]')?.textContent === 'GARANTIA SALVA'", 3000));
  await capturar("cadastrar-garantia-salva-1366x820");
  await js("document.querySelector('[data-dialogo-acao=confirmar]').click()");
  teste("Formulário volta limpo para o próximo cadastro", await esperarPredicado("document.getElementById('placa').value === '' && !document.querySelector('[data-dialogo]')", 3000));
  // mesma placa, mesmo dia e mesmo servico: pede confirmacao
  await js(`(() => { const s = document.getElementById('servico'); s.value = [...s.options].find(o => o.textContent === 'TROCA CARCAÇA+PILHA').value; s.dispatchEvent(new Event('change'));
    document.getElementById('placa').value = 'SMK1A23'; (() => { const s = document.getElementById('modelo'); s.value = [...s.options].find(o => o.textContent === 'ONIX (CHEVROLET)').value; })(); document.getElementById('tecnico').value = 'FELIPE';
    document.getElementById('btn-salvar').click(); })()`);
  teste("Garantia repetida pede confirmação", await esperarPredicado("!!document.querySelector('[data-dialogo]') && document.querySelector('[data-dialogo-titulo]').textContent.includes('GARANTIA PARECIDA')", 4000));
  await js("document.querySelector('[data-dialogo-acao=cancelar]').click()");

  // ---------- PESQUISAR ----------
  await ir("pesquisar-garantias");
  teste("PESQUISAR mostra a garantia do mês", await esperarPredicado("document.querySelectorAll('#tableBody tr.linha-garantia').length === 1"));
  await js("(() => { const i = document.getElementById('searchInput'); i.value = 'smk1'; i.dispatchEvent(new Event('input')); })()");
  teste("Pesquisa pela placa acha a garantia", await esperarPredicado("document.querySelectorAll('#tableBody tr.linha-garantia').length === 1"));
  await js("(() => { const i = document.getElementById('searchInput'); i.value = 'xyz-nada'; i.dispatchEvent(new Event('input')); })()");
  teste("Pesquisa sem resultado esvazia a lista", await esperarPredicado("document.querySelectorAll('#tableBody tr.linha-garantia').length === 0"));
  await js("(() => { const i = document.getElementById('searchInput'); i.value = ''; i.dispatchEvent(new Event('input')); document.querySelector('[data-filter=TODOS]').click(); })()");
  await js("document.querySelector('#tableBody tr.linha-garantia').click()");
  teste("Clicar na linha abre a área de edição", await esperarPredicado("!document.getElementById('editorContainer').classList.contains('hidden')"));
  teste("Garantia mostra marca e modelo", await esperarPredicado("document.querySelector('#tableBody tr.linha-garantia').textContent.includes('CHEVROLET ONIX')", 5000));
  await js(`(() => { const s = document.getElementById('fieldSelect'); s.value = 'veiculo'; s.dispatchEvent(new Event('change'));
    const v = document.getElementById('newValueSelect'); v.value = [...v.options].find(o => o.textContent === 'CHEVROLET CRUZE').value;
    v.dispatchEvent(new Event('change')); document.getElementById('btnApplyChange').click(); })()`);
  teste("Alterar um campo salva (modelo pela lista)", await esperarPredicado("document.querySelector('#tableBody tr.linha-garantia').textContent.includes('CHEVROLET CRUZE')", 5000));
  teste("Cadastrada por FELIPE", (await texto("#tableBody tr.linha-garantia")).includes("FELIPE"));
  await js("document.getElementById('btnCupomLancado').click()");
  teste("CUPOM LANÇADO marca o selo", await esperarPredicado("document.querySelector('#tableBody tr.linha-garantia').textContent.includes('Lançado')", 5000));
  teste("Selos de cupom são arredondados", await js("getComputedStyle(document.querySelector('#tableBody .selo')).borderTopLeftRadius !== '0px'"));
  await capturar("pesquisar-garantias-1366x820");
  await js("document.getElementById('btnImprimir').click()");
  teste("IMPRIMIR GARANTIA gera o PDF", await esperarPredicado("!!document.body.dataset.relatorioPdf", 10000));

  // importacao da planilha antiga (formato do legado)
  const b64 = planilhaLegada().toString("base64");
  const r = await js(`(async () => { const cfg = await window.finDesk.config(); const resp = await fetch('http://127.0.0.1:' + cfg.port + '/api/legado/importar', {
    method: 'POST', headers: { 'X-FinDesk-Token': cfg.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomeArquivo: 'GARANTIAS-SMOKE.xlsx', conteudoBase64: '${b64}' }) }); return resp.status + ' ' + await resp.text(); })()`);
  teste("Importação da planilha antiga traz a garantia", r.startsWith("200") && r.includes('"importadas":1'), r);

  await ir("menu");
  await ir("pesquisar-garantias");
  await esperarPredicado("document.body.dataset.garantiasCarregadas !== undefined");
  await js("document.querySelector('[data-filter=TODOS]').click()");
  teste("Garantia importada aparece com o selo PLANILHA", await esperarPredicado("[...document.querySelectorAll('#tableBody tr.linha-garantia')].some(tr => tr.textContent.includes('LEG1A23') && tr.textContent.includes('Planilha'))", 5000));
  await js("[...document.querySelectorAll('#tableBody tr.linha-garantia')].find(tr => tr.textContent.includes('LEG1A23')).click()");
  await js("document.getElementById('btnExcluir').click()");
  await esperarPredicado("!!document.querySelector('[data-dialogo]')", 3000);
  await js("document.querySelector('[data-dialogo-acao=confirmar]').click()");
  teste("EXCLUIR remove a garantia", await esperarPredicado("![...document.querySelectorAll('#tableBody tr.linha-garantia')].some(tr => tr.textContent.includes('LEG1A23'))", 5000));

  // ---------- ESTATISTICA E ATUALIZACOES ----------
  await ir("estatisticas");
  teste("ATUALIZAÇÃO E ESTATÍSTICA tem 3 botões (com CONTROLE)", await esperarPredicado("document.querySelectorAll('.submenu-grade button, .submenu-grade a').length === 3", 5000));
  await ir("controle");
  teste("CONTROLE leva a TÉCNICOS, VEÍCULOS e TABELA DE VALORES", await esperarPredicado("document.querySelectorAll('.submenu-grade button, .submenu-grade a').length === 3 && document.querySelector('.submenu-grade').textContent.includes('TABELA DE VALORES')", 5000));
  for (const [sub, form, todos] of [["tecnicos", "form-tecnico", "todos-tecnicos"], ["veiculos", "form-veiculo", "todos-veiculos"], ["produtos", "form-produto", "todos-produtos"]]) {
    teste(`${sub}: submenu com cadastrar e todos`, await ir(sub) && await esperarPredicado("document.querySelectorAll('.submenu-grade button, .submenu-grade a').length === 2", 5000));
    teste(`${form} abre`, await ir(form));
    teste(`${todos} lista a tabela`, await ir(todos) && await esperarPredicado("Number(document.body.dataset.registros) > 0", 8000));
  }
  await ir("form-veiculo");
  await esperarPredicado("document.getElementById('marca').options.length > 20", 5000);
  await js("(() => { const m = document.getElementById('marca'); m.value = 'FIAT'; m.dispatchEvent(new Event('change')); document.getElementById('modelo').value = 'Uno Smoke'; document.getElementById('btn-salvar').click(); })()");
  teste("Cadastrar veículo grava", await esperarPredicado("!!document.body.dataset.cadastroSalvo", 5000));
  await ir("todos-veiculos");
  await esperarPredicado("Number(document.body.dataset.registros) > 0", 8000);
  await js("(() => { const i = document.getElementById('searchInput'); i.value = 'uno smoke'; i.dispatchEvent(new Event('input')); })()");
  teste("Todos os veículos acha o cadastrado", await esperarPredicado("document.querySelectorAll('#tableBody tr.linha-cadastro').length === 1", 4000));
  await capturar("todos-veiculos-1366x820");
  await ir("form-tecnico");
  await js("(() => { document.getElementById('nome').value = 'Técnico Smoke'; document.getElementById('btn-salvar').click(); })()");
  teste("Cadastrar técnico grava", await esperarPredicado("!!document.body.dataset.cadastroSalvo", 5000));
  await ir("todos-tecnicos");
  teste("Todos os técnicos mostra o novo com a bolinha", await esperarPredicado("document.querySelector('#tableBody').textContent.includes('TÉCNICO SMOKE') && !!document.querySelector('#tableBody .perfil-avatar')", 6000));
  await ir("graficos");
  teste("GRÁFICOS carregam", await esperarPredicado("document.body.dataset.resumoCarregado === 'true'"));
  teste("Gráficos contam a garantia do mês", (await texto("#kpiQuantidade")) === "1", await texto("#kpiQuantidade"));
  await capturar("graficos-1366x820");
  await ir("atualizar-precos");
  teste("ATUALIZAR PREÇOS lista a tabela", await esperarPredicado("Number(document.body.dataset.precosCarregados) >= 11"));
  await js(`(() => { const tr = [...document.querySelectorAll('#corpoPrecos tr')].find(t => t.textContent.includes('TROCA GAIOLA'));
    const i = tr.querySelector('input'); i.value = '85,00'; i.dispatchEvent(new Event('input')); tr.querySelector('button').click(); })()`);
  teste("Salvar preço de um serviço", await esperarPredicado("[...document.querySelectorAll('#corpoPrecos tr')].find(t => t.textContent.includes('TROCA GAIOLA')).querySelector('input').value === '85,00' && [...document.querySelectorAll('.notificacao__texto')].some(n => n.textContent.includes('preço salvo'))", 5000));
  await capturar("atualizar-precos-1366x820");

  // ---------- CONTAS (icone na barra): o admin cadastra; o usuario comum nao administra ----------
  await ir("contas");
  teste("CONTAS abre com a área do administrador", await esperarPredicado("document.body.dataset.adminCarregado === 'true' && !document.getElementById('area-admin').classList.contains('hidden')", 8000));
  await js(`(() => { const v = (id, t) => { document.getElementById(id).value = t; }; v('u_nome', 'Renato'); v('u_login', 'renato'); v('u_pin', '5678');
    document.querySelector('#form-usuario button[type=submit]').click(); })()`);
  teste("Admin cadastra uma conta", await esperarPredicado("document.body.dataset.usuarioCriado === 'RENATO' && document.getElementById('tabela-usuarios').textContent.includes('renato')", 6000));
  teste("Histórico de acessos registra as entradas", (await texto("#acessos-todos")).includes("FELIPE"));
  await capturar("contas-1366x820");
  teste("Barra tem o ícone CONTAS", await js("!!document.querySelector('#nav-global .nav-contas')"));
  await ir("perfis");
  await esperarPredicado("Number(document.body.dataset.perfisCarregados) === 2");
  await js("document.querySelector('.perfil-cartao[data-perfil=\"RENATO\"]').click()");
  await js("(() => { document.getElementById('pin-campo').value = '5678'; document.getElementById('pin-entrar').click(); })()");
  teste("Renato entra com o PIN dele", await telaPronta("menu") && await esperarPredicado("document.body.dataset.perfil === 'RENATO'"));
  await ir("contas");
  await esperar(1200);
  teste("Usuário comum não vê a administração de contas", await js("document.getElementById('area-admin').classList.contains('hidden')") && (await texto("#minha-conta")).includes("RENATO"));
  const negado = await js(`(async () => { const cfg = await window.finDesk.config(); const p = JSON.parse(sessionStorage.getItem('garantias.perfil'));
    const r = await fetch('http://127.0.0.1:' + cfg.port + '/api/usuarios', { headers: { 'X-FinDesk-Token': cfg.token, 'X-Garantias-Sessao': p.token } }); return r.status; })()`);
  teste("Servidor recusa a lista de contas para quem não é admin (403)", negado === 403, String(negado));
  await ir("perfis");
  await esperarPredicado("Number(document.body.dataset.perfisCarregados) === 2");
  await js("document.querySelector('.perfil-cartao[data-perfil=\"FELIPE\"]').click()");
  await js("(() => { document.getElementById('pin-campo').value = '1234'; document.getElementById('pin-entrar').click(); })()");
  await telaPronta("menu");

  // ---------- larguras: menu sem rolagem lateral; telas internas com o menu lateral (hamburguer) ----------
  for (const [l, a] of [[1920, 1040], [1024, 768], [760, 800], [480, 800]]) {
    janela.setContentSize(l, a);
    await ir("menu");
    await esperar(400);
    teste(`Menu sem rolagem lateral em ${l}px`, await js("document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1"));
    await capturar(`menu-${l}x${a}`);
    await ir("cadastrar-garantia");
    await esperar(400);
    const hamb = await js("getComputedStyle(document.querySelector('.nav-hamburguer')).display !== 'none'");
    teste(`Cadastrar em ${l}px: ${l < 1024 ? "menu lateral (hambúrguer)" : "barra completa"}`, l < 1024 ? hamb : !hamb);
    if (l < 1024) {
      await js("document.querySelector('.nav-hamburguer').click()");
      teste(`Menu lateral abre em ${l}px com o perfil`, await esperarPredicado("document.querySelector('#nav-global').dataset.menuAberto === 'true' && document.querySelector('.nav-painel').textContent.includes('TROCAR PERFIL')", 3000));
      await capturar(`menu-lateral-${l}x${a}`);
      await js("document.querySelector('.nav-hamburguer').click()");
    }
  }
  teste("Sem erros no console", errosConsole.length === 0, errosConsole.join(" | "));
  teste("PDFs só na pasta temporária", abertos.every((a) => a.startsWith(PASTA)), JSON.stringify(abertos));

  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n=== RESULTADO SMOKE GARANTIAS: ${resultados.length - falhas.length}/${resultados.length} verificações passaram ===`);
  app.exitCode = falhas.length ? 1 : 0;
  app.quit();
}

app.on("browser-window-created", (_e, win) => {
  if (janela) return;
  janela = win;
  win.webContents.on("console-message", (...args) => {
    const nivel = typeof args[1] === "number" ? args[1] : 0;
    if (nivel >= 3) errosConsole.push(String(args[2]));
  });
  setTimeout(() => executar().catch((erro) => {
    console.error("ERRO FATAL:", erro);
    app.exitCode = 1;
    app.quit();
  }), 1500);
});
