package com.chaveiro.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.database.DatabaseInitializer;
import com.chaveiro.model.Garantia;
import com.chaveiro.model.Servico;
import com.chaveiro.repository.CupomRepository;
import com.chaveiro.repository.CupomRepository.LinhaCupom;
import com.chaveiro.repository.GarantiaRepository;
import com.chaveiro.repository.ServicoRepository;
import com.chaveiro.repository.VeiculoRepository;
import com.chaveiro.service.CupomService.ItemCupom;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Cupom fiscal automatico no RM: o pedido do PDV e a NFC-e registrada, sobre SQLite real em tmp. */
class CupomServiceTest {

    @TempDir
    Path pasta;

    private GarantiaService garantias;
    private ServicoRepository servicos;
    private CupomService cupons;
    private CadastrosService cadastros;

    @BeforeEach
    void preparar() {
        ConnectionFactory conexao = new ConnectionFactory(pasta.resolve("garantias.db").toString());
        new DatabaseInitializer(conexao).inicializar();
        servicos = new ServicoRepository(conexao);
        garantias = new GarantiaService(new GarantiaRepository(conexao), servicos, new VeiculoRepository(conexao));
        cupons = new CupomService(new CupomRepository(conexao));
        cadastros = new CadastrosService(servicos, new com.chaveiro.repository.ListaRepository(conexao));
    }

    private Servico servico(String nome) throws Exception {
        return servicos.buscarPorNome(nome).orElseThrow();
    }

    private void nomeNoRm(String servico, String nomeRm) throws Exception {
        Servico s = servico(servico);
        cadastros.atualizarServico(s.id(), new Servico(s.id(), s.nome(), s.preco(), s.codigoCupom(), nomeRm,
                s.pedeCarcaca(), s.pedeBotao(), s.pedePilha(), s.pedeItens(), s.peca(), s.ativo()));
    }

    private Garantia cadastrar(String valor, List<GarantiaService.ItemEntrada> itens) {
        Garantia dados = new Garantia(null, LocalDate.now(), "ABC1D23", false, null, "ONIX", null, null, 0, 0, 0, 0,
                new BigDecimal(valor), "FELIPE", null, null, null, null, null, null, null);
        return garantias.cadastrarComItens(dados, itens, true);
    }

    private static LinhaCupom linha(String nomeRm, int qtd, long preco, boolean peca) {
        return new LinhaCupom(nomeRm, qtd, preco, peca, nomeRm);
    }

    private static List<String> resumo(List<ItemCupom> itens) {
        return itens.stream().map(i -> i.quantidade() + "x " + i.nomeRm() + " " + i.valorUnitario()).toList();
    }

    @Test
    void carcacaJaVemComONomeDoRmDaVendaReal() throws Exception {
        assertThat(servico("TROCA CARCAÇA").nomeRm()).isEqualTo("CARCAÇA CANIVETE");
        assertThat(servico("PILHA").nomeRm()).isNull();
    }

    @Test
    void pedidoTemOsProdutosPeloNomeNoRmEUmaVendaSoPorGarantia() throws Exception {
        nomeNoRm("PILHA", "pilha  cr2032");
        assertThat(servico("PILHA").nomeRm()).isEqualTo("PILHA CR2032");
        Garantia g = cadastrar("150.00", List.of(
                new GarantiaService.ItemEntrada(servico("TROCA CARCAÇA").id(), null, 1),
                new GarantiaService.ItemEntrada(servico("PILHA").id(), null, 1)));

        CupomService.PedidoCupom pedido = cupons.pedido(g.id());
        assertThat(pedido.status()).isEqualTo("NAO_LANCADO");
        assertThat(pedido.total()).isEqualByComparingTo("150.00");
        // a pilha fica com o preco de tabela (R$ 12) e a carcaca com o resto
        assertThat(resumo(pedido.itens())).containsExactly("1x CARCAÇA CANIVETE 138.00", "1x PILHA CR2032 12.00");
        assertThat(pedido.vendaUuid()).hasSize(36);
        // nova tentativa: o mesmo identificador de venda (o RM nao cria outra venda)
        assertThat(cupons.pedido(g.id()).vendaUuid()).isEqualTo(pedido.vendaUuid());

        cupons.registrarEmitido(g.id(), "262", "3526 1168 2444 7000 0134 6500 1000 0002 6291 4869 0252");
        Garantia lancada = garantias.buscarPorId(g.id());
        assertThat(lancada.cupomStatus()).isEqualTo("LANCADO");
        assertThat(lancada.cupomLancadoEm()).isNotBlank();
        // ja lancada: nada a emitir
        assertThat(cupons.pedido(g.id()).itens()).isEmpty();
    }

    @Test
    void produtoSemNomeNoRmOuOutroNaoEmiteEAvisaOQueFalta() throws Exception {
        Garantia g = cadastrar("80.00", List.of(new GarantiaService.ItemEntrada(null, "chave codificada", 1)));
        assertThatThrownBy(() -> cupons.pedido(g.id()))
                .isInstanceOf(DadosInvalidosException.class)
                .satisfies(e -> assertThat(((DadosInvalidosException) e).getCampos().get("cupom"))
                        .contains("CHAVE CODIFICADA").contains("NOME NO RM"));
    }

    @Test
    void numeroOuChaveInvalidosNaoSaoRegistrados() throws Exception {
        Garantia g = cadastrar("100.00", List.of(new GarantiaService.ItemEntrada(servico("TROCA CARCAÇA").id(), null, 1)));
        assertThatThrownBy(() -> cupons.registrarEmitido(g.id(), "abc", null)).isInstanceOf(DadosInvalidosException.class);
        assertThatThrownBy(() -> cupons.registrarEmitido(g.id(), "262", "123")).isInstanceOf(DadosInvalidosException.class);
        assertThat(garantias.buscarPorId(g.id()).cupomStatus()).isEqualTo("NAO_LANCADO");
    }

    @Test
    void divideOValorComoOSatDoVba() {
        // quantidade: valor unitario = resto / quantidade
        assertThat(resumo(CupomService.dividir(25000, List.of(linha("CARCACA", 2, 13000, false)))))
                .containsExactly("2x CARCACA 125.00");
        // dois servicos: na proporcao do preco de tabela; o centavo que sobra vai para quem tem quantidade 1
        assertThat(resumo(CupomService.dividir(10001, List.of(linha("A", 1, 3000, false), linha("B", 1, 7000, false)))))
                .containsExactly("1x A 30.01", "1x B 70.00");
        // so pecas: o valor da garantia se divide entre elas
        assertThat(resumo(CupomService.dividir(3000, List.of(linha("PILHA", 1, 1200, true), linha("BOTAO", 1, 1500, true)))))
                .containsExactly("1x PILHA 13.34", "1x BOTAO 16.66");
        // servico sem preco de tabela fica com todo o resto
        assertThat(resumo(CupomService.dividir(9000, List.of(linha("GAIOLA", 1, 0, false), linha("PILHA", 2, 1200, true)))))
                .containsExactly("1x GAIOLA 66.00", "2x PILHA 12.00");
    }

    @Test
    void recusaOQueOPdvNaoAceitaria() {
        assertThatThrownBy(() -> CupomService.dividir(0, List.of(linha("A", 1, 100, false))))
                .isInstanceOf(DadosInvalidosException.class);
        assertThatThrownBy(() -> CupomService.dividir(1000, List.of(linha("A", 1, 0, false), linha("PILHA", 1, 1200, true))))
                .isInstanceOf(DadosInvalidosException.class);
        // R$ 125,01 em 2 unidades nao fecha em centavos
        assertThatThrownBy(() -> CupomService.dividir(12501, List.of(linha("A", 2, 0, false))))
                .isInstanceOf(DadosInvalidosException.class);
        assertThatThrownBy(() -> CupomService.dividir(1000, List.of()))
                .isInstanceOf(DadosInvalidosException.class);
    }
}
