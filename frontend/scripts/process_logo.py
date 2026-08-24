"""Separa conejo y wordmark. El texto empieza bien abajo para no llevarse la panza del conejo."""
from pathlib import Path

from PIL import Image

src = Path("/in/logo.png")
out_dir = Path("/out")
out_dir.mkdir(parents=True, exist_ok=True)

raw = Image.open(src).convert("RGBA")
w, h = raw.size
px = raw.load()


def is_ink(p):
    r, g, b, a = p
    return a > 8 and not (r > 242 and g > 242 and b > 242)


ink = [any(is_ink(px[x, y]) for x in range(w)) for y in range(h)]
ink_rows = [y for y, v in enumerate(ink) if v]
if not ink_rows:
    raise SystemExit("no ink")

gaps = []
prev = ink_rows[0]
for y in ink_rows[1:]:
    if y > prev + 1:
        gaps.append((prev, y, y - prev))
    prev = y
gaps.sort(key=lambda g: g[2], reverse=True)
split = gaps[0][0] if gaps else int(h * 0.62)

# Texto = filas ANCHAS debajo del conejo (la panza es angosta).
word_rows = []
for y in range(split + 36, h):
    xs = [x for x in range(w) if is_ink(px[x, y])]
    if xs and (max(xs) - min(xs)) > int(w * 0.5):
        word_rows.append(y)
if not word_rows:
    raise SystemExit("no word rows")

mark_rows = [y for y in ink_rows if y <= split]


def bbox(rows, pad_x, pad_y):
    y0, y1 = min(rows), max(rows)
    xs = [x for y in range(y0, y1 + 1) for x in range(w) if is_ink(px[x, y])]
    x0, x1 = min(xs), max(xs)
    return (
        max(0, x0 - pad_x),
        max(0, y0 - pad_y),
        min(w, x1 + 1 + pad_x),
        min(h, y1 + 1 + pad_y),
    )


out = raw.copy()
opx = out.load()
for y in range(h):
    for x in range(w):
        r, g, b, a = opx[x, y]
        if r >= 248 and g >= 248 and b >= 248:
            opx[x, y] = (255, 255, 255, 0)


def with_pad(im, p):
    canvas = Image.new("RGBA", (im.width + p * 2, im.height + p * 2), (0, 0, 0, 0))
    canvas.paste(im, (p, p), im)
    return canvas


def to_light(im):
    img = im.copy()
    p = img.load()
    ww, hh = img.size
    for y in range(hh):
        for x in range(ww):
            r, g, b, a = p[x, y]
            if a > 12:
                p[x, y] = (245, 240, 250, a)
    return img


mark = with_pad(out.crop(bbox(mark_rows, 36, 48)), 28)
word = with_pad(out.crop(bbox(word_rows, 40, 56)), 48)
full = with_pad(out.crop(bbox(ink_rows, 24, 32)), 16)

mark.save(out_dir / "logo-mark.png", "PNG")
word.save(out_dir / "logo-wordmark.png", "PNG")
to_light(word).save(out_dir / "logo-wordmark-light.png", "PNG")
full.save(out_dir / "logo.png", "PNG")
print("h", h, "split", split, "word", word_rows[0], word_rows[-1], "sizes", mark.size, word.size)
