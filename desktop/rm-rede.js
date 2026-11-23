// Traduz a falha de rede entre o computador e o RM para uma frase que a loja entende
// (aparece no pop-up "RM SOFTWARE FORA DO AR" e no log). Sem Electron: testado em teste-rm-cupom.js.

/** `falha` = { origem: "pagina" | "api", erro?: "net::ERR_...", status?: numero } ou null (sem resposta). */
function traduzirFalhaDeRede(falha) {
  if (!falha) return "o RM não respondeu em 30 segundos (internet lenta ou bloqueada)";
  if (falha.status) return `o RM respondeu com erro ${falha.status}`;
  const erro = String(falha.erro || "").replace(/^net::/, "");
  const onde = falha.origem === "api" ? "o servidor do RM" : "o site do RM";
  const tabela = [
    [/INTERNET_DISCONNECTED|NETWORK_CHANGED|NETWORK_IO_SUSPENDED|NETWORK_ACCESS_DENIED/, "o computador está sem internet"],
    [/NAME_NOT_RESOLVED|NAME_RESOLUTION/, `o computador não achou ${onde} (internet ou DNS)`],
    [/TIMED_OUT|TIMEOUT/, `${onde} demorou demais para responder (internet lenta ou bloqueada)`],
    [/CERT|SSL|CERTIFICATE/, "certificado de segurança recusado (confira a data e a hora do Windows e o antivírus)"],
    [/PROXY|TUNNEL/, "problema de proxy ou firewall na rede"],
    [/BLOCKED|ACCESS_DENIED|ADDRESS_UNREACHABLE/, "a rede ou o antivírus bloqueou o acesso ao RM"],
    [/CONNECTION_REFUSED|CONNECTION_RESET|CONNECTION_CLOSED|CONNECTION_FAILED|EMPTY_RESPONSE/, `${onde} recusou ou derrubou a conexão`],
  ];
  for (const [padrao, texto] of tabela) if (padrao.test(erro)) return texto;
  return `falha de rede (${erro || "desconhecida"})`;
}

module.exports = { traduzirFalhaDeRede };
