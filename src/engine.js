/* ======================================================= more sounds */
Object.assign(Sound, {
  meow() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(480, t); o.frequency.linearRampToValueAtTime(640, t + .12); o.frequency.exponentialRampToValueAtTime(420, t + .32);
    f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(1000, t); f.frequency.linearRampToValueAtTime(1500, t + .12); f.frequency.linearRampToValueAtTime(900, t + .32);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.1, t + .04); g.gain.exponentialRampToValueAtTime(.0001, t + .36);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + .4);
  },
  purr(dur = 1.6) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), am = c.createOscillator(), ag = c.createGain();
    s.buffer = this.noise; f.type = 'lowpass'; f.frequency.value = 180;
    am.frequency.value = 26; ag.gain.value = .5; am.connect(ag); ag.connect(g.gain);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.9, t + .3); g.gain.linearRampToValueAtTime(0, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); am.start(t); s.stop(t + dur); am.stop(t + dur);
  },
  sweep(f0, f1, dur, vol, q = 1.2) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .2); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 2); s.stop(t + dur + .05);
  },
  scribble(dur) {          // pencil on paper: bright noise in quick back-and-forth strokes
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = 3800; f.Q.value = .7;
    g.gain.setValueAtTime(0, t);
    for (let k = 0; k < dur * 9; k++) { const a = t + k / 9; g.gain.linearRampToValueAtTime(.32 + Math.random() * .2, a + .03); g.gain.linearRampToValueAtTime(.04, a + .1); }
    g.gain.linearRampToValueAtTime(0, t + dur + .05);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 2); s.stop(t + dur + .1);
  },
  slurp() { this.sweep(700, 2600, .35, .5, 4); [80, 170, 260].forEach((d) => setTimeout(() => this.blip(500 + Math.random() * 400, 300, .06, .08), d)); },
  pour() { this.sweep(300, 1400, 1.1, .45, .8); },
  whoosh() { this.sweep(260, 1800, .32, .5, .9); },
  clink() { this.blip(2600, 2500, .35, .12); this.blip(3900, 3800, .25, .05); },
  ting() { this.blip(1900, 1880, .5, .1); this.blip(2850, 2830, .35, .05); },
  splash() { this.hiss(1100, .7, .5, .6); this.plop(.8); },
  chime() { [1320, 1760, 2093].forEach((f, i) => setTimeout(() => this.blip(f, f, .4, .06), i * 70)); },
  jingle() { [2400, 3100, 2700].forEach((f, i) => setTimeout(() => this.blip(f, f * .98, .18, .05), i * 55)); },
  click() { this.blip(1400, 900, .03, .15, 'square'); },
  thump() { this.blip(120, 60, .18, .3, 'triangle'); this.hiss(400, 1, .12, .3); },
  page() { this.sweep(400, 2400, .55, .35, .5); setTimeout(() => this.sweep(1800, 700, .35, .2, .6), 260); },
});

/* ======================================================= pen + pencil helpers */
function penPath(x, path, seed, scale, alpha, taper = true) {
  const n = path.length; if (n < 2) return;
  const L = [], R = [];
  for (let i = 0; i < n; i++) {
    const p = path[i], q = path[Math.min(n - 1, i + 1)], o = path[Math.max(0, i - 1)];
    let tx = q[0] - o[0], ty = q[1] - o[1]; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const t = i / (n - 1);
    const w = 1.5 * scale * (taper ? (.35 + .65 * Math.pow(Math.sin(Math.PI * t), .45)) : 1) * (1 + .12 * Math.sin(t * 9 + seed));
    const wob = Math.sin(t * 7.3 + seed * 3.1) * .3 * scale;
    L.push([p[0] - ty * (w + wob), p[1] + tx * (w + wob)]); R.push([p[0] + ty * (w - wob), p[1] - tx * (w - wob)]);
  }
  x.beginPath(); L.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
  for (let i = n - 1; i >= 0; i--) x.lineTo(R[i][0], R[i][1]);
  x.closePath(); x.fillStyle = `rgba(${PEN}, ${.88 * alpha})`; x.fill();
  x.lineWidth = 1.1; x.strokeStyle = `rgba(${PEN}, ${.16 * alpha})`; x.stroke();
}
const arcPts = (cx, cy, rx, ry, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const ease = (t) => (t = clamp(t, 0, 1), t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
function spline(pts, seg = 8) {            // Catmull-Rom through points
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(i - 1, 0)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(i + 2, pts.length - 1)];
    for (let k = 0; k < seg; k++) {
      const t = k / seg, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((j) => .5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3)));
    }
  }
  out.push(pts[pts.length - 1]); return out;
}

/* the artist's pencil hatching (from the sunset page), as stroke density 0..255 */
let HATCH = null, GLOW_TEX = null;
function setHatch(img) {
  if (HATCH) return;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  HATCH = { w: c.width, h: c.height, d: new Uint8Array(c.width * c.height) };
  for (let i = 0; i < HATCH.d.length; i++) HATCH.d[i] = d.data[i * 4];
  for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i]; d.data[i] = 250; d.data[i + 1] = 214; d.data[i + 2] = 96; d.data[i + 3] = a; }
  x.putImageData(d, 0, 0); GLOW_TEX = c;
}
const hatchAt = (X, Y) => HATCH.d[(((Y | 0) % HATCH.h + HATCH.h) % HATCH.h) * HATCH.w + (((X | 0) % HATCH.w + HATCH.w) % HATCH.w)] / 255;
function colorAt(spec, X, Y) {
  if (spec === 'confetti') {                       // a different pencil for every figure in the crowd
    const pal = [[214, 96, 90], [96, 140, 196], [232, 190, 84], [120, 170, 120], [196, 128, 186], [234, 150, 96]];
    return pal[Math.abs(Math.floor(X / 23 + Math.sin(X * .013) * 1.7)) % pal.length];
  }
  if (!Array.isArray(spec[0])) return spec;
  if (Y <= spec[0][0]) return spec[0][1];
  for (let i = 1; i < spec.length; i++) if (Y <= spec[i][0]) { const t = (Y - spec[i - 1][0]) / (spec[i][0] - spec[i - 1][0]); return spec[i - 1][1].map((v, j) => v + (spec[i][1][j] - v) * t); }
  return spec[spec.length - 1][1];
}
function canvasOf(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
/* colour a drawing in with pencil, the way the artist does: hatching multiplied under the ink */
function pencilColor(src, it, spec, strength = .82) {
  const c = canvasOf(src.width, src.height), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  if (!spec) return c;
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  for (let y = 0, i = 0; y < c.height; y++) for (let X = 0; X < c.width; X++, i += 4) {
    if (p[i + 3] < 8) continue;
    const cm = it.cm ? it.cm[i >> 2] / 255 : 1; if (cm < .02) continue;
    const hd = cm * (.3 + .7 * hatchAt(X + it.x + (y + it.y) * .2, y + it.y)), col = colorAt(spec, X + it.x, y + it.y);
    for (let k = 0; k < 3; k++) p[i + k] *= 1 - hd * strength * (1 - col[k] / 255);
  }
  x.putImageData(d, 0, 0); return c;
}
function hueShift(src, deg) {
  const c = canvasOf(src.width, src.height), x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(src, 0, 0);
  if (!deg) return c;
  const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
  const cs = Math.cos(deg * Math.PI / 180), sn = Math.sin(deg * Math.PI / 180);
  // rotate around the grey axis (keeps the pencil's lightness, so ink stays ink)
  const m = [
    .299 + .701 * cs + .168 * sn, .587 - .587 * cs + .330 * sn, .114 - .114 * cs - .497 * sn,
    .299 - .299 * cs - .328 * sn, .587 + .413 * cs + .035 * sn, .114 - .114 * cs + .292 * sn,
    .299 - .300 * cs + 1.25 * sn, .587 - .588 * cs - 1.05 * sn, .114 + .886 * cs - .203 * sn];
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], g = p[i + 1], b = p[i + 2];
    p[i] = m[0] * r + m[1] * g + m[2] * b; p[i + 1] = m[3] * r + m[4] * g + m[5] * b; p[i + 2] = m[6] * r + m[7] * g + m[8] * b;
  }
  x.putImageData(d, 0, 0); return c;
}
/* the order a hand lays pencil strokes: diagonal bands, back and forth */
function strokeOrder(w, h) {
  const a = -.62, ca = Math.cos(a), sa = Math.sin(a), band = 15;
  const o = new Float32Array(w * h);
  let pmin = 1e9, pmax = -1e9, amin = 1e9, amax = -1e9;
  for (const [X, Y] of [[0, 0], [w, 0], [0, h], [w, h]]) { const al = X * ca + Y * sa, pe = -X * sa + Y * ca; pmin = Math.min(pmin, pe); pmax = Math.max(pmax, pe); amin = Math.min(amin, al); amax = Math.max(amax, al); }
  const nb = Math.ceil((pmax - pmin) / band), jit = Array.from({ length: nb + 1 }, () => Math.random());
  for (let Y = 0, i = 0; Y < h; Y++) for (let X = 0; X < w; X++, i++) {
    const pe = -X * sa + Y * ca, al = X * ca + Y * sa;
    const b = Math.floor((pe - pmin) / band);
    let f = (al - amin) / (amax - amin); if (b & 1) f = 1 - f;
    o[i] = (b + f * .8 + jit[b] * .15) / nb;
  }
  return { o, nb };
}
function letterSegments(alpha, w, h) {
  const col = new Float32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x] > 60) col[x]++;
  const segs = []; let s0 = -1, gap = 0;
  for (let x = 0; x <= w; x++) {
    const on = x < w && col[x] > 0;
    if (on) { if (s0 < 0) s0 = x; gap = 0; } else if (s0 >= 0 && ++gap >= 3) { segs.push([s0, x - gap + 1]); s0 = -1; }
  }
  if (s0 >= 0) segs.push([s0, w]);
  return segs.reduce((a, sg) => { const l = a[a.length - 1]; if (l && (sg[1] - sg[0] < 6 || sg[0] - l[1] < 2)) l[1] = sg[1]; else a.push(sg); return a; }, []);
}
function setImg(it, c) { it.img = c; it.ctx = c.getContext('2d', { willReadFrequently: true }); it.alpha = alphaOf(c); }
function editable(it) { setImg(it, pencilColor(it.orig, it, null)); it.area0 = it.alpha.reduce((n, a) => n + (a > 50), 0); }
function areaLeft(it) { return it.alpha.reduce((n, a) => n + (a > 50), 0) / Math.max(1, it.area0); }
function meanColor(data, mask) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) if (mask[i + 3] > 128 && data[i + 3] > 200) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [230, 220, 200];
}
function meanColorOf(ctx) {
  if (!ctx) return [230, 220, 200];
  const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 64) if (d[i + 3] > 200 && d[i] + d[i + 1] + d[i + 2] < 700) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return n ? [r / n | 0, g / n | 0, b / n | 0] : [230, 220, 200];
}
