"""Photo of an open spread -> two flattened, cleaned 'ink' pages (paper = white).

usage: pages.py spreads.json photos_dir out_dir
"""
import cv2, numpy as np, sys, json, os
W, H = 900, 1300
cfg = json.load(open(sys.argv[1])); SRC, OUT = sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)

def fit_bg(img, mask, deg=3):
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    idx = np.random.default_rng(0).choice(len(xs), min(40000, len(xs)), replace=False)
    xs, ys = xs[idx], ys[idx]
    T = lambda x, y: np.stack([x ** i * y ** j for i in range(deg + 1) for j in range(deg + 1 - i)], -1)
    A = T(xs / w, ys / h)
    gy, gx = np.mgrid[0:h, 0:w]
    G = T(gx.ravel() / w, gy.ravel() / h)
    out = np.zeros(img.shape, np.float32)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, img[ys, xs, c].astype(np.float32), rcond=None)
        out[..., c] = (G @ coef).reshape(h, w)
    return out

def skin_mask(img, side):
    """fingers: warm skin tones entering from the bottom edge, next to the gutter."""
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV).astype(int)
    b, g, r = [img[..., i].astype(int) for i in range(3)]
    m = ((r - b > 18) & (r - g > 6) & (hsv[..., 1] > 30) & (r > 90)).astype(np.uint8)
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((9, 9)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    for i in range(1, n):
        x, y, w, h, a = st[i]
        near_gutter = (x + w > W - 330) if side == 'L' else (x < 330)
        if a > 1500 and y + h >= H - 6 and near_gutter:
            keep[lab == i] = 1
    keep = cv2.morphologyEx(keep, cv2.MORPH_CLOSE, np.ones((31, 31)))
    return cv2.dilate(keep, np.ones((25, 25)))

for name, sides in cfg.items():
    im = cv2.imread(f'{SRC}/{name}.jpg')
    for side, q in sides.items():
        M = cv2.getPerspectiveTransform(np.float32(q), np.float32([(0, 0), (W, 0), (W, H), (0, H)]))
        raw = cv2.warpPerspective(im, M, (W, H), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
        fing = skin_mask(raw, side)
        hsv = cv2.cvtColor(raw, cv2.COLOR_BGR2HSV)
        v = hsv[..., 2].astype(np.float32)
        paper = (hsv[..., 1] < 26) & (v > cv2.dilate(v, np.ones((41, 41))) - 10) & (fing == 0)
        paper[:, :25] = paper[:, -25:] = False; paper[-20:] = False
        bg = fit_bg(raw, paper)
        ink = np.clip(raw.astype(np.float32) / np.maximum(bg, 1), 0, 1)
        # remove fingers: clone neighbouring paper/drawing sideways, away from the gutter
        f = cv2.GaussianBlur(fing.astype(np.float32), (31, 31), 0)[..., None]
        shift = -260 if side == 'L' else 260
        src = np.roll(ink, -shift, axis=1)
        ink = ink * (1 - f) + src * f
        # trim the photo's edge shadow and the gutter stitching
        if side == 'L': ink = ink[8:H - 14, 8:W - 20]
        else: ink = ink[8:H - 14, 16:W - 8]
        ink = cv2.resize(ink, (W, H), interpolation=cv2.INTER_AREA)
        cv2.imwrite(f'{OUT}/{name}_{side}.png', (ink * 255).round().astype(np.uint8))
        print(name, side, int(fing.sum()))
