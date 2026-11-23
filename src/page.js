/* ======================================================= a page of drawings that respond */
const isPalette = (col) => Array.isArray(col) && !(col.length === 3 && typeof col[0] === 'number') && col.every((c) => c === null || (Array.isArray(c) && c.length === 3 && typeof c[0] === 'number'));
class SketchPage {
  constructor(pid, recs, base, imgs, canvas, extra) {
    this.pid = pid; this.c = canvas; this.x = canvas.getContext('2d'); this.base = base;
    this.fx = []; this.zones = []; this.items = []; this.t = 0; this.gust = 0; this.nextGust = 6; this.breeze = .3;
    let k = 0;
    for (const r of recs) {
      if (r.zone) { this.zones.push(r); continue; }
      const it = Object.assign({}, r, { orig: imgs[k], plab: extra[r.id] || null, cm: extra[r.id + '_c'] || null }); k++;
      setImg(it, pencilColor(it.orig, it, null));
      it.pv = r.pv || [it.x + it.w / 2, it.y + it.h];
      Object.assign(it, { tx: 0, ty: 0, vx: 0, vy: 0, rot: 0, vr: 0, sq: 0, vsq: 0, sc: 1, op: 1, flip: 1, air: false, hover: 0, lift: 0, seed: Math.random() * 100, step: 0, colorIx: -1 });
      this.init(it);
      this.items.push(it);
    }
    this.by = Object.fromEntries(this.items.map((i) => [i.id, i]));
    for (const it of this.items) { if (it.parent) { it.par = this.by[it.parent]; (it.par.kids || (it.par.kids = [])).push(it); } }
    this.opaque = this.items.some((i) => i.opaque);
    this.listOrder = [...this.items].reverse();          // first-listed sits on top
    if (pid === 'fr_L') this.cat = new Cat(675, 1206);
    this.bind();
  }
  init(it) {
    if (it.b === 'text') it.reveal = 1;
    if (it.on && it.on.some((a) => ['bite', 'scoop', 'pieces', 'slice'].includes(a))) { editable(it); it.done = 0; it.wedge = 0; }
    if (it.b === 'sip') { it.empty = this.emptyCup(it.img); it.drunk = 0; it.drunkTo = 0; it.slosh = 0; }
    if (it.b === 'fan') { it.fold = 0; it.foldTo = 0; }
    if (it.b === 'glow') { it.on_ = 0; it.amt = 0; }
    if (it.on && it.on.includes('toss')) { it.state = 'home'; it.tt = 0; }
    if (it.b === 'flutter') { it.burst = 0; }
    if (it.gustAmt === undefined) it.gustAmt = 0;
    if (it.drips) it.nextDrip = 1 + Math.random() * it.drips.every;
    if (it.plab) { it.lab = it.plab; it.gone = new Set(); }
  }
  emptyCup(img) {
    const c = canvasOf(img.width, img.height), x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const mx = Math.max(p[i], p[i + 1], p[i + 2]), mn = Math.min(p[i], p[i + 1], p[i + 2]);
      if (mn > 120 && (mx - mn) > 14) { const keep = .12; for (let k = 0; k < 3; k++) p[i + k] = 255 - (255 - p[i + k]) * keep; }
    }
    x.putImageData(d, 0, 0); return c;
  }
  onShow() {}
  resize() { fitCanvas(this.c); }

  /* ---------------------------------------------------------------- order + hit testing */
  depth(it) { return (it.z ?? it.pv[1]) + it.ty; }
  order() {
    if (!this.opaque) return this.listOrder;
    const roots = this.items.filter((i) => !i.par).sort((a, b) => (a.b === 'text') - (b.b === 'text') || this.depth(a) - this.depth(b));
    const out = [];
    const put = (it) => { (it.kids || []).filter((c) => c.behind).forEach(put); out.push(it); (it.kids || []).filter((c) => !c.behind).forEach(put); };
    roots.forEach(put); return out;
  }
  toLocal(it, px, py) {
    const chain = []; for (let i = it; i; i = i.par) chain.unshift(i);
    let x = px, y = py;
    for (const c of chain) {
      const [cx, cy] = c.pv; const a = -c.rot;
      const dx = x - (cx + c.tx), dy = y - (cy + c.ty);
      let rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
      rx /= (1 - c.sq * .55) * c.sc * (1 + c.lift * .025) * (c.flip || 1); ry /= (1 + c.sq) * c.sc * (1 + c.lift * .025);
      x = rx + cx; y = ry + cy;
    }
    return [x - it.x, y - it.y];
  }
  hitItem(it, px, py, pad = 2) {
    if (it.b === 'glow' && Math.hypot(px - it.glow[0] - it.tx - (it.par ? it.par.tx : 0), py - it.glow[1] - it.ty - (it.par ? it.par.ty : 0)) < 62) return true;
    const [lx, ly] = this.toLocal(it, px, py);
    for (let oy = -pad; oy <= pad; oy += 2) for (let ox = -pad; ox <= pad; ox += 2) {
      const X = Math.round(lx + ox), Y = Math.round(ly + oy);
      if (X >= 0 && Y >= 0 && X < it.w && Y < it.h && it.alpha[Y * it.w + X] > 50) return true;
    }
    return !!(it.done && lx >= 0 && ly >= 0 && lx < it.w && ly < it.h);
  }
  hit(px, py) {
    const ord = this.order();
    for (let i = ord.length - 1; i >= 0; i--) { const it = ord[i]; if (it.op > .3 && it.on && this.hitItem(it, px, py)) return it; }
    return null;
  }
  zoneAt(px, py) { return this.zones.find((z) => { const [x0, y0, x1, y1] = z.box; return px >= x0 && px <= x1 && py >= y0 && py <= y1; }); }
  rootDrag(it) { for (let i = it; i; i = i.par) if (i.drag) return i; return null; }
  bind() {
    const c = this.c;
    c.addEventListener('pointermove', (e) => {
      const p = pagePoint(c, e); this.pointer = p;
      const d = this.dragging;
      if (d) {
        const dx = p.x - d.sx, dy = p.y - d.sy;
        if (!d.moved && Math.hypot(dx, dy) > 7) { d.moved = true; Sound.tok(.6); }
        if (d.moved) {
          const it = d.it, ntx = clamp(d.tx0 + dx, -it.x - it.w * .45, PW - it.x - it.w * .55), nty = clamp(d.ty0 + dy, -it.y - it.h * .25, PH - it.y - it.h * .9);
          it.vx = (ntx - it.tx) / Math.max(.008, this.dt || .016); it.tx = ntx; it.ty = nty;
        }
        return;
      }
      const h = this.hit(p.x, p.y);
      const catHit = this.cat && this.cat.contains(p.x, p.y);
      c.style.cursor = h ? (this.rootDrag(h) ? 'grab' : 'pointer') : catHit || (this.zoneAt(p.x, p.y)) ? 'pointer' : 'default';
      for (const i of this.items) i.hoverT = i === h ? 1 : 0;
      if (h && h.b === 'pendulum' && this.lastP) h.vr += clamp((p.x - this.lastP.x) * .004, -.2, .2);
      if (h && h.b === 'flutter') this.items.filter((o) => o.b === 'flutter').forEach((o) => o.burst = Math.max(o.burst, .35));
      this.lastP = p;
    });
    c.addEventListener('pointerleave', () => { for (const i of this.items) i.hoverT = 0; this.lastP = null; this.pointer = null; });
    c.addEventListener('pointerdown', (e) => {
      App.touched();
      const p = pagePoint(c, e);
      if (this.cat && this.cat.contains(p.x, p.y)) { this.cat.pet(); return; }
      const h = this.hit(p.x, p.y);
      const root = h && this.rootDrag(h);
      if (root) {
        c.setPointerCapture(e.pointerId); c.style.cursor = 'grabbing';
        this.dragging = { it: root, tapIt: h, sx: p.x, sy: p.y, tx0: root.tx, ty0: root.ty, moved: false, px: p.x, py: p.y };
        return;
      }
      if (h) return this.tap(h, p.x, p.y);
      const z = this.zoneAt(p.x, p.y);
      if (z && z.zone === 'birds') { this.flock(p.x, p.y, 3 + (Math.random() * 3 | 0)); Sound.sweep(2500, 4200, .3, .15, 2); }
      if (z && z.zone === 'street' && this.cat) { this.cat.walkTo(p.x, p.y); this.fx.push({ k: 'mark', x: p.x, y: p.y, age: 0, seed: Math.random() * 9 }); }
    });
    const up = () => {
      const d = this.dragging; if (!d) return; this.dragging = null;
      if (!d.moved) return this.tap(d.tapIt, d.px, d.py);
      d.it.sq = -.05; d.it.vsq = -.4; d.it.vr += clamp(d.it.vx * .0004, -.12, .12); Sound.thump();
    };
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up);
  }

  /* ---------------------------------------------------------------- reactions */
  tap(it, px, py) {
    const acts = it.on || [];
    let act = acts[0];
    if (act === 'color' && acts.length > 1 && it.colorIx >= 0) act = acts[1 + (it.step++ % (acts.length - 1))];
    const side = px < it.pv[0] ? -1 : 1;
    switch (act) {
      case 'color': this.colorIn(it); break;
      case 'hue': {
        it.hueIx = ((it.hueIx || 0) + 1) % 4;
        this.transition(it, hueShift(it.orig, [0, 145, 215, 290][it.hueIx]));
        if (it.b === 'sway') it.gustAmt = 1;
        break;
      }
      case 'gust': it.gustAmt = 1; it.vr += side * .05; Sound.sweep(500, 1200, .6, .2, .7); break;
      case 'glow': it.on_ = !it.on_; Sound.click(); break;
      case 'sip': this.sip(it); break;
      case 'bite': case 'scoop': this.eat(it, px, py, act === 'bite'); break;
      case 'pieces': this.pick(it, px, py); break;
      case 'slice': this.slice(it); break;
      case 'fold': it.foldTo = it.foldTo ? 0 : 1; Sound.whoosh(); [0, 90, 180, 270].forEach((d) => setTimeout(() => Sound.click(), d + 60)); break;
      case 'lid': { const lid = this.by.lid; if (lid.air) break; lid.air = true; lid.vy = -560; lid.vr += (side || 1) * -.5; setTimeout(() => Sound.clink(), 60); break; }
      case 'pearl': this.fx.push({ k: 'spark', x: it.pearl[0], y: it.pearl[1], age: 0, seed: Math.random() * 9 }); Sound.chime(); break;
      case 'toss': if (it.state === 'home') { it.state = 'fly'; it.tt = 0; Sound.ting(); } break;
      case 'splash': this.ripple(clamp(px, 380, 780), clamp(py, 640, 700), 1); Sound.splash(); break;
      case 'jingle': it.vr += side * 1.6; Sound.jingle(); break;
      case 'purr': { const head = this.by.cathead; if (head) { head.vr += .25; head.purr = 1; } Sound.purr(1.6); break; }
      case 'clink': this.hop(it, .5); setTimeout(() => Sound.clink(), 300); break;
      case 'flip': if (!it.air) { it.air = true; it.vy = -720; it.flipT = 0; it.sq = -.1; Sound.whoosh(); } break;
      case 'step': this.items.filter((o) => o.group === it.group).forEach((o, i) => { for (let k = 0; k < 4; k++) this.hop(o, .4, (k * 2 + i) * 190); }); break;
    }
  }
  hop(it, power = 1, delay = 0) {
    setTimeout(() => {
      if (it.air) return;
      it.sq = -.12 * power;
      setTimeout(() => { it.air = true; it.vy = -430 * power; it.vr += (Math.random() - .5) * 1.2 * power; it.vsq += 2 * power; Sound.tok(.8 + Math.random() * .4); }, 70);
    }, delay);
  }
  /* pencil colouring: sweep the new version in, band by band, like a hand laying strokes */
  colorIn(it) {
    const group = it.group ? this.items.filter((o) => o.group === it.group && o.col) : [it];
    for (const o of group) {
      const pal = isPalette(o.col) ? o.col : null;
      let spec;
      if (pal) { o.colorIx = (o.colorIx + 1) % pal.length; spec = pal[o.colorIx]; }
      else { if (o.colorIx >= 0 && o !== it) continue; o.colorIx = 0; spec = o.col; }
      this.transition(o, pencilColor(o.orig, o, spec));
    }
  }
  transition(it, to) {
    if (!it.order) it.order = strokeOrder(it.w, it.h);
    const from = canvasOf(it.w, it.h); from.getContext('2d').drawImage(it.img, 0, 0);
    const dur = .7 + Math.sqrt(it.w * it.h) / 520;
    it.trans = { from: from.getContext('2d').getImageData(0, 0, it.w, it.h), to: to.getContext('2d').getImageData(0, 0, it.w, it.h), toC: to, t: 0, dur };
    it.transC = it.transC || canvasOf(it.w, it.h);
    it.transD = it.transD || it.transC.getContext('2d').createImageData(it.w, it.h);
    Sound.scribble(dur * .9);
  }
  stepTransition(it, dt) {
    const T = it.trans; T.t += dt;
    const p = easeOut(T.t / T.dur) * 1.04, o = it.order.o, nb = it.order.nb, a = T.from.data, b = T.to.data, out = it.transD.data;
    const soft = 1.6 / nb;
    for (let i = 0, j = 0; i < o.length; i++, j += 4) {
      const m = clamp((p - o[i]) / soft, 0, 1);
      out[j] = a[j] + (b[j] - a[j]) * m; out[j + 1] = a[j + 1] + (b[j + 1] - a[j + 1]) * m; out[j + 2] = a[j + 2] + (b[j + 2] - a[j + 2]) * m; out[j + 3] = a[j + 3] + (b[j + 3] - a[j + 3]) * m;
    }
    it.transC.getContext('2d').putImageData(it.transD, 0, 0);
    it.img = it.transC;
    if (T.t >= T.dur) { setImg(it, T.toC); it.trans = null; it.transC = null; it.transD = null; }
  }
  sip(it) {
    if (it.drunkTo >= .999) { it.drunkTo = 0; it.slosh = 1; Sound.pour(); return; }
    it.drunkTo = Math.min(1, it.drunkTo + .2); it.slosh = 1; it.vsq -= .6; Sound.slurp();
    for (let i = 0; i < 5; i++) this.fx.push({ k: 'bubble', it, x: it.x + it.w * (.3 + Math.random() * .4), y: it.level[1] - 10 - Math.random() * 30, r: 2 + Math.random() * 3, age: -i * .08, seed: Math.random() * 9 });
  }
  eat(it, px, py, teeth) {
    if (it.done) { editable(it); it.done = 0; it.sq = -.3; it.vsq = 4; Sound.blip(420, 840, .18, .12); return; }
    const [lx, ly] = [px - it.x, py - it.y];
    let e = null;
    outer: for (let r = 6; r < 260; r += 5) for (let k = 0; k < 28; k++) {
      const a = k / 28 * Math.PI * 2, X = Math.round(lx + Math.cos(a) * r), Y = Math.round(ly + Math.sin(a) * r);
      if (X < 0 || Y < 0 || X >= it.w || Y >= it.h || it.alpha[Y * it.w + X] < 30) { e = [X, Y, a]; break outer; }
    }
    const R = it.r; let cx = lx, cy = ly;
    if (e) { cx = e[0] + Math.cos(e[2]) * R * .3; cy = e[1] + Math.sin(e[2]) * R * .3; }
    const go = () => { const piece = this.carve(it, cx, cy, R, { teeth, piece: true }); it.vsq -= .8; if (areaLeft(it) < .12) it.done = 1; return piece; };
    const tool = it.tool && this.by[it.tool];
    if (tool && !tool.busy) this.useTool(tool, cx + it.x, cy + it.y, go, it, false);
    else { go(); Sound.crunch(); }
  }
  /* take one whole piece (a potato cube, a slice of salami) off the plate */
  pick(it, px, py) {
    const lx = Math.round(px - it.x), ly = Math.round(py - it.y);
    let id = 0;
    for (let r = 0; r <= 8 && !id; r += 2) for (const [ox, oy] of [[0, 0], [r, 0], [-r, 0], [0, r], [0, -r]]) {
      const X = lx + ox, Y = ly + oy; if (X < 0 || Y < 0 || X >= it.w || Y >= it.h) continue;
      const v = it.lab[Y * it.w + X]; if (v && !it.gone.has(v)) { id = v; break; }
    }
    if (!id) {
      if (it.gone.size >= it.npieces * .7) { editable(it); it.gone.clear(); it.sq = -.15; it.vsq = 3; Sound.blip(420, 840, .18, .12); }
      return;
    }
    const go = () => {
      it.gone.add(id);
      const d = it.ctx.getImageData(0, 0, it.w, it.h), p = d.data;
      const pc = canvasOf(it.w, it.h), pcx = pc.getContext('2d'), pd = pcx.createImageData(it.w, it.h);
      let sx = 0, sy = 0, n = 0;
      for (let i = 0; i < it.lab.length; i++) if (it.lab[i] === id) {
        const j = i * 4; for (let k = 0; k < 4; k++) pd.data[j + k] = p[j + k];
        p[j + 3] = 0; sx += i % it.w; sy += i / it.w | 0; n++;
      }
      it.ctx.putImageData(d, 0, 0); pcx.putImageData(pd, 0, 0); it.alpha = alphaOf(it.img);
      return { c: pc, cx: it.x + sx / n, cy: it.y + sy / n };
    };
    const tool = it.tool && this.by[it.tool];
    if (tool && !tool.busy) this.useTool(tool, px, py, () => go(), it, true);
    else { const r = go(); this.fx.push({ k: 'lift', img: r.c, x0: it.x, y0: it.y, cx: r.cx, cy: r.cy, age: 0, life: 1.1, dir: Math.random() < .5 ? -1 : 1 }); Sound.tok(1.5); }
  }
  useTool(tool, tx, ty, go, target, carry) {
    tool.busy = true;
    const [hx, hy] = tool.tip || tool.pv;
    tool.anim = { t: 0, dx: tx - hx, dy: ty - hy, go, carry, done: false, target };
  }
  carve(it, cx, cy, r, opt = {}) {
    const W = it.w, H = it.h, ctx = it.ctx;
    const before = ctx.getImageData(0, 0, W, H);
    const shape = (g, grow) => {
      if (opt.teeth) {
        g.beginPath(); g.arc(cx, cy, r - 5 + grow, 0, Math.PI * 2); g.fill();
        const n = Math.round(2 * Math.PI * r / 15);
        for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; g.beginPath(); g.arc(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6), 9 + grow, 0, Math.PI * 2); g.fill(); }
      } else { g.beginPath(); g.ellipse(cx, cy, r + grow, r * .82 + grow, -.3, 0, Math.PI * 2); g.fill(); }
    };
    const protect = (g) => {
      if (!it.protect) return;
      g.beginPath(); it.protect.forEach(([X, Y], i) => (i ? g.lineTo(X - it.x, Y - it.y) : g.moveTo(X - it.x, Y - it.y))); g.closePath();
      g.fillStyle = '#000'; g.fill(); g.lineWidth = 6; g.strokeStyle = '#000'; g.stroke();
    };
    const mk = (fn) => { const c = canvasOf(W, H), g = c.getContext('2d'); g.fillStyle = '#000'; fn(g); return [c, g]; };
    const [mask, mg] = mk((g) => { shape(g, 0); g.globalCompositeOperation = 'destination-out'; protect(g); });
    const md = mg.getImageData(0, 0, W, H).data, bd = before.data;
    const [piece] = mk((g) => { g.drawImage(it.img, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); });
    const mean = meanColor(bd, md), face = mean.map((v) => Math.round(255 - (255 - v) * .45));
    const [tmp] = mk((g) => {
      g.fillStyle = `rgb(${face})`; shape(g, 11);
      g.globalCompositeOperation = 'destination-out'; shape(g, 2.6);
      g.globalCompositeOperation = 'source-over';
      const [ring] = mk((rg) => { rg.fillStyle = `rgb(${PEN})`; shape(rg, 2.8); rg.globalCompositeOperation = 'destination-out'; shape(rg, 0); });
      g.drawImage(ring, 0, 0);
      g.globalCompositeOperation = 'destination-in'; g.drawImage(it.img, 0, 0);
      g.globalCompositeOperation = 'destination-out'; protect(g);
    });
    let made = 0, tries = 0;
    while (made < 12 && tries++ < 500) {
      const X = Math.random() * W | 0, Y = Math.random() * H | 0, i = (Y * W + X) * 4;
      if (md[i + 3] > 128 && bd[i + 3] > 200) {
        this.fx.push({ k: 'crumb', x: X + it.x, y: Y + it.y, vx: (Math.random() - .5) * 200, vy: -Math.random() * 220 - 40, r: Math.random() * 6, vr: (Math.random() - .5) * 18,
          s: 1.6 + Math.random() * 2.4, col: `rgb(${bd[i]},${bd[i + 1]},${bd[i + 2]})`, floor: it.pv[1] + Math.random() * 30, age: 0 });
        made++;
      }
    }
    ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(tmp, 0, 0);
    it.alpha = alphaOf(it.img);
    return piece;
  }
  /* serve a slice: it lifts away trailing strings of melted cheese that stretch, thin and snap */
  slice(it) {
    const knife = it.knife && this.by[it.knife];
    if (it.wedge >= it.wedges.length) {
      editable(it); it.wedge = 0; it.done = 0; it.sq = -.25; it.vsq = 3;
      if (knife) knife.anim2 = { t: 0, from: [knife.tx, knife.ty, knife.rot], to: [0, 0, 0] };
      Sound.blip(420, 840, .18, .12); return;
    }
    if (knife && it.wedge === 0) knife.anim2 = { t: 0, from: [0, 0, 0], to: [150, 70, .28] };
    const [a0, a1] = it.wedges[it.wedge++];
    const [cx, cy] = [it.c[0] - it.x, it.c[1] - it.y];
    const W = it.w, H = it.h, ctx = it.ctx;
    const wedge = (g) => {
      g.beginPath(); g.moveTo(cx, cy);
      for (let a = a0; a <= a1 + .01; a += 3) { const r = a * Math.PI / 180; g.lineTo(cx + Math.cos(r) * 600, cy + Math.sin(r) * 600); }
      g.closePath(); g.fill();
    };
    const mk = () => { const c = canvasOf(W, H), g = c.getContext('2d'); g.fillStyle = '#000'; return [c, g]; };
    if (!it.body) {
      const [bc, bg] = mk(); bg.drawImage(it.orig, 0, 0);
      const d = bg.getImageData(0, 0, W, H), q = d.data;
      for (let i = 0; i < q.length; i += 4) {
        const mx = Math.max(q[i], q[i + 1], q[i + 2]), mn = Math.min(q[i], q[i + 1], q[i + 2]);
        q[i + 3] = q[i + 3] > 60 && (mn < 150 || (mx - mn) / (mx || 1) > .22 && q[i] > q[i + 2]) ? 255 : 0;
      }
      bg.putImageData(d, 0, 0); it.body = bc;
    }
    const [piece, pg] = mk(); pg.drawImage(it.img, 0, 0); pg.globalCompositeOperation = 'destination-in'; wedge(pg);
    const [cut, cg] = mk();
    for (const a of [a0, a1]) { const r = a * Math.PI / 180; penPath(cg, [[cx + Math.cos(r) * 4, cy + Math.sin(r) * 4], [cx + Math.cos(r) * 240, cy + Math.sin(r) * 240]], a, 1.05, 1, false); }
    cg.globalCompositeOperation = 'destination-in'; cg.drawImage(it.body, 0, 0);
    ctx.globalCompositeOperation = 'destination-out'; wedge(ctx);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(cut, 0, 0);
    it.alpha = alphaOf(it.img);
    const mid = (a0 + a1) / 2 * Math.PI / 180, dir = [Math.cos(mid), Math.sin(mid)];
    const strands = [];
    for (const a of [a0, a1]) for (const f of [.25, .5, .72]) {
      const r = a * Math.PI / 180, rr = 140 * f + 18;
      strands.push({ ax: it.c[0] + Math.cos(r) * rr, ay: it.c[1] + Math.sin(r) * rr, snap: 70 + Math.random() * 70, w: 3 + Math.random() * 2.5, seed: Math.random() * 9 });
    }
    this.fx.push({ k: 'slice', img: piece, x0: it.x, y0: it.y, cx: it.c[0], cy: it.c[1], dir, age: 0, life: 2.4, strands });
    if (it.wedge >= it.wedges.length) it.done = 1;
    Sound.sweep(900, 2200, .25, .25, 2);
  }
  ripple(x, y, s = 1) {
    for (let i = 0; i < 3; i++) this.fx.push({ k: 'ring', x, y, age: -i * .22, s, seed: Math.random() * 9 });
    for (let i = 0; i < 7; i++) { const a = -Math.PI * (.15 + .7 * Math.random()); this.fx.push({ k: 'drop', x, y, vx: Math.cos(a) * 120 * s, vy: Math.sin(a) * 240 * s, age: 0, seed: Math.random() * 9 }); }
  }
  flock(x, y, n) {
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < .5 ? -1 : 1;
      this.fx.push({ k: 'bird', x: x + (Math.random() - .5) * 60, y: y + (Math.random() - .5) * 40, vx: dir * (60 + Math.random() * 60), vy: -60 - Math.random() * 60, ph: Math.random() * 6, fr: 8 + Math.random() * 3, sc: .9 + Math.random() * .4, age: 0, seed: Math.random() * 99 });
    }
  }

  /* ---------------------------------------------------------------- simulation */
  update(t, dt) {
    this.t = t; this.dt = dt;
    this.nextGust -= dt;
    if (this.nextGust < 0 && !reduced) { this.nextGust = 7 + Math.random() * 8; this.gust = 1; }
    this.gust = Math.max(0, this.gust - dt * .45);
    this.breeze = reduced ? .1 : .3 + .18 * Math.sin(t * .47) + this.gust * .8;
    const dragIt = this.dragging && this.dragging.moved && this.dragging.it;
    for (const it of this.items) {
      if (it.trans) this.stepTransition(it, dt);
      it.hover = lerp(it.hover, it.hoverT || 0, 1 - Math.exp(-dt * 12));
      it.lift += ((it === dragIt ? 1 : 0) - it.lift) * (1 - Math.exp(-dt * 14));
      if (it.drag) { it.sc = 1 + it.ty * .00034; if (it === dragIt) it.rot += (clamp(it.vx * .00025, -.06, .06) - it.rot) * (1 - Math.exp(-dt * 10)); it.vx *= .8; }
      const pend = it.b === 'pendulum' || it.b === 'tail';
      const kR = pend ? (it.k || 18) : 70, cR = pend ? 1.2 : 6;
      let target = 0;
      if (pend && !reduced) target = Math.sin(t * 1.1 + it.seed) * (it.idle ?? .02) + Math.sin(t * .43 + it.seed) * (it.idle ?? .02) * .6;
      if (it.b === 'tail') target = Math.sin(t * 1.7 + it.seed) * .13;
      if (it.b === 'head') {
        const p = this.pointer;
        target = p ? clamp(-(p.x - 590) * .00035 + (p.y - 990) * .0004, -.16, .16) : Math.sin(t * .33) * .06;
        if (it.purr) { it.purr = Math.max(0, it.purr - dt * .4); target += Math.sin(t * 2) * .05 * it.purr + .08 * it.purr; }
      }
      if (it.b === 'breathe') it.sq = Math.sin(t * 1.9) * .008;
      if (it.on && it.on.includes('flip') && it.air) { it.flipT += dt; it.rot = -ease(it.flipT / .8) * Math.PI * 2; }
      else if (it !== dragIt) { it.vr += (-(it.rot - target) * kR - it.vr * cR) * dt; it.rot += it.vr * dt; it.rot = clamp(it.rot, -1.2, 1.2); }
      if (it.b !== 'breathe') { it.vsq += (-it.sq * 160 - it.vsq * 9) * dt; it.sq += it.vsq * dt; }
      if (it.air) {
        it.vy += 1900 * dt; it.ty += it.vy * dt;
        if (it.ty >= 0) { it.ty = 0; it.air = false; it.vsq -= Math.min(it.vy, 700) * .006; it.vy = 0; if (it.on && it.on.includes('flip')) it.rot = 0; else it.vr *= .3; Sound.tok(.7); if (it.id === 'lid') Sound.clink(); }
      }
      if (it.b === 'sip') { it.drunk += (it.drunkTo - it.drunk) * (1 - Math.exp(-dt * (it.drunkTo < it.drunk ? 2 : 5))); it.slosh = Math.max(0, it.slosh - dt * .8); }
      if (it.b === 'fan') it.fold += (it.foldTo - it.fold) * (1 - Math.exp(-dt * 7));
      if (it.b === 'glow') it.amt += ((it.on_ ? 1 : 0) - it.amt) * (1 - Math.exp(-dt * (it.on_ ? 5 : 3)));
      if (it.b === 'flutter') it.burst = Math.max(0, it.burst - dt * .6);
      it.gustAmt = Math.max(0, it.gustAmt - dt * .55);
      if (it.state) this.updateToss(it, dt);
      if (it.anim) this.updateTool(it, dt);
      if (it.anim2) { const a = it.anim2; a.t += dt; const u = ease(a.t / .7); it.tx = lerp(a.from[0], a.to[0], u); it.ty = lerp(a.from[1], a.to[1], u); it.rot = lerp(a.from[2], a.to[2], u); if (a.t >= .7) it.anim2 = null; }
      if (it.drips && !reduced) {
        it.nextDrip -= dt;
        if (it.nextDrip < 0) {
          it.nextDrip = it.drips.every * (.6 + Math.random() * .8);
          const [x, y] = it.drips.at[Math.random() * it.drips.at.length | 0];
          this.fx.push({ k: 'drip', x: x + it.tx, y0: y + it.ty, y: y + it.ty, vy: 0, len: 0, age: 0, state: 'grow', puddle: 0, col: it.drips.col });
        }
      }
    }
    if (this.cat) this.cat.update(t, dt, this.pointer);
    if (!reduced && this.zones.some((z) => z.zone === 'birds')) { this.nextBird = (this.nextBird ?? 8) - dt; if (this.nextBird < 0) { this.nextBird = 18 + Math.random() * 16; this.flock(Math.random() < .5 ? -20 : PW + 20, 120 + Math.random() * 120, 1 + (Math.random() * 2 | 0)); } }
    for (const f of this.fx) {
      f.age += dt; if (f.age < 0) continue;
      switch (f.k) {
        case 'crumb':
          if (f.y < f.floor) { f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.vr * dt; }
          if (f.y >= f.floor) { f.y = f.floor; if (f.vy > 120) { f.vy *= -.28; f.vx *= .5; f.y -= .5; } else { f.vy = 0; f.vx = 0; } }
          break;
        case 'drop': f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; break;
        case 'bird': f.ph += dt * f.fr; f.x += f.vx * dt * f.sc; f.y += f.vy * dt; f.vy *= 1 - dt * .4; f.sc = Math.max(.35, f.sc - dt * .05); break;
        case 'bubble': f.y -= dt * 38; break;
        case 'drip':
          if (f.state === 'grow') { f.len = Math.min(1, f.len + dt * 1.1); if (f.len >= 1) f.state = 'fall'; }
          else if (f.state === 'fall') { f.vy += 900 * dt; f.y += f.vy * dt; if (f.y > f.y0 + 50) { f.state = 'pool'; Sound.drip(); } }
          else f.puddle = Math.min(1, f.puddle + dt * 3);
          break;
      }
    }
    const life = { crumb: 5, drop: .7, bird: 8, bubble: 1.2, drip: 6, ring: 1.8, spark: 1, mark: .9 };
    this.fx = this.fx.filter((f) => f.age < (f.life || life[f.k] || 2) && !(f.k === 'bird' && (f.x < -80 || f.x > PW + 80 || f.y < -60)));
  }
  updateToss(it, dt) {
    if (it.state === 'fly') {
      it.tt += dt; const u = Math.min(1, it.tt / 1.05);
      const dx = it.target[0] - it.pv[0], dy = it.target[1] - it.pv[1];
      it.tx = dx * u; it.ty = dy * u - 300 * Math.sin(Math.PI * u);
      it.flip = Math.cos(u * Math.PI * 7) || .05; it.sc = 1 - .72 * u;
      if (u >= 1) {
        it.state = 'gone'; it.tt = 0; it.op = 0; this.ripple(it.target[0], it.target[1], .9); Sound.splash();
        const w = this.by.water; if (w && w.colorIx < 0) this.colorIn(w);
      }
    } else if (it.state === 'gone') {
      it.tt += dt;
      if (it.tt > 2.2) { it.state = 'home'; it.tx = it.ty = 0; it.flip = 1; it.sc = 1; it.op = 1; it.sq = -.4; it.vsq = 5; Sound.blip(700, 1400, .1, .05); }
    }
  }
  updateTool(tool, dt) {
    const a = tool.anim; a.t += dt;
    const out = .38, hold = .16, back = .5;
    if (a.t < out) { const u = easeOut(a.t / out); tool.tx = a.dx * u; tool.ty = a.dy * u - Math.sin(u * Math.PI) * 40; tool.rot = -.25 * u; }
    else if (a.t < out + hold) {
      tool.rot = -.25 + .35 * ((a.t - out) / hold);
      if (!a.done) {
        a.done = true; const res = a.go(); Sound.crunch();
        if (a.carry && res) this.fx.push(a.held = { k: 'held', img: res.c, x0: a.target.x, y0: a.target.y, cx: res.cx, cy: res.cy, age: 0, life: 9 });
        else if (!a.carry) this.fx.push(a.held = { k: 'ball', col: meanColorOf(res ? res.getContext('2d') : null), r: a.target.r * .45, x: 0, y: 0, age: 0, life: 9 });
        if (a.held) { const [hx, hy] = tool.tip || tool.pv; a.held.ox = hx + tool.tx; a.held.oy = hy + tool.ty; }
      }
    } else if (a.t < out + hold + back) {
      const u = ease((a.t - out - hold) / back);
      tool.tx = a.dx * (1 - u); tool.ty = a.dy * (1 - u) - Math.sin(u * Math.PI) * 60; tool.rot = .1 * (1 - u);
    } else { tool.tx = tool.ty = tool.rot = 0; tool.anim = null; tool.busy = false; if (a.held) a.held.age = 99; tool.vr += .6; return; }
    if (a.held) {
      const [hx, hy] = tool.tip || tool.pv;
      const fade = a.t > out + hold ? 1 - (a.t - out - hold) / back : 1;
      a.held.dx = hx + tool.tx - a.held.ox; a.held.dy = hy + tool.ty - a.held.oy; a.held.op = fade;
      if (a.held.k === 'ball') { a.held.x = hx + tool.tx; a.held.y = hy + tool.ty - a.held.r * .6; }
    }
  }

  /* ---------------------------------------------------------------- drawing */
  setT(x, it, k) {
    if (it.par) this.setT(x, it.par, k); else x.setTransform(k, 0, 0, k, 0, 0);
    const [cx, cy] = it.pv, L = 1 + it.lift * .025;
    x.translate(cx + it.tx, cy + it.ty - it.lift * 6); x.rotate(it.rot);
    x.scale((1 - it.sq * .55) * it.sc * L * (it.flip || 1), (1 + it.sq) * it.sc * L);
    x.translate(-cx, -cy);
  }
  strips(x, it, horizontal, size, fn) {
    if (horizontal) for (let y = 0; y < it.h; y += size) { const [dx, dy] = fn(y); x.drawImage(it.img, 0, y, it.w, Math.min(size, it.h - y), it.x + dx, it.y + y + dy, it.w, Math.min(size, it.h - y) + .6); }
    else for (let X = 0; X < it.w; X += size) { const [dx, dy] = fn(X); x.drawImage(it.img, X, 0, Math.min(size, it.w - X), it.h, it.x + X + dx, it.y + dy, Math.min(size, it.w - X) + .6, it.h); }
  }
  drawItem(x, it, k) {
    const LAYERED = { sway: 40, tree: 40, crowd: 12, water: 8, fan: 40 };
    const pad = LAYERED[it.b];
    const mode = this.opaque ? 'source-over' : 'multiply';
    if (it.lift > .02) {                    // picked up: a soft shadow on the page below
      if (!it.sil) { it.sil = canvasOf(it.w, it.h); const g = it.sil.getContext('2d'); g.drawImage(it.img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(60,50,45)'; g.fillRect(0, 0, it.w, it.h); }
      x.setTransform(k, 0, 0, k, 0, 0); x.globalCompositeOperation = 'multiply'; x.globalAlpha = .16 * it.lift;
      x.filter = `blur(${7 * k}px)`;
      const [cx, cy] = it.pv;
      x.translate(cx + it.tx + 8 * it.lift, cy + it.ty + 10 * it.lift); x.scale(it.sc, it.sc); x.translate(-cx, -cy);
      x.drawImage(it.sil, it.x, it.y); x.filter = 'none'; x.globalAlpha = 1;
    }
    x.globalCompositeOperation = mode;
    if (pad !== undefined) {
      const o = this.layerC || (this.layerC = canvasOf(2, 2)), ox = this.layerX || (this.layerX = o.getContext('2d'));
      const W = Math.ceil((it.w + pad * 2) * k), H = Math.ceil((it.h + pad * 2) * k);
      if (o.width < W || o.height < H) { o.width = Math.max(o.width, W); o.height = Math.max(o.height, H); }
      ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, W, H);
      ox.setTransform(k, 0, 0, k, (pad - it.x) * k, (pad - it.y) * k);
      this.drawBody(ox, it);
      x.globalAlpha = it.op; this.setT(x, it, k);
      x.drawImage(o, 0, 0, W, H, it.x - pad, it.y - pad, W / k, H / k);
      x.globalAlpha = 1; return;
    }
    x.globalAlpha = it.op; this.setT(x, it, k);
    this.drawBody(x, it); x.globalAlpha = 1;
    if (it.id === 'lid' && it.ty < -2) {
      x.setTransform(k, 0, 0, k, 0, 0); x.globalCompositeOperation = 'multiply';
      const cxr = it.pv[0], cyr = it.y + it.h - 14, a = clamp(-it.ty / 20, 0, 1);
      penPath(x, arcPts(cxr, cyr, it.w / 2 - 10, 22, Math.PI * .02, Math.PI * .98, 30), 3, 1, a, false);
      penPath(x, arcPts(cxr, cyr, it.w / 2 - 10, 22, Math.PI * 1.02, Math.PI * 1.98, 30), 5, .9, a * .8, false);
    }
  }
  drawBody(x, it) {
    const t = this.t;
    switch (it.b) {
      case 'sway': {
        const A = (it.amp || 6) * (this.breeze + it.gustAmt * 2.5);
        this.strips(x, it, true, 5, (y) => { const d = (it.y + y - it.pv[1]) / it.h; const f = Math.pow(Math.max(0, d), 1.25); return [f * A * Math.sin(t * 1.7 + it.seed - d * 2.2) + f * it.gustAmt * 8 * Math.sin(t * 9 - d * 4), 0]; });
        break;
      }
      case 'tree': {
        const A = 4 * (this.breeze + it.gustAmt * 3);
        this.strips(x, it, true, 4, (y) => { const d = (it.pv[1] - (it.y + y)) / it.h; const f = Math.pow(clamp(d, 0, 1), 1.6); return [f * A * Math.sin(t * 1.3 + it.seed), 0]; });
        break;
      }
      case 'crowd': this.strips(x, it, false, 9, (X) => { const i = X / 9; return [Math.sin(t * .7 + i * .9) * 1.1, -Math.abs(Math.sin(t * (3 + (i % 3)) + i * 1.7)) * 1.3]; }); break;
      case 'water': this.strips(x, it, true, 3, (y) => [Math.sin((it.y + y) * .16 + t * 2.1) * 1.7 + Math.sin((it.y + y) * .05 - t * 1.3) * 1.1, 0]); break;
      case 'fan': {
        const p = ease(it.fold) * .8;
        if (p < .002) { x.drawImage(it.img, it.x, it.y); break; }
        const N = 16, [a0, a1] = it.a.map((d) => d * Math.PI / 180), [px, py] = it.pv;
        const mid = (a0 + a1) / 2, ordr = [...Array(N).keys()].sort((i, j) => Math.abs(j + .5 - N / 2) - Math.abs(i + .5 - N / 2));
        for (const i of ordr) {            // closes onto its centre ribs, outer guards on top
          const s0 = a0 + (a1 - a0) * i / N, s1 = a0 + (a1 - a0) * (i + 1) / N;
          x.save(); x.translate(px, py); x.rotate((mid - (s0 + s1) / 2) * p); x.translate(-px, -py);
          x.beginPath(); x.moveTo(px, py);
          const ext = i === 0 ? .3 : .015, ext2 = i === N - 1 ? .3 : .015;
          for (let a = s0 - ext; a <= s1 + ext2 + 1e-4; a += .02) x.lineTo(px + Math.cos(a) * 700, py + Math.sin(a) * 700);
          x.closePath(); x.clip(); x.drawImage(it.img, it.x, it.y); x.restore();
        }
        break;
      }
      case 'sip': {
        const top = it.level[0] + (it.level[1] - it.level[0]) * it.drunk;
        x.drawImage(it.empty, it.x, it.y);
        if (it.drunk < .995) {
          x.save(); x.beginPath(); x.moveTo(it.x, it.y + it.h);
          for (let X = 0; X <= it.w; X += 6) x.lineTo(it.x + X, top + Math.sin(X * .06 + t * 6) * (1.5 + it.slosh * 5));
          x.lineTo(it.x + it.w, it.y + it.h); x.closePath(); x.clip(); x.drawImage(it.img, it.x, it.y); x.restore();
        }
        break;
      }
      case 'flutter': {
        const [ax, ay, deg] = it.axis, th = deg * Math.PI / 180;
        const idle = reduced ? 0 : .05 * (.5 + .5 * Math.sin(t * 2.3 + it.seed)) + .03 * Math.sin(t * 7.7);
        const f = 1 - (idle + it.burst * .75 * (.5 + .5 * Math.sin(t * 34)));
        x.translate(ax, ay); x.rotate(th); x.scale(1, f); x.rotate(-th); x.translate(-ax, -ay);
        x.drawImage(it.img, it.x, it.y); break;
      }
      default: x.drawImage(it.img, it.x, it.y);
    }
  }
  drawGlow(x, it, k) {
    if (it.amt < .01 || !GLOW_TEX) return;
    const [gx, gy, gr] = it.glow;
    if (!this.glowC) { this.glowC = canvasOf(2, 2); this.glowX = this.glowC.getContext('2d'); }
    const S = Math.ceil(gr * 2), g = this.glowX;
    if (this.glowC.width !== S) { this.glowC.width = S; this.glowC.height = S; }
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, S, S);
    // the lamp's light is laid in with pencil: strokes reach out from the bulb as it warms up
    g.drawImage(GLOW_TEX, 0, 0, S, S);
    const flick = .93 + .07 * Math.sin(this.t * 13) * Math.sin(this.t * 7.3), reach = .35 + .65 * easeOut(it.amt);
    const rg = g.createRadialGradient(gr, gr, 0, gr, gr, gr * reach);
    rg.addColorStop(0, `rgba(0,0,0,${.95 * flick})`); rg.addColorStop(.4, `rgba(0,0,0,${.6 * flick})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = rg; g.fillRect(0, 0, S, S);
    const ox = it.par ? it.par.tx : 0, oy = it.par ? it.par.ty : 0;
    x.setTransform(k, 0, 0, k, 0, 0); x.globalCompositeOperation = 'multiply';
    x.globalAlpha = Math.min(1, it.amt * 1.1) * .9;
    x.drawImage(this.glowC, gx - gr + it.tx + ox, gy - gr + it.ty + oy);
    x.globalAlpha = 1;
  }
  drawFx(x, k) {
    x.setTransform(k, 0, 0, k, 0, 0); x.globalCompositeOperation = 'multiply';
    for (const f of this.fx) {
      if (f.age < 0) continue;
      x.setTransform(k, 0, 0, k, 0, 0);
      switch (f.k) {
        case 'crumb':
          x.globalAlpha = 1 - smooth(3.4, 5, f.age); x.fillStyle = f.col;
          x.translate(f.x, f.y); x.rotate(f.r); x.beginPath(); x.moveTo(-f.s, -f.s * .6); x.lineTo(f.s * .8, -f.s * .8); x.lineTo(f.s, f.s * .5); x.lineTo(-f.s * .5, f.s * .8); x.closePath(); x.fill();
          break;
        case 'lift': {      // a piece is picked up: it rises toward you, turns, and is gone
          const u = f.age / f.life, s = 1 + .35 * easeOut(u);
          x.globalAlpha = 1 - smooth(.55, 1, u);
          x.translate(f.cx + f.dir * 30 * u, f.cy - 120 * easeOut(u)); x.rotate(f.dir * .5 * u); x.scale(s, s); x.translate(-f.cx, -f.cy);
          x.drawImage(f.img, f.x0, f.y0); break;
        }
        case 'held': x.globalAlpha = f.op ?? 1; x.translate(f.dx || 0, f.dy || 0); x.drawImage(f.img, f.x0, f.y0); break;
        case 'ball':
          x.globalAlpha = f.op ?? 1; x.fillStyle = `rgb(${f.col})`; x.beginPath(); x.ellipse(f.x, f.y, f.r, f.r * .8, 0, 0, Math.PI * 2); x.fill();
          penPath(x, arcPts(f.x, f.y, f.r, f.r * .8, 0, Math.PI * 2, 26), 2, .8, f.op ?? 1, false); break;
        case 'slice': this.drawSlice(x, f); break;
        case 'ring': {
          const u = f.age / 1.8, rx = 8 + u * 70 * f.s, a = (1 - u) * .9;
          penPath(x, arcPts(f.x, f.y, rx, rx * .28, Math.PI * 1.08, Math.PI * 1.92, 18), f.seed, .7, a, true);
          penPath(x, arcPts(f.x, f.y, rx, rx * .28, Math.PI * .1, Math.PI * .9, 18), f.seed + 2, .8, a, true);
          break;
        }
        case 'mark': {       // where you called the cat: a quick pencil tick on the stones
          const a = 1 - f.age / .9; penPath(x, arcPts(f.x, f.y, 14 + f.age * 8, 4 + f.age * 2, 0, Math.PI * 2, 16), f.seed, .5, a * .7, false); break;
        }
        case 'drop': penPath(x, [[f.x, f.y], [f.x - f.vx * .02, f.y - f.vy * .02]], f.seed, .7, 1 - f.age / .7, true); break;
        case 'spark': {
          const u = f.age, a = 1 - u;
          for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 2 + .3, r0 = 22 + u * 18, r1 = r0 + 16 * (1 - u * .5); penPath(x, [[f.x + Math.cos(ang) * r0, f.y + Math.sin(ang) * r0], [f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1]], f.seed + i, .8, a, true); }
          break;
        }
        case 'bubble': { const it = f.it, top = it.level[0] + (it.level[1] - it.level[0]) * it.drunk; if (f.y < top + 4) break; penPath(x, arcPts(f.x + Math.sin(f.age * 9 + f.seed) * 2, f.y, f.r, f.r, 0, Math.PI * 2, 10), f.seed, .45, 1 - f.age / 1.2, false); break; }
        case 'bird': {
          const sp = 19 * f.sc, fl = Math.sin(f.ph), up = 9 * f.sc, a = Math.min(1, f.age * 4) * (1 - smooth(6, 8, f.age));
          const tipY = f.y - fl * up, ctlY = f.y - up * (.55 + .45 * fl) - 3 * f.sc, dir = Math.sign(f.vx) || 1;
          const wing = (s) => [[f.x + s * sp, tipY + s * dir * 1.2 * f.sc], [f.x + s * sp * .42, ctlY], [f.x, f.y + 1.2 * f.sc]];
          penStroke(x, [...wing(-1), ...wing(1).reverse().slice(1)], f.seed, Math.min(1.15, .75 + f.sc * .3), a); break;
        }
        case 'drip': {
          const fade = 1 - smooth(4, 6, f.age);
          x.globalAlpha = fade; x.fillStyle = `rgb(${f.col})`; x.strokeStyle = `rgba(${PEN}, .8)`; x.lineWidth = 1.3; x.beginPath();
          if (f.state === 'pool') x.ellipse(f.x, f.y0 + 54, 3 + f.puddle * 8, 1.6 + f.puddle * 2.2, 0, 0, Math.PI * 2);
          else {
            const r = 3.4 * (f.state === 'grow' ? f.len : 1), st = f.state === 'fall' ? Math.min(14, f.vy * .02) : 0, y = f.state === 'grow' ? f.y0 + f.len * 6 : f.y;
            x.moveTo(f.x, y - r - 4 - st); x.quadraticCurveTo(f.x + r * 1.1, y - r * .2, f.x + r, y); x.arc(f.x, y, r, 0, Math.PI); x.quadraticCurveTo(f.x - r * 1.1, y - r * .2, f.x, y - r - 4 - st);
          }
          x.fill(); x.stroke(); break;
        }
      }
      x.globalAlpha = 1;
    }
    x.setTransform(k, 0, 0, k, 0, 0);
  }
  drawSlice(x, f) {
    const lift = easeOut(f.age / .9), away = smooth(1.1, 2.4, f.age);
    const dx = f.dir[0] * 46 * lift + 30 * away, dy = f.dir[1] * 46 * lift - 70 * lift - 120 * away, rot = .12 * lift + .2 * away, s = 1 + .06 * lift;
    const P = (px, py) => { const X = px - f.cx, Y = py - f.cy, c = Math.cos(rot), sn = Math.sin(rot); return [f.cx + dx + (X * c - Y * sn) * s, f.cy + dy + (X * sn + Y * c) * s]; };
    // strings of mozzarella between the pan and the lifted slice
    for (const st of f.strands) {
      const b = P(st.ax, st.ay), d = Math.hypot(b[0] - st.ax, b[1] - st.ay);
      if (d > st.snap) { st.broke = st.broke || f.age; }
      const tb = st.broke ? f.age - st.broke : 0; if (tb > .45) continue;
      const shrink = st.broke ? 1 - easeOut(tb / .45) : 1, end = st.broke ? lerp2([st.ax, st.ay], b, .5 * shrink) : b;
      const sag = 10 + d * .12, mid = [(st.ax + end[0]) / 2, (st.ay + end[1]) / 2 + sag];
      const w = Math.max(.8, st.w * (1 - d / (st.snap * 1.2))) * (st.broke ? shrink : 1);
      const pts = spline([[st.ax, st.ay], mid, end], 8), L = [], R = [];
      pts.forEach((p, i) => { const q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)]; let tx = q[0] - o[0], ty = q[1] - o[1]; const l = Math.hypot(tx, ty) || 1; tx /= l; ty /= l; const ww = w * (.6 + .4 * Math.sin(Math.PI * i / (pts.length - 1)) * 0 + (i === 0 || i === pts.length - 1 ? .5 : .4)); L.push([p[0] - ty * ww, p[1] + tx * ww]); R.push([p[0] + ty * ww, p[1] - tx * ww]); });
      x.beginPath(); [...L, ...R.reverse()].forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1]))); x.closePath();
      x.fillStyle = 'rgb(248, 226, 160)'; x.fill();
      penPath(x, L, st.seed, .45, .75); penPath(x, R.reverse(), st.seed + 1, .45, .75);
    }
    x.globalAlpha = 1 - smooth(1.6, 2.4, f.age);
    x.save(); x.translate(f.cx + dx, f.cy + dy); x.rotate(rot); x.scale(s, s); x.translate(-f.cx, -f.cy); x.drawImage(f.img, f.x0, f.y0); x.restore();
    x.globalAlpha = 1;
  }
  drawCat(x, k) {
    const c = this.cat, s = c.scale;
    // a pencilled shadow under the cat
    if (GLOW_TEX) {
      x.setTransform(k, 0, 0, k, 0, 0); x.globalCompositeOperation = 'multiply';
      x.save(); x.beginPath(); x.ellipse(c.x - 4 * s * c.face, c.y + 2 * s, 110 * s * (1 - c.sit * .3), 13 * s, 0, 0, Math.PI * 2); x.clip();
      x.globalAlpha = .45; x.filter = 'grayscale(1) contrast(1.4)'; x.drawImage(GLOW_TEX, c.x - 140 * s, c.y - 30 * s, 300 * s, 60 * s); x.filter = 'none'; x.restore(); x.globalAlpha = 1;
    }
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over';
    x.setTransform(k, 0, 0, k, 0, 0); c.draw(x, k);
  }
  frame(t, dt) {
    this.update(t, dt);
    const x = this.x, k = this.c.width / PW;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.drawImage(this.base, 0, 0, this.c.width, this.c.height);
    for (const it of this.order()) if (it.op > .01 && !(it.b === 'text' && it.reveal <= 0)) this.drawItem(x, it, k);
    for (const it of this.items) if (it.b === 'glow') this.drawGlow(x, it, k);
    if (this.cat) this.drawCat(x, k);
    this.drawFx(x, k);
    x.globalCompositeOperation = 'source-over';
  }
}
