package com.chaveiro.model;

/**
 * Um produto da garantia (linha do cadastro com o botao +): da tabela de precos
 * (idServico) ou "OUTRO" (idServico nulo e a descricao escrita). Quantidade de 1 a 5.
 */
public record ItemGarantia(Long idServico, String descricao, int quantidade, long precoCentavos) {
}
