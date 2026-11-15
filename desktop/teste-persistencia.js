const { spawn } = require("child_process");
const crypto = require("crypto");
const path = require("path");
const net = require("net");
const fs = require("fs");
const os = require("os");

const JAR = path.join(__dirname, "..", "backend", "target", "garantias-backend-0.1.0.jar");
const resultados = [];

// Banco de dados isolado: os testes nunca tocam a base real do usuario
const BANCO_TESTE = path.join(os.tmpdir(), "garantias-persistencia.db");
for (const sufixo of ["", "-wal", "-shm"]) {
  try { fs.unlinkSync(BANCO_TESTE + sufixo); } catch { /* nao existia */ }
}
process.env.FINDESK_DB_PATH = BANCO_TESTE;

function teste(nome, ok, detalhe = "") {
  resultados.push({ nome, ok, detalhe });
  console.log(`${ok ? "[OK]    " : "[FALHA]"} ${nome}${detalhe ? " — " + detalhe : ""}`);
}

function portaLivre() {
  return new Promise((resolver, rejeitar) => {
    const servidor = net.createServer();
    servidor.listen(0, "127.0.0.1", () => {
      const p = servidor.address().port;
      servidor.close(() => resolver(p));
    });
    servidor.on("error", rejeitar);
  });
}

function esperar(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function subirBackend() {
  const porta = await portaLivre();
  const token = crypto.randomBytes(24).toString("hex");
  const logs = [];
  const proc = spawn("java", ["-jar", JAR], {
    env: { ...process.env, SERVER_PORT: String(porta), FINDESK_API_TOKEN: token },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  proc.stdout.on("data", (d) => logs.push(d.toString()));
  proc.stderr.on("data", (d) => logs.push(d.toString()));
  const inicio = Date.now();
  while (Date.now() - inicio < 60000) {
    try {
      const resposta = await fetch(`http://127.0.0.1:${porta}/api/status`, {
        headers: { "X-FinDesk-Token": token },
      });
      // igual ao Electron (main.js): so usa a API depois que o banco terminou as migracoes.
      // O /api/status responde antes disso, com "inicializado": "false".
      if (resposta.ok && (await resposta.json()).inicializado === "true") return { proc, porta, token, logs };
    } catch {
      // backend ainda subindo
    }
    await esperar(400);
  }
  proc.kill();
  throw new Error("backend nao respondeu em 60s");
}

function encerrarBackend({ proc }) {
  return new Promise((resolver) => {
    if (proc.exitCode !== null) return resolver();
    proc.once("exit", () => resolver());
    proc.kill();
  });
}

async function api(porta, token, caminho, opcoes = {}) {
  return fetch(`http://127.0.0.1:${porta}${caminho}`, {
    ...opcoes,
    headers: { "X-FinDesk-Token": token, "Content-Type": "application/json", ...(opcoes.headers || {}) },
  });
}

async function main() {
  if (!fs.existsSync(JAR)) {
    console.error("Backend nao compilado. Execute: mvn -f backend/pom.xml package");
    process.exit(1);
  }

  console.log("=== Teste de persistencia: fechar e reabrir o aplicativo ===\n");
  const agora = new Date();
  const hoje = new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const placa = `PRS${String(Date.now()).slice(-4)}`;
  const dados = { dataServico: hoje, placa, semPlaca: false, modelo: "ONIX", idServico: null,
    servico: "TESTE DE PERSISTENCIA", valor: "130.00", tecnico: "FELIPE", observacao: "chave canivete" };
  const tecnico = `TECNICO PERSISTENCIA ${Date.now()}`;

  console.log("1. Abrindo o aplicativo (backend)...");
  const primeira = await subirBackend();

  console.log("2. Cadastrando garantia e tecnico ficticios...");
  const criado = await api(primeira.porta, primeira.token, "/api/garantias", { method: "POST", body: JSON.stringify(dados) });
  const registro = await criado.json();
  teste("Cadastro de garantia retorna 201 com id", criado.status === 201 && registro.id > 0,
    `id=${registro.id}${criado.status === 201 ? "" : ` (HTTP ${criado.status}: ${JSON.stringify(registro)})`}`);
  const consulta1 = await (await api(primeira.porta, primeira.token, `/api/garantias/${registro.id}`)).json();
  teste("Cadastro confirmado antes de fechar", consulta1.placa === placa, consulta1.placa);
  const criadoTec = await api(primeira.porta, primeira.token, "/api/listas/tecnicos", { method: "POST", body: JSON.stringify({ nome: tecnico }) });
  const registroTec = await criadoTec.json();
  teste("Inclusao de tecnico retorna 201 com id", criadoTec.status === 201 && registroTec.id > 0, `id=${registroTec.id}`);

  console.log("3. Fechando o aplicativo (processo encerrado)...");
  await encerrarBackend(primeira);
  teste("Processo do backend encerrado", primeira.proc.exitCode !== null || primeira.proc.killed);

  console.log("4. Reabrindo o aplicativo...");
  const segunda = await subirBackend();

  console.log("5. Consultando o que foi cadastrado...");
  const resposta2 = await api(segunda.porta, segunda.token, `/api/garantias/${registro.id}`);
  const consulta2 = await resposta2.json();
  teste("Garantia preservada apos reinicializacao",
    resposta2.status === 200 && consulta2.placa === placa && consulta2.valor === 130 && consulta2.observacao === "CHAVE CANIVETE",
    JSON.stringify(consulta2));
  const tecnicos = await (await api(segunda.porta, segunda.token, "/api/listas/tecnicos")).json();
  teste("Tecnico preservado apos reinicializacao", tecnicos.some((t) => t.id === registroTec.id && t.nome === tecnico));

  console.log("6. Limpando os registros ficticios...");
  const exclusao = await api(segunda.porta, segunda.token, `/api/garantias/${registro.id}`, { method: "DELETE" });
  teste("Exclusao de limpeza retorna 204", exclusao.status === 204, String(exclusao.status));
  const aposExclusao = await api(segunda.porta, segunda.token, `/api/garantias/${registro.id}`);
  teste("Registro ficticio removido (404)", aposExclusao.status === 404, String(aposExclusao.status));
  const exclusaoTec = await api(segunda.porta, segunda.token, `/api/listas/tecnicos/${registroTec.id}`, { method: "DELETE" });
  teste("Exclusao de limpeza do tecnico retorna 204", exclusaoTec.status === 204, String(exclusaoTec.status));

  await encerrarBackend(segunda);
  teste("Backend encerrado ao final do teste", true);

  const todosLogs = primeira.logs.join("") + segunda.logs.join("");
  teste("Token NAO aparece nos logs do backend", !todosLogs.includes(primeira.token) && !todosLogs.includes(segunda.token));

  const falhas = resultados.filter((r) => !r.ok);
  console.log(`\n=== RESULTADO: ${resultados.length - falhas.length}/${resultados.length} verificacoes passaram ===`);
  for (const f of falhas) console.log(` - [FALHA] ${f.nome} ${f.detalhe}`);
  process.exit(falhas.length ? 1 : 0);
}

main().catch((erro) => {
  console.error("ERRO FATAL:", erro);
  process.exit(1);
});
