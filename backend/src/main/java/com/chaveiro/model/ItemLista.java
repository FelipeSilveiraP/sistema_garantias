package com.chaveiro.model;

/** Item de lista editavel (tecnicos e modelos de carro). Inativo some do cadastro, mas a historia fica. */
public record ItemLista(Long id, String nome, boolean ativo) {
}
