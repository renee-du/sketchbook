"""A field of the artist's own yellow pencil hatching (from the sunset page), as stroke density.
Used to colour in lamp light so it looks pencilled, not airbrushed."""
import cv2, numpy as np, sys, os
sys.path.insert(0, os.path.dirname(__file__))
from fill_sky import quilt
R = cv2.imread(sys.argv[1]).astype(np.float32) / 255
P = 1 - R
src = P[520:640, 40:400, 0]                       # yellow strokes absorb blue
d = np.clip(src / np.percentile(src, 97), 0, 1.2).astype(np.float32)
D = quilt(d, 560, 560, np.random.default_rng(5), ph=110, pw=200)
D = np.clip(0.25 + 0.75 * D, 0, 1)
cv2.imwrite(sys.argv[2], (D * 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 85])
