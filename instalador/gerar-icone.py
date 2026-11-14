"""Gera o emblema do Sistema de Garantias (chave amarela, sem fundo) em todos os tamanhos.

Saidas:
  instalador/icone.ico         -> .exe do sistema, instalador, atalhos (16 a 256 px)
  frontend/assets/icone.png    -> icone da janela, da barra de tarefas e do Menu (256 px)

Uso: python instalador/gerar-icone.py   (precisa do Pillow: pip install pillow)
Mesmo estilo do emblema do Contas a Pagar (formas retas, contorno preto grosso,
sem placa de fundo): aqui uma chave amarela na diagonal, ocupando a imagem toda.
"""
from pathlib import Path

from PIL import Image, ImageDraw

RAIZ = Path(__file__).resolve().parent.parent
PRETO = (28, 27, 27, 255)       # #1c1b1b
AMARELO = (255, 230, 0, 255)    # #FFE600
VAZIO = (0, 0, 0, 0)


def chave_horizontal() -> Image.Image:
    """Chave deitada (cabeca a esquerda, dentes embaixo, a direita) em 1400 x 600."""
    img = Image.new("RGBA", (1400, 600), VAZIO)
    d = ImageDraw.Draw(img)

    def ret(x0, y0, x1, y1, cor):
        # ImageDraw substitui o pixel (sem mistura): VAZIO "recorta" o desenho
        d.rectangle([x0, y0, x1, y1], fill=cor)

    # contornos pretos: cabeca, haste e dois dentes
    ret(20, 20, 540, 580, PRETO)
    ret(500, 210, 1385, 390, PRETO)
    ret(1060, 350, 1200, 530, PRETO)
    ret(1240, 350, 1385, 470, PRETO)
    # miolo amarelo (a haste emenda com a cabeca e com os dentes)
    ret(62, 62, 498, 538, AMARELO)
    ret(498, 252, 1343, 348, AMARELO)
    ret(1102, 348, 1158, 488, AMARELO)
    ret(1282, 348, 1343, 428, AMARELO)
    # furo da cabeca: contorno preto e vazio no meio
    ret(170, 190, 390, 410, PRETO)
    ret(212, 232, 348, 368, VAZIO)
    return img


def desenhar(lado: int = 1024) -> Image.Image:
    chave = chave_horizontal().rotate(40, resample=Image.NEAREST, expand=True)
    chave = chave.crop(chave.getbbox())
    escala = (lado * 0.98) / max(chave.size)
    chave = chave.resize((round(chave.width * escala), round(chave.height * escala)), Image.LANCZOS)
    img = Image.new("RGBA", (lado, lado), VAZIO)
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
