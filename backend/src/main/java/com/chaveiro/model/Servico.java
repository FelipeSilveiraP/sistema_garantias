package com.chaveiro.model;

import java.math.BigDecimal;

/**
 * Item da tabela de precos: servico (aparece no cadastro) ou peca (PILHA, BOTAO:
 * so o preco, usado para dividir o valor no cupom fiscal). Os "pede*" dizem quais
 * quantidades o cadastro pergunta (regra do VBA).
 */
public record Servico(
        Long id,
        String nome,
        BigDecimal preco,
        String codigoCupom,
        boolean pedeCarcaca,
        boolean pedeBotao,
        boolean pedePilha,
        boolean pedeItens,
        boolean peca,
        boolean ativo) {
}
