package com.chaveiro.web;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Tamanho maximo do corpo das requisicoes, conferido ANTES de ler o corpo (sem isso, um
 * JSON de 1 GB acabaria com a memoria do backend antes de qualquer validacao):
 * - importacao da planilha: 42 MB (planilha de ate 30 MB em base64);
 * - demais rotas: 2 MB (a maior e a foto: 1 MB em base64).
 * Corpo sem tamanho declarado (chunked) e recusado: o Electron sempre manda o tamanho.
 * Tambem acrescenta cabecalhos de seguranca em todas as respostas.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class LimiteCorpoFilter extends OncePerRequestFilter {

    static final long LIMITE_PADRAO = 2L * 1024 * 1024;
    static final long LIMITE_PLANILHA = 42L * 1024 * 1024;

    @Override
    protected void doFilterInternal(HttpServletRequest requisicao, HttpServletResponse resposta,
                                    FilterChain cadeia) throws ServletException, IOException {
        resposta.setHeader("X-Content-Type-Options", "nosniff");
        resposta.setHeader("Cache-Control", "no-store");
        long limite = "/api/legado/importar".equals(requisicao.getRequestURI()) ? LIMITE_PLANILHA : LIMITE_PADRAO;
        long tamanho = requisicao.getContentLengthLong();
        boolean temCorpo = tamanho > 0 || requisicao.getHeader("Transfer-Encoding") != null;
        if (temCorpo && tamanho < 0) {
            recusar(resposta, HttpServletResponse.SC_LENGTH_REQUIRED, "tamanho da requisicao nao informado");
            return;
        }
        if (tamanho > limite) {
            recusar(resposta, HttpServletResponse.SC_REQUEST_ENTITY_TOO_LARGE, "requisicao grande demais");
            return;
        }
        cadeia.doFilter(requisicao, resposta);
    }

    private static void recusar(HttpServletResponse resposta, int status, String erro) throws IOException {
        resposta.setStatus(status);
        resposta.setContentType("application/json;charset=UTF-8");
        resposta.getWriter().write("{\"erro\":\"" + erro + "\"}");
    }
}
