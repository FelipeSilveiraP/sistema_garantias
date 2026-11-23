package com.chaveiro.database;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** v10: gatilhos de protecao e auditoria completa (pedido do usuario, 2026-11-23). */
class ProtecoesBancoTest {

    @TempDir
    Path pasta;

    private ConnectionFactory conexao;

    @BeforeEach
    void preparar() {
        conexao = new ConnectionFactory(pasta.resolve("garantias.db").toString());
        new DatabaseInitializer(conexao).inicializar();
    }

    private void sql(String comando) throws SQLException {
        try (Connection c = conexao.getConnection(); Statement st = c.createStatement()) {
            st.execute(comando);
        }
    }

    private String texto(String consulta) throws SQLException {
        try (Connection c = conexao.getConnection(); Statement st = c.createStatement(); ResultSet rs = st.executeQuery(consulta)) {
            return rs.next() ? rs.getString(1) : null;
        }
    }

    private long garantia() throws SQLException {
        sql("INSERT INTO garantias (data_servico, placa, modelo, servico, tecnico, valor_centavos) VALUES ('"
                + LocalDate.now() + "', 'ABC1D23', 'GOL', 'TROCA CARCAÇA', 'FELIPE', 5000)");
        return Long.parseLong(texto("SELECT max(id_garantia) FROM garantias"));
    }

    @Test
    void versaoDez() throws SQLException {
        assertThat(texto("PRAGMA user_version")).isEqualTo("10");
    }

    @Test
    void garantiaComNfceNaoExcluiNemMudaOCupom() throws SQLException {
        long id = garantia();
        sql("UPDATE garantias SET cupom_status = 'LANCADO', cupom_lancado_em = '" + LocalDate.now()
                + "', cupom_nfce = '262', cupom_chave = 'CHAVE123' WHERE id_garantia = " + id);
        assertThatThrownBy(() -> sql("DELETE FROM garantias WHERE id_garantia = " + id)).hasMessageContaining("NFCE_EMITIDA");
        assertThatThrownBy(() -> sql("UPDATE garantias SET cupom_nfce = '999' WHERE id_garantia = " + id))
                .hasMessageContaining("NFCE_EMITIDA");
        assertThatThrownBy(() -> sql("UPDATE garantias SET cupom_status = 'NAO_LANCADO', cupom_lancado_em = NULL WHERE id_garantia = " + id))
                .hasMessageContaining("NFCE_EMITIDA");
        // o resto da garantia continua editavel
        sql("UPDATE garantias SET observacao = 'cliente voltou' WHERE id_garantia = " + id);
        assertThat(texto("SELECT cupom_nfce FROM garantias WHERE id_garantia = " + id)).isEqualTo("262");
    }

    @Test
    void garantiaSemNfceContinuaExcluindo() throws SQLException {
        long id = garantia();
        sql("UPDATE garantias SET cupom_status = 'LANCADO', cupom_lancado_em = '" + LocalDate.now() + "' WHERE id_garantia = " + id);
        sql("UPDATE garantias SET cupom_status = 'NAO_LANCADO', cupom_lancado_em = NULL WHERE id_garantia = " + id);
        sql("DELETE FROM garantias WHERE id_garantia = " + id);
        assertThat(texto("SELECT count(*) FROM garantias")).isEqualTo("0");
    }

    @Test
    void auditoriaRegistraOCupomEOTecnico() throws SQLException {
        long id = garantia();
        sql("UPDATE garantias SET cupom_status = 'LANCADO', cupom_lancado_em = '" + LocalDate.now()
                + "', cupom_nfce = '262', cupom_chave = 'CHAVE123' WHERE id_garantia = " + id);
        String depois = texto("SELECT depois FROM auditoria_operacoes WHERE tabela = 'garantias' AND operacao = 'UPDATE'"
                + " ORDER BY id_auditoria DESC LIMIT 1");
        assertThat(depois).contains("\"cupom_nfce\":\"262\"").contains("\"cupom_chave\":\"CHAVE123\"").contains("id_tecnico");
        // so o NOME NO RM mudou: antes da v10 isso nao ficava no historico
        sql("UPDATE servicos SET nome_rm = 'GAIOLA NOVA' WHERE nome = 'TROCA GAIOLA'");
        assertThat(texto("SELECT depois FROM auditoria_operacoes WHERE tabela = 'servicos' ORDER BY id_auditoria DESC LIMIT 1"))
                .contains("GAIOLA NOVA");
    }

    @Test
    void marcasEModelosSaoAuditados() throws SQLException {
        sql("INSERT INTO marcas (nome) VALUES ('MARCA TESTE')");
        sql("UPDATE modelos SET ativo = 0 WHERE nome = 'GOL'");
        assertThat(texto("SELECT count(*) FROM auditoria_operacoes WHERE tabela IN ('marcas', 'modelos')")).isEqualTo("2");
    }

    @Test
    void tetoDeValor() {
        assertThatThrownBy(() -> sql("UPDATE servicos SET preco_centavos = 100000000000 WHERE nome = 'PILHA'"))
                .hasMessageContaining("VALOR_INVALIDO");
        assertThatThrownBy(() -> sql("INSERT INTO garantias (data_servico, placa, modelo, servico, tecnico, valor_centavos) VALUES ('"
                + LocalDate.now() + "', 'ABC1D23', 'GOL', 'X SERVICO', 'FELIPE', 100000000000)")).hasMessageContaining("VALOR_INVALIDO");
    }

    @Test
    void planilhaAntigaFicaComoVeio() throws SQLException {
        sql("INSERT INTO legado_garantias (arquivo_origem, aba_origem, linha_origem, placa) VALUES ('G.xlsm', 'JAN', 2, 'XYZ9999')");
        assertThatThrownBy(() -> sql("UPDATE legado_garantias SET placa = 'OUTRA'")).hasMessageContaining("LEGADO_IMUTAVEL");
        long id = garantia();
        sql("UPDATE legado_garantias SET id_garantia_migrada = " + id); // o vinculo pode mudar
    }

    @Test
    void codigoUsadoNaoVoltaAValer() throws SQLException {
        sql("INSERT INTO usuarios (nome, login_indice, login_cifrado, pin_hash, admin) VALUES ('ADM', 'i', 'c', 'h', 1)");
        sql("INSERT INTO codigos_redefinicao (id_usuario, codigo_hash, expira_em, usado, tentativas) VALUES (1, 'x', '2999-01-01', 1, 2)");
        assertThatThrownBy(() -> sql("UPDATE codigos_redefinicao SET usado = 0")).hasMessageContaining("CODIGO_IMUTAVEL");
        assertThatThrownBy(() -> sql("UPDATE codigos_redefinicao SET tentativas = 0")).hasMessageContaining("CODIGO_IMUTAVEL");
        sql("UPDATE codigos_redefinicao SET tentativas = tentativas + 1");
    }
}
