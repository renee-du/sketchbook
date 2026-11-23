"""Remove the fingers and gutter/edge artifacts from the flattened ink layers."""
import cv2, numpy as np, sys
D = sys.argv[1]
def skin(img, box):
    x0, y0, x1, y1 = box
    m = np.zeros(img.shape[:2], np.uint8)
    roi = img[y0:y1, x0:x1].astype(int)
    b, g, r = roi[..., 0], roi[..., 1], roi[..., 2]
    m[y0:y1, x0:x1] = ((r - b > 18) & (r < 250) | (r + g + b < 520)).astype(np.uint8) * 255
    m = cv2.morphologyEx(m, cv2.MORPH_CLOSE, np.ones((15, 15)))
    n, lab, st, _ = cv2.connectedComponentsWithStats(m)
    keep = np.zeros_like(m)
    for i in range(1, n):
        if st[i, 4] > 3000: keep[lab == i] = 255
    keep = cv2.dilate(keep, np.ones((25, 25)))
    return keep
L = cv2.imread(f'{D}/left_ink.png'); R = cv2.imread(f'{D}/right_ink.png')
# left: paper only around the finger -> white
mL = skin(L, (700, 1100, 900, 1300))
f = cv2.GaussianBlur(mL, (31, 31), 0)[..., None] / 255.
L = (L * (1 - f) + 255 * f).astype(np.uint8)
# right: clone hatching from the neighbouring strip
mR = skin(R, (0, 1150, 220, 1300))
f = cv2.GaussianBlur(mR, (31, 31), 0)[..., None] / 255.
src = np.roll(R, -170, axis=1)
R = (R * (1 - f) + src * f).astype(np.uint8)
cv2.imwrite(f'{D}/fmask.png', np.hstack([mL, mR]))
# trim edges (photo shadow at bottom, stitches at gutter), back to 900x1300
L = cv2.resize(L[6:1286, 6:880], (900, 1300), interpolation=cv2.INTER_AREA)
R = cv2.resize(R[6:1286, 12:892], (900, 1300), interpolation=cv2.INTER_AREA)
cv2.imwrite(f'{D}/left_clean.png', L); cv2.imwrite(f'{D}/right_clean.png', R)
