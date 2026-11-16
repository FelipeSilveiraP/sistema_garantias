; Trechos proprios do instalador NSIS (electron-builder: nsis.include).
; REGRA (pedido do usuario, 2026-11-16): o Garantias NAO abre sozinho quando o
; computador liga. O instalador APAGA o cadastro na inicializacao do Windows que
; as versoes antigas gravavam; o sistema tambem confere e apaga a cada abertura
; (desktop/automacoes.js configurarInicioComWindows).
; Mesmo nome usado em desktop/automacoes.js (NOME_INICIO).

!macro customInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Garantias - Chaveiro Universal"
!macroend

!macro customUnInstall
  DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "Garantias - Chaveiro Universal"
!macroend
