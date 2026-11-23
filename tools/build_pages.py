"""Cut each cleaned page into a base (everything that never moves) and one sprite per item.

usage: build_pages.py pages_dir assets_dir
writes assets/<page>/base.webp, assets/<page>/<item>.png and assets/pages.json
"""
import cv2, numpy as np, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pages_config import PAGES, SOURCE
from scipy.ndimage import binary_fill_holes
SRC, OUT = sys.argv[1], sys.argv[2]
W, H = 900, 1300

def clean_levels(f):
    lum = f.mean(2); mx, mn = f.max(2), f.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    g = 1 - np.clip((lum - 0.93) / (0.985 - 0.93), 0, 1)
    ghost = np.clip((0.07 - sat) / 0.04, 0, 1) * np.clip((lum - 0.80) / 0.08, 0, 1)   # faint grey show-through
    g *= 1 - ghost * 0.8
    return np.clip(1 - (1 - f) * g[..., None], 0, 1)

def save(path, f, alpha=None, q=90):
    u8 = (np.clip(f, 0, 1) * 255).round().astype(np.uint8)
    if alpha is not None:
        u8 = np.dstack([u8, (np.clip(alpha, 0, 1) * 255).round().astype(np.uint8)])
        cv2.imwrite(path, u8, [cv2.IMWRITE_WEBP_QUALITY, 92])
    else:
        cv2.imwrite(path, u8, [cv2.IMWRITE_WEBP_QUALITY, q])

meta = {}
for pid, items in PAGES.items():
    src = f"{SRC}/{SOURCE[pid[:2]]}_{pid[-1]}.png"
    P = clean_levels(cv2.imread(src).astype(np.float32) / 255)
    edge = np.ones((H, 1), np.float32); edge[:10] = 0; edge[-20:] = 0
    edge = cv2.GaussianBlur(edge, (1, 9), 0)[..., None]
    P = 1 - (1 - P) * edge                      # photo shadows along the page's top/bottom edge
    os.makedirs(f'{OUT}/{pid}', exist_ok=True)
    dark = 1 - P.min(2)
    lum = P.mean(2); sat = (P.max(2) - P.min(2)) / np.maximum(P.max(2), 1e-3)
    ink = (dark > 0.10).astype(np.uint8)
    colored = ((sat > 0.16) & (lum < 0.93)).astype(np.uint8)
    claimed = np.zeros((H, W), np.uint8)
    clones = []
    holes = np.zeros((H, W), np.float32)
    out = []
    for it in items:
        region = np.zeros((H, W), np.uint8)
        if 'poly' in it: cv2.fillPoly(region, [np.int32(it['poly'])], 1)
        else:
            x0, y0, x1, y1 = it['box']; region[y0:y1, x0:x1] = 1
        if it.get('zone'):
            out.append(dict(it, x=0, y=0, w=0, h=0)); continue
        mode = it.get('mask', 'ink')
        text = it.get('b') == 'text'
        if mode == 'box':
            m = region.copy()
        elif mode == 'color':
            c = colored & region
            c = cv2.morphologyEx(c, cv2.MORPH_CLOSE, np.ones((7, 7)))
            m = (c | (ink & cv2.dilate(c, np.ones((11, 11))) & region)).astype(np.uint8)
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9)))
            m = binary_fill_holes(m).astype(np.uint8)
        else:
            m = (ink | colored) & region
            k = 9 if text else 21
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((k, k)))
            if not text:
                m = binary_fill_holes(m).astype(np.uint8)
                n, lab, st, _ = cv2.connectedComponentsWithStats(m)
                m = np.isin(lab, [i for i in range(1, n) if st[i, 4] > (8 if it.get('keepSmall') else 120)]).astype(np.uint8)
        m &= region
        m &= (1 - cv2.dilate(claimed, np.ones((3, 3))))
        m = cv2.dilate(m, np.ones((5, 5))) & region if mode != 'box' else m
        soft = cv2.GaussianBlur(m.astype(np.float32), (7, 7), 0) * (m if mode == 'box' else 1)
        if mode == 'box':
            soft = cv2.GaussianBlur(m.astype(np.float32), (13, 13), 0)
        claimed |= (soft > 0.02).astype(np.uint8)
        holes = np.maximum(holes, soft)
        if 'fill' in it: clones.append((it['fill'], soft.copy()))
        ys, xs = np.nonzero(soft > 0.02)
        if not len(xs):
            print('EMPTY', pid, it['id']); continue
        x0, y0 = max(xs.min() - 2, 0), max(ys.min() - 2, 0)
        x1, y1 = min(xs.max() + 3, W), min(ys.max() + 3, H)
        save(f'{OUT}/{pid}/{it["id"]}.webp', P[y0:y1, x0:x1], soft[y0:y1, x0:x1])
        rec = {k: v for k, v in it.items() if k not in ('box', 'poly', 'mask', 'fill')}
        rec.update(x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0))
        out.append(rec)
    # base: refill where items were lifted, with nearby wash + paper tooth from the emptiest band
    hole = np.clip(cv2.GaussianBlur(holes, (0, 0), 2) * 1.4, 0, 1)
    keep = 1 - hole
    num = cv2.GaussianBlur(P * keep[..., None], (0, 0), 18)
    den = cv2.GaussianBlur(keep, (0, 0), 18)[..., None]
    wash = num / np.maximum(den, 1e-3)
    conf = np.clip((den - 0.15) / 0.35, 0, 1)
    wash = 1 - (1 - np.clip(wash, 0, 1)) * 0.6 * conf
    rows = [(dark[y:y + 200].mean(), y) for y in range(0, H - 200, 50)]
    by = min(rows)[1]
    band = P[by:by + 200]
    nb = np.vstack([band] * (H // 200 + 1))[:H]
    nd = np.vstack([dark[by:by + 200]] * (H // 200 + 1))[:H]
    bare = cv2.erode((nd < 0.045).astype(np.uint8), np.ones((9, 9))).astype(np.float32)
    tooth = np.clip(nb - cv2.GaussianBlur(nb, (0, 0), 4), -0.03, 0.03) * cv2.GaussianBlur(bare, (0, 0), 2)[..., None]
    wash = np.clip(wash + tooth * 0.8, 0, 1)
    base = P * keep[..., None] + wash * hole[..., None]
    for (dx, dy), soft in clones:           # refill with the drawing's own texture from nearby (e.g. cobblestones)
        h = np.clip(cv2.GaussianBlur(cv2.dilate(soft, np.ones((9, 9))), (0, 0), 3) * 1.3, 0, 1)[..., None]
        src = np.roll(P, (-dy, -dx), axis=(0, 1))
        base = base * (1 - h) + src * h
    save(f'{OUT}/{pid}/base.webp', base, q=88)
    meta[pid] = out
    print(pid, len(out), 'items')
json.dump(meta, open(f'{OUT}/pages.json', 'w'), separators=(',', ':'))
