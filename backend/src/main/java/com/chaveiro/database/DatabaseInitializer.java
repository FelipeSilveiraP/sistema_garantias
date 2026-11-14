package com.chaveiro.database;

import java.sql.Connection;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
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
    private static final int VERSAO_ATUAL = 1;

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
        try {
            int versao = lerVersao();
            if (versao >= VERSAO_ATUAL) {
                log.info("esquema SQLite ja esta na versao {}", versao);
                return;
            }
            log.info("aplicando migracoes SQLite: versao {} -> {}", versao, VERSAO_ATUAL);
            try (Connection conn = conexao.getConnection()) {
                conn.setAutoCommit(false);
                try (Statement stmt = conn.createStatement()) {
                    for (int v = versao + 1; v <= VERSAO_ATUAL; v++) {
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
}
