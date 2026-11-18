package com.chaveiro.database;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Evolucao versionada do esquema SQLite via PRAGMA user_version.
 * Migracoes sao incrementais e so acrescentam (nunca apagam dados).
 */
@Component
public class DatabaseInitializer {

    private static final Logger log = LoggerFactory.getLogger(DatabaseInitializer.class);
    private static final int VERSAO_ATUAL = 8;

    /** Listas iniciais, iguais as do VBA (frmControleGarantias V17.1); editaveis no sistema. */
    static final List<String> TECNICOS = List.of("FELIPE", "RENATO", "JONATAN", "HABNER", "LUÍS", "CARLOS H.", "CARLOS A.");

    static final List<String> MODELOS = List.of("CORSA", "VECTRA", "ASTRA", "CELTA", "MONZA", "OPALA", "KADET",
            "ZAFIRA", "MERIVA", "MONTANA", "ONIX", "PRISMA", "CRUZE", "COBALT", "S-10", "CAMARO", "GOL",
            "FORD KA", "FIESTA", "CURRIER", "ECOSPORT", "RANGER", "FOCUS", "F1000", "DELLREY", "PAMPA", "CORCEL",
            "CORCEL II", "VOYAGE", "PARATI", "POLO", "TCROSS", "FUSCA", "NEWBEATLE", "KOMBI", "FOX", "CROSSFOX",
            "GOLF", "JETTA", "UP", "SAVEIRO", "AMAROC", "PALIO", "PALIO WEEKEND", "PUNTO", "IDEA", "STRADA", "SIENA",
            "STILO", "MOB", "UNO", "FIAT 500", "FASTBACK", "FIORINO", "TORO", "SANDERO", "CLIO", "LOGAN", "DUSTER",
            "KWID", "MASTER", "COMPASS", "CHEROKEE", "RENEGADE", "COROLA", "COROLACROSS", "ETIOS", "LIVINIA",
            "HILUX", "SW4", "CIVIC", "CITY", "FIT", "HRV", "L200", "OUTLANDER", "LANCER", "PAJERO", "HB20", "CRETA",
            "AZIRA", "SENTRA", "C3", "C4", "PICASSO", "PEUGEOT 206", "PEUGEOT 207", "PEUGEOT 208", "DODGE RAM");

    /**
     * Servicos do VBA: nome, codigo do produto no cupom fiscal e se pede quantidade de
     * carcaca/botao/pilha ou de "itens" (demais pecas). PILHA e BOTAO sao PECAS: nao
     * aparecem como servico no cadastro, mas o preco delas divide o valor no cupom
     * (R$ 12 e R$ 15 no VBA). Os demais precos comecam em 0 e o usuario preenche em
     * ATUALIZAR PRECOS.
     */
    record ServicoInicial(String nome, String codigo, int carcaca, int botao, int pilha, int itens, int peca, int precoCentavos) {
    }

    static final List<ServicoInicial> SERVICOS = List.of(
            new ServicoInicial("TROCA CARCAÇA", "19", 1, 0, 0, 0, 0, 0),
            new ServicoInicial("TROCA CARCAÇA+PILHA", "19_10", 1, 0, 1, 0, 0, 0),
            new ServicoInicial("TROCA CARCAÇA+BOTÃO", "19_16", 1, 1, 0, 0, 0, 0),
            new ServicoInicial("TROCA CARCAÇA+BOTÃO+PILHA", "19_16_10", 1, 1, 1, 0, 0, 0),
            new ServicoInicial("TROCA GAIOLA", "48", 0, 0, 0, 1, 0, 0),
            new ServicoInicial("TROCA CILINDRO IGNIÇÃO", "999", 0, 0, 0, 1, 0, 0),
            new ServicoInicial("TROCA EXCÊNTRICO", "999", 0, 0, 0, 1, 0, 0),
            new ServicoInicial("TROCA BOLACHA", "50", 0, 0, 0, 1, 0, 0),
            new ServicoInicial("TROCA COMUTADOR PARTIDA", "47", 0, 0, 0, 1, 0, 0),
            new ServicoInicial("PILHA", "10", 0, 0, 0, 0, 1, 1200),
            new ServicoInicial("BOTÃO", "16", 0, 0, 0, 0, 1, 1500));

    private final ConnectionFactory conexao;

    public DatabaseInitializer(ConnectionFactory conexao) {
        this.conexao = conexao;
    }

    public int getVersaoAtual() {
        return VERSAO_ATUAL;
    }

    public int lerVersao() throws SQLException {
        try (Connection conn = conexao.getConnection();
             Statement stmt = conn.createStatement()) {
            var rs = stmt.executeQuery("PRAGMA user_version;");
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    /** Aplica as migracoes pendentes dentro de uma transacao unica. */
    public void inicializar() {
        inicializarAte(VERSAO_ATUAL);
    }

    /**
     * Leva o banco ate a versao `alvo` (os testes usam para montar um banco igual ao de
     * uma versao antiga do sistema e conferir que a atualizacao nao perde nada).
     */
    void inicializarAte(int alvo) {
        try {
            int versao = lerVersao();
            if (versao >= alvo) {
                log.info("esquema SQLite ja esta na versao {}", versao);
                return;
            }
            log.info("aplicando migracoes SQLite: versao {} -> {}", versao, alvo);
            try (Connection conn = conexao.getConnection()) {
                conn.setAutoCommit(false);
                try (Statement stmt = conn.createStatement()) {
                    for (int v = versao + 1; v <= alvo; v++) {
                        for (String comando : migracao(v)) {
                            stmt.execute(comando);
                        }
                        stmt.execute("PRAGMA user_version = " + v + ";");
                        log.info("migracao para a versao {} aplicada", v);
                    }
                    conn.commit();
                } catch (SQLException erro) {
                    conn.rollback();
                    throw erro;
                } finally {
                    conn.setAutoCommit(true);
                }
            }
        } catch (SQLException erro) {
            log.error("falha ao inicializar o banco SQLite", erro);
            throw new IllegalStateException("Falha na inicializacao do banco de dados", erro);
        }
    }

    private static List<String> migracao(int versao) {
        return switch (versao) {
            case 1 -> esquemaInicial();
            // perfis (tela "Quem esta usando?"): quem cadastrou cada garantia
            case 2 -> List.of("ALTER TABLE garantias ADD COLUMN criado_por TEXT");
            case 3 -> veiculos();
            case 4 -> usuarios();
            case 5 -> validacoesEAuditoriaCadastros();
            case 6 -> itensDaGarantia();
            case 7 -> limitesEAuditoriaSeguranca();
            case 8 -> cupomNoRm();
            default -> throw new IllegalStateException("migracao desconhecida: " + versao);
        };
    }

    private static String texto(String valor) {
        return "'" + valor.replace("'", "''") + "'";
    }

    private static List<String> esquemaInicial() {
        List<String> sql = new ArrayList<>();
        // ---------- listas editaveis ----------
        sql.add("""
                CREATE TABLE tecnicos (
                    id_tecnico INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(nome)) BETWEEN 2 AND 60),
                    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
                    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
                )
                """);
        sql.add("""
                CREATE TABLE modelos (
                    id_modelo INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(nome)) BETWEEN 1 AND 60),
                    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
                    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
                )
                """);
        // tabela de precos: servicos e pecas, com o codigo do produto no cupom fiscal
        sql.add("""
                CREATE TABLE servicos (
                    id_servico INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(nome)) BETWEEN 2 AND 80),
                    preco_centavos INTEGER NOT NULL DEFAULT 0 CHECK (preco_centavos >= 0),
                    codigo_cupom TEXT,
                    pede_carcaca INTEGER NOT NULL DEFAULT 0 CHECK (pede_carcaca IN (0, 1)),
                    pede_botao INTEGER NOT NULL DEFAULT 0 CHECK (pede_botao IN (0, 1)),
                    pede_pilha INTEGER NOT NULL DEFAULT 0 CHECK (pede_pilha IN (0, 1)),
                    pede_itens INTEGER NOT NULL DEFAULT 0 CHECK (pede_itens IN (0, 1)),
                    peca INTEGER NOT NULL DEFAULT 0 CHECK (peca IN (0, 1)),
                    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
                    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
                )
                """);
        // ---------- garantias ----------
        sql.add("""
                CREATE TABLE garantias (
                    id_garantia INTEGER PRIMARY KEY AUTOINCREMENT,
                    data_servico TEXT NOT NULL CHECK (date(data_servico) = data_servico),
                    placa TEXT,
                    sem_placa INTEGER NOT NULL DEFAULT 0 CHECK (sem_placa IN (0, 1)),
                    cpf TEXT,
                    modelo TEXT NOT NULL CHECK (length(trim(modelo)) >= 1),
                    id_servico INTEGER,
                    servico TEXT NOT NULL CHECK (length(trim(servico)) >= 2),
                    qtd_carcaca INTEGER NOT NULL DEFAULT 0 CHECK (qtd_carcaca BETWEEN 0 AND 99),
                    qtd_botao INTEGER NOT NULL DEFAULT 0 CHECK (qtd_botao BETWEEN 0 AND 99),
                    qtd_pilha INTEGER NOT NULL DEFAULT 0 CHECK (qtd_pilha BETWEEN 0 AND 99),
                    qtd_itens INTEGER NOT NULL DEFAULT 0 CHECK (qtd_itens BETWEEN 0 AND 99),
                    valor_centavos INTEGER NOT NULL DEFAULT 0 CHECK (valor_centavos >= 0),
                    tecnico TEXT NOT NULL CHECK (length(trim(tecnico)) >= 1),
                    observacao TEXT,
                    codigo_cupom TEXT,
                    cupom_status TEXT NOT NULL DEFAULT 'NAO_LANCADO'
                        CHECK (cupom_status IN ('NAO_LANCADO', 'LANCADO', 'DISPENSADO')),
                    cupom_lancado_em TEXT,
                    origem TEXT NOT NULL DEFAULT 'SISTEMA' CHECK (origem IN ('SISTEMA', 'LEGADO')),
                    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                    CHECK (origem = 'LEGADO'
                        OR (sem_placa = 0 AND placa IS NOT NULL AND length(placa) = 7)
                        OR (sem_placa = 1 AND placa IS NULL AND cpf IS NOT NULL AND length(cpf) = 11)),
                    FOREIGN KEY (id_servico) REFERENCES servicos(id_servico) ON DELETE SET NULL
                )
                """);
        sql.add("CREATE INDEX idx_garantias_data ON garantias(data_servico)");
        sql.add("CREATE INDEX idx_garantias_placa ON garantias(placa)");
        sql.add("CREATE INDEX idx_garantias_cpf ON garantias(cpf)");
        // ---------- legado: linhas da planilha GARANTIAS-AAAA.xlsm como estavam ----------
        sql.add("""
                CREATE TABLE legado_garantias (
                    id_legado INTEGER PRIMARY KEY AUTOINCREMENT,
                    arquivo_origem TEXT NOT NULL,
                    aba_origem TEXT NOT NULL,
                    linha_origem INTEGER NOT NULL,
                    data TEXT,
                    placa TEXT,
                    modelo TEXT,
                    servico TEXT,
                    cpf TEXT,
                    valor TEXT,
                    tecnico TEXT,
                    observacao TEXT,
                    importado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                    id_garantia_migrada INTEGER REFERENCES garantias(id_garantia) ON DELETE SET NULL,
                    UNIQUE (arquivo_origem, aba_origem, linha_origem)
                )
                """);
        sql.add("""
                CREATE TABLE manutencao (
                    chave TEXT PRIMARY KEY,
                    valor TEXT NOT NULL
                )
                """);
        // ---------- listas iniciais ----------
        for (String nome : TECNICOS) {
            sql.add("INSERT OR IGNORE INTO tecnicos (nome) VALUES (" + texto(nome) + ")");
        }
        for (String nome : MODELOS) {
            sql.add("INSERT OR IGNORE INTO modelos (nome) VALUES (" + texto(nome) + ")");
        }
        for (ServicoInicial s : SERVICOS) {
            sql.add("INSERT OR IGNORE INTO servicos (nome, codigo_cupom, pede_carcaca, pede_botao, pede_pilha,"
                    + " pede_itens, peca, preco_centavos) VALUES (" + texto(s.nome()) + ", " + texto(s.codigo()) + ", "
                    + s.carcaca() + ", " + s.botao() + ", " + s.pilha() + ", " + s.itens() + ", " + s.peca() + ", "
                    + s.precoCentavos() + ")");
        }
        sql.addAll(seguranca());
        return sql;
    }

    // ---------- auditoria e gatilhos de seguranca (mesmo padrao do Contas a Pagar v17) ----------

    private static String jsonGarantia(String r) {
        return "json_object('id_garantia', " + r + ".id_garantia, 'data_servico', " + r + ".data_servico,"
                + " 'placa', " + r + ".placa, 'sem_placa', " + r + ".sem_placa, 'cpf', " + r + ".cpf,"
                + " 'modelo', " + r + ".modelo, 'id_servico', " + r + ".id_servico, 'servico', " + r + ".servico,"
                + " 'qtd_carcaca', " + r + ".qtd_carcaca, 'qtd_botao', " + r + ".qtd_botao,"
                + " 'qtd_pilha', " + r + ".qtd_pilha, 'qtd_itens', " + r + ".qtd_itens,"
                + " 'valor_centavos', " + r + ".valor_centavos, 'tecnico', " + r + ".tecnico,"
                + " 'observacao', " + r + ".observacao, 'cupom_status', " + r + ".cupom_status,"
                + " 'origem', " + r + ".origem)";
    }

    private static String jsonServico(String r) {
        return "json_object('id_servico', " + r + ".id_servico, 'nome', " + r + ".nome,"
                + " 'preco_centavos', " + r + ".preco_centavos, 'codigo_cupom', " + r + ".codigo_cupom,"
                + " 'ativo', " + r + ".ativo)";
    }

    private static String auditar(String tabela, String operacao, String idRegistro, String antes, String depois) {
        return "INSERT INTO auditoria_operacoes (tabela, operacao, id_registro, antes, depois) VALUES ('"
                + tabela + "', '" + operacao + "', " + idRegistro + ", " + antes + ", " + depois + ");";
    }

    /**
     * Auditoria automatica (garantias e precos, com antes/depois) e somente-inclusao;
     * servico em uso nao e excluido; cupom LANCADO exige a data do lancamento.
     */
    private static List<String> seguranca() {
        List<String> sql = new ArrayList<>();
        sql.add("""
                CREATE TABLE auditoria_operacoes (
                    id_auditoria INTEGER PRIMARY KEY AUTOINCREMENT,
                    momento TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%f', 'now', 'localtime')),
                    tabela TEXT NOT NULL,
                    operacao TEXT NOT NULL CHECK (operacao IN ('INSERT', 'UPDATE', 'DELETE')),
                    id_registro INTEGER NOT NULL,
                    antes TEXT,
                    depois TEXT
                )
                """);
        sql.add("CREATE INDEX idx_auditoria_registro ON auditoria_operacoes(tabela, id_registro)");
        sql.add("""
                CREATE TRIGGER trg_cupom_lancado_exige_data
                BEFORE UPDATE OF cupom_status ON garantias
                WHEN NEW.cupom_status = 'LANCADO' AND NEW.cupom_lancado_em IS NULL
                BEGIN
                    SELECT RAISE(ABORT, 'CUPOM_INVALIDO: cupom LANCADO precisa da data do lancamento');
                END
                """);
        sql.add("""
                CREATE TRIGGER trg_servico_em_uso_nao_exclui
                BEFORE DELETE ON servicos
                WHEN EXISTS (SELECT 1 FROM garantias WHERE id_servico = OLD.id_servico)
                BEGIN
                    SELECT RAISE(ABORT, 'SERVICO_EM_USO: desative o servico em vez de excluir');
                END
                """);
        sql.add("CREATE TRIGGER trg_auditoria_garantia_insert AFTER INSERT ON garantias BEGIN "
                + auditar("garantias", "INSERT", "NEW.id_garantia", "NULL", jsonGarantia("NEW")) + " END");
        sql.add("CREATE TRIGGER trg_auditoria_garantia_update AFTER UPDATE ON garantias"
                + " WHEN " + jsonGarantia("OLD") + " IS NOT " + jsonGarantia("NEW") + " BEGIN "
                + auditar("garantias", "UPDATE", "NEW.id_garantia", jsonGarantia("OLD"), jsonGarantia("NEW")) + " END");
        sql.add("CREATE TRIGGER trg_auditoria_garantia_delete AFTER DELETE ON garantias BEGIN "
                + auditar("garantias", "DELETE", "OLD.id_garantia", jsonGarantia("OLD"), "NULL") + " END");
        sql.add("CREATE TRIGGER trg_auditoria_servico_update AFTER UPDATE ON servicos"
                + " WHEN " + jsonServico("OLD") + " IS NOT " + jsonServico("NEW") + " BEGIN "
                + auditar("servicos", "UPDATE", "NEW.id_servico", jsonServico("OLD"), jsonServico("NEW")) + " END");
        sql.add("""
                CREATE TRIGGER trg_auditoria_nao_altera
                BEFORE UPDATE ON auditoria_operacoes
                BEGIN
                    SELECT RAISE(ABORT, 'AUDITORIA_SOMENTE_LEITURA: a auditoria nao pode ser alterada');
                END
                """);
        sql.add("""
                CREATE TRIGGER trg_auditoria_nao_apaga
                BEFORE DELETE ON auditoria_operacoes
                BEGIN
                    SELECT RAISE(ABORT, 'AUDITORIA_SOMENTE_LEITURA: a auditoria nao pode ser apagada');
                END
                """);
        return sql;
    }

    /** Carros mais comuns do mercado brasileiro, por marca (editaveis em CONTROLE > VEICULOS). */
    static final Map<String, List<String>> CARROS = new TreeMap<>(Map.ofEntries(
            Map.entry("CHEVROLET", List.of("ONIX", "ONIX PLUS", "PRISMA", "CELTA", "CORSA", "CLASSIC", "CRUZE", "COBALT", "SPIN", "TRACKER", "MONTANA", "S10", "TRAILBLAZER", "EQUINOX", "AGILE", "ASTRA", "VECTRA", "MERIVA", "ZAFIRA", "KADETT", "MONZA", "OPALA", "CAMARO", "CAPTIVA", "BLAZER")),
            Map.entry("VOLKSWAGEN", List.of("GOL", "VOYAGE", "FOX", "CROSSFOX", "SPACEFOX", "POLO", "VIRTUS", "T-CROSS", "NIVUS", "TAOS", "TIGUAN", "JETTA", "GOLF", "UP", "SAVEIRO", "AMAROK", "PARATI", "SANTANA", "PASSAT", "FUSCA", "NEW BEETLE", "KOMBI")),
            Map.entry("FIAT", List.of("UNO", "MOBI", "ARGO", "CRONOS", "PALIO", "PALIO WEEKEND", "SIENA", "GRAND SIENA", "STRADA", "TORO", "PULSE", "FASTBACK", "FIORINO", "DOBLO", "IDEA", "PUNTO", "BRAVO", "STILO", "LINEA", "500", "PREMIO", "TEMPRA", "TIPO", "FREEMONT")),
            Map.entry("FORD", List.of("KA", "KA SEDAN", "FIESTA", "FOCUS", "ECOSPORT", "FUSION", "RANGER", "TERRITORY", "BRONCO SPORT", "MAVERICK", "ESCORT", "COURIER", "F-1000", "F-250", "DEL REY", "PAMPA", "CORCEL", "EDGE")),
            Map.entry("RENAULT", List.of("KWID", "SANDERO", "STEPWAY", "LOGAN", "DUSTER", "OROCH", "CAPTUR", "KARDIAN", "CLIO", "MEGANE", "SCENIC", "FLUENCE", "SYMBOL", "MASTER")),
            Map.entry("TOYOTA", List.of("COROLLA", "COROLLA CROSS", "ETIOS", "YARIS", "HILUX", "SW4", "RAV4", "CAMRY", "PRIUS", "BANDEIRANTE")),
            Map.entry("HONDA", List.of("CIVIC", "CITY", "FIT", "HR-V", "WR-V", "CR-V", "ACCORD")),
            Map.entry("HYUNDAI", List.of("HB20", "HB20S", "CRETA", "TUCSON", "IX35", "SANTA FE", "AZERA", "ELANTRA", "I30", "VELOSTER", "HR")),
            Map.entry("NISSAN", List.of("KICKS", "VERSA", "MARCH", "SENTRA", "FRONTIER", "LIVINA", "TIIDA")),
            Map.entry("JEEP", List.of("RENEGADE", "COMPASS", "COMMANDER", "CHEROKEE", "GRAND CHEROKEE", "WRANGLER")),
            Map.entry("MITSUBISHI", List.of("L200", "L200 TRITON", "PAJERO", "PAJERO SPORT", "PAJERO TR4", "OUTLANDER", "ASX", "ECLIPSE CROSS", "LANCER")),
            Map.entry("PEUGEOT", List.of("206", "207", "208", "2008", "3008", "5008", "307", "308", "408", "PARTNER", "HOGGAR", "EXPERT", "BOXER")),
            Map.entry("CITROEN", List.of("C3", "C3 AIRCROSS", "C4", "C4 CACTUS", "C4 LOUNGE", "C4 PICASSO", "XSARA PICASSO", "AIRCROSS", "BERLINGO", "JUMPY", "JUMPER")),
            Map.entry("KIA", List.of("PICANTO", "CERATO", "SPORTAGE", "SORENTO", "SOUL", "STONIC", "CARNIVAL", "BONGO")),
            Map.entry("BYD", List.of("DOLPHIN", "DOLPHIN MINI", "SEAL", "SONG PLUS", "YUAN PLUS", "KING", "SHARK", "TAN", "HAN")),
            Map.entry("CAOA CHERY", List.of("TIGGO 2", "TIGGO 3X", "TIGGO 5X", "TIGGO 7", "TIGGO 8", "ARRIZO 5", "ARRIZO 6", "QQ", "CELER")),
            Map.entry("GWM", List.of("HAVAL H6", "HAVAL JOLION", "ORA 03")),
            Map.entry("RAM", List.of("RAMPAGE", "1500", "2500", "3500")),
            Map.entry("DODGE", List.of("JOURNEY", "DAKOTA")),
            Map.entry("MERCEDES-BENZ", List.of("CLASSE A", "CLASSE C", "CLASSE E", "GLA", "GLC", "SPRINTER")),
            Map.entry("BMW", List.of("SERIE 1", "SERIE 3", "SERIE 5", "X1", "X3", "X5")),
            Map.entry("AUDI", List.of("A3", "A4", "A5", "Q3", "Q5", "Q7")),
            Map.entry("VOLVO", List.of("XC40", "XC60", "XC90", "EX30")),
            Map.entry("LAND ROVER", List.of("EVOQUE", "DISCOVERY SPORT", "DEFENDER", "FREELANDER")),
            Map.entry("SUZUKI", List.of("JIMNY", "VITARA", "S-CROSS", "SWIFT")),
            Map.entry("JAC", List.of("T40", "T50", "J3", "E-JS1")),
            Map.entry("MINI", List.of("COOPER", "COUNTRYMAN")),
            Map.entry("TROLLER", List.of("T4"))));

    /**
     * v3 - entidade de veiculos (marcas + modelos) e as relacoes da garantia nos
     * moldes do Contas a Pagar: a garantia guarda o NOME (texto, historico) e a
     * chave estrangeira com ON DELETE SET NULL (excluir o cadastro nao apaga a garantia).
     */
    private static List<String> veiculos() {
        List<String> sql = new ArrayList<>();
        sql.add("""
                CREATE TABLE marcas (
                    id_marca INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(nome)) BETWEEN 2 AND 40),
                    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
                )
                """);
        sql.add("""
                CREATE TABLE veiculos (
                    id_veiculo INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_marca INTEGER NOT NULL,
                    modelo TEXT NOT NULL COLLATE NOCASE CHECK (length(trim(modelo)) BETWEEN 1 AND 60),
                    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
                    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime')),
                    UNIQUE (id_marca, modelo),
                    FOREIGN KEY (id_marca) REFERENCES marcas(id_marca) ON DELETE RESTRICT
                )
                """);
        sql.add("CREATE INDEX idx_veiculos_marca ON veiculos(id_marca)");
        for (var e : CARROS.entrySet()) {
            sql.add("INSERT OR IGNORE INTO marcas (nome) VALUES (" + texto(e.getKey()) + ")");
            for (String modelo : e.getValue()) {
                sql.add("INSERT OR IGNORE INTO veiculos (id_marca, modelo) SELECT id_marca, " + texto(modelo)
                        + " FROM marcas WHERE nome = " + texto(e.getKey()));
            }
        }
        // modelos da lista antiga (VBA/editados) que nao estao no catalogo: marca OUTRAS
        sql.add("INSERT OR IGNORE INTO marcas (nome) VALUES ('OUTRAS')");
        sql.add("INSERT OR IGNORE INTO veiculos (id_marca, modelo, ativo)"
                + " SELECT (SELECT id_marca FROM marcas WHERE nome = 'OUTRAS'), m.nome, m.ativo FROM modelos m"
                + " WHERE NOT EXISTS (SELECT 1 FROM veiculos v WHERE v.modelo = m.nome COLLATE NOCASE)"
                // a lista original do VBA (com grafias como COROLA e KADET) ja esta coberta pelo catalogo
                + " AND m.nome NOT IN (" + String.join(", ", MODELOS.stream().map(DatabaseInitializer::texto).toList()) + ")");
        sql.add("ALTER TABLE garantias ADD COLUMN id_veiculo INTEGER REFERENCES veiculos(id_veiculo) ON DELETE SET NULL");
        sql.add("ALTER TABLE garantias ADD COLUMN id_tecnico INTEGER REFERENCES tecnicos(id_tecnico) ON DELETE SET NULL");
        sql.add("CREATE INDEX idx_garantias_veiculo ON garantias(id_veiculo)");
        sql.add("CREATE INDEX idx_garantias_tecnico ON garantias(id_tecnico)");
        // liga as garantias que ja existem pelo nome
        sql.add("UPDATE garantias SET id_tecnico = (SELECT t.id_tecnico FROM tecnicos t WHERE t.nome = garantias.tecnico COLLATE NOCASE)");
        sql.add("UPDATE garantias SET id_veiculo = (SELECT v.id_veiculo FROM veiculos v WHERE v.modelo = garantias.modelo COLLATE NOCASE"
                + " ORDER BY v.id_veiculo LIMIT 1)");
        return sql;
    }

    /**
     * v4 - contas de usuario (tela "Quem esta usando?" com PIN). Login, e-mail e
     * PIN NUNCA ficam em texto: login e e-mail cifrados (AES-256-GCM) + indice HMAC
     * do login para a busca; PIN como hash PBKDF2 com sal e chave secreta fora do
     * banco (service/Cripto). O primeiro usuario criado e o administrador.
     */
    private static List<String> usuarios() {
        List<String> sql = new ArrayList<>();
        sql.add("""
                CREATE TABLE usuarios (
                    id_usuario INTEGER PRIMARY KEY AUTOINCREMENT,
                    nome TEXT NOT NULL CHECK (length(trim(nome)) BETWEEN 2 AND 40),
                    login_indice TEXT NOT NULL UNIQUE,
                    login_cifrado TEXT NOT NULL,
                    email_cifrado TEXT,
                    pin_hash TEXT NOT NULL,
                    foto BLOB,
                    admin INTEGER NOT NULL DEFAULT 0 CHECK (admin IN (0, 1)),
                    ativo INTEGER NOT NULL DEFAULT 1 CHECK (ativo IN (0, 1)),
                    falhas INTEGER NOT NULL DEFAULT 0 CHECK (falhas >= 0),
                    bloqueado_ate TEXT,
                    acessos INTEGER NOT NULL DEFAULT 0 CHECK (acessos >= 0),
                    ultimo_acesso TEXT,
                    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
                )
                """);
        // historico de acessos: a conta pode ser excluida, o historico fica (com o nome)
        sql.add("""
                CREATE TABLE acessos_usuario (
                    id_acesso INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_usuario INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
                    nome TEXT NOT NULL,
                    momento TEXT NOT NULL DEFAULT (strftime('%Y-%m-%d %H:%M:%S', 'now', 'localtime')),
                    tipo TEXT NOT NULL CHECK (tipo IN ('ENTRADA', 'PIN_ERRADO', 'BLOQUEIO', 'PIN_TROCADO',
                        'PIN_REDEFINIDO_EMAIL', 'PIN_REDEFINIDO_ADMIN', 'CODIGO_ENVIADO'))
                )
                """);
        sql.add("CREATE INDEX idx_acessos_usuario ON acessos_usuario(id_usuario, momento)");
        sql.add("""
                CREATE TABLE codigos_redefinicao (
                    id_codigo INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_usuario INTEGER NOT NULL REFERENCES usuarios(id_usuario) ON DELETE CASCADE,
                    codigo_hash TEXT NOT NULL,
                    expira_em TEXT NOT NULL,
                    tentativas INTEGER NOT NULL DEFAULT 0,
                    usado INTEGER NOT NULL DEFAULT 0 CHECK (usado IN (0, 1)),
                    criado_em TEXT NOT NULL DEFAULT (datetime('now','localtime'))
                )
                """);
        // nunca ficar sem administrador ativo
        sql.add("""
                CREATE TRIGGER trg_ultimo_admin_nao_sai
                BEFORE UPDATE OF admin, ativo ON usuarios
                WHEN OLD.admin = 1 AND OLD.ativo = 1 AND (NEW.admin = 0 OR NEW.ativo = 0)
                    AND (SELECT COUNT(*) FROM usuarios WHERE admin = 1 AND ativo = 1) <= 1
                BEGIN
                    SELECT RAISE(ABORT, 'ULTIMO_ADMIN: o sistema precisa de pelo menos um administrador ativo');
                END
                """);
        sql.add("""
                CREATE TRIGGER trg_ultimo_admin_nao_exclui
                BEFORE DELETE ON usuarios
                WHEN OLD.admin = 1 AND OLD.ativo = 1
                    AND (SELECT COUNT(*) FROM usuarios WHERE admin = 1 AND ativo = 1) <= 1
                BEGIN
                    SELECT RAISE(ABORT, 'ULTIMO_ADMIN: o sistema precisa de pelo menos um administrador ativo');
                END
                """);
        // historico somente-inclusao (so o ON DELETE SET NULL da conta pode mexer nele)
        sql.add("""
                CREATE TRIGGER trg_acessos_nao_altera
                BEFORE UPDATE ON acessos_usuario
                WHEN NOT (NEW.id_usuario IS NULL AND OLD.id_usuario IS NOT NULL
                    AND NEW.nome = OLD.nome AND NEW.momento = OLD.momento AND NEW.tipo = OLD.tipo)
                BEGIN
                    SELECT RAISE(ABORT, 'ACESSOS_SOMENTE_LEITURA: o historico de acessos nao pode ser alterado');
                END
                """);
        sql.add("""
                CREATE TRIGGER trg_acessos_nao_apaga
                BEFORE DELETE ON acessos_usuario
                BEGIN
                    SELECT RAISE(ABORT, 'ACESSOS_SOMENTE_LEITURA: o historico de acessos nao pode ser apagado');
                END
                """);
        return sql;
    }

    // ---------- v5: validacao de placa/CPF/data no proprio banco + auditoria de tecnicos e veiculos ----------

    /** Digito do CPF na posicao 1..11 (o texto ja passou pelo GLOB de 11 numeros). */
    private static String digitoCpf(String r, int posicao) {
        return "CAST(substr(" + r + ".cpf, " + posicao + ", 1) AS INTEGER)";
    }

    /** Digito verificador (modulo 11) calculado sobre os `quantos` primeiros digitos. */
    private static String verificadorCpf(String r, int quantos) {
        List<String> parcelas = new ArrayList<>();
        for (int i = 1; i <= quantos; i++) {
            parcelas.add(digitoCpf(r, i) + " * " + (quantos + 2 - i));
        }
        String soma = "(" + String.join(" + ", parcelas) + ")";
        return "(CASE WHEN " + soma + " % 11 < 2 THEN 0 ELSE 11 - " + soma + " % 11 END)";
    }

    /** Mesma regra do GarantiaService.cpfValido: 11 numeros, nao todos iguais, 2 verificadores certos. */
    static String cpfValidoSql(String r) {
        return "(" + r + ".cpf GLOB '" + "[0-9]".repeat(11) + "'"
                + " AND replace(" + r + ".cpf, substr(" + r + ".cpf, 1, 1), '') <> ''"
                + " AND " + digitoCpf(r, 10) + " = " + verificadorCpf(r, 9)
                + " AND " + digitoCpf(r, 11) + " = " + verificadorCpf(r, 10) + ")";
    }

    /** Placa antiga (ABC1234) ou Mercosul (ABC1D23). */
    static final String PLACA_GLOB = "'[A-Z][A-Z][A-Z][0-9][A-Z0-9][0-9][0-9]'";

    private static String jsonTecnico(String r) {
        return "json_object('id_tecnico', " + r + ".id_tecnico, 'nome', " + r + ".nome, 'ativo', " + r + ".ativo)";
    }

    private static String jsonVeiculo(String r) {
        return "json_object('id_veiculo', " + r + ".id_veiculo, 'id_marca', " + r + ".id_marca,"
                + " 'modelo', " + r + ".modelo, 'ativo', " + r + ".ativo)";
    }

    /**
     * Ultima linha de defesa (o servidor ja valida antes): garantia nova ou alterada pelo
     * sistema nao entra com placa fora do padrao, CPF com digito errado ou data no futuro.
     * Linhas da planilha antiga (origem LEGADO) ficam como vieram. Tecnicos e veiculos
     * passam a ser auditados (antes/depois), como as garantias e os precos.
     */
    private static List<String> validacoesEAuditoriaCadastros() {
        List<String> sql = new ArrayList<>();
        String placaRuim = "NEW.sem_placa = 0 AND NOT (coalesce(NEW.placa, '') GLOB " + PLACA_GLOB + ")";
        String cpfRuim = "NEW.cpf IS NOT NULL AND NOT " + cpfValidoSql("NEW");
        // mesma folga de 1 dia do servidor (fuso/relogio da maquina)
        String futuro = "NEW.data_servico > date('now', 'localtime', '+1 day')";
        String[][] regras = {
            {"placa", placaRuim, "PLACA_INVALIDA: use ABC1234 (antiga) ou ABC1D23 (Mercosul)"},
            {"cpf", cpfRuim, "CPF_INVALIDO: os digitos verificadores do CPF nao conferem"},
            {"data_servico", futuro, "DATA_FUTURA: a data do servico nao pode ser no futuro"},
        };
        for (String[] r : regras) {
            String coluna = r[0];
            sql.add("CREATE TRIGGER trg_garantia_" + coluna + "_insert BEFORE INSERT ON garantias"
                    + " WHEN NEW.origem <> 'LEGADO' AND " + r[1]
                    + " BEGIN SELECT RAISE(ABORT, '" + r[2] + "'); END");
            // so quando o campo muda: editar outra coisa numa garantia antiga nao trava
            sql.add("CREATE TRIGGER trg_garantia_" + coluna + "_update BEFORE UPDATE OF " + coluna + " ON garantias"
                    + " WHEN NEW.origem <> 'LEGADO' AND NEW." + coluna + " IS NOT OLD." + coluna + " AND " + r[1]
                    + " BEGIN SELECT RAISE(ABORT, '" + r[2] + "'); END");
        }
        for (String[] t : new String[][] {{"tecnicos", "id_tecnico"}, {"veiculos", "id_veiculo"}}) {
            String tabela = t[0];
            String id = t[1];
            java.util.function.Function<String, String> json = tabela.equals("tecnicos")
                    ? DatabaseInitializer::jsonTecnico : DatabaseInitializer::jsonVeiculo;
            String prefixo = "trg_auditoria_" + tabela.substring(0, tabela.length() - 1);
            sql.add("CREATE TRIGGER " + prefixo + "_insert AFTER INSERT ON " + tabela + " BEGIN "
                    + auditar(tabela, "INSERT", "NEW." + id, "NULL", json.apply("NEW")) + " END");
            sql.add("CREATE TRIGGER " + prefixo + "_update AFTER UPDATE ON " + tabela
                    + " WHEN " + json.apply("OLD") + " IS NOT " + json.apply("NEW") + " BEGIN "
                    + auditar(tabela, "UPDATE", "NEW." + id, json.apply("OLD"), json.apply("NEW")) + " END");
            sql.add("CREATE TRIGGER " + prefixo + "_delete AFTER DELETE ON " + tabela + " BEGIN "
                    + auditar(tabela, "DELETE", "OLD." + id, json.apply("OLD"), "NULL") + " END");
        }
        return sql;
    }

    // ---------- v6: varios produtos por garantia (botao + no cadastro) ----------

    /**
     * Cada garantia pode ter varios produtos (linhas do cadastro). A garantia continua
     * guardando o resumo em texto ("TROCA CARCACA + PILHA"), as quantidades e o valor,
     * entao pesquisa, graficos, cupom e backup nao mudam. As combinacoes prontas do VBA
     * (CARCACA+PILHA...) saem da lista: agora se escolhe produto por produto.
     */
    private static List<String> itensDaGarantia() {
        List<String> sql = new ArrayList<>();
        sql.add("""
                CREATE TABLE garantia_itens (
                    id_item INTEGER PRIMARY KEY AUTOINCREMENT,
                    id_garantia INTEGER NOT NULL REFERENCES garantias(id_garantia) ON DELETE CASCADE,
                    ordem INTEGER NOT NULL CHECK (ordem >= 1),
                    id_servico INTEGER REFERENCES servicos(id_servico) ON DELETE SET NULL,
                    descricao TEXT NOT NULL CHECK (length(trim(descricao)) BETWEEN 2 AND 120),
                    quantidade INTEGER NOT NULL CHECK (quantidade BETWEEN 1 AND 5),
                    preco_centavos INTEGER NOT NULL DEFAULT 0 CHECK (preco_centavos >= 0),
                    UNIQUE (id_garantia, ordem)
                )
                """);
        sql.add("CREATE INDEX idx_garantia_itens_garantia ON garantia_itens(id_garantia)");
        sql.add("UPDATE servicos SET ativo = 0 WHERE nome IN ('TROCA CARCAÇA+PILHA', 'TROCA CARCAÇA+BOTÃO', 'TROCA CARCAÇA+BOTÃO+PILHA')");
        return sql;
    }

    // ---------- v7: auditoria de seguranca (limites de tamanho e auditoria que faltava) ----------

    private static String jsonItem(String r) {
        return "json_object('id_item', " + r + ".id_item, 'id_garantia', " + r + ".id_garantia, 'ordem', " + r + ".ordem,"
                + " 'id_servico', " + r + ".id_servico, 'descricao', " + r + ".descricao, 'quantidade', " + r + ".quantidade,"
                + " 'preco_centavos', " + r + ".preco_centavos)";
    }

    /** Conta de usuario SEM segredos: nada de login/e-mail cifrado nem hash do PIN (so se mudou). */
    private static String jsonUsuario(String r) {
        return "json_object('id_usuario', " + r + ".id_usuario, 'nome', " + r + ".nome, 'admin', " + r + ".admin,"
                + " 'ativo', " + r + ".ativo, 'tem_foto', " + r + ".foto IS NOT NULL, 'login_indice', " + r + ".login_indice)";
    }

    /**
     * Ultima linha de defesa contra textos enormes (o servidor ja corta/valida antes) e
     * auditoria do que ainda nao era auditado:
     * - garantias: modelo/servico ate 120, tecnico/criado_por ate 60, observacao ate 500;
     * - legado: cada celula ate 1000 letras e o nome do arquivo ate 120;
     * - foto da conta ate 1 MB;
     * - auditoria (antes/depois) dos produtos da garantia, das contas (sem PIN, login ou
     *   e-mail: so nome, admin, ativo, foto e "PIN trocado"), das configuracoes (so a
     *   chave, nunca a senha de app) e da inclusao/exclusao de servicos.
     */
    private static List<String> limitesEAuditoriaSeguranca() {
        List<String> sql = new ArrayList<>();
        String[][] limites = {
            {"modelo", "120"}, {"servico", "120"}, {"tecnico", "60"}, {"observacao", "500"}, {"criado_por", "60"},
            {"placa", "20"}, {"cpf", "20"}, {"codigo_cupom", "200"},
        };
        for (String[] l : limites) {
            String ruim = "length(NEW." + l[0] + ") > " + l[1];
            String msg = "TEXTO_LONGO: " + l[0] + " passa de " + l[1] + " caracteres";
            sql.add("CREATE TRIGGER trg_garantia_" + l[0] + "_tamanho_insert BEFORE INSERT ON garantias WHEN " + ruim
                    + " BEGIN SELECT RAISE(ABORT, '" + msg + "'); END");
            sql.add("CREATE TRIGGER trg_garantia_" + l[0] + "_tamanho_update BEFORE UPDATE OF " + l[0] + " ON garantias WHEN "
                    + ruim + " AND NEW." + l[0] + " IS NOT OLD." + l[0] + " BEGIN SELECT RAISE(ABORT, '" + msg + "'); END");
        }
        StringBuilder legadoRuim = new StringBuilder("length(NEW.arquivo_origem) > 120 OR length(NEW.aba_origem) > 60");
        for (String c : new String[] {"data", "placa", "modelo", "servico", "cpf", "valor", "tecnico", "observacao"}) {
            legadoRuim.append(" OR length(NEW.").append(c).append(") > 1000");
        }
        sql.add("CREATE TRIGGER trg_legado_tamanho BEFORE INSERT ON legado_garantias WHEN " + legadoRuim
                + " BEGIN SELECT RAISE(ABORT, 'TEXTO_LONGO: celula da planilha antiga grande demais'); END");
        for (String op : new String[] {"INSERT", "UPDATE OF foto"}) {
            sql.add("CREATE TRIGGER trg_usuario_foto_" + (op.startsWith("I") ? "insert" : "update") + " BEFORE " + op
                    + " ON usuarios WHEN length(NEW.foto) > 1048576"
                    + " BEGIN SELECT RAISE(ABORT, 'FOTO_GRANDE: a foto passa de 1 MB'); END");
        }
        // produtos da garantia
        sql.add("CREATE TRIGGER trg_auditoria_item_insert AFTER INSERT ON garantia_itens BEGIN "
                + auditar("garantia_itens", "INSERT", "NEW.id_item", "NULL", jsonItem("NEW")) + " END");
        sql.add("CREATE TRIGGER trg_auditoria_item_update AFTER UPDATE ON garantia_itens"
                + " WHEN " + jsonItem("OLD") + " IS NOT " + jsonItem("NEW") + " BEGIN "
                + auditar("garantia_itens", "UPDATE", "NEW.id_item", jsonItem("OLD"), jsonItem("NEW")) + " END");
        sql.add("CREATE TRIGGER trg_auditoria_item_delete AFTER DELETE ON garantia_itens BEGIN "
                + auditar("garantia_itens", "DELETE", "OLD.id_item", jsonItem("OLD"), "NULL") + " END");
        // contas (falhas/acessos/ultimo acesso ja ficam em acessos_usuario)
        String depoisUsuario = "json_patch(" + jsonUsuario("NEW") + ", json_object('pin_trocado', OLD.pin_hash IS NOT NEW.pin_hash))";
        sql.add("CREATE TRIGGER trg_auditoria_usuario_insert AFTER INSERT ON usuarios BEGIN "
                + auditar("usuarios", "INSERT", "NEW.id_usuario", "NULL", jsonUsuario("NEW")) + " END");
        sql.add("CREATE TRIGGER trg_auditoria_usuario_update AFTER UPDATE ON usuarios"
                + " WHEN " + jsonUsuario("OLD") + " IS NOT " + jsonUsuario("NEW") + " OR OLD.pin_hash IS NOT NEW.pin_hash"
                + " OR OLD.foto IS NOT NEW.foto BEGIN "
                + auditar("usuarios", "UPDATE", "NEW.id_usuario", jsonUsuario("OLD"), depoisUsuario) + " END");
        sql.add("CREATE TRIGGER trg_auditoria_usuario_delete AFTER DELETE ON usuarios BEGIN "
                + auditar("usuarios", "DELETE", "OLD.id_usuario", jsonUsuario("OLD"), "NULL") + " END");
        // configuracoes: so a chave (o valor pode ser a senha de app cifrada)
        sql.add("CREATE TRIGGER trg_auditoria_config_insert AFTER INSERT ON manutencao BEGIN "
                + auditar("manutencao", "INSERT", "NEW.rowid", "NULL", "json_object('chave', NEW.chave)") + " END");
        sql.add("CREATE TRIGGER trg_auditoria_config_update AFTER UPDATE ON manutencao WHEN OLD.valor IS NOT NEW.valor BEGIN "
                + auditar("manutencao", "UPDATE", "NEW.rowid", "json_object('chave', OLD.chave)",
                        "json_object('chave', NEW.chave, 'valor_alterado', 1)") + " END");
        sql.add("CREATE TRIGGER trg_auditoria_config_delete AFTER DELETE ON manutencao BEGIN "
                + auditar("manutencao", "DELETE", "OLD.rowid", "json_object('chave', OLD.chave)", "NULL") + " END");
        // servicos: inclusao e exclusao (a alteracao ja era auditada desde a v1)
        sql.add("CREATE TRIGGER trg_auditoria_servico_insert AFTER INSERT ON servicos BEGIN "
                + auditar("servicos", "INSERT", "NEW.id_servico", "NULL", jsonServico("NEW")) + " END");
        sql.add("CREATE TRIGGER trg_auditoria_servico_delete AFTER DELETE ON servicos BEGIN "
                + auditar("servicos", "DELETE", "OLD.id_servico", jsonServico("OLD"), "NULL") + " END");
        // contagem dos codigos de "Esqueci o PIN" por conta e hora (limite contra envio em massa)
        sql.add("CREATE INDEX idx_codigos_usuario ON codigos_redefinicao(id_usuario, criado_em)");
        return sql;
    }

    // ---------- v8: cupom fiscal automatico no sistema web da RM Software ----------

    /**
     * - servicos.nome_rm: nome do produto como aparece na busca do PDV do RM (a busca e
     *   sempre pela palavra, nunca pelo codigo — pedido do usuario). Ja vem preenchido com a
     *   correlacao feita com a tabela de produtos do RM (TROCA CILINDRO IGNICAO nao tem
     *   produto no RM: fica em branco e cai no cupom manual ate alguem preencher).
     * - garantias.cupom_venda_uuid: identificador da venda mandado ao RM. E criado uma vez
     *   por garantia, para a nova tentativa nunca gerar uma segunda venda.
     * - garantias.cupom_nfce / cupom_chave: numero e chave de acesso da NFC-e emitida
     *   (codigo_cupom continua com os codigos antigos do VBA, sem uso no RM).
     */
    private static List<String> cupomNoRm() {
        return List.of(
                "ALTER TABLE servicos ADD COLUMN nome_rm TEXT CHECK (nome_rm IS NULL OR length(nome_rm) BETWEEN 2 AND 120)",
                "ALTER TABLE garantias ADD COLUMN cupom_venda_uuid TEXT CHECK (cupom_venda_uuid IS NULL OR length(cupom_venda_uuid) = 36)",
                "ALTER TABLE garantias ADD COLUMN cupom_nfce TEXT CHECK (cupom_nfce IS NULL OR length(cupom_nfce) <= 20)",
                "ALTER TABLE garantias ADD COLUMN cupom_chave TEXT CHECK (cupom_chave IS NULL OR length(cupom_chave) <= 60)",
                "CREATE UNIQUE INDEX idx_garantias_cupom_venda_uuid ON garantias(cupom_venda_uuid)",
                // correlacao com os produtos do PDV do RM (tabela de produtos da loja, 2026-11-18)
                "UPDATE servicos SET nome_rm = 'CARCAÇA CANIVETE' WHERE nome = 'TROCA CARCAÇA'",
                "UPDATE servicos SET nome_rm = 'GAIOLA' WHERE nome = 'TROCA GAIOLA'",
                "UPDATE servicos SET nome_rm = 'EXCENTRICO' WHERE nome = 'TROCA EXCÊNTRICO'",
                "UPDATE servicos SET nome_rm = 'BOLACHA' WHERE nome = 'TROCA BOLACHA'",
                "UPDATE servicos SET nome_rm = 'COMUTADOR DA PARTIDA' WHERE nome = 'TROCA COMUTADOR PARTIDA'",
                "UPDATE servicos SET nome_rm = 'PILHA' WHERE nome = 'PILHA'",
                "UPDATE servicos SET nome_rm = 'BOTÃO' WHERE nome = 'BOTÃO'");
    }
}
