package com.chaveiro.api;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.request;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.service.Carteiro;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.web.servlet.mvc.method.RequestMappingInfo;
import org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping;

/**
 * Bateria de seguranca pela API (como um atacante faria): token em todas as rotas,
 * SQL injection em todos os campos de texto, XSS guardado como texto, injecao de
 * cabecalho no e-mail, foto falsa e requisicao gigante. Banco temporario proprio.
 */
@SpringBootTest(properties = "findesk.teste-contexto=seguranca")
@AutoConfigureMockMvc
class SegurancaApiTest {

    private static final String TOKEN = "token-teste-unitario";
    private static final String SESSAO = "X-Garantias-Sessao";

    /** Ataques classicos de SQL injection (e um de XSS) usados em todos os campos de texto. */
    static final List<String> ATAQUES = List.of(
            "' OR 1=1 --",
            "'; DROP TABLE garantias; --",
            "\" OR \"\"=\"",
            "1; DELETE FROM usuarios",
            "' UNION SELECT pin_hash FROM usuarios --",
            "%' OR '%'='",
            "<script>alert(1)</script>",
            "<img src=x onerror=alert(1)>");

    @Autowired
    private MockMvc mvc;

    @Autowired
    private ConnectionFactory conexao;

    @Autowired
    @Qualifier("requestMappingHandlerMapping")
    private RequestMappingHandlerMapping rotas;

    @MockitoBean
    private Carteiro carteiro; // nenhum e-mail de verdade sai dos testes

    private final ObjectMapper json = new ObjectMapper();

    private MockHttpServletRequestBuilder comToken(MockHttpServletRequestBuilder r) {
        return r.header("X-FinDesk-Token", TOKEN);
    }

    private String enviar(HttpMethod metodo, String url, Object corpo, String sessao, int esperado) throws Exception {
        MockHttpServletRequestBuilder r = comToken(request(metodo, url)).contentType(MediaType.APPLICATION_JSON)
                .content(json.writeValueAsString(corpo));
        if (sessao != null) {
            r = r.header(SESSAO, sessao);
        }
        return mvc.perform(r).andExpect(status().is(esperado)).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
    }

    private long contar(String sql, Object... params) throws Exception {
        try (Connection c = conexao.getConnection(); PreparedStatement st = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                st.setObject(i + 1, params[i]);
            }
            try (ResultSet rs = st.executeQuery()) {
                return rs.next() ? rs.getLong(1) : 0;
            }
        }
    }

    /** Primeiro admin do banco deste teste (cria uma vez so). */
    private String sessaoAdmin() throws Exception {
        if (contar("SELECT COUNT(*) FROM usuarios") == 0) {
            Map<String, Object> d = Map.of("nome", "Admin Teste", "email", "admin@exemplo.com", "pin", "1234",
                    "emailLoja", "loja@gmail.com");
            enviar(HttpMethod.POST, "/api/perfis/primeiro-admin", d, null, 201);
        }
        long id = contar("SELECT id_usuario FROM usuarios WHERE admin = 1 ORDER BY id_usuario LIMIT 1");
        String r = enviar(HttpMethod.POST, "/api/sessao", Map.of("idUsuario", id, "pin", "1234"), null, 200);
        return json.readTree(r).get("token").asText();
    }

    // ---------- rede e token ----------

    @Test
    void todasAsRotasExigemOToken() throws Exception {
        int conferidas = 0;
        for (Map.Entry<RequestMappingInfo, ?> rota : rotas.getHandlerMethods().entrySet()) {
            RequestMappingInfo info = rota.getKey();
            List<String> metodos = new ArrayList<>();
            info.getMethodsCondition().getMethods().forEach(m -> metodos.add(m.name()));
            if (metodos.isEmpty()) {
                metodos.add("GET");
            }
            for (String padrao : info.getPatternValues()) {
                String url = padrao.replace("{lista}", "tecnicos").replaceAll("\\{[^}]+}", "1");
                for (String m : metodos) {
                    mvc.perform(request(HttpMethod.valueOf(m), url).contentType(MediaType.APPLICATION_JSON).content("{}")
                                    .param("de", "2026-01-01").param("ate", "2026-01-31"))
                            .andExpect(status().isUnauthorized());
                    // token errado (e token de outro tamanho) tambem nao passa
                    mvc.perform(request(HttpMethod.valueOf(m), url).header("X-FinDesk-Token", TOKEN + "x"))
                            .andExpect(status().isUnauthorized());
                    conferidas++;
                }
            }
        }
        assertThat(conferidas).as("rotas conferidas").isGreaterThan(30);
        // fora de /api tambem (pagina de erro, arquivos, qualquer caminho)
        for (String url : new String[] {"/", "/error", "/qualquer/coisa", "/api/../api/status", "/actuator/health"}) {
            mvc.perform(get(url)).andExpect(status().isUnauthorized());
        }
    }

    @Test
    void backendSoEscutaNoProprioComputador() throws Exception {
        String props = Files.readString(Path.of("src/main/resources/application.properties"));
        assertThat(props).contains("server.address=127.0.0.1");
        // o Electron nao troca o endereco (so a porta e o token)
        String main = Files.readString(Path.of("../desktop/main.js"));
        assertThat(main).doesNotContain("server.address").doesNotContain("SERVER_ADDRESS").contains("FINDESK_API_TOKEN: token");
    }

    @Test
    void requisicaoGrandeDemaisERecusadaAntesDeLer() throws Exception {
        byte[] grande = new byte[2 * 1024 * 1024 + 1];
        java.util.Arrays.fill(grande, (byte) 'a');
        mvc.perform(comToken(post("/api/garantias")).contentType(MediaType.APPLICATION_JSON).content(grande))
                .andExpect(status().isPayloadTooLarge());
        mvc.perform(comToken(put("/api/usuarios/1/foto")).contentType(MediaType.APPLICATION_JSON).content(grande))
                .andExpect(status().isPayloadTooLarge());
        // a planilha tem limite maior (30 MB em base64): 3 MB passa do filtro e e recusada por nao ser planilha
        String planilhaFalsa = "{\"nomeArquivo\":\"x.xlsm\",\"conteudoBase64\":\""
                + Base64.getEncoder().encodeToString(new byte[3 * 1024 * 1024]) + "\"}";
        mvc.perform(comToken(post("/api/legado/importar")).contentType(MediaType.APPLICATION_JSON).content(planilhaFalsa))
                .andExpect(status().isBadRequest());
    }

    @Test
    void respostasTemCabecalhosDeSegurancaEParametroErradoDa400() throws Exception {
        mvc.perform(comToken(get("/api/garantias")))
                .andExpect(status().isOk())
                .andExpect(header().string("X-Content-Type-Options", "nosniff"))
                .andExpect(header().string("Content-Type", org.hamcrest.Matchers.containsString("application/json")));
        mvc.perform(comToken(get("/api/garantias/1 OR 1=1"))).andExpect(status().isBadRequest());
        mvc.perform(comToken(get("/api/estatisticas")).param("de", "2026-01-01' OR '1'='1").param("ate", "2026-01-31"))
                .andExpect(status().isBadRequest());
        mvc.perform(comToken(get("/api/estatisticas"))).andExpect(status().isBadRequest());
        // o ";" no caminho e ignorado pelo Spring (vira so "tecnicos"): nada e executado
        mvc.perform(comToken(get("/api/listas/tecnicos;DROP TABLE tecnicos")));
        assertThat(contar("SELECT COUNT(*) FROM tecnicos")).isPositive();
    }

    // ---------- SQL injection e XSS em todos os campos de texto ----------

    @Test
    void sqlInjectionEmTodosOsCamposDeTextoViraSoTexto() throws Exception {
        String adm = sessaoAdmin();
        long usuariosAntes = contar("SELECT COUNT(*) FROM usuarios");
        String hoje = LocalDate.now().toString();
        int i = 0;
        for (String ataque : ATAQUES) {
            i++;
            // garantia com o ataque em modelo, servico OUTRO, tecnico e observacao
            Map<String, Object> g = new LinkedHashMap<>();
            g.put("dataServico", hoje);
            g.put("placa", "ABC1D2" + (i % 10));
            g.put("modelo", ataque);
            g.put("servico", ataque);
            g.put("tecnico", ataque);
            g.put("observacao", ataque);
            g.put("forcar", true);
            String criada = enviar(HttpMethod.POST, "/api/garantias", g, adm, 201);
            long id = json.readTree(criada).get("id").asLong();
            String upper = ataque.toUpperCase(java.util.Locale.ROOT);
            assertThat(contar("SELECT COUNT(*) FROM garantias WHERE id_garantia = ? AND modelo = ? AND servico = ?"
                    + " AND tecnico = ? AND observacao = ?", id, upper, upper, upper, upper)).isEqualTo(1);
            // com varios produtos: o OUTRO (descricao) com o ataque
            g.put("itens", List.of(Map.of("descricao", ataque, "quantidade", 1)));
            String comItens = enviar(HttpMethod.POST, "/api/garantias", g, adm, 201);
            long idItens = json.readTree(comItens).get("id").asLong();
            assertThat(contar("SELECT COUNT(*) FROM garantia_itens WHERE id_garantia = ? AND descricao = ?", idItens, upper)).isEqualTo(1);
            // editar com o ataque tambem
            enviar(HttpMethod.PUT, "/api/garantias/" + id, g, adm, 200);

            // placa e CPF com o ataque: recusados pela validacao (400), nada gravado
            Map<String, Object> placaRuim = new LinkedHashMap<>(g);
            placaRuim.remove("itens");
            placaRuim.put("placa", ataque);
            enviar(HttpMethod.POST, "/api/garantias", placaRuim, adm, 400);
            Map<String, Object> cpfRuim = new LinkedHashMap<>(placaRuim);
            cpfRuim.put("semPlaca", true);
            cpfRuim.put("cpf", ataque);
            enviar(HttpMethod.POST, "/api/garantias", cpfRuim, adm, 400);
            enviar(HttpMethod.PUT, "/api/garantias/" + id + "/cupom", Map.of("status", ataque), adm, 400);

            // listas, veiculos e servicos
            enviar(HttpMethod.POST, "/api/listas/tecnicos", Map.of("nome", ataque + i), adm, 201);
            enviar(HttpMethod.POST, "/api/listas/modelos", Map.of("nome", ataque + i), adm, 201);
            enviar(HttpMethod.POST, "/api/veiculos", Map.of("marca", ("M" + i + ataque).substring(0, Math.min(40, ataque.length() + 2)), "modelo", ataque), adm, 201);
            Map<String, Object> s = new LinkedHashMap<>();
            s.put("nome", "SERV " + ataque);
            s.put("preco", 10);
            s.put("codigoCupom", ataque.substring(0, Math.min(30, ataque.length())));
            s.put("ativo", true);
            enviar(HttpMethod.POST, "/api/servicos", s, adm, 201);

            // contas: nome com o ataque entra como texto; e-mail com o ataque e recusado
            String conta = enviar(HttpMethod.POST, "/api/usuarios", Map.of("nome", ("U" + i + ataque).substring(0, Math.min(40, ataque.length() + 2)),
                    "email", "u" + i + "@exemplo.com", "pin", "4321"), adm, 201);
            long idConta = json.readTree(conta).get("id").asLong();
            enviar(HttpMethod.POST, "/api/usuarios", Map.of("nome", "Outro", "email", ataque, "pin", "4321"), adm, 400);
            // login, PIN e codigo com o ataque: so "nao encontrado"/"incorreto"
            enviar(HttpMethod.POST, "/api/sessao/esqueci-pin", Map.of("login", ataque), null, 400);
            enviar(HttpMethod.POST, "/api/sessao/redefinir-pin", Map.of("login", ataque, "codigo", ataque, "novoPin", "1234"), null, 400);
            enviar(HttpMethod.POST, "/api/sessao", Map.of("idUsuario", idConta, "pin", ataque), null, 401);
            // a busca do historico com o ataque no lugar do numero
            mvc.perform(comToken(get("/api/usuarios/acessos")).header(SESSAO, adm).param("id", ataque)).andExpect(status().isBadRequest());
        }
        // nada foi apagado nem alterado por fora: tabelas existem e contas so cresceram
        for (String tabela : new String[] {"garantias", "garantia_itens", "usuarios", "tecnicos", "servicos", "veiculos", "auditoria_operacoes"}) {
            assertThat(contar("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = ?", tabela)).isEqualTo(1);
        }
        assertThat(contar("SELECT COUNT(*) FROM usuarios")).isEqualTo(usuariosAntes + ATAQUES.size());
        // a tela recebe o texto como texto (JSON), e mostra com textContent
        String lista = mvc.perform(comToken(get("/api/garantias"))).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
        assertThat(json.readTree(lista).findValuesAsText("observacao")).contains("<SCRIPT>ALERT(1)</SCRIPT>", "' OR 1=1 --");
        // e o hash do PIN nunca aparece em resposta nenhuma
        assertThat(lista).doesNotContain("pbkdf2");
        String usuarios = mvc.perform(comToken(get("/api/usuarios")).header(SESSAO, adm)).andReturn().getResponse().getContentAsString();
        assertThat(usuarios).doesNotContain("pbkdf2").doesNotContain("v1:");
    }

    // ---------- e-mail, foto e contas ----------

    @Test
    void quebraDeLinhaNoEmailOuNoNomeNaoInjetaCabecalho() throws Exception {
        String adm = sessaoAdmin();
        for (String email : new String[] {"x@y.com\r\nBcc: vitima@z.com", "x@y.com\nBcc:v@z.com", "x@y.com%0d%0aBcc:v@z.com",
                "\"x\"@y.com", "x@y.com,v@z.com", "x@y.com;v@z.com", "<x@y.com>"}) {
            enviar(HttpMethod.POST, "/api/usuarios", Map.of("nome", "Teste Email", "email", email, "pin", "4321"), adm, 400);
            enviar(HttpMethod.PUT, "/api/email-config", Map.of("remetente", email, "senhaApp", "abcdefghijklmnop"), adm, 400);
            enviar(HttpMethod.POST, "/api/email-config/teste", Map.of("destino", email), adm, 400);
        }
        // nome com quebra de linha vira uma linha so (ele entra no texto do e-mail)
        String r = enviar(HttpMethod.POST, "/api/usuarios", Map.of("nome", "Ana\r\nBcc: v@z.com", "email", "ana@exemplo.com", "pin", "4321"), adm, 201);
        assertThat(json.readTree(r).get("nome").asText()).isEqualTo("ANA BCC: V@Z.COM");
        // senha de app: 16 letras, nada de simbolos/quebras
        enviar(HttpMethod.PUT, "/api/email-config", Map.of("remetente", "loja@gmail.com", "senhaApp", "abcd\r\nefghijklmn"), adm, 400);
        enviar(HttpMethod.PUT, "/api/email-config", Map.of("remetente", "loja@gmail.com", "senhaApp", "abcd efgh ijkl mnop"), adm, 204);
    }

    @Test
    void fotoSoEntraSeForPngOuJpegDeVerdade() throws Exception {
        String adm = sessaoAdmin();
        long id = contar("SELECT id_usuario FROM usuarios WHERE admin = 1 ORDER BY id_usuario LIMIT 1");
        String url = "/api/usuarios/" + id + "/foto";
        byte[][] falsas = {
            "GIF89a.......".getBytes(StandardCharsets.US_ASCII),
            "<svg onload=alert(1)>".getBytes(StandardCharsets.US_ASCII),
            "MZ executavel do windows".getBytes(StandardCharsets.US_ASCII),
            {(byte) 0x89, 'P', 'N', 'G', 0, 0, 0, 0, 0, 0}, // comeco de PNG incompleto
            {(byte) 0xFF, (byte) 0xD8, 0, 0}, // comeco de JPEG incompleto
        };
        for (byte[] f : falsas) {
            enviar(HttpMethod.PUT, url, Map.of("fotoBase64", "data:image/png;base64," + Base64.getEncoder().encodeToString(f)), adm, 400);
        }
        enviar(HttpMethod.PUT, url, Map.of("fotoBase64", "nao-e-base64!!!"), adm, 400);
        // mais de 1 MB: recusada antes de decodificar
        byte[] grande = new byte[1024 * 1024 + 10];
        grande[0] = (byte) 0xFF;
        grande[1] = (byte) 0xD8;
        grande[2] = (byte) 0xFF;
        enviar(HttpMethod.PUT, url, Map.of("fotoBase64", Base64.getEncoder().encodeToString(grande)), adm, 400);
        // JPEG de verdade (comeco certo) entra, e a resposta nao deixa o navegador "adivinhar" o tipo
        byte[] jpeg = {(byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0, 0x10, 'J', 'F', 'I', 'F'};
        enviar(HttpMethod.PUT, url, Map.of("fotoBase64", Base64.getEncoder().encodeToString(jpeg)), adm, 204);
        mvc.perform(comToken(get("/api/perfis/" + id + "/foto")))
                .andExpect(status().isOk())
                .andExpect(header().string("Content-Type", "image/jpeg"))
                .andExpect(header().string("X-Content-Type-Options", "nosniff"));
        // sem sessao de admin ninguem troca a foto
        enviar(HttpMethod.PUT, url, Map.of("fotoBase64", Base64.getEncoder().encodeToString(jpeg)), null, 401);
    }

    @Test
    void cadastradaPorVemDaSessaoENaoDoQueATelaManda() throws Exception {
        Map<String, Object> g = new LinkedHashMap<>();
        g.put("dataServico", LocalDate.now().toString());
        g.put("placa", "XYZ9A87");
        g.put("modelo", "GOL");
        g.put("servico", "CHAVE");
        g.put("tecnico", "FELIPE");
        g.put("criadoPor", "ADMIN FALSO");
        g.put("forcar", true);
        String r = enviar(HttpMethod.POST, "/api/garantias", g, "sessao-inventada", 201);
        assertThat(json.readTree(r).get("criadoPor").isNull()).isTrue();
        String adm = sessaoAdmin();
        r = enviar(HttpMethod.POST, "/api/garantias", g, adm, 201);
        assertThat(json.readTree(r).get("criadoPor").asText()).isEqualTo("ADMIN TESTE");
    }

    @Test
    void segundoAdminNaoPodeSerCriadoPelaRotaDaPrimeiraAbertura() throws Exception {
        sessaoAdmin();
        Map<String, Object> d = Map.of("nome", "Intruso", "email", "intruso@exemplo.com", "pin", "1234");
        enviar(HttpMethod.POST, "/api/perfis/primeiro-admin", d, null, 403);
        // rotas de admin sem sessao ou com sessao inventada: 401
        enviar(HttpMethod.POST, "/api/usuarios", d, null, 401);
        enviar(HttpMethod.POST, "/api/usuarios", d, "abc", 401);
        mvc.perform(comToken(get("/api/email-config"))).andExpect(status().isUnauthorized());
    }
}
