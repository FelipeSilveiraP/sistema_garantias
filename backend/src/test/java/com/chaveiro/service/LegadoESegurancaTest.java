package com.chaveiro.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.database.DatabaseInitializer;
import com.chaveiro.model.Garantia;
import com.chaveiro.model.ItemLista;
import com.chaveiro.repository.GarantiaRepository;
import com.chaveiro.repository.LegadoRepository;
import com.chaveiro.repository.ListaRepository;
import com.chaveiro.repository.ListaRepository.Lista;
import com.chaveiro.repository.ServicoRepository;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Importacao da planilha legada, tabela de precos/listas e gatilhos de seguranca (SQLite real em tmp). */
class LegadoESegurancaTest {

    @TempDir
    Path pasta;

    private ConnectionFactory conexao;
    private LegadoService legado;
    private GarantiaService garantias;
    private CadastrosService cadastros;

    @BeforeEach
    void preparar() {
        conexao = new ConnectionFactory(pasta.resolve("garantias.db").toString());
        new DatabaseInitializer(conexao).inicializar();
        GarantiaRepository repo = new GarantiaRepository(conexao);
        ServicoRepository servicos = new ServicoRepository(conexao);
        legado = new LegadoService(new LegadoRepository(conexao), repo);
        garantias = new GarantiaService(repo, servicos, new com.chaveiro.repository.VeiculoRepository(conexao));
        cadastros = new CadastrosService(servicos, new ListaRepository(conexao));
    }

    private void sql(String comando) throws SQLException {
        try (Connection conn = conexao.getConnection(); Statement stmt = conn.createStatement()) {
            stmt.execute(comando);
        }
    }

    private int contar(String consulta) throws SQLException {
        try (Connection conn = conexao.getConnection(); Statement stmt = conn.createStatement();
             ResultSet rs = stmt.executeQuery(consulta)) {
            return rs.next() ? rs.getInt(1) : 0;
        }
    }

    /** Planilha no formato do legado: abas de meses, cabecalho na linha 1, data como numero de serie. */
    private static byte[] planilhaLegada() throws Exception {
        List<String> cab = List.of("DATA", "PLACA", "MODELO (CARRO)", "SERVIÇO", "CPF", "VALOR", "TÉCNICO ", "OBSERVAÇÃO");
        return PlanilhaXlsx.gerar(List.of(
                new PlanilhaXlsx.Aba("JANEIRO", cab, List.of(
                        List.of(46027, "TST1234", "RENEGADE", "01 TROCA DE CARCAÇA", "", 240, "FELIPE", ""),
                        List.of(46028, "SEM PLACA", "ONIX", "01 CARCAÇA CANIVETE E PILHA", "12345678909", 130, "RENATO", "CLIENTE VOLTA"),
                        List.of("", "", "", "", "", "", "", ""))),
                new PlanilhaXlsx.Aba("MARÇO", cab, List.of(
                        List.of("15/03/2026", "tst-9876", "voiage", "01 TROCA DA GAIOLA", "", "85,50", "renato", ""))),
                new PlanilhaXlsx.Aba("RESUMO", cab, List.of(
                        List.of(46027, "NAO E MES", "X", "X", "", 1, "X", "")))));
    }

    @Test
    void importaAsAbasDeMesesSemDuplicarAoRepetir() throws Exception {
        byte[] arquivo = planilhaLegada();

        LegadoService.Resultado r = legado.importar("GARANTIAS-2026.xlsm", arquivo);

        assertThat(r.importadas()).isEqualTo(3);
        List<Garantia> lista = garantias.listar();
        assertThat(lista).hasSize(3).allMatch(g -> "LEGADO".equals(g.origem()));
        Garantia renegade = lista.stream().filter(g -> "TST1234".equals(g.placa())).findFirst().orElseThrow();
        assertThat(renegade.dataServico()).hasToString("2026-01-05");
        assertThat(renegade.valor()).isEqualByComparingTo("240.00");
        Garantia semPlaca = lista.stream().filter(Garantia::semPlaca).findFirst().orElseThrow();
        assertThat(semPlaca.placa()).isNull();
        assertThat(semPlaca.cpf()).isEqualTo("12345678909");
        Garantia gaiola = lista.stream().filter(g -> "TST9876".equals(g.placa())).findFirst().orElseThrow();
        assertThat(gaiola.valor()).isEqualByComparingTo("85.50");
        assertThat(gaiola.tecnico()).isEqualTo("RENATO");
        assertThat(contar("SELECT COUNT(*) FROM legado_garantias WHERE id_garantia_migrada IS NOT NULL")).isEqualTo(3);

        LegadoService.Resultado deNovo = legado.importar("GARANTIAS-2026.xlsm", arquivo);
        assertThat(deNovo.importadas()).isZero();
        assertThat(deNovo.jaImportadas()).isEqualTo(3);
        assertThat(garantias.listar()).hasSize(3);
    }

    @Test
    void arquivoQueNaoEPlanilhaERecusado() {
        assertThatThrownBy(() -> legado.importar("x.xlsm", "nao e zip".getBytes()))
                .isInstanceOf(DadosInvalidosException.class);
    }

    /**
     * Usa a planilha real da loja quando o caminho dela e informado na variavel de ambiente
     * GARANTIAS_PLANILHA_REAL (no CI, ou sem a variavel, o teste e pulado). O caminho fica so
     * na maquina de quem testa: nada da loja vai para o repositorio.
     */
    @Test
    void importaAPlanilhaRealDoLegadoQuandoDisponivel() throws Exception {
        String caminho = System.getenv("GARANTIAS_PLANILHA_REAL");
        assumeTrue(caminho != null && !caminho.isBlank(), "GARANTIAS_PLANILHA_REAL nao definida");
        Path real = Path.of(caminho);
        assumeTrue(Files.exists(real), "planilha real ausente nesta maquina");

        LegadoService.Resultado r = legado.importar(real.getFileName().toString(), Files.readAllBytes(real));

        assertThat(r.importadas()).isGreaterThan(0);
        assertThat(garantias.listar()).allSatisfy(g -> {
            assertThat(g.dataServico().getYear()).isEqualTo(2026);
            assertThat(g.valor()).isNotNull();
        });
    }

    @Test
    void reajusteDePrecosEmUmaTransacaoFicaNaAuditoria() throws Exception {
        assertThat(cadastros.listarServicos()).extracting(s -> s.nome()).contains("TROCA CARCAÇA", "PILHA", "BOTÃO");
        int atualizados = cadastros.reajustar(new BigDecimal("10"), true);

        assertThat(atualizados).isEqualTo(8); // 11 da lista do VBA menos os 3 combos desativados na v6
        assertThat(cadastros.listarServicos()).filteredOn(s -> s.nome().equals("PILHA"))
                .singleElement().satisfies(s -> assertThat(s.preco()).isEqualByComparingTo("13.20"));
        // so as mudancas de PRECO (a v6 tambem audita a desativacao dos combos)
        assertThat(contar("SELECT COUNT(*) FROM auditoria_operacoes WHERE tabela = 'servicos' AND operacao = 'UPDATE'"
                + " AND json_extract(antes, '$.preco_centavos') <> json_extract(depois, '$.preco_centavos')"))
                .isEqualTo(2); // so PILHA e BOTAO tinham preco > 0
        assertThatThrownBy(() -> cadastros.reajustar(new BigDecimal("500"), true)).isInstanceOf(DadosInvalidosException.class);
    }

    @Test
    void listasComecamComAsDoVbaENaoAceitamRepetidos() {
        assertThat(cadastros.listar(Lista.TECNICOS)).extracting(ItemLista::nome)
                .contains("FELIPE", "RENATO", "JONATAN", "HABNER", "LUÍS", "CARLOS H.", "CARLOS A.");
        assertThat(cadastros.listar(Lista.MODELOS)).hasSizeGreaterThan(80);
        cadastros.incluir(Lista.TECNICOS, "  marcos  ");
        assertThatThrownBy(() -> cadastros.incluir(Lista.TECNICOS, "MARCOS")).isInstanceOf(DadosInvalidosException.class);
    }

    @Test
    void gatilhosAuditamGarantiasEProtegemOBanco() throws Exception {
        Garantia g = garantias.cadastrar(new Garantia(null, java.time.LocalDate.now(), "ABC1D23", false, null, "ONIX",
                null, "CHAVE NOVA", 0, 0, 0, 0, BigDecimal.TEN, "FELIPE", null, null, null, null, null, null, null), false);
        garantias.marcarCupom(g.id(), "DISPENSADO");
        garantias.excluir(g.id());

        assertThat(contar("SELECT COUNT(*) FROM auditoria_operacoes WHERE tabela = 'garantias' AND id_registro = " + g.id()))
                .isEqualTo(3);
        assertThatThrownBy(() -> sql("DELETE FROM auditoria_operacoes")).hasMessageContaining("AUDITORIA_SOMENTE_LEITURA");
        assertThatThrownBy(() -> sql("UPDATE auditoria_operacoes SET tabela = 'x'")).hasMessageContaining("AUDITORIA_SOMENTE_LEITURA");
        // placa fora da regra, direto no banco, e recusada pelo CHECK
        assertThatThrownBy(() -> sql("INSERT INTO garantias (data_servico, placa, modelo, servico, tecnico)"
                + " VALUES ('2026-01-01', 'X', 'ONIX', 'CHAVE', 'FELIPE')")).isInstanceOf(SQLException.class);
        // cupom LANCADO sem data e servico em uso sem poder excluir
        Garantia outra = garantias.cadastrar(new Garantia(null, java.time.LocalDate.now(), "XYZ9A87", false, null, "GOL",
                cadastros.listarServicos().getFirst().id(), null, 1, 1, 1, 1, BigDecimal.TEN, "FELIPE", null,
                null, null, null, null, null, null), false);
        assertThatThrownBy(() -> sql("UPDATE garantias SET cupom_status = 'LANCADO' WHERE id_garantia = " + outra.id()))
                .hasMessageContaining("CUPOM_INVALIDO");
        assertThatThrownBy(() -> sql("DELETE FROM servicos WHERE id_servico = " + outra.idServico()))
                .hasMessageContaining("SERVICO_EM_USO");
    }

    @Test
    void gatilhosV5RecusamPlacaCpfEDataFuturaEAuditamCadastros() throws SQLException {
        String colunas = "INSERT INTO garantias (data_servico, placa, sem_placa, cpf, modelo, servico, tecnico, origem) VALUES ";
        // placa de 7 caracteres fora do padrao (passa no CHECK antigo, cai no gatilho)
        assertThatThrownBy(() -> sql(colunas + "('2026-01-01', '1234ABC', 0, NULL, 'ONIX', 'CHAVE', 'FELIPE', 'SISTEMA')"))
                .hasMessageContaining("PLACA_INVALIDA");
        // CPF com digito verificador errado e CPF repetido
        assertThatThrownBy(() -> sql(colunas + "('2026-01-01', NULL, 1, '12345678900', 'ONIX', 'CHAVE', 'FELIPE', 'SISTEMA')"))
                .hasMessageContaining("CPF_INVALIDO");
        assertThatThrownBy(() -> sql(colunas + "('2026-01-01', NULL, 1, '11111111111', 'ONIX', 'CHAVE', 'FELIPE', 'SISTEMA')"))
                .hasMessageContaining("CPF_INVALIDO");
        // data muito no futuro
        assertThatThrownBy(() -> sql(colunas + "('2999-01-01', 'ABC1D23', 0, NULL, 'ONIX', 'CHAVE', 'FELIPE', 'SISTEMA')"))
                .hasMessageContaining("DATA_FUTURA");
        // validos: placa antiga, Mercosul e CPF certo
        sql(colunas + "('2026-01-01', 'ABC1234', 0, NULL, 'ONIX', 'CHAVE', 'FELIPE', 'SISTEMA')");
        sql(colunas + "('2026-01-01', NULL, 1, '12345678909', 'ONIX', 'CHAVE', 'FELIPE', 'SISTEMA')");
        // planilha antiga entra como veio
        sql(colunas + "('2020-01-01', 'XX', 0, '123', 'ONIX', 'CHAVE', 'FELIPE', 'LEGADO')");
        // trocar a placa de uma garantia do sistema para uma invalida tambem e recusado
        assertThatThrownBy(() -> sql("UPDATE garantias SET placa = '9999999' WHERE placa = 'ABC1234'"))
                .hasMessageContaining("PLACA_INVALIDA");

        // tecnicos e veiculos auditados
        sql("INSERT INTO tecnicos (nome) VALUES ('AUDITADO')");
        sql("UPDATE tecnicos SET ativo = 0 WHERE nome = 'AUDITADO'");
        sql("DELETE FROM tecnicos WHERE nome = 'AUDITADO'");
        assertThat(contar("SELECT COUNT(*) FROM auditoria_operacoes WHERE tabela = 'tecnicos'")).isEqualTo(3);
        sql("UPDATE veiculos SET ativo = 0 WHERE id_veiculo = (SELECT MIN(id_veiculo) FROM veiculos)");
        assertThat(contar("SELECT COUNT(*) FROM auditoria_operacoes WHERE tabela = 'veiculos' AND operacao = 'UPDATE'"))
                .isEqualTo(1);
    }
}
