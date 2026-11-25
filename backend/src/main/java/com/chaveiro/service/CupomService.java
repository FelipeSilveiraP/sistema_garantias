package com.chaveiro.service;

import com.chaveiro.repository.CupomRepository;
import com.chaveiro.repository.CupomRepository.LinhaCupom;
import java.math.BigDecimal;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Cupom fiscal automatico no PDV do RM Software. O servidor so monta o pedido (o que
 * o operador digitaria no PDV) e registra a NFC-e emitida; quem conversa com o RM e o
 * processo do Electron (desktop/rm.js), que usa o login guardado na janela do RM.
 *
 * Valor de cada produto (regra do SAT do VBA): pecas (PILHA, BOTAO) ficam com o preco
 * da tabela e o resto do valor da garantia vai para os servicos, na proporcao do preco
 * de tabela de cada um. Sem servico na garantia, o valor se divide entre as pecas.
 */
@Service
public class CupomService {

    private static final Logger log = LoggerFactory.getLogger(CupomService.class);

    /** Uma linha do PDV: pesquisar pela palavra, escolher, ajustar quantidade e valor. */
    public record ItemCupom(String nomeRm, int quantidade, BigDecimal valorUnitario, boolean peca) {
        public ItemCupom(String nomeRm, int quantidade, BigDecimal valorUnitario) {
            this(nomeRm, quantidade, valorUnitario, false);
        }
    }

    /** status != NAO_LANCADO: nada a emitir (itens vazio). */
    /**
     * `marca`/`modelo` do carro: com eles o desktop escolhe no RM o produto do carro (ex.:
     * TROCA CARCACA num ONIX -> o canivete escrito CHEVROLET/ONIX); sem achar, usa o NOME NO RM.
     */
    public record PedidoCupom(long idGarantia, String status, String vendaUuid, BigDecimal total, List<ItemCupom> itens,
                              String marca, String modelo) {
        public PedidoCupom(long idGarantia, String status, String vendaUuid, BigDecimal total, List<ItemCupom> itens) {
            this(idGarantia, status, vendaUuid, total, itens, null, null);
        }
    }

    private final CupomRepository repository;

    public CupomService(CupomRepository repository) {
        this.repository = repository;
    }

    public PedidoCupom pedido(long idGarantia) {
        try {
            var situacao = repository.situacao(idGarantia).orElseThrow(() -> new RecursoNaoEncontradoException("garantia"));
            BigDecimal total = BigDecimal.valueOf(situacao.valorCentavos(), 2);
            if (!"NAO_LANCADO".equals(situacao.status())) {
                return new PedidoCupom(idGarantia, situacao.status(), situacao.vendaUuid(), total, List.of());
            }
            if ("LEGADO".equals(situacao.origem())) {
                throw erro("Garantia da planilha antiga: o cupom não é emitido automaticamente.");
            }
            List<ItemCupom> itens = dividir(situacao.valorCentavos(), repository.linhas(idGarantia));
            String uuid = repository.garantirVendaUuid(idGarantia, UUID.randomUUID().toString());
            var carro = repository.carro(idGarantia);
            return new PedidoCupom(idGarantia, situacao.status(), uuid, total, itens, carro.marca(), carro.modelo());
        } catch (SQLException erro) {
            log.error("falha ao montar o cupom da garantia id={}", idGarantia, erro);
            throw new IllegalStateException("falha ao montar o cupom", erro);
        }
    }

    /** NFC-e emitida no RM: garantia vira LANCADO com a data, o numero e a chave da nota. */
    public void registrarEmitido(long idGarantia, String nfce, String chave) {
        String numero = nfce == null ? "" : nfce.trim();
        String chaveLimpa = chave == null ? null : chave.replaceAll("\\D", "");
        if (!numero.matches("[0-9]{1,9}")) {
            throw erro("Número da NFC-e inválido.");
        }
        if (chaveLimpa != null && !chaveLimpa.isEmpty() && chaveLimpa.length() != 44) {
            throw erro("Chave da NFC-e inválida.");
        }
        String quando = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        try {
            if (!repository.registrarEmitido(idGarantia, numero,
                    chaveLimpa == null || chaveLimpa.isEmpty() ? null : chaveLimpa, quando)) {
                throw new RecursoNaoEncontradoException("garantia");
            }
            log.info("cupom da garantia id={} registrado (NFC-e {})", idGarantia, numero);
        } catch (SQLException erro) {
            log.error("falha ao registrar o cupom da garantia id={}", idGarantia, erro);
            throw new IllegalStateException("falha ao registrar o cupom", erro);
        }
    }

    /** Divide o valor da garantia (centavos) entre os produtos; recusa o que o PDV nao aceitaria. */
    static List<ItemCupom> dividir(long totalCentavos, List<LinhaCupom> linhas) {
        if (linhas.isEmpty()) {
            throw erro("A garantia não tem produtos.");
        }
        for (LinhaCupom l : linhas) {
            if (l.nomeRm() == null || l.nomeRm().isBlank()) {
                throw erro("O produto " + l.descricao() + " está sem o NOME NO RM. Preencha em ATUALIZAR PREÇOS.");
            }
        }
        if (totalCentavos <= 0) {
            throw erro("A garantia está sem valor.");
        }
        boolean temServico = linhas.stream().anyMatch(l -> !l.peca());
        long[] unitario = new long[linhas.size()];
        long resto = totalCentavos;
        long pesoTotal = 0;
        for (int i = 0; i < linhas.size(); i++) {
            LinhaCupom l = linhas.get(i);
            if (temServico && l.peca()) {
                unitario[i] = l.precoCentavos();
                resto -= l.precoCentavos() * l.quantidade();
            } else {
                pesoTotal += l.precoCentavos() * l.quantidade();
            }
        }
        if (resto <= 0) {
            throw erro("O valor da garantia é menor que o preço das peças.");
        }
        long distribuido = 0;
        for (int i = 0; i < linhas.size(); i++) {
            LinhaCupom l = linhas.get(i);
            if (temServico && l.peca()) {
                continue;
            }
            // sem preco de tabela, cada unidade pesa igual
            long peso = pesoTotal > 0 ? l.precoCentavos() * l.quantidade() : l.quantidade();
            long base = pesoTotal > 0 ? pesoTotal : linhas.stream()
                    .filter(x -> !(temServico && x.peca())).mapToLong(LinhaCupom::quantidade).sum();
            unitario[i] = resto * peso / base / l.quantidade();
            distribuido += unitario[i] * l.quantidade();
        }
        long sobra = resto - distribuido;
        if (sobra > 0) {
            int alvo = -1;
            for (int i = 0; i < linhas.size() && alvo < 0; i++) {
                LinhaCupom l = linhas.get(i);
                if (!(temServico && l.peca()) && sobra % l.quantidade() == 0) {
                    alvo = i;
                }
            }
            if (alvo < 0) {
                throw erro("O valor da garantia não se divide igualmente pela quantidade de produtos.");
            }
            unitario[alvo] += sobra / linhas.get(alvo).quantidade();
        }
        List<ItemCupom> itens = new ArrayList<>();
        for (int i = 0; i < linhas.size(); i++) {
            if (unitario[i] <= 0) {
                throw erro("O valor da garantia é pequeno demais para dividir entre os produtos.");
            }
            LinhaCupom l = linhas.get(i);
            itens.add(new ItemCupom(l.nomeRm(), l.quantidade(), BigDecimal.valueOf(unitario[i], 2), l.peca()));
        }
        return itens;
    }

    private static DadosInvalidosException erro(String mensagem) {
        return new DadosInvalidosException(Map.of("cupom", mensagem));
    }
}
