"""Genera le icone dell'app (eseguito automaticamente da GitHub durante la compilazione)."""
import os
from PIL import Image, ImageDraw

RES = "app/src/main/res"
WWW = "app/src/main/assets/www"
GREEN = (23, 97, 61, 255)


def draw(S, pad, shape):
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if shape == "round":
        d.ellipse([0, 0, S - 1, S - 1], fill=GREEN)
    elif shape == "rounded":
        d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * .2), fill=GREEN)
    p = S * pad
    w = S - 2 * p

    def P(x, y):
        return (p + x * w, p + y * w)

    d.polygon([P(.5, .08), P(.95, .45), P(.83, .45), P(.83, .92), P(.17, .92), P(.17, .45), P(.05, .45)], fill="white")
    cx, cy = P(.5, .63)
    r = w * .2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=GREEN)
    lw = max(1, int(w * .045))
    d.arc([cx - r * .62, cy - r * .62, cx + r * .62, cy + r * .62], start=40, end=320, fill="white", width=lw)
    d.line([cx - r * .85, cy - r * .15, cx + r * .15, cy - r * .15], fill="white", width=max(1, int(lw * .8)))
    d.line([cx - r * .85, cy + r * .18, cx + r * .15, cy + r * .18], fill="white", width=max(1, int(lw * .8)))
    return im


def save(im, size, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    im.resize((size, size), Image.LANCZOS).save(path)


for name, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
    save(draw(px * 4, .16, "rounded"), px, f"{RES}/mipmap-{name}/ic_launcher.png")
    save(draw(px * 4, .2, "round"), px, f"{RES}/mipmap-{name}/ic_launcher_round.png")
    fg = int(px * 108 / 48)
    save(draw(fg * 4, .3, None), fg, f"{RES}/mipmap-{name}/ic_launcher_foreground.png")
save(draw(768, .14, "rounded"), 192, f"{WWW}/icon-192.png")
print("Icone create")
