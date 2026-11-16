"""Gera o emblema do Sistema de Garantias (placa vermelha com chave amarela) em todos os tamanhos.

Saidas:
  instalador/icone.ico         -> .exe do sistema, instalador, atalhos (16 a 256 px)
  frontend/assets/icone.png    -> icone da janela, da barra de tarefas e do Menu (256 px)

Uso: python instalador/gerar-icone.py   (precisa do Pillow: pip install pillow)
Placa quadrada com borda preta grossa ocupando o icone inteiro (pedido do usuario,
2026-11-16: emblema maior e mais facil de ver na Area de Trabalho), com a chave amarela
encorpada por cima. Mesmo estilo do Contas a Pagar (placa azul com cadeado laranja).
"""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
PRETO = (28, 27, 27, 255)       # #1c1b1b
AMARELO = (255, 230, 0, 255)    # #FFE600
VAZIO = (0, 0, 0, 0)


PLACA = (255, 59, 48, 255)      # #FF3B30 (vermelho do sistema)


def chave_horizontal() -> Image.Image:
    """Chave deitada e ENCORPADA (cabeca grande a esquerda, dentes a direita) em 1400 x 700."""
    img = Image.new("RGBA", (1400, 700), VAZIO)
    d = ImageDraw.Draw(img)

    def ret(x0, y0, x1, y1, cor):
        # ImageDraw substitui o pixel (sem mistura): VAZIO "recorta" o desenho
        d.rectangle([x0, y0, x1, y1], fill=cor)

    # contornos pretos grossos: cabeca, haste larga e dois dentes
    ret(0, 0, 640, 700, PRETO)
    ret(580, 215, 1400, 485, PRETO)
    ret(1010, 440, 1190, 690, PRETO)
    ret(1230, 440, 1400, 610, PRETO)
    # miolo amarelo (a haste emenda com a cabeca e com os dentes)
    ret(60, 60, 580, 640, AMARELO)
    ret(580, 275, 1340, 425, AMARELO)
    ret(1070, 425, 1130, 630, AMARELO)
    ret(1290, 425, 1340, 550, AMARELO)
    # furo da cabeca: contorno preto e o vermelho da placa aparecendo no meio
    ret(180, 200, 460, 500, PRETO)
    ret(240, 260, 400, 440, VAZIO)
    return img


def desenhar(lado: int = 1024) -> Image.Image:
    """Placa quadrada vermelha com borda preta grossa ocupando o icone INTEIRO e a chave
    amarela grande por cima: fica grande e destacada na Area de Trabalho (32/48 px) em
    qualquer papel de parede, e diferente do Contas a Pagar (placa amarela, cadeado)."""
    img = Image.new("RGBA", (lado, lado), PRETO)
    borda = round(lado * 0.07)
    ImageDraw.Draw(img).rectangle([borda, borda, lado - 1 - borda, lado - 1 - borda], fill=PLACA)
    chave = chave_horizontal().rotate(35, resample=Image.NEAREST, expand=True)
    chave = chave.crop(chave.getbbox())
    escala = (lado * 0.86) / max(chave.size)
    chave = chave.resize((round(chave.width * escala), round(chave.height * escala)), Image.LANCZOS)
    img.alpha_composite(chave, ((lado - chave.width) // 2, (lado - chave.height) // 2))
    return img


def main() -> None:
    grande = desenhar(1024)
    tamanhos = [16, 20, 24, 32, 40, 48, 64, 128, 256]
    imagens = [grande.resize((t, t), Image.LANCZOS) for t in tamanhos]
    ico = RAIZ / "instalador" / "icone.ico"
    imagens[-1].save(ico, format="ICO", sizes=[(t, t) for t in tamanhos], append_images=imagens[:-1])
    png = RAIZ / "frontend" / "assets" / "icone.png"
    imagens[-1].save(png, format="PNG", optimize=True)
    print(f"gerados: {ico} ({ico.stat().st_size // 1024} KB) e {png} ({png.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
