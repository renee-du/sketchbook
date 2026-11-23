"""Flatten the two sketchbook pages out of the source photo."""
import cv2, numpy as np, sys, os
SRC = sys.argv[1]; OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
im = cv2.imread(SRC)
W, H = 900, 1300
pages = {
  'left':  [(467,302),(1341,382),(1357,1597),(437,1622)],
  'right': [(1345,382),(2202,340),(2250,1607),(1360,1598)],
}
for name, q in pages.items():
    M = cv2.getPerspectiveTransform(np.float32(q), np.float32([(0,0),(W,0),(W,H),(0,H)]))
    cv2.imwrite(f'{OUT}/{name}_raw.png', cv2.warpPerspective(im, M, (W,H), flags=cv2.INTER_CUBIC))
