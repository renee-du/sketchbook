"""Remove photo lighting: divide each page by a smooth fitted paper estimate,
giving an 'ink' layer (paper = white) that can be multiplied onto any paper."""
import cv2, numpy as np, sys
D = sys.argv[1]
def fit(img, mask, deg=3):
    h, w = mask.shape
    ys, xs = np.nonzero(mask)
    idx = np.random.default_rng(0).choice(len(xs), min(40000, len(xs)), replace=False)
    xs, ys = xs[idx]/w, ys[idx]/h
    terms = lambda x, y: np.stack([x**i * y**j for i in range(deg+1) for j in range(deg+1-i)], -1)
    A = terms(xs, ys)
    gy, gx = np.mgrid[0:h, 0:w]
    G = terms(gx.ravel()/w, gy.ravel()/h)
    out = np.zeros_like(img, dtype=np.float32)
    for c in range(3):
        coef, *_ = np.linalg.lstsq(A, img[ys.astype(int)*0 + (ys*h).astype(int), (xs*w).astype(int), c].astype(np.float32), rcond=None)
        out[..., c] = (G @ coef).reshape(h, w)
    return out
for name in ['left', 'right']:
    im = cv2.imread(f'{D}/{name}_raw.png')
    hsv = cv2.cvtColor(im, cv2.COLOR_BGR2HSV)
    v = hsv[..., 2].astype(np.float32)
    # local brightness reference so we pick paper, not pencil
    loc = cv2.dilate(v, np.ones((41, 41)))
    mask = (hsv[..., 1] < 22) & (v > loc - 10)
    h, w = mask.shape
    mask[:, w-40:] = False; mask[:, :25] = False   # gutters/edges
    if name == 'left': mask[1120:, 720:] = False    # finger
    else: mask[1180:, :200] = False
    bg = fit(im, mask)
    ink = np.clip(im.astype(np.float32) / np.maximum(bg, 1) , 0, 1)
    cv2.imwrite(f'{D}/{name}_ink.png', (ink*255).round().astype(np.uint8))
    cv2.imwrite(f'{D}/{name}_mask.png', mask.astype(np.uint8)*255)
