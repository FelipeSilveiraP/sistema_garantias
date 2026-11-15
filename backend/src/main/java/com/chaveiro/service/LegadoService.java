package com.chaveiro.service;

import com.chaveiro.model.Garantia;
import com.chaveiro.repository.GarantiaRepository;
import com.chaveiro.repository.LegadoRepository;
import java.io.IOException;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.text.Normalizer;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Importa a planilha antiga (GARANTIAS-AAAA.xlsm): as 12 abas de meses, colunas
 * A=DATA B=PLACA C=MODELO D=SERVICO E=CPF F=VALOR G=TECNICO H=OBSERVACAO (linha 1
 * = cabecalho). Cada linha vai para legado_garantias (como estava) e vira uma
 * garantia com origem LEGADO. Tudo numa unica transacao; importar de novo o mesmo
 * arquivo nao duplica (arquivo + aba + linha).
 */
@Service
public class LegadoService {

    private static final Logger log = LoggerFactory.getLogger(LegadoService.class);
    private static final Set<String> MESES = Set.of("JANEIRO", "FEVEREIRO", "MARCO", "ABRIL", "MAIO", "JUNHO",
            "JULHO", "AGOSTO", "SETEMBRO", "OUTUBRO", "NOVEMBRO", "DEZEMBRO");
    private static final DateTimeFormatter DATA_BR = DateTimeFormatter.ofPattern("d/M/yyyy");

    public record Resultado(int lidas, int importadas, int jaImportadas) {
    }

    private final LegadoRepository legado;
    private final GarantiaRepository garantias;

    public LegadoService(LegadoRepository legado, GarantiaRepository garantias) {
        this.legado = legado;
        this.garantias = garantias;
    }

    public Resultado importar(String nomeArquivo, byte[] conteudo) {
        String arquivo = nomeSeguro(nomeArquivo);
        Map<String, List<LeitorXlsx.Linha>> abas;
        try {
            abas = LeitorXlsx.ler(conteudo);
        } catch (IOException erro) {
            log.warn("planilha legada recusada: {}", erro.getMessage());
            throw new DadosInvalidosException(Map.of("arquivo",
                    "Não foi possível ler a planilha. Escolha o arquivo GARANTIAS-AAAA.xlsm (ou .xlsx)."));
        }
        int[] contagem = new int[3];
        try {
            legado.emTransacao(conn -> {
                for (var aba : abas.entrySet()) {
                    if (!MESES.contains(semAcento(aba.getKey()))) {
                        continue;
                    }
                    for (LeitorXlsx.Linha linha : aba.getValue()) {
                        Map<String, String> c = linha.celulas();
                        if (linha.numero() < 2 || (c.get("A") == null && c.get("B") == null)) {
                            continue;
                        }
                        contagem[0]++;
                        Optional<Long> idLegado = legado.inserirLinha(conn, arquivo, aba.getKey(), linha.numero(), c);
                        if (idLegado.isEmpty()) {
                            contagem[2]++;
                            continue;
                        }
                        Optional<Garantia> g = converter(c);
                        if (g.isPresent()) {
                            Garantia criada = garantias.inserir(conn, g.get());
                            legado.marcarMigrada(conn, idLegado.get(), criada.id());
                            contagem[1]++;
                        }
                    }
                }
                return null;
            });
        } catch (SQLException erro) {
            log.error("falha ao importar a planilha legada", erro);
            throw new IllegalStateException("falha ao importar a planilha", erro);
        }
        log.info("legado {}: {} linha(s) lidas, {} importada(s), {} ja importada(s)", arquivo,
                contagem[0], contagem[1], contagem[2]);
        return new Resultado(contagem[0], contagem[1], contagem[2]);
    }

    /**
     * Nome do arquivo como vai para o banco: so o nome (sem pasta), sem caracteres de
     * controle e com ate 120 letras. Vazio = "planilha.xlsm".
     */
    static String nomeSeguro(String nomeArquivo) {
        String n = nomeArquivo == null ? "" : nomeArquivo.replaceAll("\\p{Cntrl}", "").trim();
        n = n.substring(Math.max(n.lastIndexOf('/'), n.lastIndexOf('\\')) + 1).trim();
        if (n.length() > 120) {
            n = n.substring(n.length() - 120);
        }
        return n.isEmpty() ? "planilha.xlsm" : n;
    }

    /** Linha da planilha -> garantia LEGADO (sem a data valida, fica so na tabela de legado). */
    static Optional<Garantia> converter(Map<String, String> c) {
        LocalDate data = data(c.get("A"));
        if (data == null) {
            return Optional.empty();
        }
        String placaBruta = texto(c.get("B"));
        boolean semPlaca = placaBruta == null || semAcento(placaBruta).contains("SEM PLACA");
        String placa = semPlaca ? null : GarantiaService.limparPlaca(placaBruta);
        String cpf = GarantiaService.soDigitos(c.get("E"));
        // os mesmos tamanhos maximos do cadastro (a linha completa fica em legado_garantias)
        return Optional.of(new Garantia(null, data, corta(placa, 20), semPlaca, cpf.isEmpty() ? null : corta(cpf, 20),
                corta(padrao(texto(c.get("C"))), 120), null, corta(padrao(texto(c.get("D"))), 120), 0, 0, 0, 0, valor(c.get("F")),
                corta(padrao(texto(c.get("G"))), 60), corta(texto(c.get("H")), 500), null, null, null, "LEGADO", null, null));
    }

    private static String corta(String texto, int maximo) {
        return texto == null || texto.length() <= maximo ? texto : texto.substring(0, maximo);
    }

    static LocalDate data(String bruto) {
        if (bruto == null || bruto.isBlank()) {
            return null;
        }
        String iso = LeitorXlsx.dataDeSerie(bruto);
        if (iso != null) {
            return LocalDate.parse(iso);
        }
        try {
            return LocalDate.parse(bruto.trim().split(" ")[0], DATA_BR);
        } catch (DateTimeParseException erro) {
            return null;
        }
    }

    static BigDecimal valor(String bruto) {
        if (bruto == null || bruto.isBlank()) {
            return BigDecimal.ZERO;
        }
        String limpo = bruto.replace("R$", "").trim();
        if (limpo.contains(",")) {
            limpo = limpo.replace(".", "").replace(",", ".");
        }
        // "1E999999999" travaria o servidor montando um numero de 1 bilhao de digitos
        if (limpo.length() > 20 || limpo.toUpperCase(Locale.ROOT).contains("E")) {
            return BigDecimal.ZERO;
        }
        try {
            BigDecimal v = new BigDecimal(limpo).setScale(2, java.math.RoundingMode.HALF_UP);
            // fora da faixa do cadastro (0 a 99.999,99) vira 0; o valor original fica no legado
            return v.signum() < 0 || v.compareTo(new BigDecimal("100000")) >= 0 ? BigDecimal.ZERO : v;
        } catch (NumberFormatException erro) {
            return BigDecimal.ZERO;
        }
    }

    private static String texto(String valor) {
        return valor == null || valor.isBlank() ? null
                : valor.replaceAll("\\p{Cntrl}", " ").trim().replaceAll("\\s+", " ").toUpperCase(Locale.ROOT);
    }

    private static String padrao(String valor) {
        return valor == null || valor.length() < 2 ? "NÃO INFORMADO" : valor;
    }

    static String semAcento(String texto) {
        return Normalizer.normalize(texto.trim().toUpperCase(Locale.ROOT), Normalizer.Form.NFD).replaceAll("\\p{M}", "");
    }
}
