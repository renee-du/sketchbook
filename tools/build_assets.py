"""Build the web assets from the cleaned page scans.

right page -> right_base.webp (sun lifted out), sun.png, right_geo.png
              (R: sea mask, G: land/occluder mask, B: depth below horizon)
left page  -> left_base.webp (treats lifted out) + one sprite per treat/label
"""
import cv2, numpy as np, sys, json, os
D, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)
W, H = 900, 1300

def clean_levels(img, ghost_box=None):
    f = img.astype(np.float32) / 255
    lum = f.mean(2)
    mx, mn = f.max(2), f.min(2)
    sat = (mx - mn) / np.maximum(mx, 1e-3)
    g = 1 - np.clip((lum - 0.945) / (0.99 - 0.945), 0, 1)
    if ghost_box is not None:   # faint show-through from the next page: grey + light
        x0, y0, x1, y1 = ghost_box
        gh = np.zeros_like(lum); gh[y0:y1, x0:x1] = 1
        gh = cv2.GaussianBlur(gh, (61, 61), 0)
        greyish = np.clip((0.06 - sat) / 0.03, 0, 1) * np.clip((lum - 0.74) / 0.08, 0, 1)
        g *= 1 - gh * greyish * 0.85
    g = g[..., None]
    return np.clip(1 - (1 - f) * g, 0, 1)

def save(name, f, alpha=None):
    u8 = (np.clip(f, 0, 1) * 255).round().astype(np.uint8)
    if alpha is not None:
        u8 = np.dstack([u8, (np.clip(alpha, 0, 1) * 255).round().astype(np.uint8)])
    if name.endswith('.webp'):
        cv2.imwrite(f'{OUT}/{name}', u8, [cv2.IMWRITE_WEBP_QUALITY, 90])
    else:
        cv2.imwrite(f'{OUT}/{name}', u8, [cv2.IMWRITE_PNG_COMPRESSION, 9])

def disk(cx, cy, r, feather):
    yy, xx = np.mgrid[0:H, 0:W]
    d = np.hypot(xx - cx, yy - cy)
    return np.clip((r - d) / feather + 0.5, 0, 1)

meta = {}
# ---------------------------------------------------------------- right page
R = clean_levels(cv2.imread(f'{D}/right_clean.png'), ghost_box=(0, 0, 900, 520))
lum = R.mean(2)
# horizon (pen line) + mountain silhouette
hz = np.argmin(cv2.GaussianBlur(lum[740:830], (1, 9), 0), 0).astype(np.float32) + 740
fitx = np.arange(130, 260); c = np.polyfit(fitx, hz[130:260], 1)
hz[:130] = np.polyval(c, np.arange(130))
hz = cv2.GaussianBlur(hz[None], (1, 41), 0)[0]
mt = []
for x in range(W):
    col = lum[640:830, x]; b = R[640:830, x]
    idx = np.nonzero((col < 0.70) & (b[:, 0] > b[:, 2] - 0.02))[0]
    mt.append(idx[0] + 640 if len(idx) else hz[x])
mt = np.minimum(np.array(mt, np.float32), hz)
from scipy.ndimage import median_filter, minimum_filter1d
mt = median_filter(mt, 25, mode='nearest')
mt = minimum_filter1d(mt, 9)
mt = cv2.GaussianBlur(mt[None], (1, 15), 0)[0]
yy = np.arange(H)[:, None].astype(np.float32)
sea = np.clip((yy - hz[None] - 1) / 3, 0, 1)
land = np.clip((yy - mt[None] + 2) / 4, 0, 1)
depth = np.clip((yy - hz[None]) / (H - hz[None]), 0, 1)
save('right_geo.png', np.dstack([depth, land, sea]))
sys.path.insert(0, os.path.dirname(__file__)); from fill_sky import fill_sky
R = fill_sky(R, land); lum = R.mean(2)
cov = cv2.dilate((lum < 0.95).astype(np.uint8), np.ones((31, 31))).astype(np.float32)
cov = cv2.GaussianBlur(cov, (0, 0), 14)
cv2.imwrite(f'{OUT}/right_cover.png', (cov * 255).astype(np.uint8))  # bgr -> r=sea g=land b=depth

# sun: lift it out, refill with glow hatching (tone from inpaint, grain from a neighbour)
SX, SY, RX, RY = 455, 590, 56, 46
yy2, xx2 = np.mgrid[0:H, 0:W]
ell = lambda rx, ry: np.hypot((xx2 - SX) / rx, (yy2 - SY) / ry)
alpha = np.clip((1 - ell(RX, RY)) * 7, 0, 1)
hole = np.clip((1 - ell(RX + 6, RY + 6)) * 5, 0, 1)
u8 = (R * 255).astype(np.uint8)
tone = cv2.inpaint(u8, (ell(RX + 4, RY + 4) < 1).astype(np.uint8) * 255, 15, cv2.INPAINT_TELEA).astype(np.float32) / 255
tone = cv2.GaussianBlur(tone, (0, 0), 6)
nb = np.roll(R, 130, axis=1)
grain = nb - cv2.GaussianBlur(nb, (0, 0), 6)
fill = np.clip(tone + grain * 1.5, 0, 1)
base = R * (1 - hole[..., None]) + fill * hole[..., None]
save('right_base.webp', base)
pad = RX + 8
crop = lambda img: img[SY - pad:SY + pad, SX - pad:SX + pad]
save('sun.png', crop(R), crop(alpha))
meta['right'] = dict(sun=[SX, SY, pad], horizon=[round(float(v),1) for v in hz[::10]])

# ---------------------------------------------------------------- left page
L = clean_levels(cv2.imread(f'{D}/left_clean.png'))
lum = L.mean(2)
dark = (1 - L.min(2))
items = {   # x0,y0,x1,y1 boxes (page px)
  'melon':   (70, 300, 318, 545),
  'cherry':  (272, 255, 405, 412),
  'popsicle':(470, 374, 790, 632),
  'eclair':  (190, 585, 650, 797),
  'lbl_melon':   (95, 160, 505, 232),
  'lbl_bracket': (70, 245, 120, 390),
  'lbl_cherry':  (392, 240, 605, 352),
  'lbl_pop':     (600, 288, 845, 405),
  'lbl_eclair':  (270, 790, 645, 868),
}
ink_mask = (dark > 0.10).astype(np.uint8)
claimed = np.zeros((H, W), np.float32)
base = L.copy()
sprites = {}
for name, (x0, y0, x1, y1) in items.items():
    m = np.zeros((H, W), np.uint8)
    m[y0:y1, x0:x1] = ink_mask[y0:y1, x0:x1]
    if name == 'cherry':     # leave the label leader line out of the cherry
        m[y0:y1, 404:x1] = 0; m[284:y1, 393:x1] = 0
        m[388:, :300] = 0
    if name == 'lbl_cherry':
        m[y0:y1, x0:401] = ink_mask[y0:y1, x0:401] * 0
        m[255:352, 405:440] = ink_mask[255:352, 405:440]; m[284:352, 393:405] = ink_mask[284:352, 393:405]
    k = 9 if name.startswith('lbl') else 15
    if name == 'melon': m[:405, :106] = 0; m[:388, 256:] = 0
    if name == 'popsicle': m[:412, 696:] = 0
    if name == 'lbl_pop': m[378:, :696] = 0
    if name == 'eclair': m[:628, 505:] = 0; m[776:, 340:] = 0
    if not name.startswith('lbl'): k = 21
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((k, k)))
    if not name.startswith('lbl'):   # fill interior holes
        inv = (1 - m).astype(np.uint8); ff = inv.copy()
        cv2.floodFill(ff, None, (0, 0), 2)
        m = np.where(ff == 1, 1, m).astype(np.uint8)
        n_, lab_, st_, _ = cv2.connectedComponentsWithStats(m)
        m = np.isin(lab_, [i for i in range(1, n_) if st_[i, 4] > 150]).astype(np.uint8)
    m = cv2.dilate(m, np.ones((5, 5)))
    soft = cv2.GaussianBlur(m.astype(np.float32), (7, 7), 0)
    sprites[name] = ((x0 - 6, y0 - 6, x1 + 6, y1 + 6), soft)
    claimed = np.maximum(claimed, cv2.dilate(m, np.ones((9, 9))).astype(np.float32))

# keep cherry pixels out of the melon sprite
_, cs = sprites['cherry']; mb, ms = sprites['melon']
sprites['melon'] = (mb, ms * (1 - np.clip(cv2.dilate(cs, np.ones((5, 5))), 0, 1)))
# per-cube split for the watermelon (they touch, so split by hand-drawn regions)
polys = [
  [(150, 300), (250, 300), (246, 360), (214, 392), (190, 386), (150, 392)],          # top
  [(60, 420), (110, 410), (190, 388), (214, 394), (228, 440), (234, 505), (220, 520), (120, 550), (60, 545)],  # big
  [(228, 430), (280, 388), (325, 430), (325, 515), (285, 525), (226, 512)],          # right
]
seed = np.zeros((H, W), np.int32)
for i, pg in enumerate(polys): cv2.fillPoly(seed, [np.int32(pg)], i + 1)
(_, soft) = sprites['melon']
from scipy.ndimage import distance_transform_edt
_, (iy, ix) = distance_transform_edt(seed == 0, return_indices=True)
lab = seed[iy, ix] * (soft > 0.01)
cubes = []
for i in range(1, len(polys) + 1):
    ys, xs = np.nonzero(lab == i)
    cubes.append((xs.min(), ys.min(), xs.max(), ys.max(), i))
# base: paint treats out, refill with the surrounding wash
keep = 1 - np.clip(cv2.GaussianBlur(claimed, (0, 0), 3) * 1.5, 0, 1)
num = cv2.GaussianBlur(L * keep[..., None], (0, 0), 18)
den = cv2.GaussianBlur(keep, (0, 0), 18)[..., None]
wash = num / np.maximum(den, 1e-3)
conf = np.clip((den - 0.15) / 0.35, 0, 1)
wash = 1 - (1 - np.clip(wash, 0, 1)) * 0.8 * conf
# give the filled holes the scan's paper tooth, borrowed from blank paper lower down
blank = L[930:1230]                     # an empty band of the page
nb = np.vstack([blank] * (H // 300 + 1))[:H]
tooth = np.clip(nb - cv2.GaussianBlur(nb, (0, 0), 4), -0.025, 0.025)
wash = np.clip(wash + tooth * 0.9, 0, 1)
# no ink may survive inside a lifted-out treat: take the paper's lightest tone nearby
clean = cv2.GaussianBlur(cv2.dilate(L, np.ones((17, 17))), (0, 0), 6)
hole = (1 - keep)[..., None]
wash = np.minimum(np.maximum(wash, clean - 0.04), 1)
fill = L * keep[..., None] + wash * hole
save('left_base.webp', fill)

meta['left'] = {}
def emit(name, box, alpha):
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0 = max(x0, 0), max(y0, 0)
    save(f'{name}.png', L[y0:y1, x0:x1], alpha[y0:y1, x0:x1])
    meta['left'][name] = [x0, y0, x1 - x0, y1 - y0]
for name, (box, soft) in sprites.items():
    if name == 'melon':
        for j, (a0, b0, a1, b1, i) in enumerate(cubes):
            al = soft * (lab == i)
            emit(f'melon{j}', (a0 - 4, b0 - 4, a1 + 5, b1 + 5), al)
    else:
        emit(name, box, soft)
json.dump(meta, open(f'{OUT}/meta.json', 'w'), indent=1)
print(json.dumps(meta))
