"""Cut each cleaned page into a base (everything that never moves) and one sprite per item.

usage: build_pages.py pages_dir assets_dir
writes assets/<page>/base.webp, assets/<page>/<item>.webp (+ <item>_pieces.png) and assets/pages.json
"""
import cv2, numpy as np, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
from pages_config import PAGES, SOURCE, SPREAD_SRC
from scipy.ndimage import binary_fill_holes, distance_transform_edt
SRC, OUT = sys.argv[1], sys.argv[2]
W, H = 900, 1300
PEN = np.array([64, 61, 52], np.float32) / 255      # BGR of the artist's fineliner

def clean_levels(f):
    lum = f.mean(2); mx, mn = f.max(2), f.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    g = 1 - np.clip((lum - 0.93) / (0.985 - 0.93), 0, 1)
    ghost = np.clip((0.07 - sat) / 0.04, 0, 1) * np.clip((lum - 0.80) / 0.08, 0, 1)
    g *= 1 - ghost * 0.8
    return np.clip(1 - (1 - f) * g[..., None], 0, 1)

def save(path, f, alpha=None, q=90):
    u8 = (np.clip(f, 0, 1) * 255).round().astype(np.uint8)
    if alpha is not None:
        u8 = np.dstack([u8, (np.clip(alpha, 0, 1) * 255).round().astype(np.uint8)]); q = 92
    cv2.imwrite(path, u8, [cv2.IMWRITE_WEBP_QUALITY, q])

def poly_mask(pts):
    m = np.zeros((H, W), np.uint8); cv2.fillPoly(m, [np.int32(pts)], 1); return m

def pen_strokes(img, alpha, lines, seed=1):
    """draw completion lines in the artist's fineliner: ~2.6px, slightly uneven"""
    rng = np.random.default_rng(seed)
    layer = np.zeros((H * 2, W * 2), np.uint8)
    for pts in lines:
        p = np.float32(pts)
        # smooth with a Catmull-Rom pass
        dense = []
        for i in range(len(p) - 1):
            p0, p1, p2, p3 = p[max(i - 1, 0)], p[i], p[i + 1], p[min(i + 2, len(p) - 1)]
            for t in np.linspace(0, 1, 12, endpoint=False):
                dense.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3))
        dense.append(p[-1]); dense = np.array(dense)
        for i in range(len(dense) - 1):
            w = int(round(2 * (2.2 + 0.6 * np.sin(i * 0.4 + rng.uniform(0, 6)))))
            a, b = (dense[i] * 2).astype(int), (dense[i + 1] * 2).astype(int)
            cv2.line(layer, tuple(a), tuple(b), 255, max(2, w), cv2.LINE_AA)
    lay = cv2.resize(layer, (W, H), interpolation=cv2.INTER_AREA).astype(np.float32) / 255 * 0.9
    img[:] = img * (1 - lay[..., None]) + PEN * lay[..., None]
    alpha[:] = np.maximum(alpha, lay)

meta = {}
for pid, items in PAGES.items():
    if pid in SPREAD_SRC:            # a whole spread laid out as one 1800px-wide room
        P = np.hstack([clean_levels(cv2.imread(f"{SRC}/{n}.png").astype(np.float32) / 255) for n in SPREAD_SRC[pid]])
    else:
        P = clean_levels(cv2.imread(f"{SRC}/{SOURCE[pid[:2]]}_{pid[-1]}.png").astype(np.float32) / 255)
    W = P.shape[1]
    edge = np.ones((H, 1), np.float32); edge[:10] = 0; edge[-20:] = 0
    P = 1 - (1 - P) * cv2.GaussianBlur(edge, (1, 9), 0)[..., None]
    os.makedirs(f'{OUT}/{pid}', exist_ok=True)
    dark = 1 - P.min(2)
    lum = P.mean(2); sat = (P.max(2) - P.min(2)) / np.maximum(P.max(2), 1e-3)
    ink = (dark > 0.10).astype(np.uint8)
    colored = ((sat > 0.16) & (lum < 0.93)).astype(np.uint8)
    claimed = np.zeros((H, W), np.uint8)
    holes = np.zeros((H, W), np.float32)
    clones, unders = [], []
    # paper tooth from the emptiest band, for refills
    rows = [(dark[y:y + 200].mean(), y) for y in range(0, H - 200, 50)]
    by = min(rows)[1]
    band = P[by:by + 200]
    nb = np.vstack([band] * (H // 200 + 1))[:H]
    nd = np.vstack([dark[by:by + 200]] * (H // 200 + 1))[:H]
    bare = cv2.erode((nd < 0.045).astype(np.uint8), np.ones((9, 9))).astype(np.float32)
    tooth = np.clip(nb - cv2.GaussianBlur(nb, (0, 0), 4), -0.03, 0.03) * cv2.GaussianBlur(bare, (0, 0), 2)[..., None]
    paper = np.clip(0.985 + tooth, 0, 1)
    out = []
    for it in items:
        region = poly_mask(it['poly']) if 'poly' in it else np.zeros((H, W), np.uint8)
        if 'box' in it:
            x0, y0, x1, y1 = it['box']; region[max(y0, 0):y1, max(x0, 0):x1] = 1
        if 'exclude' in it:
            ex = it['exclude'] if isinstance(it['exclude'][0][0], (list, tuple)) else [it['exclude']]
            for e in ex: region &= 1 - poly_mask(e)
        if it.get('zone'):
            out.append({k: v for k, v in it.items() if k not in ('poly',)}); continue
        mode = it.get('mask', 'ink'); text = it.get('b') == 'text'
        if mode == 'box':
            m = region.copy()
        elif mode == 'color':
            c = cv2.morphologyEx(colored & region, cv2.MORPH_CLOSE, np.ones((7, 7)))
            m = (c | (ink & cv2.dilate(c, np.ones((11, 11))) & region)).astype(np.uint8)
            m = binary_fill_holes(cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9)))).astype(np.uint8)
        else:
            m = (((dark > it['inkmin']).astype(np.uint8) if 'inkmin' in it else ink) | colored) & region
            m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9) if text or it.get('nofill') else (21, 21)))
            if not text and not it.get('nofill'):
                m = binary_fill_holes(m).astype(np.uint8)
                n, lab, st, _ = cv2.connectedComponentsWithStats(m)
                m = np.isin(lab, [i for i in range(1, n) if st[i, 4] > 120]).astype(np.uint8)
        m &= region
        if it.get('noblue'):          # leave the pale blue pencil shadow on the page
            bl = (P[..., 0] > P[..., 2] + 0.03) & (dark < 0.35)
            m &= (1 - cv2.dilate(bl.astype(np.uint8), np.ones((3, 3))))
            n_, lab_, st_, _ = cv2.connectedComponentsWithStats(m)
            m = np.isin(lab_, [i for i in range(1, n_) if st_[i, 4] > 400]).astype(np.uint8)
        m &= (1 - cv2.dilate(claimed, np.ones((3, 3))))
        if mode != 'box': m = cv2.dilate(m, np.ones((5, 5))) & region
        soft = cv2.GaussianBlur(m.astype(np.float32), (13, 13) if mode == 'box' else (7, 7), 0)
        if mode == 'box': soft *= 1
        claimed |= (soft > 0.02).astype(np.uint8)
        holes = np.maximum(holes, soft)
        if 'fill' in it: clones.append((it['fill'], soft.copy()))
        if it.get('remove'): continue
        img = P.copy(); alpha = soft.copy()
        if 'under_rot' in it:        # continue the food under what lies on it: the same food, turned about its centre
            cx, cy, deg, pts = it['under_rot']
            K = cv2.dilate(poly_mask(pts), np.ones((9, 9))).astype(np.float32)
            M = cv2.getRotationMatrix2D((cx, cy), -deg, 1.0)
            rot = cv2.warpAffine(P, M, (W, H), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)
            ra = cv2.warpAffine(alpha, M, (W, H))
            f = cv2.GaussianBlur(K, (0, 0), 3)[..., None]
            img = img * (1 - f) + rot * f
            alpha = np.maximum(alpha, cv2.GaussianBlur(K, (0, 0), 2) * np.clip(ra * 1.2, 0, 1))
        if 'under_of' in it:        # what was hidden under something lying on top (the knife): continue the food beneath
            K = cv2.dilate(poly_mask(it['under_of']), np.ones((7, 7)))
            u8 = (img * 255).astype(np.uint8)
            img = cv2.inpaint(u8, K, 11, cv2.INPAINT_TELEA).astype(np.float32) / 255
            alpha = np.maximum(alpha, cv2.GaussianBlur(K.astype(np.float32), (5, 5), 0))
        if 'extra' in it:
            before = alpha > 0.5
            pen_strokes(img, alpha, it['extra'])
            filled = binary_fill_holes(cv2.morphologyEx((alpha > 0.3).astype(np.uint8), cv2.MORPH_CLOSE, np.ones((15, 15))))
            new = filled & ~before
            stroke = (alpha > 0.3) & ~before
            img[new & ~stroke] = paper[new & ~stroke]      # hidden parts become blank paper inside the new outline
            alpha = np.maximum(alpha, cv2.GaussianBlur(filled.astype(np.float32), (5, 5), 0))
        if 'under' in it:
            M = binary_fill_holes(m).astype(np.uint8)
            inner = cv2.erode(M, np.ones((15, 15)))
            rim = (M - inner).astype(bool) & (dark > 0.25)
            tone = np.array(it['under'][::-1], np.float32) / 255
            u = np.clip(tone + np.random.default_rng(2).normal(0, .006, P.shape), 0, 1).astype(np.float32)
            u[rim] = P[rim]
            unders.append((cv2.GaussianBlur(M.astype(np.float32), (5, 5), 0), u))
        ys, xs = np.nonzero(alpha > 0.02)
        x0, y0 = max(xs.min() - 2, 0), max(ys.min() - 2, 0)
        x1, y1 = min(xs.max() + 3, W), min(ys.max() + 3, H)
        save(f'{OUT}/{pid}/{it["id"]}.webp', img[y0:y1, x0:x1], alpha[y0:y1, x0:x1])
        rec = {k: v for k, v in it.items() if k not in ('box', 'poly', 'mask', 'fill', 'extra', 'exclude', 'under', 'under_of', 'under_rot')}
        if it.get('pieces'):
            c = (colored & (dark < 0.55) & m).astype(np.uint8)
            c = cv2.morphologyEx(c, cv2.MORPH_OPEN, np.ones((3, 3)))
            n, lab, st, _ = cv2.connectedComponentsWithStats(c, connectivity=4)
            keep = [i for i in range(1, n) if st[i, 4] > 140]
            seeds = np.zeros((H, W), np.int32)
            for j, i in enumerate(keep): seeds[lab == i] = j + 1
            d, (iy, ix) = distance_transform_edt(seeds == 0, return_indices=True)
            L = seeds[iy, ix] * ((d < 7) & (alpha > 0.02))
            cv2.imwrite(f'{OUT}/{pid}/{it["id"]}_pieces.png', L[y0:y1, x0:x1].astype(np.uint8))
            rec['npieces'] = len(keep)
        cm = it.get('cmask')
        if cm:                     # where pencil colour may go (not cast shadows, not empty centres)
            body = (alpha > 0.5).astype(np.uint8)
            if cm == 'shadow':
                dens = cv2.GaussianBlur((dark > 0.18).astype(np.float32), (0, 0), 6)
                low = np.zeros_like(body); low[y0 + int((y1 - y0) * .42):y1] = 1
                sh = ((dens > 0.09) & low.astype(bool)).astype(np.uint8)
                sh = cv2.dilate(cv2.morphologyEx(sh, cv2.MORPH_CLOSE, np.ones((31, 31))), np.ones((9, 9)))
                C = body & (1 - sh)
            elif cm in ('holes', 'figures'):
                lim = 2500 if cm == 'holes' else 1800
                k = 5 if cm == 'figures' else 9
                closed = cv2.morphologyEx(ink & region, cv2.MORPH_CLOSE, np.ones((k, k)))
                inv = (1 - closed).astype(np.uint8)
                n, lab, st, _ = cv2.connectedComponentsWithStats(inv, connectivity=4)
                small = np.isin(lab, [i for i in range(1, n) if st[i, 4] < lim and st[i, 0] > 0 and st[i, 1] > 0])
                C = (closed.astype(bool) | small).astype(np.uint8) & body
            else:                  # a polygon
                C = poly_mask(cm) & body
            C = cv2.GaussianBlur(C.astype(np.float32), (5, 5), 0)
            cv2.imwrite(f'{OUT}/{pid}/{it["id"]}_c.png', (C[y0:y1, x0:x1] * 255).astype(np.uint8))
            rec['cmask'] = 1
        rec.update(x=int(x0), y=int(y0), w=int(x1 - x0), h=int(y1 - y0))
        out.append(rec)
    hole = np.clip(cv2.GaussianBlur(holes, (0, 0), 2) * 1.4, 0, 1)
    keep = 1 - hole
    num = cv2.GaussianBlur(P * keep[..., None], (0, 0), 18)
    den = cv2.GaussianBlur(keep, (0, 0), 18)[..., None]
    wash = num / np.maximum(den, 1e-3)
    conf = np.clip((den - 0.15) / 0.35, 0, 1)
    wash = 1 - (1 - np.clip(wash, 0, 1)) * 0.6 * conf
    wash = np.clip(wash + tooth * 0.8, 0, 1)
    base = P * keep[..., None] + wash * hole[..., None]
    for (dx, dy), soft in clones:
        h = np.clip(cv2.GaussianBlur(cv2.dilate(soft, np.ones((9, 9))), (0, 0), 3) * 1.3, 0, 1)[..., None]
        base = base * (1 - h) + np.roll(P, (-dy, -dx), axis=(0, 1)) * h
    for M, u in unders:
        base = base * (1 - M[..., None]) + u * M[..., None]
    if pid in SPREAD_SRC:
        for i, side in enumerate('LR'):
            os.makedirs(f'{OUT}/{pid}_{side}', exist_ok=True)
            save(f'{OUT}/{pid}_{side}/base.webp', base[:, i * 900:(i + 1) * 900], q=88)
    else:
        save(f'{OUT}/{pid}/base.webp', base, q=88)
    meta[pid] = out
    print(pid, len(out), 'items')
json.dump(meta, open(f'{OUT}/pages.json', 'w'), separators=(',', ':'))
