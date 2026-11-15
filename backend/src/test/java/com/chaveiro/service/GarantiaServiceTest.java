package com.chaveiro.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.database.DatabaseInitializer;
import com.chaveiro.model.Garantia;
import com.chaveiro.model.Servico;
import com.chaveiro.repository.GarantiaRepository;
import com.chaveiro.repository.ServicoRepository;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Regras do cadastro de garantias (VBA frmControleGarantias V17.1) sobre SQLite real em tmp. */
class GarantiaServiceTest {

    @TempDir
    Path pasta;

    private GarantiaService service;
    private ServicoRepository servicos;

    @BeforeEach
    void preparar() {
        ConnectionFactory conexao = new ConnectionFactory(pasta.resolve("garantias.db").toString());
        new DatabaseInitializer(conexao).inicializar();
        servicos = new ServicoRepository(conexao);
        service = new GarantiaService(new GarantiaRepository(conexao), servicos, new com.chaveiro.repository.VeiculoRepository(conexao));
    }

    private long servico(String nome) throws Exception {
        return servicos.buscarPorNome(nome).map(Servico::id).orElseThrow();
    }

    private static Garantia garantia(String placa, boolean semPlaca, String cpf, Long idServico, String servico,
                                     int carcaca, int botao, int pilha, int itens) {
        return new Garantia(null, LocalDate.now(), placa, semPlaca, cpf, "onix", idServico, servico, carcaca, botao,
                pilha, itens, new BigDecimal("130.00"), "felipe", "chave canivete", null, null, null, null, null, null);
    }

    @Test
    void cadastraComPlacaLimpaEmMaiusculasEQuantidadesDoServico() throws Exception {
        Garantia g = service.cadastrar(garantia("frj-7958", false, null, servico("TROCA CARCAÇA+PILHA"), null,
                2, 3, 1, 4), false);

        assertThat(g.id()).isNotNull();
        assertThat(g.placa()).isEqualTo("FRJ7958");
        assertThat(g.modelo()).isEqualTo("ONIX");
        assertThat(g.tecnico()).isEqualTo("FELIPE");
        assertThat(g.servico()).isEqualTo("TROCA CARCAÇA+PILHA");
        // pede carcaca e pilha: o botao e os itens informados sao ignorados (zerados)
        assertThat(g).extracting(Garantia::qtdCarcaca, Garantia::qtdBotao, Garantia::qtdPilha, Garantia::qtdItens)
                .containsExactly(2, 0, 1, 0);
        assertThat(g.codigoCupom()).isEqualTo("19_10");
        assertThat(service.buscarPorId(g.id()).cupomStatus()).isEqualTo("NAO_LANCADO");
    }

    @Test
    void placaInvalidaOuSemPlacaSemCpfSaoRecusados() {
        assertThatThrownBy(() -> service.cadastrar(garantia("AB12", false, null, null, "CHAVE NOVA", 0, 0, 0, 0), false))
                .isInstanceOf(DadosInvalidosException.class);
        assertThatThrownBy(() -> service.cadastrar(garantia(null, true, "123", null, "CHAVE NOVA", 0, 0, 0, 0), false))
                .isInstanceOf(DadosInvalidosException.class);
    }

    @Test
    void semPlacaComCpfGuardaSoOsNumerosDoCpf() {
        Garantia g = service.cadastrar(garantia("ABC1234", true, "123.456.789-09", null, "copia de chave", 0, 0, 0, 0), false);
        assertThat(g.placa()).isNull();
        assertThat(g.cpf()).isEqualTo("12345678909");
        assertThat(g.servico()).isEqualTo("COPIA DE CHAVE");
    }

    @Test
    void outroExigeDescricaoEQuantidadeForaDe1a5ERecusada() throws Exception {
        assertThatThrownBy(() -> service.cadastrar(garantia("ABC1D23", false, null, null, " ", 0, 0, 0, 0), false))
                .isInstanceOf(DadosInvalidosException.class);
        long gaiola = servico("TROCA GAIOLA");
        assertThatThrownBy(() -> service.cadastrar(garantia("ABC1D23", false, null, gaiola, null, 0, 0, 0, 6), false))
                .isInstanceOf(DadosInvalidosException.class);
    }

    @Test
    void mesmaPlacaMesmoDiaMesmoServicoPedeConfirmacao() throws Exception {
        long carcaca = servico("TROCA CARCAÇA");
        service.cadastrar(garantia("GEW5638", false, null, carcaca, null, 1, 0, 0, 0), false);

        assertThatThrownBy(() -> service.cadastrar(garantia("GEW-5638", false, null, carcaca, null, 1, 0, 0, 0), false))
                .isInstanceOf(PossivelDuplicataException.class);
        assertThat(service.cadastrar(garantia("GEW5638", false, null, carcaca, null, 1, 0, 0, 0), true).id()).isNotNull();
        assertThat(service.listar()).hasSize(2);
    }

    @Test
    void editaExcluiEMarcaCupomComData() throws Exception {
        Garantia g = service.cadastrar(garantia("DDQ6717", false, null, servico("TROCA GAIOLA"), null, 0, 0, 0, 1), false);

        Garantia editada = service.atualizar(g.id(), new Garantia(null, g.dataServico(), "DDQ6717", false, null, "VOYAGE",
                g.idServico(), null, 0, 0, 0, 2, new BigDecimal("85.00"), "RENATO", null, null, null, null, null, null, null));
        assertThat(editada.modelo()).isEqualTo("VOYAGE");
        assertThat(editada.qtdItens()).isEqualTo(2);
        assertThat(editada.valor()).isEqualByComparingTo("85.00");

        Garantia lancada = service.marcarCupom(g.id(), "lancado");
        assertThat(lancada.cupomStatus()).isEqualTo("LANCADO");
        assertThat(lancada.cupomLancadoEm()).isNotBlank();
        assertThatThrownBy(() -> service.marcarCupom(g.id(), "QUALQUER")).isInstanceOf(DadosInvalidosException.class);

        service.excluir(g.id());
        assertThatThrownBy(() -> service.buscarPorId(g.id())).isInstanceOf(RecursoNaoEncontradoException.class);
    }

    @Test
    void dataNoFuturoERecusada() {
        Garantia futura = new Garantia(null, LocalDate.now().plusDays(10), "ABC1D23", false, null, "ONIX", null,
                "CHAVE", 0, 0, 0, 0, BigDecimal.TEN, "FELIPE", null, null, null, null, null, null, null);
        assertThatThrownBy(() -> service.cadastrar(futura, false)).isInstanceOf(DadosInvalidosException.class);
    }

    @Test
    void guardaQuemCadastrouEMantemNaEdicao() {
        Garantia nova = new Garantia(null, LocalDate.now(), "PRF1A23", false, null, "ONIX", null, "CHAVE NOVA", 0, 0, 0, 0,
                BigDecimal.TEN, "RENATO", null, null, null, null, null, "felipe", null);
        Garantia g = service.cadastrar(nova, false);
        assertThat(service.buscarPorId(g.id()).criadoPor()).isEqualTo("FELIPE");

        service.atualizar(g.id(), new Garantia(null, g.dataServico(), "PRF1A23", false, null, "CRUZE", null, "CHAVE NOVA",
                0, 0, 0, 0, BigDecimal.TEN, "RENATO", null, null, null, null, null, null, null));
        assertThat(service.buscarPorId(g.id()).criadoPor()).isEqualTo("FELIPE");
    }

    @Test
    void cadastraVariosProdutosComOBotaoMais() throws Exception {
        var itens = java.util.List.of(
                new GarantiaService.ItemEntrada(servico("TROCA CARCAÇA"), null, 1),
                new GarantiaService.ItemEntrada(servico("PILHA"), null, 2),
                new GarantiaService.ItemEntrada(null, "cópia codificada", 1));
        Garantia g = service.cadastrarComItens(garantia("abc1d23", false, null, null, null, 0, 0, 0, 0), itens, false);

        assertThat(g.servico()).isEqualTo("TROCA CARCAÇA + 2x PILHA + CÓPIA CODIFICADA");
        assertThat(g).extracting(Garantia::qtdCarcaca, Garantia::qtdBotao, Garantia::qtdPilha, Garantia::qtdItens)
                .containsExactly(1, 0, 2, 1);
        assertThat(g.codigoCupom()).isEqualTo("19_10");
        // sem produto ou com OUTRO vazio: recusado
        assertThatThrownBy(() -> service.cadastrarComItens(garantia("abc1d24", false, null, null, null, 0, 0, 0, 0),
                java.util.List.of(), false)).isInstanceOf(DadosInvalidosException.class);
        assertThatThrownBy(() -> service.cadastrarComItens(garantia("abc1d24", false, null, null, null, 0, 0, 0, 0),
                java.util.List.of(new GarantiaService.ItemEntrada(null, " ", 1)), false)).isInstanceOf(DadosInvalidosException.class);
    }
}
