package com.chaveiro.repository;

import static org.assertj.core.api.Assertions.assertThat;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.database.DatabaseInitializer;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** SERVICOS MAIS FEITOS conta por produto (pedido do usuario, 2026-11-25), nao pelo texto da garantia. */
class EstatisticaProdutosTest {

    @TempDir
    Path pasta;

    private static final Map<String, String> TABELA = Map.of(
            "TROCA CARCACA", "TROCA CARCAÇA", "PILHA", "PILHA", "BOTAO", "BOTÃO", "TROCA GAIOLA", "TROCA GAIOLA");

    @Test
    void textosAntigosViramOsProdutosDaTabela() {
        assertThat(EstatisticaRepository.produtosDoTexto("TROCA CARCAÇA (1 UN)", TABELA)).containsExactly("TROCA CARCAÇA");
        assertThat(EstatisticaRepository.produtosDoTexto("TROCA CARCAÇA+BOTÃO+PILHA", TABELA))
                .containsExactly("TROCA CARCAÇA", "BOTÃO", "PILHA");
        assertThat(EstatisticaRepository.produtosDoTexto("troca carcaca + 2x pilha", TABELA)).containsExactly("TROCA CARCAÇA", "PILHA");
        assertThat(EstatisticaRepository.produtosDoTexto("TROCA GAIOLA (1 UN)", TABELA)).containsExactly("TROCA GAIOLA");
        assertThat(EstatisticaRepository.produtosDoTexto("01 CHAVE COMPLETA KD", TABELA)).containsExactly("CHAVE COMPLETA KD");
    }

    @Test
    void graficoJuntaGarantiasAntigasENovasNoMesmoProduto() throws Exception {
        ConnectionFactory conexao = new ConnectionFactory(pasta.resolve("g.db").toString());
        new DatabaseInitializer(conexao).inicializar();
        String hoje = LocalDate.now().toString();
        try (Connection c = conexao.getConnection(); Statement st = c.createStatement()) {
            // antigas (texto livre da planilha / versoes anteriores)
            st.execute("INSERT INTO garantias (data_servico, placa, modelo, servico, tecnico, valor_centavos, origem)"
                    + " VALUES ('" + hoje + "', 'X', 'GOL', 'TROCA CARCAÇA (1 UN)', 'F', 15000, 'LEGADO')");
            st.execute("INSERT INTO garantias (data_servico, placa, modelo, servico, tecnico, valor_centavos)"
                    + " VALUES ('" + hoje + "', 'ABC1234', 'GOL', 'TROCA CARCAÇA+PILHA', 'F', 16000)");
            st.execute("INSERT INTO garantias (data_servico, placa, modelo, servico, tecnico, valor_centavos, origem)"
                    + " VALUES ('" + hoje + "', 'Y', 'GOL', '01 CHAVE COMPLETA KD', 'F', 20000, 'LEGADO')");
            // nova (produtos gravados)
            st.execute("INSERT INTO garantias (data_servico, placa, modelo, servico, tecnico, valor_centavos)"
                    + " VALUES ('" + hoje + "', 'ABC1D23', 'GOL', 'TROCA CARCAÇA + BOTÃO', 'F', 17000)");
            st.execute("INSERT INTO garantia_itens (id_garantia, ordem, id_servico, descricao, quantidade)"
                    + " SELECT 4, 1, id_servico, nome, 1 FROM servicos WHERE nome = 'TROCA CARCAÇA'");
            st.execute("INSERT INTO garantia_itens (id_garantia, ordem, id_servico, descricao, quantidade)"
                    + " SELECT 4, 2, id_servico, nome, 1 FROM servicos WHERE nome = 'BOTÃO'");
        }
        var resumo = new EstatisticaRepository(conexao).resumo(hoje, hoje);
        var nomes = resumo.porServico().stream().map(EstatisticaRepository.Grupo::nome).toList();
        assertThat(nomes).doesNotContain("TROCA CARCAÇA (1 UN)", "TROCA CARCAÇA+PILHA", "01 CHAVE COMPLETA KD");
        assertThat(resumo.porServico().get(0).nome()).isEqualTo("TROCA CARCAÇA");
        assertThat(resumo.porServico().get(0).quantidade()).isEqualTo(3);
        assertThat(nomes).contains("PILHA", "BOTÃO", "CHAVE COMPLETA KD");
    }
}
