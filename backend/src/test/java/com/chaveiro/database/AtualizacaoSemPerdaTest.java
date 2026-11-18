package com.chaveiro.database;

import static org.assertj.core.api.Assertions.assertThat;

import com.chaveiro.service.BackupDriveService;
import com.chaveiro.service.BackupService;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/**
 * NAO PODEMOS PERDER NENHUM REGISTRO: monta um banco igual ao de uma versao antiga do
 * sistema (v3 a v6; a loja usa a 1.3.3 = v6), enche as tabelas, roda a atualizacao de
 * verdade (InicializadorBanco: backup antes + migracoes) e confere linha por linha,
 * coluna por coluna, que tudo continua igual e que o backup tem tudo.
 */
class AtualizacaoSemPerdaTest {

    @TempDir
    Path pasta;

    private static void sql(Connection c, String comando) throws SQLException {
        try (Statement st = c.createStatement()) {
            st.execute(comando);
        }
    }

    /** Dados de exemplo em todas as tabelas que existem na versao `v`. */
    private static void encher(ConnectionFactory conexao, int v) throws SQLException {
        String hoje = LocalDate.now().toString();
        try (Connection c = conexao.getConnection()) {
            sql(c, "INSERT INTO tecnicos (nome) VALUES ('TECNICO DA LOJA')");
            sql(c, "INSERT INTO modelos (nome) VALUES ('MODELO DA LOJA')");
            sql(c, "UPDATE servicos SET preco_centavos = 12345 WHERE nome = 'TROCA GAIOLA'");
            sql(c, "INSERT INTO servicos (nome, preco_centavos, codigo_cupom) VALUES ('SERVICO DA LOJA', 9900, '77')");
            for (int i = 0; i < 50; i++) {
                sql(c, "INSERT INTO garantias (data_servico, placa, modelo, servico, valor_centavos, tecnico, observacao)"
                        + " VALUES ('" + hoje + "', 'ABC" + (1000 + i) + "', 'GOL', 'TROCA CARCAÇA', " + (100 * i)
                        + ", 'FELIPE', 'OBSERVAÇÃO " + i + " com acento e ''aspas''')");
            }
            sql(c, "INSERT INTO garantias (data_servico, sem_placa, cpf, modelo, servico, tecnico) VALUES ('" + hoje
                    + "', 1, '52998224725', 'ONIX', 'CHAVE CANIVETE', 'RENATO')");
            sql(c, "INSERT INTO legado_garantias (arquivo_origem, aba_origem, linha_origem, data, placa, observacao)"
                    + " VALUES ('GARANTIAS-2025.xlsm', 'JANEIRO', 2, '45000', 'XYZ9999', 'da planilha antiga')");
            sql(c, "INSERT INTO garantias (data_servico, placa, modelo, servico, tecnico, origem) VALUES ('2023-01-02',"
                    + " 'PLACA-ANTIGA-ESTRANHA', 'X', 'XX', 'Y', 'LEGADO')");
            sql(c, "INSERT INTO manutencao (chave, valor) VALUES ('teste.config', 'valor')");
            if (v >= 3) {
                sql(c, "INSERT INTO marcas (nome) VALUES ('MARCA DA LOJA')");
                sql(c, "INSERT INTO veiculos (id_marca, modelo) SELECT id_marca, 'CARRO DA LOJA' FROM marcas WHERE nome = 'MARCA DA LOJA'");
            }
            if (v >= 4) {
                sql(c, "INSERT INTO usuarios (nome, login_indice, login_cifrado, email_cifrado, pin_hash, admin, foto)"
                        + " VALUES ('FELIPE', 'indice1', 'v1:abc', 'v1:def', 'pbkdf2$1$a$b', 1, X'FFD8FF00')");
                sql(c, "INSERT INTO acessos_usuario (id_usuario, nome, tipo) VALUES (1, 'FELIPE', 'ENTRADA')");
                sql(c, "INSERT INTO codigos_redefinicao (id_usuario, codigo_hash, expira_em) VALUES (1, 'h', '2099-01-01 00:00:00')");
            }
            if (v >= 6) {
                sql(c, "INSERT INTO garantia_itens (id_garantia, ordem, descricao, quantidade, preco_centavos) VALUES (1, 1, 'TROCA CARCAÇA', 2, 5000)");
                sql(c, "INSERT INTO garantia_itens (id_garantia, ordem, descricao, quantidade) VALUES (1, 2, 'PILHA', 1)");
            }
        }
    }

    /** Todas as tabelas com todas as linhas e colunas, como texto (ordem fixa). */
    private static Map<String, List<String>> foto(String caminhoBanco) throws SQLException {
        Map<String, List<String>> tudo = new LinkedHashMap<>();
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + caminhoBanco); Statement st = c.createStatement()) {
            List<String> tabelas = new ArrayList<>();
            try (ResultSet rs = st.executeQuery("SELECT name FROM sqlite_master WHERE type = 'table'"
                    + " AND name NOT LIKE 'sqlite_%' ORDER BY name")) {
                while (rs.next()) {
                    tabelas.add(rs.getString(1));
                }
            }
            for (String t : tabelas) {
                List<String> linhas = new ArrayList<>();
                try (ResultSet rs = st.executeQuery("SELECT * FROM \"" + t + "\" ORDER BY rowid")) {
                    int colunas = rs.getMetaData().getColumnCount();
                    while (rs.next()) {
                        StringBuilder l = new StringBuilder();
                        for (int i = 1; i <= colunas; i++) {
                            l.append(rs.getMetaData().getColumnName(i)).append('=').append(rs.getString(i)).append('|');
                        }
                        linhas.add(l.toString());
                    }
                }
                tudo.put(t, linhas);
            }
        }
        return tudo;
    }

    private static Path backupPreMigracao(BackupService backup) throws Exception {
        try (Stream<Path> arquivos = Files.list(backup.getDiretorioBackups())) {
            return arquivos.filter(p -> p.getFileName().toString().contains("pre-migracao")).findFirst().orElseThrow();
        }
    }

    @ParameterizedTest(name = "banco v{0} -> versao atual sem perder nada")
    @ValueSource(ints = {3, 4, 5, 6})
    void atualizarNaoPerdeNemMudaNenhumRegistro(int versaoAntiga) throws Exception {
        Path banco = pasta.resolve("garantias.db");
        ConnectionFactory conexao = new ConnectionFactory(banco.toString());
        DatabaseInitializer migracoes = new DatabaseInitializer(conexao);
        migracoes.inicializarAte(versaoAntiga);
        assertThat(migracoes.lerVersao()).isEqualTo(versaoAntiga);
        encher(conexao, versaoAntiga);
        Map<String, List<String>> antes = foto(banco.toString());

        // a atualizacao de verdade: o que o sistema faz ao abrir a versao nova
        BackupService backup = new BackupService(conexao);
        new InicializadorBanco(migracoes, backup, new BackupDriveService(conexao, "", banco.toString())).run(null);
        assertThat(migracoes.lerVersao()).isEqualTo(migracoes.getVersaoAtual());

        Map<String, List<String>> depois = foto(banco.toString());
        for (var tabela : antes.entrySet()) {
            String nome = tabela.getKey();
            assertThat(depois).as("tabela %s continua existindo", nome).containsKey(nome);
            if (nome.equals("auditoria_operacoes") || nome.equals("servicos") || nome.equals("sqlite_sequence")) {
                // auditoria so cresce; servicos: as migracoes so desativam combos antigos (v6)
                assertThat(depois.get(nome)).as(nome).hasSizeGreaterThanOrEqualTo(tabela.getValue().size());
                continue;
            }
            // cada linha continua igual; migracoes novas so acrescentam colunas no fim
            assertThat(depois.get(nome)).as("registros da tabela %s", nome).hasSameSizeAs(tabela.getValue());
            for (int i = 0; i < tabela.getValue().size(); i++) {
                assertThat(depois.get(nome).get(i)).as("registro %d da tabela %s", i, nome).startsWith(tabela.getValue().get(i));
            }
        }
        // servicos: mesmas linhas, mesmos precos (no maximo o "ativo" dos combos muda)
        assertThat(depois.get("servicos")).hasSize(antes.get("servicos").size());
        for (int i = 0; i < antes.get("servicos").size(); i++) {
            assertThat(depois.get("servicos").get(i).replaceAll("ativo=\\d", ""))
                    .startsWith(antes.get("servicos").get(i).replaceAll("ativo=\\d", ""));
        }
        // a auditoria antiga continua la, igual (so ganha linhas novas no fim)
        assertThat(depois.get("auditoria_operacoes")).startsWith(antes.get("auditoria_operacoes").toArray(String[]::new));

        // o backup feito ANTES da migracao tem todos os registros
        Map<String, List<String>> doBackup = foto(backupPreMigracao(backup).toString());
        assertThat(doBackup).isEqualTo(antes);

        // abrir de novo (2a abertura da versao nova) nao muda nada
        new InicializadorBanco(migracoes, backup, new BackupDriveService(conexao, "", banco.toString())).run(null);
        assertThat(foto(banco.toString())).isEqualTo(depois);
    }

    @Test
    void instaladorNuncaApagaOsDados() throws Exception {
        String empacotar = Files.readString(Path.of("../instalador/empacotar.js"));
        assertThat(empacotar).contains("deleteAppDataOnUninstall: false");
        // os dados ficam fora da pasta do programa (que o instalador troca)
        String fabrica = Files.readString(Path.of("src/main/java/com/chaveiro/database/ConnectionFactory.java"));
        assertThat(fabrica).contains("\"ChaveiroUniversal\"").contains("\"Garantias\"").contains("LOCALAPPDATA");
        String migracoes = Files.readString(Path.of("src/main/java/com/chaveiro/database/DatabaseInitializer.java"));
        // migracoes so acrescentam (regra do AGENTS.md)
        assertThat(migracoes).doesNotContainIgnoringCase("DROP TABLE").doesNotContainIgnoringCase("DELETE FROM garantias");
    }
}
