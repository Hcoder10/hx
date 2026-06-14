"""Second pass: clear checkerboard pockets enclosed by the subject (unreachable by
border flood-fill). A connected region of light low-saturation pixels is treated as
leftover checkerboard only if it contains the checkerboard's mid-gray tone; pure-white
subject highlights (which lack that gray) are preserved."""
import sys
from collections import deque
from PIL import Image

def light(p):
    mx = max(p[0], p[1], p[2]); mn = min(p[0], p[1], p[2])
    return p[3] > 0 and mx >= 198 and (mx - mn) <= 26

def is_gray(p):
    mx = max(p[0], p[1], p[2]); mn = min(p[0], p[1], p[2])
    return 205 <= mx <= 246 and (mx - mn) <= 12

def run(path):
    im = Image.open(path).convert("RGBA")
    W, H = im.size; px = im.load()
    seen = bytearray(W * H); cleared = 0
    for sy in range(H):
        for sx in range(W):
            if seen[sy*W+sx] or not light(px[sx, sy]):
                continue
            comp = []; q = deque([(sx, sy)]); seen[sy*W+sx] = 1; has_gray = False
            while q:
                x, y = q.popleft(); p = px[x, y]; comp.append((x, y))
                if is_gray(p): has_gray = True
                for dx, dy in ((1,0),(-1,0),(0,1),(0,-1)):
                    nx, ny = x+dx, y+dy
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny*W+nx] and light(px[nx, ny]):
                        seen[ny*W+nx] = 1; q.append((nx, ny))
            if has_gray:
                for x, y in comp:
                    r, g, b, a = px[x, y]; px[x, y] = (r, g, b, 0)
                cleared += len(comp)
    im.save(path)
    print(f"{path}: pockets cleared {cleared} px")

if __name__ == "__main__":
    for p in sys.argv[1:]:
        run(p)
