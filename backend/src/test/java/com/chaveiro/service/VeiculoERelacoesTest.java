package com.chaveiro.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.chaveiro.database.ConnectionFactory;
import com.chaveiro.database.DatabaseInitializer;
import com.chaveiro.model.Garantia;
import com.chaveiro.model.Veiculo;
import com.chaveiro.repository.GarantiaRepository;
import com.chaveiro.repository.ListaRepository;
import com.chaveiro.repository.ListaRepository.Lista;
import com.chaveiro.repository.ServicoRepository;
import com.chaveiro.repository.VeiculoRepository;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDate;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** Catalogo de veiculos (v3) e as relacoes da garantia com tecnico, veiculo e produto. */
class VeiculoERelacoesTest {

    @TempDir
    Path pasta;

    private ConnectionFactory conexao;
    private VeiculoService veiculos;
    private GarantiaService garantias;
    private CadastrosService cadastros;

    @BeforeEach
    void preparar() {
        conexao = new ConnectionFactory(pasta.resolve("garantias.db").toString());
        new DatabaseInitializer(conexao).inicializar();
        ServicoRepository servicos = new ServicoRepository(conexao);
        VeiculoRepository repoVeiculos = new VeiculoRepository(conexao);
        veiculos = new VeiculoService(repoVeiculos);
        garantias = new GarantiaService(new GarantiaRepository(conexao), servicos, repoVeiculos);
        cadastros = new CadastrosService(servicos, new ListaRepository(conexao));
    }

    private long consultar(String sql) throws Exception {
        try (Connection conn = conexao.getConnection(); Statement st = conn.createStatement(); ResultSet rs = st.executeQuery(sql)) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private Veiculo veiculo(String marca, String modelo) {
        return veiculos.listar().stream().filter(v -> v.marca().equals(marca) && v.modelo().equals(modelo)).findFirst().orElseThrow();
    }

    private Garantia garantia(Long idVeiculo, Long idServico, String tecnico) {
        return garantias.cadastrar(new Garantia(null, LocalDate.now(), "REL1A23", false, null, null, idServico,
                idServico == null ? "CHAVE NOVA" : null, 1, 1, 1, 1, BigDecimal.TEN, tecnico, null, null, null, null,
                null, "FELIPE", idVeiculo), true);
    }

    @Test
    void catalogoTemOsCarrosMaisComunsDeTodasAsMarcas() {
        assertThat(veiculos.listar()).hasSizeGreaterThan(240);
        assertThat(veiculos.marcas()).contains("CHEVROLET", "VOLKSWAGEN", "FIAT", "FORD", "TOYOTA", "HYUNDAI", "BYD", "JEEP");
        assertThat(veiculo("CHEVROLET", "ONIX").ativo()).isTrue();
        assertThat(veiculo("FIAT", "STRADA").id()).isNotNull();
    }

    @Test
    void garantiaComVeiculoGuardaMarcaModeloEAsChavesEstrangeiras() throws Exception {
        Garantia g = garantia(veiculo("CHEVROLET", "ONIX").id(), null, "renato");

        assertThat(g.modelo()).isEqualTo("CHEVROLET ONIX");
        assertThat(consultar("SELECT id_veiculo FROM garantias WHERE id_garantia = " + g.id())).isEqualTo(veiculo("CHEVROLET", "ONIX").id());
        assertThat(consultar("SELECT id_tecnico IS NOT NULL FROM garantias WHERE id_garantia = " + g.id())).isEqualTo(1);
    }

    @Test
    void excluirVeiculoOuTecnicoNaoApagaAGarantiaSoDesfazOVinculo() throws Exception {
        Veiculo gol = veiculo("VOLKSWAGEN", "GOL");
        Garantia g = garantia(gol.id(), null, "RENATO");
        long idRenato = cadastros.listar(Lista.TECNICOS).stream().filter(t -> t.nome().equals("RENATO")).findFirst().orElseThrow().id();

        veiculos.excluir(gol.id());
        cadastros.excluir(Lista.TECNICOS, idRenato);

        Garantia depois = garantias.buscarPorId(g.id());
        assertThat(depois.modelo()).isEqualTo("VOLKSWAGEN GOL");
        assertThat(depois.tecnico()).isEqualTo("RENATO");
        assertThat(depois.idVeiculo()).isNull();
        assertThat(consultar("SELECT id_tecnico IS NULL FROM garantias WHERE id_garantia = " + g.id())).isEqualTo(1);
    }

    @Test
    void produtoEmUsoNaoPodeSerExcluidoMasLivrePode() {
        long carcaca = cadastros.listarServicos().stream().filter(s -> s.nome().equals("TROCA CARCAÇA")).findFirst().orElseThrow().id();
        garantia(veiculo("FIAT", "UNO").id(), carcaca, "FELIPE");
        assertThatThrownBy(() -> cadastros.excluirServico(carcaca)).isInstanceOf(ConflitoIntegridadeException.class);

        long gaiola = cadastros.listarServicos().stream().filter(s -> s.nome().equals("TROCA GAIOLA")).findFirst().orElseThrow().id();
        cadastros.excluirServico(gaiola);
        assertThat(cadastros.listarServicos()).noneMatch(s -> s.id() == gaiola);
    }

    @Test
    void cadastroDeVeiculoCriaMarcaNovaENaoDuplica() {
        Veiculo novo = veiculos.cadastrar("  great wall ", "poer");
        assertThat(novo.descricao()).isEqualTo("GREAT WALL POER");
        assertThat(veiculos.marcas()).contains("GREAT WALL");
        assertThatThrownBy(() -> veiculos.cadastrar("GREAT WALL", "POER")).isInstanceOf(DadosInvalidosException.class);
        assertThat(veiculos.atualizar(novo.id(), "GREAT WALL", "POER", false).ativo()).isFalse();
    }
}
