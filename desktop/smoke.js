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
// Enter DE VERDADE (tecla enviada pela janela) num campo: tem de fazer o mesmo que o
// botao de enviar/concluir do formulario (frontend/ts/enter-envia.ts)
// Enter de verdade com o foco onde estiver (ex.: pop-up aberto)
function enterNoFoco() {
  janela.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  janela.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
  janela.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
}
async function enter(seletor) {
  await js(`document.querySelector(${JSON.stringify(seletor)}).focus()`);
  janela.webContents.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
  janela.webContents.sendInputEvent({ type: "char", keyCode: "\r" });
  janela.webContents.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
}

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
  teste("Primeira conta: BEM-VINDO AO SISTEMA DE GARANTIAS no topo", (await texto("#perfis-boas-vindas")) === "BEM-VINDO AO SISTEMA DE GARANTIAS" && await js("document.getElementById('perfis-boas-vindas').getBoundingClientRect().top < document.querySelector('.perfis-titulo').getBoundingClientRect().top"));
  await capturar("primeiro-admin-1366x820");
  teste("Primeira conta: o login é o e-mail (sem campo LOGIN)", await js("!document.getElementById('adm_login') && !!document.getElementById('adm_email')"));
  await js(`(() => { const v = (id, t) => { document.getElementById(id).value = t; }; v('adm_nome', 'Felipe');
    v('adm_email', 'felipe@exemplo.com'); v('adm_email_loja', 'loja@gmail.com'); v('adm_pin', '1234'); v('adm_pin2', '4321'); document.querySelector('#form-admin button[type=submit]').click(); })()`);
  teste("PINs diferentes não criam o admin", await esperarPredicado("!document.querySelector('[data-erro-campo=pin2]').classList.contains('hidden')", 3000));
  await js(`(() => { document.getElementById('adm_pin2').value = '1234'; document.querySelector('#form-admin button[type=submit]').click(); })()`);
  teste("Admin criado entra direto no Menu", await telaPronta("menu") && await esperarPredicado("document.body.dataset.perfil === 'FELIPE'"));
  await ir("perfis");
  teste("Bolinhas: BEM-VINDO AO SISTEMA DE GARANTIAS continua no topo", (await texto("#perfis-boas-vindas")) === "BEM-VINDO AO SISTEMA DE GARANTIAS" && await js("document.getElementById('perfis-boas-vindas').getBoundingClientRect().bottom <= document.getElementById('perfis').getBoundingClientRect().top"));
  teste("Voltar aos perfis mostra a bolinha do admin", await esperarPredicado("Number(document.body.dataset.perfisCarregados) === 1"));
  teste("Bolinhas são círculos", await js("getComputedStyle(document.querySelector('.perfil-avatar')).borderTopLeftRadius !== '0px'"));
  await js("document.querySelector('.perfil-cartao[data-perfil=\"FELIPE\"]').click()");
  teste("Clicar na bolinha abre o pop-up do PIN", await esperarPredicado("document.body.dataset.pinAberto === 'true'", 3000));
  await js("(() => { document.getElementById('pin-campo').value = '9999'; document.getElementById('pin-entrar').click(); })()");
  teste("PIN errado avisa quantas tentativas faltam", await esperarPredicado("document.getElementById('pin-erro').textContent.includes('4 tentativa')", 5000));
  await capturar("perfis-pin-1366x820");
  await js("(() => { document.getElementById('pin-campo').value = '1234'; document.getElementById('pin-entrar').click(); })()");
  teste("PIN certo entra no Menu com o perfil", await telaPronta("menu") && await esperarPredicado("document.body.dataset.perfil === 'FELIPE'"));
  teste("Menu mostra a versão instalada no rodapé", await esperarPredicado(`document.getElementById('versao-sistema').textContent === 'Sistema de Garantias · versão ${require("../package.json").version}'`, 5000), await texto("#versao-sistema"));
  teste("Menu tem exatamente 3 botões quadrados", await js("[...document.querySelectorAll('a[data-path]')].every(a => Math.abs(a.offsetWidth - a.offsetHeight) <= 2)") && (await js("document.querySelectorAll('a[data-path]').length")) === 3);
  teste("Terceiro botão: Controle", (await texto("a[data-path=estatisticas]")).toUpperCase().includes("CONTROLE"));
  teste("Pesquisar é vermelho", (await js("getComputedStyle(document.querySelector('a[data-path=pesquisar-garantias]')).backgroundColor")) === "rgb(255, 59, 48)");
  await capturar("menu-1366x820");

  // ---------- CADASTRAR ----------
  await js("document.querySelector('a[data-path=\"cadastrar-garantia\"]').click()");
  teste("CADASTRAR GARANTIA abre o formulário", await telaPronta("cadastrar-garantia"));
  teste("Técnicos, modelos e serviços carregados", await esperarPredicado("document.body.dataset.listasCarregadas === 'true'"));
  teste("Letras maiores no formulário (rótulos >= 17px, campos >= 19px)", await js("parseFloat(getComputedStyle(document.querySelector('#form-garantia .rotulo-form')).fontSize) >= 17 && parseFloat(getComputedStyle(document.getElementById('placa')).fontSize) >= 19"));
  teste("Rótulo: TÉCNICO QUE REALIZOU O SERVIÇO", (await texto("label[for=tecnico_busca]")).includes("TÉCNICO QUE REALIZOU O SERVIÇO"));
  teste("Técnicos iniciais do VBA", (await js("[...document.querySelectorAll('#tecnico option')].map(o => o.value).join(',')")).includes("RENATO"));
  // produtos em linhas: + acrescenta outra linha abaixo (combos do VBA saíram da lista)
  teste("Combos CARCAÇA+PILHA saíram da lista", await js("![...document.querySelectorAll('#produtos .produto-caixa option')].some(o => o.textContent.includes('+'))"));
  // caixas de digitar (pedido do usuario): digita "bola" e a lista mostra so TROCA BOLACHA; Enter escolhe
  const digitarEEscolher = (seletorCampo, texto) => js(`(() => { const c = document.querySelector(${JSON.stringify(seletorCampo)}); c.focus(); c.value = ${JSON.stringify(texto)};
    c.dispatchEvent(new Event('input')); const lista = c.parentElement.querySelector('.caixa-busca__lista');
    const opcoes = [...lista.querySelectorAll('[role=option]')].map(o => o.textContent);
    c.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })); c.blur(); return opcoes; })()`);
  const opcoesProduto = await digitarEEscolher("#produtos .caixa-busca__campo", "bola");
  teste("Produto: digitar mostra só os que combinam (bola → TROCA BOLACHA)", opcoesProduto.length === 1 && opcoesProduto[0] === "TROCA BOLACHA", JSON.stringify(opcoesProduto));
  teste("Produto: Enter escolhe e a caixa guarda o produto", await js("document.querySelector('#produtos .produto-caixa').selectedOptions[0].textContent === 'TROCA BOLACHA' && document.querySelector('#produtos .caixa-busca__campo').value === 'TROCA BOLACHA'"));
  const opcoesTecnico = await digitarEEscolher("#tecnico_busca", "ren");
  teste("Técnico: digitar mostra só os que combinam (ren → RENATO)", opcoesTecnico.join(",") === "RENATO", JSON.stringify(opcoesTecnico));
  teste("Técnico: Enter escolhe o técnico", await js("document.getElementById('tecnico').value === 'RENATO' && document.getElementById('tecnico_busca').value === 'RENATO'"));
  await js("(() => { const c = document.getElementById('tecnico_busca'); c.focus(); c.value = 'xyz'; c.dispatchEvent(new Event('input')); c.blur(); })()");
  teste("Técnico: texto que não é da lista não escolhe nada (campo apagado)", await js("document.getElementById('tecnico').value === '' && document.getElementById('tecnico_busca').value === ''"));
  // volta ao tecnico vazio (como a tela abre) para os testes seguintes
  await js("(() => { const s = document.getElementById('tecnico'); s.value = ''; s.dispatchEvent(new Event('change')); })()");
  await js(`(() => { const c = document.querySelectorAll('#produtos .produto-caixa'); const s = c[c.length - 1]; s.value = [...s.options].find(o => o.textContent === 'TROCA CARCAÇA').value; s.dispatchEvent(new Event('change')); })()`);
  await js("document.querySelector('#produtos .produto-mais').click()");
  teste("Botão + acrescenta uma linha de produto", (await js("document.querySelectorAll('#produtos > li').length")) === 2);
  await js(`(() => { const c = document.querySelectorAll('#produtos .produto-caixa'); const s = c[c.length - 1]; s.value = [...s.options].find(o => o.textContent === 'PILHA').value; s.dispatchEvent(new Event('change')); })()`);
  teste("Valor NAO e preenchido sozinho pela tabela (pedido do usuario)", (await js("document.getElementById('valor').value")) === "" && !(await js("Boolean(document.getElementById('valor-dica'))")), await js("document.getElementById('valor').value"));
  // OUTRO numa linha: o campo de texto entra no lugar da caixa; o botao volta para a lista
  await js("document.querySelectorAll('#produtos .produto-mais')[1].click()");
  await js(`(() => { const c = document.querySelectorAll('#produtos .produto-caixa'); const s = c[c.length - 1]; s.value = [...s.options].find(o => o.textContent === 'OUTRO (DESCREVER)').value; s.dispatchEvent(new Event('change')); })()`);
  teste("Produto OUTRO troca a caixa pelo campo de texto",
    await js("(() => { const li = document.querySelectorAll('#produtos > li')[2]; return li.querySelector('.produto-caixa').classList.contains('hidden') && !li.querySelector('.produto-outro').classList.contains('hidden'); })()"));
  await capturar("cadastrar-garantia-outro-1366x820");
  await js("document.querySelectorAll('#produtos > li')[2].querySelector('.produto-tirar').click()");
  teste("X tira a linha", (await js("document.querySelectorAll('#produtos > li').length")) === 2);
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
  teste("Técnico começa VAZIO (técnico não é quem está logado)", (await js("document.getElementById('tecnico').value")) === "" && (await js("document.getElementById('tecnico_busca').value")) === "");
  teste("CPF travado até marcar carro sem placa", await js("document.getElementById('cpf').disabled"));
  await js("document.getElementById('sem_placa').click()");
  teste("Carro sem placa libera o CPF", await js("!document.getElementById('cpf').disabled && document.getElementById('placa').disabled"));
  await js("document.getElementById('sem_placa').click()");
  // modelo do carro: digita e a lista mostra os carros que combinam
  await js("document.getElementById('modelo_busca').focus()");
  janela.webContents.insertText("carro do cliente");
  await esperar(150);
  teste("Modelo fora da lista: avisa e fica como OUTRO com o texto digitado",
    await js("document.getElementById('modelo').value === 'OUTRO' && document.getElementById('modelo_outro').value === 'CARRO DO CLIENTE' && document.querySelector('#lista-modelos .caixa-busca__vazio')?.textContent.includes('CARRO DO CLIENTE')"));
  await js("(() => { const c = document.getElementById('modelo_busca'); c.value = ''; c.dispatchEvent(new Event('input')); return true; })()");
  janela.webContents.insertText("oni");
  await esperar(150);
  const sugestoes = JSON.parse(await js("JSON.stringify([...document.querySelectorAll('#lista-modelos [role=option]')].map(li => li.textContent))"));
  teste("Digitando 'oni' a lista mostra os carros que combinam", sugestoes.includes("ONIX (CHEVROLET)") && sugestoes.every((t) => t.includes("ONI")), JSON.stringify(sugestoes));
  await capturar("cadastrar-garantia-modelo-busca-1366x820");
  await enter("#modelo_busca");
  teste("Enter escolhe o carro marcado (não envia o formulário)",
    await esperarPredicado("document.getElementById('modelo_busca').value === 'ONIX (CHEVROLET)' && document.getElementById('modelo').selectedOptions[0]?.textContent === 'ONIX (CHEVROLET)' && document.getElementById('lista-modelos').classList.contains('hidden') && !document.querySelector('[data-dialogo]')", 3000));
  await js(`(() => { document.getElementById('placa').value = 'smk-1a23';
    document.getElementById('tecnico').value = 'FELIPE'; document.getElementById('observacao').value = 'chave canivete';
    const v = document.getElementById('valor'); v.value = '130,00'; v.dispatchEvent(new Event('input')); })()`);
  await capturar("cadastrar-garantia-1366x820");
  await enter("#valor");
  teste("Enter no último campo = SALVAR GARANTIA (grava)", await esperarPredicado("!!document.body.dataset.garantiaSalva", 6000));
  teste("Pop-up GARANTIA SALVA (verde) aparece",
    await esperarPredicado("document.querySelector('[data-dialogo=sucesso] [data-dialogo-titulo]')?.textContent === 'GARANTIA SALVA'", 3000));
  teste("Pop-up GARANTIA SALVA é o grande (letras maiores)", await js("(() => { const d = document.querySelector('[data-dialogo=sucesso]'); return d.classList.contains('dialogo--grande') && parseFloat(getComputedStyle(d.querySelector('.dialogo__mensagem')).fontSize) >= 20; })()"));
  teste("Depois de salvar a tela volta ao começo do formulário (título visível no alto)", await js("(() => { const t = document.querySelector('h1') || document.getElementById('form-garantia'); const r = t.getBoundingClientRect(); return r.top >= 0 && r.top < 260; })()"), await js("JSON.stringify((document.querySelector('h1') || document.getElementById('form-garantia')).getBoundingClientRect().top)"));
  await capturar("cadastrar-garantia-salva-1366x820");
  enterNoFoco();
  teste("Enter no pop-up GARANTIA SALVA = OK (fecha)", await esperarPredicado("!document.querySelector('[data-dialogo]')", 3000));
  teste("Formulário volta limpo para o próximo cadastro", await esperarPredicado("document.getElementById('placa').value === '' && !document.querySelector('[data-dialogo]')", 3000));
  teste("Formulário limpo também limpa o modelo digitado", await js("document.getElementById('modelo_busca').value === '' && document.getElementById('modelo').value === ''"));
  // caixas MODELO e PRODUTO abertas perto do pe da tela (fotos do usuario, 2026-11-19): a area
  // do formulario sobe, a lista aparece inteira, nada de segunda rolagem nem tela branca
  for (const [nome, seletor] of [["MODELO", "#modelo_busca"], ["PRODUTO", ".produto-busca .caixa-busca__campo"]]) {
    await js("document.activeElement && document.activeElement.blur()");
    await js(`(() => { const c = document.querySelector(${JSON.stringify(seletor)}); const rol = document.body;
      rol.scrollTop += c.getBoundingClientRect().bottom - innerHeight + 30; })()`);
    await js(`(() => { const c = document.querySelector(${JSON.stringify(seletor)}); c.dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); c.focus(); })()`);
    await esperar(250);
    const v = await js(`(() => { const c = document.querySelector(${JSON.stringify(seletor)}); const lista = c.closest('.caixa-busca').querySelector('.caixa-busca__lista');
      const l = lista.getBoundingClientRect(); const rc = c.getBoundingClientRect(); const html = document.documentElement;
      return { listaAberta: !lista.classList.contains('hidden'), listaInteira: l.bottom <= innerHeight + 1, campoVisivel: rc.top >= 0,
        semRolagemDeFora: html.scrollTop === 0 && html.scrollHeight <= innerHeight + 1 }; })()`);
    teste(`Caixa ${nome} perto do pé da tela: a tela sobe, a lista aparece inteira e não surge rolagem de fora`,
      v.listaAberta && v.listaInteira && v.campoVisivel && v.semRolagemDeFora, JSON.stringify(v));
    if (nome === "PRODUTO") await capturar("cadastrar-garantia-produto-aberto-1366x820");
    await js("document.activeElement && document.activeElement.blur()");
    await esperar(150);
    teste(`Caixa ${nome}: ao sair do campo o espaço extra some e dá para subir até o topo`, await js(`(() => {
      document.body.scrollTop = 0; const h = document.querySelector('h1').getBoundingClientRect();
      return !document.getElementById('espaco-lista-aberta') && h.top >= 0 && h.top < 300 && document.documentElement.scrollTop === 0; })()`));
  }
  teste("Avisos curtos (notificações) aparecem grandes no canto inferior direito", await js(`(() => { const d = document.createElement('div'); d.className = 'notificacoes'; d.style.height = '60px'; document.body.appendChild(d);
    const r = d.getBoundingClientRect(); d.remove(); return r.right > innerWidth - 40 && r.bottom > innerHeight - 40 && r.width >= 400; })()`));
  // mesma placa, mesmo dia e mesmo servico: pede confirmacao
  await js(`(() => { const c = document.querySelectorAll('#produtos .produto-caixa'); const s = c[c.length - 1]; s.value = [...s.options].find(o => o.textContent === 'TROCA CARCAÇA').value; s.dispatchEvent(new Event('change')); })()`);
  await js("document.querySelector('#produtos .produto-mais').click()");
  await js(`(() => { const c = document.querySelectorAll('#produtos .produto-caixa'); const s = c[c.length - 1]; s.value = [...s.options].find(o => o.textContent === 'PILHA').value; s.dispatchEvent(new Event('change')); })()`);
  await js(`(() => {
    document.getElementById('placa').value = 'SMK1A23'; (() => { const s = document.getElementById('modelo'); s.value = [...s.options].find(o => o.textContent === 'ONIX (CHEVROLET)').value; })(); document.getElementById('tecnico').value = 'FELIPE';
    document.getElementById('btn-salvar').click(); })()`);
  teste("Garantia repetida pede confirmação", await esperarPredicado("!!document.querySelector('[data-dialogo]') && document.querySelector('[data-dialogo-titulo]').textContent.includes('GARANTIA PARECIDA')", 4000));
  // Enter no pop-up de confirmacao = SALVAR MESMO ASSIM (o botao de continuar)
  const antesDup = await js("(async () => { const cfg = await window.finDesk.config(); return (await (await fetch('http://127.0.0.1:' + cfg.port + '/api/garantias', { headers: { 'X-FinDesk-Token': cfg.token } })).json()).length; })()");
  enterNoFoco();
  teste("Enter no pop-up GARANTIA PARECIDA = SALVAR MESMO ASSIM",
    await esperarPredicado("document.querySelector('[data-dialogo=sucesso] [data-dialogo-titulo]')?.textContent === 'GARANTIA SALVA'", 5000));
  enterNoFoco();
  await esperarPredicado("!document.querySelector('[data-dialogo]')", 3000);
  // tira a repetida para nao mexer nas contas do resto do teste
  const depoisDup = await js(`(async () => { const cfg = await window.finDesk.config(); const h = { 'X-FinDesk-Token': cfg.token };
    const l = await (await fetch('http://127.0.0.1:' + cfg.port + '/api/garantias', { headers: h })).json();
    const nova = Math.max(...l.map(g => g.id));
    await fetch('http://127.0.0.1:' + cfg.port + '/api/garantias/' + nova, { method: 'DELETE', headers: h });
    return l.length; })()`);
  teste("A garantia repetida foi mesmo gravada pelo Enter", depoisDup === antesDup + 1, `${antesDup} -> ${depoisDup}`);

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
    v.dispatchEvent(new Event('change')); })()`);
  await enter("#newValueSelect");
  teste("Enter na caixa de seleção = APLICAR (modelo pela lista salvo)", await esperarPredicado("document.querySelector('#tableBody tr.linha-garantia').textContent.includes('CHEVROLET CRUZE')", 5000));
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
  teste("Menu: cartões têm a dica do que fazem ao parar o mouse", await esperarPredicado("document.querySelector('a[data-path=cadastrar-garantia]').title.startsWith('Cadastrar garantia:') && document.querySelector('a[data-path=pesquisar-garantias]').title.startsWith('Pesquisar garantia:')", 3000),
    await js("[...document.querySelectorAll('a[data-path]')].map(a => a.title).join(' | ')"));
  await ir("pesquisar-garantias");
  await esperarPredicado("document.body.dataset.garantiasCarregadas !== undefined");
  await js("document.querySelector('[data-filter=TODOS]').click()");
  teste("Garantia importada aparece com o selo PLANILHA", await esperarPredicado("[...document.querySelectorAll('#tableBody tr.linha-garantia')].some(tr => tr.textContent.includes('LEG1A23') && tr.textContent.includes('Planilha'))", 5000));
  await js("[...document.querySelectorAll('#tableBody tr.linha-garantia')].find(tr => tr.textContent.includes('LEG1A23')).click()");
  await js("document.getElementById('btnExcluir').click()");
  await esperarPredicado("!!document.querySelector('[data-dialogo]')", 3000);
  // EXCLUIR: o Enter CANCELA (um Enter sem querer nunca apaga um registro)
  enterNoFoco();
  teste("Enter no pop-up EXCLUIR cancela e a garantia continua lá",
    await esperarPredicado("!document.querySelector('[data-dialogo]')", 3000) && await js("[...document.querySelectorAll('#tableBody tr.linha-garantia')].some(tr => tr.textContent.includes('LEG1A23'))"));
  await js("document.getElementById('btnExcluir').click()");
  await esperarPredicado("!!document.querySelector('[data-dialogo]')", 3000);
  await js("document.querySelector('[data-dialogo-acao=confirmar]').click()");
  teste("EXCLUIR remove a garantia", await esperarPredicado("![...document.querySelectorAll('#tableBody tr.linha-garantia')].some(tr => tr.textContent.includes('LEG1A23'))", 5000));

  // tabela recolhida: so 5 garantias; EXPANDIR TABELA mostra todas e RECOLHER volta a 5
  // (garantias do ano passado, para nao mexer nos numeros do mes usados nos graficos)
  const ids = JSON.parse(await js(`(async () => { const cfg = await window.finDesk.config(); const ids = [];
    const ano = new Date().getFullYear() - 1;
    for (let i = 0; i < 8; i++) {
      const resp = await fetch('http://127.0.0.1:' + cfg.port + '/api/garantias', { method: 'POST',
        headers: { 'X-FinDesk-Token': cfg.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ dataServico: ano + '-03-1' + i, placa: 'EXP1A2' + i, modelo: 'GOL', servico: 'TESTE EXPANDIR', tecnico: 'FELIPE', valor: 10, forcar: true }) });
      ids.push((await resp.json()).id);
    }
    return JSON.stringify(ids); })()`));
  await ir("menu");
  await ir("pesquisar-garantias");
  await esperarPredicado("document.body.dataset.garantiasCarregadas !== undefined");
  await js("document.querySelector('[data-filter=TODOS]').click()");
  // altura de 5 linhas com rolagem por dentro (sem botao EXPANDIR TABELA)
  const rolagem = `(() => { const corpo = document.getElementById('tableBody'); const caixa = corpo.closest('.tabela-rolagem'); if (!caixa) return null;
    const c = caixa.getBoundingClientRect(); const cab = corpo.closest('table').tHead.getBoundingClientRect().height; const linhas = [...corpo.querySelectorAll('tr.linha-garantia')];
    return { total: linhas.length, dentro: linhas.filter(tr => { const r = tr.getBoundingClientRect(); return r.top >= c.top + cab - 1 && r.bottom <= c.bottom + 1; }).length,
      rola: caixa.scrollHeight > caixa.clientHeight, botao: !!document.getElementById('btnExpandirTabela') }; })()`;
  await esperarPredicado("document.querySelectorAll('#tableBody tr.linha-garantia').length >= 8", 4000);
  await esperar(300);
  const rg = await js(rolagem);
  teste("Pesquisar: todas as garantias na tabela, altura de 5 e rolagem por dentro (sem EXPANDIR)",
    !!rg && rg.total >= 8 && rg.dentro === 5 && rg.rola && !rg.botao, JSON.stringify(rg));
  await capturar("pesquisar-garantias-rolagem-1366x820");
  await js("(() => { const i = document.getElementById('searchInput'); i.value = 'EXP1A21'; i.dispatchEvent(new Event('input')); })()");
  teste("A pesquisa procura em TODAS (não só nas 5 visíveis)", await esperarPredicado("document.querySelectorAll('#tableBody tr.linha-garantia').length === 1", 3000));
  await js("(() => { const i = document.getElementById('searchInput'); i.value = ''; i.dispatchEvent(new Event('input')); })()");
  await js(`(async () => { const cfg = await window.finDesk.config();
    for (const id of ${JSON.stringify(ids)}) await fetch('http://127.0.0.1:' + cfg.port + '/api/garantias/' + id, { method: 'DELETE', headers: { 'X-FinDesk-Token': cfg.token } }); })()`);

  // ---------- ESTATISTICA E ATUALIZACOES ----------
  await ir("estatisticas");
  teste("CONTROLE tem GRÁFICOS e o botão CONTROLE", await esperarPredicado("document.querySelectorAll('.submenu-grade button, .submenu-grade a').length === 2", 5000));
  await ir("controle");
  teste("Botão CONTROLE leva a TÉCNICOS, VEÍCULOS e TABELA DE VALORES", await esperarPredicado("document.querySelectorAll('.submenu-grade button, .submenu-grade a').length === 3 && document.querySelector('.submenu-grade').textContent.includes('TABELA DE VALORES')", 5000));
  for (const [sub, form, todos] of [["tecnicos", "form-tecnico", "todos-tecnicos"], ["veiculos", "form-veiculo", "todos-veiculos"], ["produtos", "form-produto", "todos-produtos"]]) {
    teste(`${sub}: submenu com cadastrar e todos`, await ir(sub) && await esperarPredicado(`document.querySelectorAll('.submenu-grade button, .submenu-grade a').length === ${sub === "produtos" ? 3 : 2}`, 5000));
    teste(`${form} abre`, await ir(form));
    teste(`${todos} lista a tabela`, await ir(todos) && await esperarPredicado("Number(document.body.dataset.registros) > 0", 8000));
  }
  // todos os produtos: palavra do cupom no RM + so 5 linhas, depois EXPANDIR TABELA
  await ir("todos-produtos");
  await esperarPredicado("Number(document.body.dataset.registros) > 0", 8000);
  teste("Todos os produtos: colunas CÓDIGO NO CUPOM e NOME NO RM (CUPOM)", await js("(() => { const th = [...document.querySelectorAll('#tabela thead th')].map(t => t.textContent); return th.includes('CÓDIGO NO CUPOM') && th.includes('NOME NO RM (CUPOM)'); })()"));
  await esperar(300);
  teste("Todos os produtos: altura de 5 linhas e rolagem por dentro (sem EXPANDIR)", await js(`(() => { const caixa = document.querySelector('#tableBody').closest('.tabela-rolagem');
    return !!caixa && caixa.scrollHeight > caixa.clientHeight && !document.querySelector('[data-expandir-tabela]'); })()`));
  teste("Todos os produtos: TROCA CARCAÇA = CARCAÇA CANIVETE no RM", await js(`(() => { const linhas = [...document.querySelectorAll('#tableBody tr')];
    const t = linhas.find(l => l.textContent.includes('TROCA CARCAÇA')); return !!t && t.textContent.includes('CARCAÇA CANIVETE'); })()`));
  await js("[...document.querySelectorAll('#tableBody tr')].find(l => l.textContent.includes('TROCA CILINDRO')).click()");
  await js("(() => { const s = document.getElementById('fieldSelect'); s.value = 'nomeRm'; s.dispatchEvent(new Event('change')); const i = document.getElementById('newValueInput'); i.value = 'cilindro ignicao'; document.getElementById('btnApplyChange').click(); })()");
  teste("Todos os produtos: editar o NOME NO RM grava em maiúsculas", await esperarPredicado("[...document.querySelectorAll('#tableBody tr')].some(l => l.textContent.includes('TROCA CILINDRO') && l.textContent.includes('CILINDRO IGNICAO'))", 5000));
  teste("Dica do Windows: botões têm o nome ao parar o mouse", await esperarPredicado("[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null).every(b => b.title.trim().length > 0)", 3000),
    await js("[...document.querySelectorAll('button')].filter(b => b.offsetParent !== null && !b.title).map(b => b.outerHTML.slice(0, 80)).join(' | ')"));
  await ir("form-produto");
  teste("Cadastrar produto tem o campo NOME NO RM", await js("!!document.getElementById('nomeRm') && !!document.getElementById('codigoCupom')"));
  await ir("form-veiculo");
  await esperarPredicado("document.getElementById('marca').options.length > 20", 5000);
  await js("(() => { const m = document.getElementById('marca'); m.value = 'FIAT'; m.dispatchEvent(new Event('change')); document.getElementById('modelo').value = 'Uno Smoke'; })()");
  await enter("#modelo");
  teste("Enter = SALVAR: cadastrar veículo grava", await esperarPredicado("!!document.body.dataset.cadastroSalvo", 5000));
  await ir("todos-veiculos");
  await esperarPredicado("Number(document.body.dataset.registros) > 0", 8000);
  await js("(() => { const i = document.getElementById('searchInput'); i.value = 'uno smoke'; i.dispatchEvent(new Event('input')); })()");
  teste("Todos os veículos acha o cadastrado", await esperarPredicado("document.querySelectorAll('#tableBody tr.linha-cadastro').length === 1", 4000));
  await capturar("todos-veiculos-1366x820");
  await ir("form-tecnico");
  await js("document.getElementById('nome').value = 'Técnico Smoke'");
  await enter("#nome");
  teste("Enter = SALVAR: cadastrar técnico grava", await esperarPredicado("!!document.body.dataset.cadastroSalvo", 5000));
  await ir("todos-tecnicos");
  teste("Todos os técnicos mostra o novo com a bolinha", await esperarPredicado("document.querySelector('#tableBody').textContent.includes('TÉCNICO SMOKE') && !!document.querySelector('#tableBody .perfil-avatar')", 6000));
  await ir("graficos");
  teste("GRÁFICOS carregam", await esperarPredicado("document.body.dataset.resumoCarregado === 'true'"));
  teste("Gráficos contam a garantia do mês", (await texto("#kpiQuantidade")) === "1", await texto("#kpiQuantidade"));
  await capturar("graficos-1366x820");
  await ir("atualizar-precos");
  teste("ATUALIZAR PREÇOS lista a tabela", await esperarPredicado("Number(document.body.dataset.precosCarregados) >= 11"));
  await esperar(300);
  teste("ATUALIZAR PREÇOS: altura de 5 linhas e rolagem por dentro", await js("(() => { const caixa = document.getElementById('corpoPrecos').closest('.tabela-rolagem'); return !!caixa && caixa.scrollHeight > caixa.clientHeight && !document.querySelector('[data-expandir-tabela]'); })()"));
  // bug da loja (2026-11-19): digitar varias linhas e salvar uma apagava as outras
  const linhaP = (nome) => `[...document.querySelectorAll('#corpoPrecos tr')].find(t => t.cells[0].textContent === '${nome}')`;
  for (const [nome, v] of [["TROCA BOLACHA", "71,00"], ["TROCA CARCAÇA", "72,00"]]) {
    await js(`(() => { const i = (${linhaP(nome)}).querySelector('input'); i.value = '${v}'; i.dispatchEvent(new Event('input')); })()`);
  }
  teste("Atualizar preços: digitar o preço liga o SALVAR de cada linha", await js(`[${linhaP("TROCA BOLACHA")}, ${linhaP("TROCA CARCAÇA")}].every(tr => !tr.querySelector('button').disabled)`));
  await js(`(${linhaP("TROCA BOLACHA")}).querySelector('button').click()`);
  await esperarPredicado(`(${linhaP("TROCA BOLACHA")}).querySelector('button').disabled`, 5000);
  teste("Atualizar preços: salvar uma linha NÃO apaga o que foi digitado nas outras", await js(`(() => { const c = ${linhaP("TROCA CARCAÇA")};
    return c.querySelector('input').value === '72,00' && !c.querySelector('button').disabled && (${linhaP("TROCA BOLACHA")}).querySelector('input').value === '71,00'; })()`),
    await js(`(${linhaP("TROCA CARCAÇA")}).querySelector('input').value`));
  await js(`(${linhaP("TROCA CARCAÇA")}).querySelector('button').click()`);
  teste("Atualizar preços: depois salva a outra (as duas gravadas)", await esperarPredicado(`(async () => { const cfg = await window.finDesk.config();
    const r = await fetch('http://127.0.0.1:' + cfg.port + '/api/servicos', { headers: { 'X-FinDesk-Token': cfg.token } }); const l = await r.json();
    return l.find(x => x.nome === 'TROCA BOLACHA').preco === 71 && l.find(x => x.nome === 'TROCA CARCAÇA').preco === 72; })()`, 5000));
  await js(`(() => { const i = (${linhaP("TROCA GAIOLA")}).querySelectorAll('input')[2]; i.value = 'gaiola'; i.dispatchEvent(new Event('input')); })()`);
  teste("Atualizar preços: mudar só o NOME NO RM também liga o SALVAR", await js(`!(${linhaP("TROCA GAIOLA")}).querySelector('button').disabled`));
  await js(`(() => { const i = (${linhaP("TROCA GAIOLA")}).querySelectorAll('input')[2]; i.value = 'GAIOLA'; })()`);
  await js(`(() => { const tr = [...document.querySelectorAll('#corpoPrecos tr')].find(t => t.textContent.includes('TROCA GAIOLA'));
    const i = tr.querySelector('input'); i.value = '85,00'; i.dispatchEvent(new Event('input')); i.id = 'preco-gaiola'; })()`);
  await enter("#preco-gaiola");
  teste("Enter no preço = SALVAR da linha (preço salvo)", await esperarPredicado("[...document.querySelectorAll('#corpoPrecos tr')].find(t => t.textContent.includes('TROCA GAIOLA')).querySelector('input').value === '85,00' && [...document.querySelectorAll('.notificacao__texto')].some(n => n.textContent.includes('preço salvo'))", 5000));
  await capturar("atualizar-precos-1366x820");

  // ---------- CONTAS (icone na barra): o admin cadastra; o usuario comum nao administra ----------
  await ir("contas");
  teste("CONTAS abre com a área do administrador", await esperarPredicado("document.body.dataset.adminCarregado === 'true' && !document.getElementById('area-admin').classList.contains('hidden')", 8000));
  await js(`(() => { const v = (id, t) => { document.getElementById(id).value = t; }; v('u_nome', 'Renato'); v('u_email', 'renato@hotmail.com'); v('u_pin', '5678'); })()`);
  await enter("#u_pin");
  teste("Enter = CADASTRAR: admin cadastra uma conta", await esperarPredicado("document.body.dataset.usuarioCriado === 'RENATO' && document.getElementById('tabela-usuarios').textContent.includes('renato')", 6000));
  teste("Histórico de acessos registra as entradas", (await texto("#acessos-todos")).includes("FELIPE"));
  await capturar("contas-1366x820");
  teste("Barra tem um botão só para a conta", await js("document.querySelectorAll('#nav-global .nav-barra .conta-menu').length === 1"));
  await ir("perfis");
  await esperarPredicado("Number(document.body.dataset.perfisCarregados) === 2");
  await js("document.querySelector('.perfil-cartao[data-perfil=\"RENATO\"]').click()");
  await js("document.getElementById('pin-campo').value = '5678'");
  await enter("#pin-campo");
  teste("Enter no PIN = ENTRAR: Renato entra com o PIN dele", await telaPronta("menu") && await esperarPredicado("document.body.dataset.perfil === 'RENATO'"));
  // conta comum (Renato): ve TODOS os tecnicos no cadastro e usa a Pesquisar Garantia
  await ir("cadastrar-garantia");
  await esperarPredicado("document.querySelectorAll('#tecnico option').length > 3", 8000);
  const totalTecnicos = await js("[...document.querySelectorAll('#tecnico option')].filter(o => o.value).length");
  teste("Conta comum: técnico começa vazio", await js("document.getElementById('tecnico').value === '' && document.getElementById('tecnico_busca').value === ''"));
  await js("(() => { const c = document.getElementById('tecnico_busca'); c.focus(); c.dispatchEvent(new Event('focus')); })()");
  teste("Conta comum: a lista de técnicos mostra TODOS os técnicos", await esperarPredicado(`document.querySelectorAll('#tecnico_busca').length && [...document.getElementById('tecnico_busca').closest('.caixa-busca').querySelectorAll('.caixa-busca__opcao')].length === ${totalTecnicos}`, 3000),
    await js("[...document.getElementById('tecnico_busca').closest('.caixa-busca').querySelectorAll('.caixa-busca__opcao')].map(o => o.textContent).join(',')"));
  await js("(() => { const s = document.getElementById('tecnico'); s.value = 'FELIPE'; s.dispatchEvent(new Event('change')); document.getElementById('tecnico_busca').blur(); })()");
  await esperar(200);
  await js("(() => { const c = document.getElementById('tecnico_busca'); c.focus(); c.dispatchEvent(new Event('focus')); })()");
  teste("Com um técnico escolhido, abrir a lista mostra TODOS de novo (não fica travado)", await esperarPredicado(`[...document.getElementById('tecnico_busca').closest('.caixa-busca').querySelectorAll('.caixa-busca__opcao')].length === ${totalTecnicos}`, 3000));
  await js("document.getElementById('tecnico_busca').blur()");
  await ir("pesquisar-garantias");
  await esperarPredicado("document.body.dataset.garantiasCarregadas !== undefined", 8000);
  await js("document.querySelector('[data-filter=TODOS]').click()");
  teste("Conta comum: PESQUISAR GARANTIA abre e mostra as garantias", await esperarPredicado("document.querySelectorAll('#tableBody tr.linha-garantia').length > 0", 5000));
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
