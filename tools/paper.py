"""Tileable paper grain (multiplied over the paper colour in CSS)."""
import numpy as np, cv2, sys
N = 512; rng = np.random.default_rng(7)
def fnoise(power):
    f = np.fft.fft2(rng.standard_normal((N, N)))
    ky, kx = np.meshgrid(np.fft.fftfreq(N), np.fft.fftfreq(N), indexing='ij')
    k = np.hypot(kx, ky); k[0, 0] = 1
    n = np.real(np.fft.ifft2(f / k ** power)); return (n - n.mean()) / n.std()
tooth = fnoise(0.35)            # fine tooth
cloud = fnoise(1.4)             # soft mottling
img = 1 - 0.022 * np.clip(tooth, -3, 3) - 0.012 * cloud
fib = np.zeros((N, N), np.float32)
for _ in range(260):            # faint fibres
    x, y = rng.uniform(0, N, 2); a = rng.uniform(0, np.pi); L = rng.uniform(8, 40)
    pts = [(x, y)]
    for i in range(6):
        a += rng.normal(0, 0.25); x += np.cos(a) * L / 6; y += np.sin(a) * L / 6; pts.append((x, y))
    for ox in (-N, 0, N):
        for oy in (-N, 0, N):
            cv2.polylines(fib, [np.int32([(px + ox, py + oy) for px, py in pts])], False, rng.uniform(0.3, 1), 1, cv2.LINE_AA)
img -= 0.035 * cv2.GaussianBlur(fib, (3, 3), 0)
img = img - img.max() + 1
img = np.clip(1 - (1 - img) * (0.03 / (1 - img.mean())), 0, 1)
cv2.imwrite(sys.argv[1], (img * 255).astype(np.uint8), [cv2.IMWRITE_WEBP_QUALITY, 80])
print(img.min(), img.mean())
