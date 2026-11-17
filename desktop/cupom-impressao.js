// Cupom da NFC-e (DANFE NFC-e) para a impressora termica DARUMA (bobina de 80 mm).
// Montado com os dados que o proprio PDV do RM usa para imprimir
// (GET /v1/pdv/vendas/{id}/cupom-dados). Todo texto do RM passa por `esc` (sem HTML).
const qrcode = require("qrcode-generator");

function esc(texto) {
  return String(texto === null || texto === undefined ? "" : texto)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function moeda(valor) {
  return Number(valor || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cnpj(numeros) {
  const d = String(numeros || "").replace(/\D/g, "");
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : d;
}

function dataHora(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(String(iso || ""));
  return m ? `${m[3]}/${m[2]}/${m[1]} ${m[4]}:${m[5]}:${m[6]}` : "";
}

const MEIOS = { "01": "Dinheiro", "03": "Cartão de Crédito", "04": "Cartão de Débito", "17": "PIX" };

function qrSvg(texto) {
  if (!texto) return "";
  const qr = qrcode(0, "M");
  qr.addData(String(texto));
  qr.make();
  return qr.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
}

/** HTML do cupom, pronto para imprimir (sem scripts nem nada da internet). */
function montarHtml(d) {
  const e = d.emitente || {};
  const itens = (d.itens || []).map((i) => `
    <tr><td colspan="4">${esc(i.codigo)} ${esc(i.descricao)}</td></tr>
    <tr class="num"><td>${esc(i.quantidade)} ${esc(i.unidade)}</td><td>x ${moeda(i.valorUnitario)}</td><td></td><td>${moeda(i.valorTotal)}</td></tr>`).join("");
  const pagamentos = (d.pagamentos || []).map((p) =>
    `<tr><td>${esc(MEIOS[p.meio] || `Meio ${p.meio}`)}</td><td class="dir">${moeda(p.valor)}</td></tr>`).join("");
  const chave = String(d.chave || "").replace(/\D/g, "").replace(/(\d{4})(?=\d)/g, "$1 ");
  const contingencia = String(d.tpEmis) === "9";
  const homologacao = String(d.ambiente) === "2";
  const logo = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(String(d.logoTermico || ""))
    ? `<img class="logo" src="${d.logoTermico}" alt="">` : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'">
<title>NFC-e ${esc(d.numero)}</title>
<style>
  @page { size: 80mm auto; margin: 2mm; }
  body { font-family: "Courier New", monospace; font-size: 11px; width: 72mm; margin: 0; color: #000; }
  .centro { text-align: center; } .dir { text-align: right; } .negrito { font-weight: bold; }
  .logo { display: block; max-width: 50mm; margin: 0 auto 2mm; }
  hr { border: 0; border-top: 1px dashed #000; margin: 2mm 0; }
  table { width: 100%; border-collapse: collapse; } td { vertical-align: top; padding: 0; }
  tr.num td { text-align: right; } tr.num td:first-child { text-align: left; }
  .qr { width: 32mm; height: 32mm; margin: 2mm auto; } .qr svg { width: 100%; height: 100%; }
  .chave { word-spacing: 1px; font-size: 10px; }
  .url { overflow-wrap: anywhere; font-size: 10px; }
</style></head><body>
${logo}
<div class="centro negrito">${esc(e.nome)}</div>
<div class="centro">CNPJ: ${esc(cnpj(e.cnpj))} IE: ${esc(e.ie)}</div>
<div class="centro">${esc(e.endereco)}</div>
<hr>
<div class="centro negrito">DANFE NFC-e - Documento Auxiliar da Nota Fiscal de Consumidor Eletrônica</div>
${homologacao ? '<div class="centro negrito">EMITIDA EM AMBIENTE DE HOMOLOGAÇÃO - SEM VALOR FISCAL</div>' : ""}
${contingencia ? '<div class="centro negrito">EMITIDA EM CONTINGÊNCIA<br>Pendente de autorização</div>' : ""}
<hr>
<table>${itens}</table>
<hr>
<table>
  <tr><td>Qtde. total de itens</td><td class="dir">${esc((d.itens || []).length)}</td></tr>
  ${Number(d.desconto) ? `<tr><td>Desconto R$</td><td class="dir">${moeda(d.desconto)}</td></tr>` : ""}
  ${Number(d.acrescimo) ? `<tr><td>Acréscimo R$</td><td class="dir">${moeda(d.acrescimo)}</td></tr>` : ""}
  <tr class="negrito"><td>VALOR TOTAL R$</td><td class="dir">${moeda(d.valorTotal)}</td></tr>
  <tr><td>FORMA DE PAGAMENTO</td><td class="dir">VALOR PAGO R$</td></tr>
  ${pagamentos}
  <tr><td>Troco R$</td><td class="dir">${moeda(d.troco)}</td></tr>
</table>
<hr>
<div class="centro">Consulte pela Chave de Acesso em</div>
<div class="centro url">${esc(d.urlChave)}</div>
<div class="centro chave">${esc(chave)}</div>
<hr>
<div class="centro">${d.consumidorDocumento ? `CONSUMIDOR - CPF/CNPJ ${esc(d.consumidorDocumento)} ${esc(d.consumidorNome)}` : "CONSUMIDOR NÃO IDENTIFICADO"}</div>
<hr>
<div class="centro negrito">NFC-e nº ${esc(d.numero)} Série ${esc(d.serie)} ${esc(dataHora(d.dhEmi))}</div>
${d.protocolo ? `<div class="centro">Protocolo de autorização: ${esc(d.protocolo)}</div><div class="centro">Data de autorização: ${esc(dataHora(d.dhRecbto))}</div>` : ""}
<div class="qr">${qrSvg(d.qrCode)}</div>
${d.valorAproxTributos ? `<div class="centro">Tributos Totais Incidentes (Lei Federal 12.741/2012): R$ ${moeda(d.valorAproxTributos)}</div>` : ""}
</body></html>`;
}

module.exports = { montarHtml };
