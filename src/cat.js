/* ======================================================= a living cat, drawn in the artist's pen
   Faces left by default. Local units: page px at depth-scale 1, origin on the ground under the body. */
function ik2(a, b, L1, L2, bendSign) {      // two-bone IK: joint between a and b
  const dx = b[0] - a[0], dy = b[1] - a[1];
  let d = Math.hypot(dx, dy); const dd = Math.min(d, L1 + L2 - .01);
  const ang = Math.atan2(dy, dx), k = Math.acos(clamp((L1 * L1 + dd * dd - L2 * L2) / (2 * L1 * dd), -1, 1));
  const j = ang + bendSign * k;
  return [a[0] + Math.cos(j) * L1, a[1] + Math.sin(j) * L1];
}
const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
const add2 = (p, q, s = 1) => [p[0] + q[0] * s, p[1] + q[1] * s];

class Cat {
  constructor(x, y) {
    this.x = x; this.y = y; this.face = 1;   // 1 = facing left (as drawn), -1 = facing right
    this.turn = 1; this.sit = 0; this.sitTo = 0; this.speed = 0; this.phase = 0;
    this.target = null; this.idle = 0; this.blink = 0; this.nextBlink = 2; this.slowBlink = -1;
    this.earT = [-9, -9]; this.nextEar = 3; this.look = [0, 0]; this.lookTo = [0, 0];
    this.tailFlick = 0; this.t = 0; this.purrT = -9; this.stretch = 0;
    this.c = canvasOf(2, 2); this.x2 = this.c.getContext('2d');
    this.seed = 3.7;
    // fixed tabby markings
    const r = (i) => (Math.sin(i * 12.9898) * 43758.5453) % 1;
    this.stripes = Array.from({ length: 8 }, (_, i) => ({ s: .1 + i * .12 + r(i) * .04, len: 18 + Math.abs(r(i + 9)) * 24, off: Math.abs(r(i + 5)) * 10, lean: (r(i + 3)) * 8, gap: Math.abs(r(i + 7)) > .5 }));
  }
  get scale() { return .6 + clamp((this.y - 940) / 320, 0, 1) * .44; }
  contains(px, py) {
    const s = this.scale, lx = (px - this.x) / s * this.face, ly = (py - this.y) / s;
    return lx > -165 && lx < 130 && ly > -175 && ly < 8;
  }
  walkTo(x, y) {
    this.target = [clamp(x, 70, 830), clamp(y, 945, 1262)];
    this.sitTo = 0; this.idle = 0;
  }
  pet() { this.slowBlink = 0; this.purrT = this.t; this.tailFlick = 1; Sound.purr(1.8); if (this.sit < .5 && !this.target) this.sitTo = 1; }
  update(t, dt, pointer) {
    this.t = t;
    const wantWalk = this.target && this.sit < .08;
    if (this.target) {
      const dx = this.target[0] - this.x, dy = this.target[1] - this.y, d = Math.hypot(dx, dy);
      const dir = dx < -2 ? 1 : dx > 2 ? -1 : this.face;
      if (dir !== this.face && Math.abs(dx) > 18) this.face = dir;
      if (wantWalk) {
        const s = this.scale, vmax = 92 * s;
        this.speed = Math.min(vmax, this.speed + dt * 160 * s, d * 2.2 + 8 * s);
        if (d < 3) { this.target = null; this.idle = 0; if (Math.random() < .5) setTimeout(() => Sound.meow(), 300); }
        else { this.x += dx / d * this.speed * dt; this.y += dy / d * this.speed * dt; }
      }
    } else this.speed = Math.max(0, this.speed - dt * 220);
    this.phase += this.speed * dt / (58 * this.scale);
    this.turn += (this.face - this.turn) * (1 - Math.exp(-dt * 9));
    if (!this.target) { this.idle += dt; if (this.idle > 7 && this.sitTo === 0) this.sitTo = 1; }
    this.sit += (this.sitTo - this.sit) * (1 - Math.exp(-dt * (this.sitTo ? 2.6 : 4.5)));
    // eyes, ears, gaze
    this.nextBlink -= dt; if (this.nextBlink < 0) { this.nextBlink = 2.5 + Math.random() * 4; this.blink = 1; }
    this.blink = Math.max(0, this.blink - dt * 7);
    if (this.slowBlink >= 0) { this.slowBlink += dt; if (this.slowBlink > 1.6) this.slowBlink = -1; }
    this.nextEar -= dt; if (this.nextEar < 0) { this.nextEar = 3 + Math.random() * 6; this.earT[Math.random() < .5 ? 0 : 1] = t; }
    if (pointer && !this.target) {
      const s = this.scale, hx = this.x - 120 * s * this.face, hy = this.y - 130 * s;
      this.lookTo = [clamp((pointer.x - hx) * this.face * -1 / 260, -1, 1), clamp((pointer.y - hy) / 300, -.7, .7)];
    } else this.lookTo = [Math.sin(t * .23) * .25, Math.sin(t * .31) * .12];
    for (let i = 0; i < 2; i++) this.look[i] += (this.lookTo[i] - this.look[i]) * (1 - Math.exp(-dt * 4));
    this.tailFlick = Math.max(0, this.tailFlick - dt * .7);
  }
  eyeOpen() {
    let o = 1 - Math.sin(Math.min(1, this.blink) * Math.PI) * .95;
    if (this.slowBlink >= 0) { const u = this.slowBlink; o = Math.min(o, u < .35 ? 1 - u / .35 : u < .75 ? .05 : .05 + (u - .75) / .85 * .95); }
    return o;
  }
  /* --------------------------------------------------------------- pose */
  pose() {
    const t = this.t, sit = ease(this.sit), walk = clamp(this.speed / (60 * this.scale), 0, 1);
    const breath = Math.sin(t * 2.1) * (1 + sit * .4);
    const bob = walk * Math.sin(this.phase * Math.PI * 4) * 2.2;
    const S = lerp2([-60, -106 + bob - breath * .5], [-46, -122 - breath * .5], sit);
    const Hp = lerp2([58, -104 + bob * .6], [38, -32], sit);
    const legs = {};
    const stride = 50, lift = 15;
    const gait = (off, home) => {
      const q = ((this.phase + off) % 1 + 1) % 1, duty = .6;
      let fx, fy;
      if (q < duty) { fx = home + stride * (.5 - q / duty); fy = 0; }
      else { const r = (q - duty) / (1 - duty); fx = home + stride * (-.5 + ease(r)); fy = -lift * Math.sin(Math.PI * r); }
      return [lerp(home, fx, walk), fy * walk];
    };
    // feet: far side first (L), near side (R)
    legs.LF = gait(.25, S[0] - 4); legs.RF = gait(.75, S[0] - 12);
    legs.LH = gait(0, Hp[0] + 12); legs.RH = gait(.5, Hp[0] + 4);
    const sitF = { LF: [S[0] - 6, 0], RF: [S[0] - 18, 0], LH: [Hp[0] - 34, 0], RH: [Hp[0] - 46, 0] };
    for (const k in legs) legs[k] = lerp2(legs[k], sitF[k], sit);
    // head
    const hb = -walk * Math.sin(this.phase * Math.PI * 4 + .8) * 1.6;
    const head = add2(lerp2([-58, -44], [-44, -40], sit), S);
    head[0] += this.look[0] * -4; head[1] += this.look[1] * 6 + hb + breath * .3;
    return { S, Hp, legs, head, sit, walk, breath };
  }
  torsoPts(P) {
    const { S, Hp, sit, breath } = P;
    const ux = Hp[0] - S[0], uy = Hp[1] - S[1], L = Math.hypot(ux, uy), u = [ux / L, uy / L], n = [-u[1], u[0]];
    const at = (s, d) => [S[0] + u[0] * s + n[0] * d, S[1] + u[1] * s + n[1] * d];
    const sag = 3 + breath * 1.2;
    return {
      at, L, u, n,
      back: [at(-30, -44), at(2, -47), at(L * .5, -41 + sit * 3), at(L + 6, -45), at(L + 32, -30)],
      rump: [at(L + 32, -30), at(L + 46, -6), at(L + 40, 24 + sit * 6)],
      belly: [at(L + 6, 34), at(L * .55, 42 + sag), at(L * .15, 44 + sag * .6), at(-6, 41)],
      chest: [at(-6, 41), at(-30, 28), at(-44, -2), at(-30, -44)],
    };
  }
  /* --------------------------------------------------------------- drawing */
  limb(x, pts, widths, alpha, near) {
    // a soft tube along the joints, filled with paper, outlined in pen
    const path = spline(pts, 6), n = path.length, Lft = [], Rt = [];
    for (let i = 0; i < n; i++) {
      const p = path[i], q = path[Math.min(n - 1, i + 1)], o = path[Math.max(0, i - 1)];
      let tx = q[0] - o[0], ty = q[1] - o[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l;
      const f = i / (n - 1) * (widths.length - 1), k = Math.min(widths.length - 2, Math.floor(f)), w = lerp(widths[k], widths[k + 1], f - k);
      Lft.push([p[0] - ty * w, p[1] + tx * w]); Rt.push([p[0] + ty * w, p[1] - tx * w]);
    }
    x.beginPath(); [...Lft, ...Rt.slice().reverse()].forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
    x.closePath(); x.fillStyle = PAPER_FILL; x.fill();
    penPath(x, Lft, this.seed + pts[0][0], near ? .95 : .7, alpha);
    penPath(x, Rt, this.seed + 2 + pts[0][1], near ? .9 : .65, alpha);
    const e = path[n - 1], wl = widths[widths.length - 1];      // paw
    const dirx = -1;
    x.beginPath(); x.ellipse(e[0] + dirx * 3, e[1] - 1, wl + 4, wl * .75, 0, 0, Math.PI * 2); x.fillStyle = PAPER_FILL; x.fill();
    penPath(x, arcPts(e[0] + dirx * 3, e[1] - 1, wl + 4, wl * .75, Math.PI * .95, Math.PI * 2.05, 14), this.seed + e[0], near ? .85 : .6, alpha);
    return path;
  }
  legChain(P, key, near) {
    const front = key[1] === 'F', { S, Hp } = P;
    const foot = P.legs[key];
    if (front) {
      const sh = [S[0] + (near ? -2 : 6), S[1] + 14];
      const el = ik2(sh, foot, 52, 54, 1);
      return { pts: [sh, el, foot], w: near ? [18, 11, 8, 7.5] : [14, 9.5, 7, 6.5] };
    }
    const hip = [Hp[0] + (near ? 0 : 8), Hp[1] + 8];
    const sit = P.sit;
    if (sit > .55) {                          // folded under the haunch: only the long hind foot shows
      return { pts: [[foot[0] + 50, foot[1] - 8], [foot[0] + 24, foot[1] - 4], foot], w: near ? [11, 9, 7.5, 7.5] : [9, 8, 6.5, 6.5] };
    }
    const hock = [foot[0] + 20, foot[1] - 36];
    const knee = ik2(hip, hock, 56, 48, -1);
    return { pts: [hip, knee, hock, foot], w: near ? [30, 16, 10, 8, 7.5] : [22, 13, 8.5, 7, 6.5] };
  }
  tail(P) {
    const tp = this.torsoPts(P), base = tp.at(tp.L + 28, -24), t = this.t, sit = ease(P.sit), walk = P.walk;
    const pts = [base]; let a, p = base;
    for (let i = 0; i < 13; i++) {
      const f = i / 12;
      const stand = -1.32 - f * 1.05 * (1 + .1 * Math.sin(t * .7)) + Math.sin(t * 1.4 - i * .42) * .1 * f + walk * Math.sin(this.phase * Math.PI * 2 - i * .5) * .1 * f;
      const sitA = 1.15 + f * f * 2.0 + Math.sin(t * 1.1 - i * .5) * .05 * f;
      a = lerp(stand, sitA, sit) + this.tailFlick * Math.sin(t * 18 - i * .9) * .35 * f * f;
      p = [p[0] + Math.cos(a) * 9.5, Math.min(-2, p[1] + Math.sin(a) * 9.5)];
      pts.push(p);
    }
    return pts;
  }
  draw(ctx, k) {
    const s = this.scale, P = this.pose(), x = this.x2;
    const W = Math.ceil(460 * k * s), H = Math.ceil(330 * k * s);
    if (this.c.width < W || this.c.height < H) { this.c.width = W; this.c.height = H; }
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, this.c.width, this.c.height);
    const flip = this.turn;                  // squeezes through 0 while turning around
    x.setTransform(k * s * flip, 0, 0, k * s, 230 * k * s, 300 * k * s);
    const tp = this.torsoPts(P);
    // far legs, behind the body
    const farA = .55;
    this.limb(x, this.legChain(P, 'LH', false).pts, this.legChain(P, 'LH', false).w, farA, false);
    this.limb(x, this.legChain(P, 'LF', false).pts, this.legChain(P, 'LF', false).w, farA, false);
    // tail behind when sitting
    const tail = this.tail(P);
    for (const key of ['LH', 'LF']) {}
    const drawTail = () => {
      const widths = tail.map((_, i) => lerp(10, 3.6, Math.pow(i / (tail.length - 1), .8)));
      const Lft = [], Rt = [];
      tail.forEach((p, i) => { const q = tail[Math.min(tail.length - 1, i + 1)], o = tail[Math.max(0, i - 1)]; let tx = q[0] - o[0], ty = q[1] - o[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; Lft.push([p[0] - ty * widths[i], p[1] + tx * widths[i]]); Rt.push([p[0] + ty * widths[i], p[1] - tx * widths[i]]); });
      const tip = tail[tail.length - 1];
      x.beginPath(); [...Lft, ...arcPts(tip[0], tip[1], 3.2, 3.2, 0, Math.PI, 6), ...Rt.slice().reverse()].forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
      x.fillStyle = PAPER_FILL; x.fill();
      penPath(x, spline(Lft, 3), 7, .9, 1); penPath(x, spline(Rt, 3), 9, .85, 1);
      penPath(x, arcPts(tip[0], tip[1], 3.4, 3.4, 0, Math.PI * 2, 8), 5, .6, 1, false);
      for (let i = 2; i < tail.length - 1; i += 2) penPath(x, [Lft[i], lerp2(Lft[i], Rt[i], .5), lerp2(Lft[i], Rt[i], .85)], i, .55, .9);
    };
    if (P.sit > .5) drawTail();
    // body
    const outline = [...tp.back, ...tp.rump.slice(1), ...tp.belly, ...tp.chest.slice(1)];
    x.beginPath(); spline(outline, 6).forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
    x.fillStyle = PAPER_FILL; x.fill();
    penPath(x, spline(tp.back, 8), 1, 1.05, 1);
    penPath(x, spline(tp.rump, 6), 2, 1, 1);
    penPath(x, spline(tp.belly, 7), 3, .7, .8);
    penPath(x, spline([tp.chest[0], tp.chest[1], tp.chest[2]], 6), 4, .85, 1);
    // fur: quick pen flicks along the chest, belly and haunch, like the sketch
    for (let i = 0; i < 6; i++) { const p = tp.at(-38 + i * 5, -4 + i * 8); penPath(x, [p, [p[0] - 8, p[1] + 4]], i, .5, .85); }
    for (let i = 0; i < 7; i++) { const p = tp.at(tp.L * (.12 + i * .12), 42 + Math.sin(i * 2.3) * 2); penPath(x, [p, [p[0] + 3, p[1] + 6]], i + 20, .42, .75); }
    for (let i = 0; i < 5; i++) { const p = tp.at(tp.L + 10 + i * 5, -10 + i * 6); penPath(x, [p, [p[0] - 9, p[1] + 4]], i + 30, .45, .8); }
    // shoulder blade + haunch contours
    penPath(x, spline([tp.at(-8, -40), tp.at(6, -16), tp.at(0, 14)], 5), 41, .6, .7);
    penPath(x, spline([tp.at(tp.L - 22, -30), tp.at(tp.L + 4, -6), tp.at(tp.L + 2, 22)], 5), 42, .7, .8 * (1 - P.sit));
    // tabby stripes down the flank, following the body
    for (const st of this.stripes) {
      const s0 = tp.L * st.s, a = tp.at(s0, -45 + st.off * .2), b = tp.at(s0 + 6 + st.lean * .5, -45 + st.len * .6), c = tp.at(s0 + st.lean, -45 + st.len);
      penPath(x, spline([a, b, c], 5), st.s * 30, .8, .9);
      if (st.gap) { const d = tp.at(s0 + st.lean + 2, -45 + st.len + 8), e = tp.at(s0 + st.lean - 1, -45 + st.len + 18); penPath(x, [d, e], st.s * 40, .6, .8); }
    }
    // near legs
    for (const key of ['RH', 'RF']) {
      const L = this.legChain(P, key, true); this.limb(x, L.pts, L.w, 1, true);
      for (const f of [.45, .62]) { const p = spline(L.pts, 6), q = p[Math.floor(f * (p.length - 1))]; penPath(x, [[q[0] - 5, q[1] - 2], [q[0] + 5, q[1] + 1]], f * 9, .5, .8); }
    }
    // haunch line when sitting
    if (P.sit > .05) penPath(x, arcPts(P.Hp[0] - 2, P.Hp[1] + 4, 36, 28, Math.PI * .95, Math.PI * 1.75, 16), 6, .9, P.sit);
    if (P.sit <= .5) drawTail();
    // throat: joins the chin to the chest
    { const [hx, hy] = P.head; penPath(x, spline([[hx + 2, hy + 22], tp.at(-46, -12), tp.at(-42, 8)], 5), 51, .7, .85); }
    this.drawHead(x, P);
    ctx.drawImage(this.c, 0, 0, W, H, this.x - 230 * s, this.y - 300 * s, W / k, H / k);
  }
  drawHead(x, P) {
    const [hx, hy] = P.head, t = this.t;
    x.save(); x.translate(hx, hy); x.scale(1.16, 1.16); x.rotate(this.look[1] * .18 - .04 + Math.sin(t * .5) * .02);
    const yaw = this.look[0];                          // features slide toward where it looks
    const ear = (base1, base2, tip, i, near) => {
      const tw = t - this.earT[i], flick = tw > 0 && tw < .35 ? Math.sin(tw / .35 * Math.PI) * .45 : 0;
      x.save(); x.translate(base2[0], base2[1]); x.rotate(flick * (i ? 1 : -1)); x.translate(-base2[0], -base2[1]);
      x.beginPath(); x.moveTo(...base1); x.quadraticCurveTo(tip[0] - 4, tip[1] + 8, ...tip); x.quadraticCurveTo(tip[0] + 6, tip[1] + 10, ...base2); x.closePath(); x.fillStyle = PAPER_FILL; x.fill();
      penPath(x, spline([base1, [tip[0] - 3, tip[1] + 9], tip, [tip[0] + 5, tip[1] + 11], base2], 5), i + 4, near ? .9 : .7, near ? 1 : .8);
      penPath(x, [[base1[0] + 4, base1[1] - 2], [tip[0] + 1, tip[1] + 9]], i + 7, .45, .7);
      x.restore();
    };
    ear([4, -24], [20, -16], [16 + yaw * 3, -48], 1, false);
    // head shape
    const hp = [[24, 2], [22, -14], [6, -27], [-14, -25], [-28, -14], [-36, -3], [-38, 4], [-33, 11], [-22, 16], [-4, 20], [14, 17], [24, 2]];
    x.beginPath(); spline(hp, 5).forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath(); x.fillStyle = PAPER_FILL; x.fill();
    penPath(x, spline(hp.slice(1, 7), 6), 11, 1, 1);
    penPath(x, spline(hp.slice(7, 11), 6), 12, .75, .9);
    for (let i = 0; i < 3; i++) penPath(x, [[15 + i * 3, 12 + i * 2], [22 + i * 3, 16 + i * 3]], i, .5, .8);   // cheek ruff
    ear([-18, -22], [-2, -27], [-10 + yaw * 3, -52], 0, true);
    // forehead M
    penPath(x, [[-12 + yaw * 2, -21], [-9 + yaw * 2, -15], [-6 + yaw * 2, -20], [-3 + yaw * 2, -14], [0 + yaw * 2, -21]], 13, .5, .8);
    // eye
    const ex = -20 + yaw * 4, ey = -7, op = this.eyeOpen();
    x.beginPath(); x.ellipse(ex, ey, 7.5, 4.6 * op + .3, -.15, 0, Math.PI * 2); x.fillStyle = 'rgb(236, 232, 206)'; x.fill();
    penPath(x, arcPts(ex, ey, 7.5, 4.6 * op + .3, Math.PI * 1.02, Math.PI * 1.98, 10), 14, .75, 1, false);
    penPath(x, arcPts(ex, ey, 7.5, 4.6 * op + .3, Math.PI * .02, Math.PI * .98, 10), 15, .55, .9, false);
    if (op > .25) { x.save(); x.beginPath(); x.ellipse(ex, ey, 7.5, 4.6 * op, -.15, 0, Math.PI * 2); x.clip(); x.fillStyle = `rgb(${PEN})`; x.beginPath(); x.ellipse(ex - 1 + this.look[0] * -1.5, ey, 1.9, 4.6, 0, 0, Math.PI * 2); x.fill(); x.restore(); }
    // nose, mouth, whiskers
    x.beginPath(); x.moveTo(-37, 1); x.lineTo(-33, 1); x.lineTo(-35, 4); x.closePath(); x.fillStyle = `rgba(${PEN}, .85)`; x.fill();
    penPath(x, [[-35, 4], [-34, 8], [-30, 10]], 16, .45, .9);
    const wk = Math.sin(t * .9) * 1.2;
    for (let i = 0; i < 3; i++) penPath(x, [[-30, 6 + i * 2.5], [-48, 2 + i * 4 + wk], [-62, i * 6 - 1 + wk]], 17 + i, .32, .8);
    x.restore();
  }
}
const PAPER_FILL = 'rgb(252, 251, 248)';
