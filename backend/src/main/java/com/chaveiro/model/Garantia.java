package com.chaveiro.model;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * Garantia de um servico do chaveiro (uma linha das abas mensais do GARANTIAS-AAAA.xlsm).
 * Sem placa: placa = null, semPlaca = true e o CPF identifica o cliente (regra do VBA).
 * cupomStatus/codigoCupom: estrutura para a automacao futura do cupom fiscal (SAT web).
 */
public record Garantia(
        Long id,
        LocalDate dataServico,
        String placa,
        boolean semPlaca,
        String cpf,
        String modelo,
        Long idServico,
        String servico,
        int qtdCarcaca,
        int qtdBotao,
        int qtdPilha,
        int qtdItens,
        BigDecimal valor,
        String tecnico,
        String observacao,
        String codigoCupom,
        String cupomStatus,
        String cupomLancadoEm,
        String origem,
        /** perfil (tecnico) que estava usando o sistema ao cadastrar; nulo no legado */
        String criadoPor,
        /** veiculo do catalogo (CONTROLE > VEICULOS); nulo no legado ou se o cadastro for excluido */
        Long idVeiculo) {
}
