#!/usr/bin/env python3
"""Coarse terminal preview + exposure stats for rendered PNGs (dev aid)."""
import sys
from PIL import Image

RAMP = " .:-=+*#%@"

def preview(path, cols=56):
    im = Image.open(path).convert("RGB")
    w, h = im.size
    rows = max(1, int(cols * h / w * 0.5))
    small = im.resize((cols, rows), Image.LANCZOS)
    px = small.load()
    print(f"{path}  ({w}x{h})")
    for y in range(rows):
        line = []
        for x in range(cols):
            r, g, b = px[x, y]
            lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255.0
            line.append(RAMP[min(len(RAMP) - 1, int(lum * len(RAMP)))])
        print("  " + "".join(line))
    # stats
    vals = []
    rs = gs = bs = 0
    for y in range(0, h, 2):
        for x in range(0, w, 2):
            r, g, b = im.getpixel((x, y))
            rs += r; gs += g; bs += b
            vals.append(0.2126 * r + 0.7152 * g + 0.0722 * b)
    vals.sort()
    n = len(vals)
    pct = lambda p: vals[min(n - 1, int(n * p))]
    print(f"  meanRGB {rs/n:.0f},{gs/n:.0f},{bs/n:.0f} | luma p1 {pct(.01):.0f} p50 {pct(.5):.0f} p99 {pct(.99):.0f} | black {100*sum(v<10 for v in vals)/n:.1f}%  white {100*sum(v>248 for v in vals)/n:.1f}%")
    print()

if __name__ == "__main__":
    for p in sys.argv[1:]:
        preview(p)
