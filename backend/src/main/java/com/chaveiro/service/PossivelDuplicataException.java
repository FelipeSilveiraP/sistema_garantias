package com.chaveiro.service;

import com.chaveiro.model.Garantia;

/**
 * Possivel duplicidade detectada na insercao (regra do sistema legado).
 * O cliente decide: confirmar (forcar insercao) ou cancelar.
 */
public class PossivelDuplicataException extends RuntimeException {

    private final Garantia existente;

    public PossivelDuplicataException(Garantia existente) {
        super("possivel duplicidade de garantia");
        this.existente = existente;
    }

    public Garantia getExistente() {
        return existente;
    }
}
