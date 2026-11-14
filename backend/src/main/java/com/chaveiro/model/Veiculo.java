package com.chaveiro.model;

/** Veiculo do catalogo: marca + modelo. "garantias" = quantas garantias apontam para ele. */
public record Veiculo(Long id, Long idMarca, String marca, String modelo, boolean ativo, int garantias) {

    /** Texto gravado na garantia: "CHEVROLET ONIX". */
    public String descricao() {
        return marca + " " + modelo;
    }
}
