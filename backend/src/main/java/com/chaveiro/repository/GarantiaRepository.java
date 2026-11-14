package com.chaveiro.repository;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.model.Garantia;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Repository;

/** Acesso a tabela garantias (JDBC puro, consultas parametrizadas). */
@Repository
public class GarantiaRepository {

    private static final Logger log = LoggerFactory.getLogger(GarantiaRepository.class);

    private static final String COLUNAS = "id_garantia, data_servico, placa, sem_placa, cpf, modelo, id_servico,"
            + " servico, qtd_carcaca, qtd_botao, qtd_pilha, qtd_itens, valor_centavos, tecnico, observacao,"
            + " codigo_cupom, cupom_status, cupom_lancado_em, origem";

    private final ConnectionFactory conexao;

    public GarantiaRepository(ConnectionFactory conexao) {
        this.conexao = conexao;
    }

    /** Mais recentes primeiro (a pesquisa filtra na tela, como no Controle do Contas a Pagar). */
    public List<Garantia> listar() throws SQLException {
        String sql = "SELECT " + COLUNAS + " FROM garantias ORDER BY data_servico DESC, id_garantia DESC";
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql);
             ResultSet rs = stmt.executeQuery()) {
            List<Garantia> lista = new ArrayList<>();
            while (rs.next()) {
                lista.add(mapear(rs));
            }
            return lista;
        }
    }

    public Optional<Garantia> buscarPorId(long id) throws SQLException {
        String sql = "SELECT " + COLUNAS + " FROM garantias WHERE id_garantia = ?";
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setLong(1, id);
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next() ? Optional.of(mapear(rs)) : Optional.empty();
            }
        }
    }

    /** Mesma placa (ou CPF, sem placa), mesmo dia e mesmo servico: provavel lancamento repetido. */
    public Optional<Garantia> buscarParecida(Garantia g) throws SQLException {
        String sql = "SELECT " + COLUNAS + " FROM garantias WHERE data_servico = ? AND servico = ?"
                + " AND (CASE WHEN ? = 1 THEN cpf = ? ELSE placa = ? END) LIMIT 1";
        try (Connection conn = conexao.getConnection();
             PreparedStatement stmt = conn.prepareStatement(sql)) {
            stmt.setString(1, g.dataServico().toString());
            stmt.setString(2, g.servico());
            stmt.setInt(3, g.semPlaca() ? 1 : 0);
            stmt.setString(4, g.cpf());
            stmt.setString(5, g.placa());
            try (ResultSet rs = stmt.executeQuery()) {
                return rs.next() ? Optional.of(mapear(rs)) : Optional.empty();
            }
        }
    }

    public Garantia inserir(Garantia g) throws SQLException {
        return conexao.emTransacao(conn -> inserir(conn, g));
    }

    /** Insercao dentro de uma transacao ja aberta (usada tambem pela importacao do legado). */
    public Garantia inserir(Connection conn, Garantia g) throws SQLException {
        String sql = "INSERT INTO garantias (data_servico, placa, sem_placa, cpf, modelo, id_servico, servico,"
                + " qtd_carcaca, qtd_botao, qtd_pilha, qtd_itens, valor_centavos, tecnico, observacao,"
                + " codigo_cupom, origem) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";
        try (PreparedStatement stmt = conn.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            int p = preencher(stmt, g);
            stmt.setString(p, g.origem() == null ? "SISTEMA" : g.origem());
            stmt.executeUpdate();
            try (ResultSet chaves = stmt.getGeneratedKeys()) {
                if (!chaves.next()) {
                    throw new SQLException("falha ao obter o id da garantia inserida");
                }
                long id = chaves.getLong(1);
                log.info("garantia cadastrada (id={})", id);
                return comId(g, id);
            }
        }
    }

    /** Atualiza os dados da garantia (o status do cupom tem rota propria). */
    public boolean atualizar(long id, Garantia g) throws SQLException {
        String sql = "UPDATE garantias SET data_servico = ?, placa = ?, sem_placa = ?, cpf = ?, modelo = ?,"
                + " id_servico = ?, servico = ?, qtd_carcaca = ?, qtd_botao = ?, qtd_pilha = ?, qtd_itens = ?,"
                + " valor_centavos = ?, tecnico = ?, observacao = ?, codigo_cupom = ? WHERE id_garantia = ?";
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                int p = preencher(stmt, g);
                stmt.setLong(p, id);
                boolean ok = stmt.executeUpdate() > 0;
                if (ok) {
                    log.info("garantia atualizada (id={})", id);
                }
                return ok;
            }
        });
    }

    /** Estrutura do cupom fiscal: marca LANCADO (com a data), DISPENSADO ou volta a NAO_LANCADO. */
    public boolean atualizarCupom(long id, String status, String lancadoEm) throws SQLException {
        String sql = "UPDATE garantias SET cupom_status = ?, cupom_lancado_em = ? WHERE id_garantia = ?";
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement(sql)) {
                stmt.setString(1, status);
                stmt.setString(2, lancadoEm);
                stmt.setLong(3, id);
                return stmt.executeUpdate() > 0;
            }
        });
    }

    public boolean excluir(long id) throws SQLException {
        return conexao.emTransacao(conn -> {
            try (PreparedStatement stmt = conn.prepareStatement("DELETE FROM garantias WHERE id_garantia = ?")) {
                stmt.setLong(1, id);
                boolean ok = stmt.executeUpdate() > 0;
                if (ok) {
                    log.info("garantia excluida (id={})", id);
                }
                return ok;
            }
        });
    }

    private static int preencher(PreparedStatement stmt, Garantia g) throws SQLException {
        int p = 1;
        stmt.setString(p++, g.dataServico().toString());
        stmt.setString(p++, g.placa());
        stmt.setInt(p++, g.semPlaca() ? 1 : 0);
        stmt.setString(p++, g.cpf());
        stmt.setString(p++, g.modelo());
        if (g.idServico() == null) {
            stmt.setNull(p++, Types.INTEGER);
        } else {
            stmt.setLong(p++, g.idServico());
        }
        stmt.setString(p++, g.servico());
        stmt.setInt(p++, g.qtdCarcaca());
        stmt.setInt(p++, g.qtdBotao());
        stmt.setInt(p++, g.qtdPilha());
        stmt.setInt(p++, g.qtdItens());
        stmt.setLong(p++, centavos(g.valor()));
        stmt.setString(p++, g.tecnico());
        stmt.setString(p++, g.observacao());
        stmt.setString(p++, g.codigoCupom());
        return p;
    }

    static long centavos(BigDecimal valor) {
        return valor == null ? 0 : valor.movePointRight(2).setScale(0, java.math.RoundingMode.HALF_UP).longValueExact();
    }

    private static Garantia comId(Garantia g, long id) {
        return new Garantia(id, g.dataServico(), g.placa(), g.semPlaca(), g.cpf(), g.modelo(), g.idServico(),
                g.servico(), g.qtdCarcaca(), g.qtdBotao(), g.qtdPilha(), g.qtdItens(), g.valor(), g.tecnico(),
                g.observacao(), g.codigoCupom(), "NAO_LANCADO", null, g.origem() == null ? "SISTEMA" : g.origem());
    }

    private static Garantia mapear(ResultSet rs) throws SQLException {
        long idServico = rs.getLong("id_servico");
        boolean semServico = rs.wasNull();
        return new Garantia(
                rs.getLong("id_garantia"),
                LocalDate.parse(rs.getString("data_servico")),
                rs.getString("placa"),
                rs.getInt("sem_placa") == 1,
                rs.getString("cpf"),
                rs.getString("modelo"),
                semServico ? null : idServico,
                rs.getString("servico"),
                rs.getInt("qtd_carcaca"),
                rs.getInt("qtd_botao"),
                rs.getInt("qtd_pilha"),
                rs.getInt("qtd_itens"),
                BigDecimal.valueOf(rs.getLong("valor_centavos"), 2),
                rs.getString("tecnico"),
                rs.getString("observacao"),
                rs.getString("codigo_cupom"),
                rs.getString("cupom_status"),
                rs.getString("cupom_lancado_em"),
                rs.getString("origem"));
    }
}
