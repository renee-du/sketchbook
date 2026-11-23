"""Colour in the bare paper of the sky using the artist's own hatching.

Patches of the densest blue strokes (top-left of the sky) and of the yellow glow
are quilted across the sky, then layered under the original strokes (per-channel
max of pigment), so every original mark stays exactly where it was."""
import cv2, numpy as np

def quilt(src, H, W, rng, ph=150, pw=190, feather=28):
    sh, sw = src.shape
    out = np.zeros((H, W), np.float32)
    yy, xx = np.mgrid[0:ph, 0:pw]
    edge = np.minimum.reduce([yy, xx, ph - 1 - yy, pw - 1 - xx]).astype(np.float32)
    a = np.clip(edge / feather, 0, 1); a = a * a * (3 - 2 * a)
    for y in range(-ph // 2, H, ph // 2 + 10):
        for x in range(-pw // 2, W, pw // 2 + 10):
            y0 = y + rng.integers(-15, 16); x0 = x + rng.integers(-20, 21)
            sy = rng.integers(0, sh - ph); sx = rng.integers(0, sw - pw)
            patch = src[sy:sy + ph, sx:sx + pw]
            ys, xs = max(y0, 0), max(x0, 0)
            ye, xe = min(y0 + ph, H), min(x0 + pw, W)
            if ye <= ys or xe <= xs: continue
            pa = a[ys - y0:ye - y0, xs - x0:xe - x0]
            out[ys:ye, xs:xe] = out[ys:ye, xs:xe] * (1 - pa) + patch[ys - y0:ye - y0, xs - x0:xe - x0] * pa
    return out

def fill_sky(R, land, seed=3):
    """R: float BGR ink in 0..1 (paper = 1); land: 0..1 mask of mountains+sea."""
    H, W = R.shape[:2]
    rng = np.random.default_rng(seed)
    P = 1 - R                                    # pigment (BGR)
    # blue: strokes absorb red the most
    bsrc = P[40:260, 0:340]
    dens_b = bsrc[..., 2] / np.percentile(bsrc[..., 2], 97)
    strong = dens_b > .6
    absorb_b = bsrc[strong].mean(0) / bsrc[strong][:, 2].mean()          # normalised so red=1
    # yellow glow: strokes absorb blue
    ysrc = P[520:640, 40:400]
    dens_y = ysrc[..., 0] / np.percentile(ysrc[..., 0], 97)
    absorb_y = ysrc[dens_y > .6].mean(0) / ysrc[dens_y > .6][:, 0].mean()  # normalised so blue=1
    Db0 = quilt(np.clip(dens_b, 0, 1.3).astype(np.float32), H, W, rng)
    Dy0 = quilt(np.clip(dens_y, 0, 1.3).astype(np.float32), H, W, rng, ph=110, pw=200)
    # burnished: gaps between strokes take a light layer of colour too
    Db = 0.42 + 0.58 * Db0
    Dy = 0.40 + 0.60 * Dy0
    y = np.arange(H, dtype=np.float32)[:, None]
    ss = lambda a, b, v: np.clip((v - a) / (b - a), 0, 1) ** 2 * (3 - 2 * np.clip((v - a) / (b - a), 0, 1))
    blue_amt = (0.25 - 0.06 * ss(120, 400, y)) * (1 - ss(370, 520, y))
    yel_amt = 0.42 * ss(400, 560, y) * (1 - 0.8 * ss(590, 680, y))
    sky = (1 - land) * ss(2, 14, y) * np.ones((1, W), np.float32)
    x = np.arange(W, dtype=np.float32)[None]
    sky *= ss(0, 8, x) * (1 - ss(884, 896, x))
    Pb = (Db * blue_amt * sky)[..., None] * absorb_b[None, None]
    Py = (Dy * yel_amt * sky)[..., None] * absorb_y[None, None]
    Pfill = np.maximum(Pb, Py)
    return np.clip(1 - np.maximum(P, Pfill), 0, 1)
