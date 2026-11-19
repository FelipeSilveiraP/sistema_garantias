; Trechos proprios do instalador NSIS (electron-builder: nsis.include).
; REGRA (pedido do usuario, 2026-11-16): o Garantias NAO abre sozinho quando o
; computador liga. O instalador APAGA o cadastro na inicializacao do Windows que
; as versoes antigas gravavam; o sistema tambem confere e apaga a cada abertura
; (desktop/automacoes.js configurarInicioComWindows).
; Mesmo nome usado em desktop/automacoes.js (NOME_INICIO).

!macro customInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Garantias - Chaveiro Universal"
  ; ATUALIZACAO: abre o programa direto, sem depender do atalho do Menu Iniciar (o jeito
  ; padrao, pelo Explorer, as vezes nao abria nada). O programa espera o antigo fechar.
  ${if} ${isUpdated}
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --reabrir-depois-da-atualizacao'
  ${endIf}
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Garantias - Chaveiro Universal"
!macroend
