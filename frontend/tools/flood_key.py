"""Remove the baked checkerboard background from colorful assets via border flood-fill.
Safe for subjects whose interior whites are enclosed by colored edges (hero art, shield)."""
import sys
from collections import deque
from PIL import Image

def is_bg(px, mx_t=205, sat_t=20):
    r, g, b = px[0], px[1], px[2]
    mx = max(r, g, b); mn = min(r, g, b)
    return mx >= mx_t and (mx - mn) <= sat_t

def key_image(path):
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    px = im.load()
    transparent = bytearray(W * H)
    q = deque()
    def consider(x, y):
        if 0 <= x < W and 0 <= y < H and not transparent[y*W+x] and is_bg(px[x, y]):
            transparent[y*W+x] = 1; q.append((x, y))
    for x in range(W):
        consider(x, 0); consider(x, H-1)
    for y in range(H):
        consider(0, y); consider(W-1, y)
    while q:
        x, y = q.popleft()
        consider(x+1, y); consider(x-1, y); consider(x, y+1); consider(x, y-1)
    # 2 dilation passes over light AA rim to kill the gray halo
    for _ in range(2):
        add = []
        for y in range(H):
            for x in range(W):
                if transparent[y*W+x]:
                    continue
                p = px[x, y]; mx = max(p[0], p[1], p[2]); mn = min(p[0], p[1], p[2])
                if mx >= 188 and (mx - mn) <= 26:
                    if ((x>0 and transparent[y*W+x-1]) or (x<W-1 and transparent[y*W+x+1]) or
                        (y>0 and transparent[(y-1)*W+x]) or (y<H-1 and transparent[(y+1)*W+x])):
                        add.append((x, y))
        for x, y in add:
            transparent[y*W+x] = 1
    cleared = 0
    for y in range(H):
        for x in range(W):
            if transparent[y*W+x]:
                r, g, b, _ = px[x, y]; px[x, y] = (r, g, b, 0); cleared += 1
    im.save(path)
    print(f"{path}: cleared {cleared}/{W*H} px ({100*cleared//(W*H)}%)")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        key_image(p)
