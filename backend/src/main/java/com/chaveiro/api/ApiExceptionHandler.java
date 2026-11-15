package com.chaveiro.api;

import com.chaveiro.service.ConflitoIntegridadeException;
import com.chaveiro.service.DadosInvalidosException;
import com.chaveiro.service.PossivelDuplicataException;
import com.chaveiro.service.AcessoNegadoException;
import com.chaveiro.service.RecursoNaoEncontradoException;
import java.util.LinkedHashMap;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

    @ExceptionHandler(DadosInvalidosException.class)
    public ResponseEntity<Map<String, Object>> validacao(DadosInvalidosException erro) {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("erro", "dados invalidos");
        corpo.put("campos", erro.getCampos());
        return ResponseEntity.badRequest().body(corpo);
    }

    /** Corpo da requisicao ilegivel (JSON malformado, texto fora de UTF-8): 400, nao 500. */
    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> corpoInvalido(HttpMessageNotReadableException erro) {
        log.warn("requisicao com corpo ilegivel recusada: {}", erro.getMostSpecificCause().getClass().getSimpleName());
        return ResponseEntity.badRequest().body(Map.of("erro", "dados invalidos"));
    }

    @ExceptionHandler(RecursoNaoEncontradoException.class)
    public ResponseEntity<Map<String, String>> naoEncontrado(RecursoNaoEncontradoException erro) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND).body(Map.of("erro", erro.getMessage()));
    }

    @ExceptionHandler(ConflitoIntegridadeException.class)
    public ResponseEntity<Map<String, String>> conflito(ConflitoIntegridadeException erro) {
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("erro", erro.getMessage()));
    }

    @ExceptionHandler(PossivelDuplicataException.class)
    public ResponseEntity<Map<String, Object>> possivelDuplicata(PossivelDuplicataException erro) {
        Map<String, Object> corpo = new LinkedHashMap<>();
        corpo.put("erro", "possivel duplicidade de garantia");
        corpo.put("tipo", "possivel_duplicata");
        corpo.put("existente", erro.getExistente());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(corpo);
    }

    /** Contas: 401 (sem sessao/PIN errado), 403 (so admin), 423 (bloqueada). */
    @ExceptionHandler(AcessoNegadoException.class)
    public ResponseEntity<Map<String, Object>> acessoNegado(AcessoNegadoException erro) {
        Map<String, Object> corpo = new LinkedHashMap<>(erro.getExtra());
        corpo.put("erro", erro.getMessage());
        return ResponseEntity.status(erro.getStatus()).body(corpo);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> validacao(MethodArgumentNotValidException erro) {
        return ResponseEntity.badRequest().body(Map.of("erro", "dados invalidos"));
    }

    /**
     * Parametro com tipo errado ("/api/garantias/1 OR 1=1", data invalida) ou faltando:
     * 400, nao 500 (e sem encher o log de erro com tentativa de ataque).
     */
    @ExceptionHandler({org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class,
            org.springframework.web.bind.MissingServletRequestParameterException.class,
            org.springframework.web.bind.MissingRequestHeaderException.class})
    public ResponseEntity<Map<String, String>> parametroInvalido(Exception erro) {
        log.warn("parametro invalido recusado: {}", erro.getClass().getSimpleName());
        return ResponseEntity.badRequest().body(Map.of("erro", "dados invalidos"));
    }

    /** Metodo/rota inexistente: 405/404 sem stack trace no log. */
    @ExceptionHandler({org.springframework.web.HttpRequestMethodNotSupportedException.class,
            org.springframework.web.servlet.resource.NoResourceFoundException.class,
            org.springframework.web.HttpMediaTypeNotSupportedException.class})
    public ResponseEntity<Map<String, String>> rotaInvalida(Exception erro) {
        HttpStatus status = erro instanceof org.springframework.web.HttpRequestMethodNotSupportedException ? HttpStatus.METHOD_NOT_ALLOWED
                : erro instanceof org.springframework.web.HttpMediaTypeNotSupportedException ? HttpStatus.UNSUPPORTED_MEDIA_TYPE
                : HttpStatus.NOT_FOUND;
        return ResponseEntity.status(status).body(Map.of("erro", "rota invalida"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> generico(Exception erro) {
        log.error("erro nao tratado na API", erro);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("erro", "erro interno"));
    }
}
