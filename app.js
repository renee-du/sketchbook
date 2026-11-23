(() => {
'use strict';
const A = 'assets/';
const PW = 900, PH = 1300;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error('Could not load ' + src)); i.src = src; });
}
function alphaOf(img) {
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data, a = new Uint8Array(c.width * c.height);
  for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
  return a;
}
function pagePoint(canvas, e) {
  const r = canvas.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * PW, y: (e.clientY - r.top) / r.height * PH, r };
}
const Layout = { pageW: 0 };
function fitCanvas(c, cap = 1) {
  const cssW = Layout.pageW || c.getBoundingClientRect().width;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(2, Math.round(Math.min(cssW * dpr, PW * cap)));
  const h = Math.round(w * PH / PW);
  if (c.width !== w || c.height !== h) { c.width = w; c.height = h; return true; }
  return false;
}

/* ======================================================= sound (synthesised) */
const Sound = {
  on: false, ctx: null, master: null, sea: null,
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0; this.master.connect(ctx.destination);
    // sea: brown noise -> lowpass, swelling slowly
    const len = ctx.sampleRate * 4, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    let last = 0; for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.2; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 520;
    const g = ctx.createGain(); g.gain.value = .32;
    const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = .085; lg.gain.value = .2;
    lfo.connect(lg); lg.connect(g.gain);
    const lfo2 = ctx.createOscillator(), lg2 = ctx.createGain(); lfo2.frequency.value = .11; lg2.gain.value = 220;
    lfo2.connect(lg2); lg2.connect(lp.frequency);
    src.connect(lp); lp.connect(g); g.connect(this.master); src.start(); lfo.start(); lfo2.start();
    this.noise = buf;
  },
  toggle(v) {
    this.on = v; if (v) this.init(); if (!this.ctx) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.setTargetAtTime(v ? .9 : 0, this.ctx.currentTime, .25);
  },
  blip(f0, f1, dur, vol, type = 'sine') {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .008); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + .02);
  },
  hiss(freq, q, dur, vol) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 3); s.stop(t + dur);
  },
  plop(strength = 1) { const p = 1 + Math.random() * .25; this.blip(760 * p, 240 * p, .16, .22 * strength); this.hiss(1800, .9, .22, .5 * strength); },
  tok(p = 1) { this.blip(320 * p, 150 * p, .09, .3, 'triangle'); },
  boing() { this.blip(520, 380, .35, .14); this.blip(780, 560, .25, .05); },
  drip() { this.blip(1500, 700, .07, .12); },
  squish() { this.hiss(600, 1.5, .18, .5); this.blip(180, 110, .15, .18, 'triangle'); },
  crunch() { [0, 45, 95].forEach((d, i) => setTimeout(() => this.hiss(2400 - i * 500, 1.2, .07, .55), d)); this.blip(160, 90, .1, .12, 'triangle'); },
};

/* ======================================================= sunset page (WebGL) */
const VERT = `attribute vec2 a; varying vec2 vUv; void main(){ vUv = a*.5+.5; gl_Position = vec4(a,0.,1.); }`;
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uBase, uSun, uGeo, uCover;
uniform float uTime, uSet, uPad, uCalm;
uniform vec2 uSunPos;
uniform vec4 uRip[16];
uniform float uRipS[16];
const vec2 R = vec2(900., 1300.);

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
  return mix(mix(hash(i), hash(i+vec2(1.,0.)), f.x), mix(hash(i+vec2(0.,1.)), hash(i+vec2(1.,1.)), f.x), f.y); }
// a field of pencil strokes running along angle a
float hatch(vec2 p, float a, float seed){
  float c = cos(a), s = sin(a);
  vec2 q = vec2(c*p.x + s*p.y, -s*p.x + c*p.y);
  float n = vnoise(vec2(q.x*.011 + seed, q.y*.17)) * .6 + vnoise(vec2(q.x*.03 - seed, q.y*.42 + seed*3.)) * .4;
  float patchy = smoothstep(.25, .75, vnoise(p*.011 + seed*5.));
  return smoothstep(.44, .80, n) * (.55 + .45*patchy) * (.72 + .28*hash(floor(p)));
}
// absorption of a warm pencil as the evening goes: yellow -> orange -> rose -> violet
vec3 warm(float st){
  vec3 a = mix(vec3(.02,.12,.55), vec3(.03,.33,.62), smoothstep(.12,.5,st));
  a = mix(a, vec3(.05,.42,.34), smoothstep(.5,.8,st));
  return mix(a, vec3(.24,.36,.15), smoothstep(.82,1.,st));
}
vec3 regrade(vec3 ink, float st, float keep){
  float k = clamp(min(ink.r, ink.g) - ink.b, 0., 1.);          // amount of yellow pigment
  vec3 other = ink / max(vec3(1., 1., 1. - k), vec3(.05));      // everything that is not yellow
  vec3 col = other * (1. - (k / .55) * keep * warm(st));
  return clamp(col, 0., 1.);
}

void main(){
  vec2 p = vec2(vUv.x, 1. - vUv.y) * R;
  vec4 geo = texture2D(uGeo, p / R);
  float sea = geo.r, land = geo.g, depth = geo.b;
  float cover = texture2D(uCover, p / R).r;
  float t = uTime, s = uSet;

  // ---- the sea moves: slow swell + click ripples
  vec2 disp = vec2(0.);
  float shade = 0.;
  if (sea > 0.) {
    float amp = mix(.5, 3.2, depth) * uCalm;
    disp.x = sin(p.y*.085 + t*1.25 + sin(p.x*.012 + t*.37)*2.2) * amp + sin(p.y*.031 - t*.7)*amp*.6;
    disp.y = sin(p.x*.018 + t*.8 + p.y*.02) * .35 * depth * uCalm;
    for (int i = 0; i < 16; i++) {
      vec4 r = uRip[i];
      float age = t - r.w;
      if (age < 0. || age > 4.5 || uRipS[i] <= 0.) continue;
      vec2 d = p - r.xy;
      vec2 q = vec2(d.x, d.y / r.z);
      float rad = length(q);
      float front = age * 95.;
      float width = 30. + age * 22.;
      float env = exp(-pow((rad - front) / width, 2.)) * exp(-age * .6) * uRipS[i] * 1.25;
      float w = sin((rad - front) * .13) * env;
      vec2 dir = rad > .001 ? normalize(vec2(q.x, q.y * r.z)) : vec2(0.);
      disp += dir * w * 9.;
      shade += w;
    }
    float nearH = smoothstep(0., .05, depth);
    disp *= nearH; shade *= nearH * sea;
  }
  vec2 sp = clamp(p + disp * sea, vec2(1.), R - 1.);
  vec3 ink = texture2D(uBase, sp / R).rgb;
  // the drawing's own stroke texture, used to lay new colour along the existing pencil
  float stroke = smoothstep(.10, .55, 1. - min(min(ink.r, ink.g), ink.b));
  float tooth = .35 + .65 * stroke;

  float horizon = 786.;                               // only used for gradients
  float yel = clamp((min(ink.r, ink.g) - ink.b) * 3.5, 0., 1.);

  if (sea < .5) {
    // ---- sky & mountains
    float above = max(0., uSunPos.y - p.y);
    float st = clamp(s + above / 520. * s * .9, 0., 1.);
    float fadeHigh = 1. - smoothstep(0., 1., (uSunPos.y - 70. - p.y) / 260.) * smoothstep(.0, .55, s) * .8;
    ink = regrade(ink, st, fadeHigh);
    // the glow follows the sun, flattening along the horizon as it goes
    vec2 g = (p - uSunPos) * vec2(.5, 1.);
    float glow = exp(-pow(length(g) / 165., 2.)) * smoothstep(.02, .35, s) * (1. - smoothstep(.78, 1., s)) * (1. - land);
    ink *= 1. - glow * .5 * tooth * warm(clamp(s * 1.1, 0., .9));
    float band = exp(-pow((horizon - 40. - p.y) / 95., 2.)) * smoothstep(.55, .85, s) * (1. - smoothstep(.97, 1.2, s) * .4);
    ink *= 1. - band * .45 * tooth * warm(.72 + s * .2);
    // dusk settles from the top of the page
    float dusk = smoothstep(.55, 1., s) * pow(clamp(1. - p.y / horizon, 0., 1.), .6);
    ink = pow(ink, vec3(1. + dusk * 1.1));
    ink *= 1. - dusk * .55 * tooth * vec3(.36, .31, .10);
    // mountains go to silhouette
    float m = land * (1. - sea);
    ink = mix(ink, pow(ink, vec3(1. + s * 1.1)) * (1. - s * .12 * vec3(.5, .55, .3)), m);
  } else {
    // ---- sea
    float refl = 1. - smoothstep(.62, .95, s);
    float sh = .42 + .95 * vnoise(vec2(p.x * .022 + t * .33, p.y * .085 - t * .22)) ;
    sh = mix(1., sh, .85 * uCalm);
    float k = clamp(min(ink.r, ink.g) - ink.b, 0., 1.);
    vec3 other = ink / max(vec3(1., 1., 1. - k), vec3(.05));
    float colx = exp(-pow((p.x - uSunPos.x) / 220., 2.));
    vec3 c = other * (1. - (k / .55) * sh * refl * warm(clamp(s * 1.15, 0., .9)));
    c *= 1. - (k / .55) * (1. - refl) * .75 * vec3(.30, .30, .07);  // faded glints turn to dusky blue
    ink = clamp(c, 0., 1.);
    float d = smoothstep(.5, 1., s);
    ink = pow(ink, vec3(1. + d * .6));
    ink *= 1. - d * .38 * cover * tooth * vec3(.34, .26, .08);
    // ripples drawn like pencil: crests erase toward paper, troughs press harder
    float grain = .45 + .55 * stroke;
    float crest = max(shade, 0.), trough = max(-shade, 0.);
    ink = mix(ink, vec3(1.), clamp(crest * .95 * grain, 0., .85));
    ink *= 1. - clamp(crest * colx * refl * 1.3 * grain, 0., .9) * vec3(.0, .10, .55);
    ink *= 1. - clamp(trough * 1.1 * grain, 0., .85) * vec3(.42, .26, .06);
  }

  // ---- the sun, setting behind the mountains
  float flt = smoothstep(680., 800., uSunPos.y);
  vec2 lp = p - uSunPos; lp.y /= (1. - .16 * flt); lp.x /= (1. + .04 * flt);
  vec2 su = lp / (2. * uPad) + .5;
  if (su.x > 0. && su.x < 1. && su.y > 0. && su.y < 1.) {
    vec4 sun = texture2D(uSun, su);
    float a = sun.a * (1. - land);
    vec3 sInk = regrade(sun.rgb, clamp(s * .95, 0., .72), 1.);
    sInk = mix(sInk, min(sInk, ink), .5 * smoothstep(0., .12, s));
    ink = mix(ink, sInk, a);
  }
  gl_FragColor = vec4(ink, 1.);
}`;

class Sunset {
  constructor(canvas, birdsCanvas, imgs, meta) {
    this.c = canvas; this.bc = birdsCanvas; this.bx = birdsCanvas.getContext('2d');
    this.meta = meta; this.imgs = imgs;
    this.s = 0; this.ripples = []; this.birds = []; this.nextBird = 9;
    const [sx, sy, pad] = meta.sun; this.sun0 = { x: sx, y: sy }; this.pad = pad;
    // CPU copy of the masks for hit testing
    const g = document.createElement('canvas'); g.width = PW; g.height = PH;
    const gx = g.getContext('2d', { willReadFrequently: true }); gx.drawImage(imgs.geo, 0, 0);
    this.geo = gx.getImageData(0, 0, PW, PH).data;
    this.gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false, preserveDrawingBuffer: false });
    if (this.gl) this.setupGL(); else this.ctx2d = canvas.getContext('2d');
    this.bindInput();
  }
  geoAt(x, y) { const i = (clamp(Math.round(y), 0, PH - 1) * PW + clamp(Math.round(x), 0, PW - 1)) * 4; return { sea: this.geo[i] / 255, land: this.geo[i + 1] / 255, depth: this.geo[i + 2] / 255 }; }
  setupGL() {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = this.prog = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VERT)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(pr); gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const tex = (img, unit, name) => {
      const t = gl.createTexture(); gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.uniform1i(gl.getUniformLocation(pr, name), unit);
    };
    tex(this.imgs.base, 0, 'uBase'); tex(this.imgs.sun, 1, 'uSun'); tex(this.imgs.geo, 2, 'uGeo'); tex(this.imgs.cover, 3, 'uCover');
    this.u = {};
    for (const n of ['uTime', 'uSet', 'uPad', 'uCalm', 'uSunPos', 'uRip', 'uRipS']) this.u[n] = gl.getUniformLocation(pr, n);
    gl.uniform1f(this.u.uPad, this.pad);
    this.ripBuf = new Float32Array(64); this.ripS = new Float32Array(16);
  }
  sunPos(s) {
    const k = clamp(s / .78, 0, 1);
    const e = k * k * (3 - 2 * k) * .35 + k * .65;
    return { x: this.sun0.x + e * 14, y: lerp(this.sun0.y, 848, e) };
  }
  ripple(x, y, strength, now) {
    const g = this.geoAt(x, y);
    if (g.sea < .5) return;
    this.ripples.push({ x, y, a: lerp(.22, .52, g.depth), t: now, s: strength });
    if (this.ripples.length > 16) this.ripples.shift();
  }
  bindInput() {
    const c = this.c;
    let drag = null, lastRip = 0;
    c.addEventListener('pointermove', (e) => {
      const p = pagePoint(c, e);
      if (!drag) { c.className = this.geoAt(p.x, p.y).sea > .5 ? 'sea' : 'sky'; return; }
      if (drag.mode === 'sea') {
        const now = performance.now() / 1000;
        if (now - lastRip > .07 && Math.hypot(p.x - drag.lx, p.y - drag.ly) > 10) {
          this.ripple(p.x, p.y, .55, this.time); lastRip = now; drag.lx = p.x; drag.ly = p.y;
          if (Math.random() < .35) Sound.plop(.35);
        }
      } else {
        if (Math.abs(p.y - drag.y0) > 6) drag.moved = true;
        if (drag.moved) { App.setTime(clamp(drag.s0 + (p.y - drag.y0) / 330, 0, 1), true); }
      }
    });
    c.addEventListener('pointerdown', (e) => {
      const p = pagePoint(c, e);
      App.touched();
      const g = this.geoAt(p.x, p.y);
      c.setPointerCapture(e.pointerId);
      if (g.sea > .5) {
        drag = { mode: 'sea', lx: p.x, ly: p.y };
        this.ripple(p.x, p.y, 1, this.time); Sound.plop(1);
      } else {
        drag = { mode: 'sky', y0: p.y, x0: p.x, s0: App.s, moved: false };
        App.holding = true;
      }
    });
    const end = (e) => {
      if (drag && drag.mode === 'sky') {
        App.holding = false;
        if (!drag.moved) this.flock(drag.x0, drag.y0);
      }
      drag = null;
    };
    c.addEventListener('pointerup', end); c.addEventListener('pointercancel', end);
    c.addEventListener('keydown', (e) => {});
  }
  // gulls, drawn as quick graphite strokes
  flock(x, y, n = 2 + (Math.random() * 2 | 0), calm = false) {
    const dir = calm ? (Math.random() < .5 ? -1 : 1) : (x < PW / 2 ? 1 : -1);
    for (let i = 0; i < n; i++) {
      this.birds.push({
        x: x + (Math.random() - .5) * 110 + i * dir * -26, y: y + (Math.random() - .5) * 60,
        vx: dir * (55 + Math.random() * 40), vy: -(calm ? 4 : 18) - Math.random() * 14,
        ph: Math.random() * 6, fr: 7 + Math.random() * 3, sc: (calm ? .8 : 1.15) + Math.random() * .35,
        shrink: calm ? .015 : .06, age: 0, seed: Math.random() * 100,
      });
    }
    if (!calm) Sound.hiss(3200, 2, .25, .12);
  }
  drawBirds(dt) {
    const b = this.bc, x = this.bx;
    const k = b.width / PW;
    x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, b.width, b.height);
    if (!this.birds.length) return;
    x.setTransform(k, 0, 0, k, 0, 0);
    this.birds = this.birds.filter((bd) => {
      bd.age += dt; bd.ph += dt * bd.fr; bd.x += bd.vx * dt * bd.sc; bd.y += bd.vy * dt; bd.vy *= (1 - dt * .3);
      bd.sc = Math.max(.3, bd.sc - bd.shrink * dt);
      const alpha = Math.min(1, bd.age * 4) * (1 - smooth(7, 9, bd.age));
      if (bd.x < -60 || bd.x > PW + 60 || bd.y < -40 || alpha <= 0) return false;
      const sp = 19 * bd.sc, f = Math.sin(bd.ph), up = 9 * bd.sc;
      const tipY = bd.y - f * up, ctlY = bd.y - up * (.55 + .45 * f) - 3 * bd.sc;
      const dir = Math.sign(bd.vx) || 1;
      // one continuous fineliner stroke: tip -> body -> tip, like the cherry stem
      const wing = (side) => [
        [bd.x + side * sp, tipY + side * dir * 1.2 * bd.sc],
        [bd.x + side * sp * .42, ctlY],
        [bd.x, bd.y + 1.2 * bd.sc],
      ];
      penStroke(x, [...wing(-1), ...wing(1).reverse().slice(1)], bd.seed, Math.min(1.15, .75 + bd.sc * .3), alpha);
      return true;
    });
  }
  resize() { fitCanvas(this.c); fitCanvas(this.bc); if (this.gl) this.gl.viewport(0, 0, this.c.width, this.c.height); }
  frame(time, dt, s) {
    this.time = time; this.s = s;
    if (!reduced) { this.nextBird -= dt; if (this.nextBird < 0) { this.nextBird = 22 + Math.random() * 20; this.flock(Math.random() < .5 ? -30 : PW + 30, 180 + Math.random() * 260, 1 + (Math.random() * 3 | 0), true); } }
    const sp = this.sunPos(s);
    if (this.gl) {
      const gl = this.gl;
      gl.uniform1f(this.u.uTime, time); gl.uniform1f(this.u.uSet, s);
      gl.uniform1f(this.u.uCalm, reduced ? .3 : 1);
      gl.uniform2f(this.u.uSunPos, sp.x, sp.y);
      this.ripBuf.fill(0); this.ripS.fill(0);
      this.ripples.forEach((r, i) => { this.ripBuf.set([r.x, r.y, r.a, r.t], i * 4); this.ripS[i] = r.s; });
      gl.uniform4fv(this.u.uRip, this.ripBuf); gl.uniform1fv(this.u.uRipS, this.ripS);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else if (this.ctx2d) {
      const x = this.ctx2d, k = this.c.width / PW;
      x.setTransform(k, 0, 0, k, 0, 0); x.drawImage(this.imgs.base, 0, 0, PW, PH);
      x.drawImage(this.imgs.sun, this.sun0.x - this.pad, this.sun0.y - this.pad);
    }
    this.drawBirds(dt);
  }
}

/* A line in the artist's fineliner: the same blue-black ink as the labels (sampled
   from the scan), ~3px wide on the page, a little heavier mid-stroke, lifting at the ends. */
const PEN = [52, 61, 64];
function penStroke(x, pts, seed, scale, alpha) {
  const path = [];
  for (let i = 0; i + 2 < pts.length; i += 2) {
    const [a, c, b] = [pts[i], pts[i + 1], pts[i + 2]];
    for (let j = i ? 1 : 0; j <= 14; j++) {
      const t = j / 14, u = 1 - t;
      path.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
    }
  }
  const n = path.length, L = [], R = [];
  for (let i = 0; i < n; i++) {
    const p = path[i], q = path[Math.min(n - 1, i + 1)], o = path[Math.max(0, i - 1)];
    let tx = q[0] - o[0], ty = q[1] - o[1]; const len = Math.hypot(tx, ty) || 1; tx /= len; ty /= len;
    const t = i / (n - 1);
    const w = 1.55 * scale * (.35 + .65 * Math.pow(Math.sin(Math.PI * t), .45)) * (1 + .12 * Math.sin(t * 9 + seed));
    const wob = Math.sin(t * 7.3 + seed * 3.1) * .35 * scale;
    L.push([p[0] - ty * (w + wob), p[1] + tx * (w + wob)]);
    R.push([p[0] + ty * (w - wob), p[1] - tx * (w - wob)]);
  }
  x.beginPath();
  L.forEach((p, i) => (i ? x.lineTo(p[0], p[1]) : x.moveTo(p[0], p[1])));
  for (let i = n - 1; i >= 0; i--) x.lineTo(R[i][0], R[i][1]);
  x.closePath();
  x.fillStyle = `rgba(${PEN}, ${.86 * alpha})`; x.fill();
  x.lineWidth = 1.2; x.lineJoin = 'round'; x.strokeStyle = `rgba(${PEN}, ${.18 * alpha})`; x.stroke();  // soft edge like the scan
}

/* ======================================================= treats page (2D) */
class Treats {
  constructor(canvas, imgs, meta) {
    this.c = canvas; this.x = canvas.getContext('2d'); this.base = imgs.left_base;
    const pivots = {   // where each thing rests or hangs (page px)
      melon0: [200, 392], melon1: [150, 540], melon2: [272, 522],
      cherry: [398, 262], popsicle: [612, 604], eclair: [420, 768],
    };
    this.items = Object.entries(meta).map(([name, [x, y, w, h]]) => ({
      name, img: imgs[name], x, y, w, h, alpha: alphaOf(imgs[name]),
      pv: pivots[name] || [x + w / 2, y + h], label: name.startsWith('lbl'),
      ty: 0, vy: 0, rot: 0, vr: 0, sq: 0, vsq: 0, air: false, hover: 0, reveal: 0, idle: Math.random() * 6,
    }));
    const order = ['lbl_melon', 'lbl_bracket', 'lbl_cherry', 'lbl_pop', 'lbl_eclair', 'melon1', 'melon2', 'melon0', 'eclair', 'popsicle', 'cherry'];
    this.items.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
    this.by = Object.fromEntries(this.items.map((i) => [i.name, i]));
    this.drops = []; this.crumbs = [];
    this.setupPopsicle();
    this.writeT = reduced ? 99 : -0.3;
    this.off = document.createElement('canvas'); this.ox = this.off.getContext('2d');
    this.bindInput();
  }
  hit(px, py) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      // undo the item's current transform (approximately: translate + rotate about pivot)
      const [cx, cy] = it.pv; const a = -it.rot;
      let dx = px - cx, dy = py - (cy + it.ty);
      const rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
      const lx = Math.round(rx + cx - it.x), ly = Math.round(ry + cy - it.y);
      const pad = it.label ? 6 : 0;
      for (let oy = -pad; oy <= pad; oy += 3) for (let ox = -pad; ox <= pad; ox += 3) {
        const X = lx + ox, Y = ly + oy;
        if (X >= 0 && Y >= 0 && X < it.w && Y < it.h && it.alpha[Y * it.w + X] > 50) return it;
      }
    }
    return null;
  }
  hop(it, power = 1) {
    if (it.air) return;
    it.sq = -.13 * power;
    setTimeout(() => { it.air = true; it.vy = -420 * power; it.vr += (Math.random() - .5) * 2.4 * power; it.vsq += 2.2 * power; Sound.tok(.9 + Math.random() * .3); }, 75);
  }
  poke(it, px, py) {
    const n = it.name;
    if (n.startsWith('melon')) {
      this.hop(it, 1);
      ['melon0', 'melon1', 'melon2'].filter((m) => m !== n).forEach((m, i) => setTimeout(() => this.hop(this.by[m], .45), 140 + i * 110));
    } else if (n === 'cherry') {
      it.vr += (px < it.pv[0] - 20 ? -1 : 1) * (3.2 + Math.random());
      Sound.boing();
    } else if (n === 'popsicle') {
      this.bite(it, px, py);
    } else if (n === 'eclair') {
      it.sq = -.12; it.vsq = -1.5; it.vr += (px < it.pv[0] ? -.4 : .4);
      Sound.squish();
    } else if (it.label) {
      it.vr += .9;
    }
  }
  drip() {
    const spots = [[492, 552], [540, 590], [578, 601], [636, 596]].filter(([sx]) => sx > this.popFront + 20);
    if (!spots.length) return;
    const [x, y] = spots[Math.random() * spots.length | 0];
    this.drops.push({ x, y, y0: y, vy: 0, len: 0, age: 0, state: 'grow', puddle: 0 });
  }
  /* ---- the popsicle gets eaten, one bite per tap, from the tip toward the stick */
  setupPopsicle() {
    const it = this.by.popsicle; this.pop = it;
    const c = document.createElement('canvas'); c.width = it.w; c.height = it.h;
    this.popOrig = it.img; it.img = c; this.popCtx = c.getContext('2d', { willReadFrequently: true });
    // the stick (page px) is never eaten
    this.stick = [[659, 521], [688, 511], [705, 517], [746, 528], [773, 542], [786, 554], [780, 571], [758, 574], [724, 568], [699, 560], [680, 552], [658, 544]];
    this.biteSeq = [[466, 468, 60], [500, 545, 58], [536, 438, 62], [570, 532, 62], [606, 446, 64], [636, 548, 60], [662, 462, 62]];
    this.resetPopsicle();
  }
  resetPopsicle() {
    const it = this.pop, x = this.popCtx;
    x.globalCompositeOperation = 'source-over'; x.clearRect(0, 0, it.w, it.h); x.drawImage(this.popOrig, 0, 0);
    it.alpha = alphaOf(it.img); this.bites = 0; this.popFront = 0;
  }
  stickPath(x, grow = 0) {
    const it = this.pop; x.beginPath();
    this.stick.forEach(([px, py], i) => { const X = px - it.x, Y = py - it.y; i ? x.lineTo(X, Y) : x.moveTo(X, Y); });
    x.closePath();
  }
  keepStick(x) { this.stickPath(x); x.fillStyle = '#000'; x.fill(); x.lineWidth = 6; x.lineJoin = 'round'; x.strokeStyle = '#000'; x.stroke(); }
  biteShape(x, cx, cy, r, grow) {
    // a jaw: one round bite with a row of teeth marks scalloping its rim
    x.beginPath(); x.arc(cx, cy, r - 5 + grow, 0, Math.PI * 2); x.fill();
    const n = Math.round(2 * Math.PI * r / 15);
    for (let i = 0; i < n; i++) {
      const a = i / n * Math.PI * 2;
      x.beginPath(); x.arc(cx + Math.cos(a) * (r - 6), cy + Math.sin(a) * (r - 6), 9.5 + grow, 0, Math.PI * 2); x.fill();
    }
  }
  bite(it, px, py) {
    if (this.bites > this.biteSeq.length) {           // only the stick left: hand over a fresh one
      this.resetPopsicle(); it.sq = -.32; it.vsq = 4; it.vr = .5;
      Sound.blip(420, 840, .18, .12); Sound.blip(640, 1280, .22, .06);
      return;
    }
    const W = it.w, H = it.h, ctx = this.popCtx;
    const before = ctx.getImageData(0, 0, W, H);
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const t = tmp.getContext('2d');
    const last = this.bites === this.biteSeq.length;
    const shapes = last ? null : this.biteSeq[this.bites];
    const shape = (g, grow) => {
      if (last) { g.fillRect(0, 0, W, H); return; }
      const [bx, by, r] = shapes; this.biteShape(g, bx - it.x, by - it.y, r, grow);
    };
    // cut face: a band of pale cheesecake just inside the new edge, then the pen line on the edge
    if (!last) {
      t.fillStyle = 'rgb(238, 236, 214)'; shape(t, 11);
      t.globalCompositeOperation = 'destination-out'; shape(t, 2.6);
      t.globalCompositeOperation = 'source-over'; t.fillStyle = `rgb(${PEN})`;
      const ring = document.createElement('canvas'); ring.width = W; ring.height = H; const rg = ring.getContext('2d');
      rg.fillStyle = `rgb(${PEN})`; shape(rg, 2.8); rg.globalCompositeOperation = 'destination-out'; shape(rg, 0);
      t.drawImage(ring, 0, 0);
      t.globalCompositeOperation = 'destination-in'; t.drawImage(it.img, 0, 0);      // only where there is still popsicle
      t.globalCompositeOperation = 'destination-out'; this.keepStick(t);
      t.globalCompositeOperation = 'source-over';
    }
    // crumbs: real pixels from the bitten part
    const mask = document.createElement('canvas'); mask.width = W; mask.height = H; const mk = mask.getContext('2d');
    shape(mk, 0); mk.globalCompositeOperation = 'destination-out'; this.keepStick(mk);
    const md = mk.getImageData(0, 0, W, H).data, bd = before.data;
    let tries = 0, made = 0;
    while (made < 14 && tries++ < 600) {
      const X = Math.random() * W | 0, Y = Math.random() * H | 0, i = (Y * W + X) * 4;
      if (md[i + 3] > 128 && bd[i + 3] > 200) {
        this.crumbs.push({ x: X + it.x, y: Y + it.y, vx: (Math.random() - .7) * 160, vy: -Math.random() * 220 - 40, r: Math.random() * 6, vr: (Math.random() - .5) * 18,
          s: 1.6 + Math.random() * 2.4, col: `rgb(${bd[i]},${bd[i + 1]},${bd[i + 2]})`, floor: 598 + Math.random() * 34, age: 0 });
        made++;
      }
    }
    // take the bite
    ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(tmp, 0, 0);
    it.alpha = alphaOf(it.img);
    this.bites++;
    this.popFront = last ? 999 : shapes[0] + shapes[2] * .6;
    it.vr += -.9 - Math.random() * .4; it.sq = -.06; it.vsq -= 1.2;
    Sound.crunch();
    if (!last && Math.random() < .5) this.drip();
    if (last) setTimeout(() => this.pill('finito!', 'tap the stick for another', it), 350);
  }
  pill(main, sub, it) {
    const host = this.c.parentElement; host.querySelectorAll('.say').forEach((n) => n.remove());
    const pill = document.createElement('div'); pill.className = 'say';
    pill.innerHTML = '<b></b><span></span>'; pill.querySelector('b').textContent = main; pill.querySelector('span').textContent = sub;
    pill.style.left = clamp((it.x + it.w * .7) / PW * 100, 18, 82) + '%'; pill.style.top = ((it.y + 110) / PH * 100) + '%';
    host.appendChild(pill); setTimeout(() => pill.remove(), 2700);
  }
  bindInput() {
    const c = this.c; let hovered = null, last = null;
    c.addEventListener('pointermove', (e) => {
      const p = pagePoint(c, e); const h = this.hit(p.x, p.y);
      c.style.cursor = h ? 'pointer' : 'default';
      if (h && h.name === 'cherry' && last) { h.vr += clamp((p.x - last.x) * .012, -.6, .6); }   // brush the cherry
      hovered = h; last = p;
      this.items.forEach((i) => i.hoverT = i === h ? 1 : 0);
    });
    c.addEventListener('pointerleave', () => { this.items.forEach((i) => i.hoverT = 0); c.style.cursor = 'default'; last = null; });
    c.addEventListener('pointerdown', (e) => {
      App.touched();
      const p = pagePoint(c, e); const h = this.hit(p.x, p.y);
      if (h) this.poke(h, p.x, p.y);
    });
  }
  resize() { fitCanvas(this.c); this.off.width = this.c.width; this.off.height = this.c.height; }
  update(t, dt) {
    this.writeT += dt;
    let wt = this.writeT;
    for (const it of this.items) {
      if (it.label) { const d = it.name === 'lbl_bracket' ? .3 : .75; it.reveal = clamp(wt / d, 0, 1); wt -= d * .85; }
      it.hover = lerp(it.hover, it.hoverT || 0, 1 - Math.exp(-dt * 12));
      // rotation spring (cherry is a looser pendulum)
      const pend = it.name === 'cherry';
      const kR = pend ? 16 : it.label ? 90 : 70, cR = pend ? 1.1 : it.label ? 9 : 6;
      let target = 0;
      if (pend && !reduced) target = Math.sin(t * 1.05 + 1) * .022 + Math.sin(t * .41) * .016;
      it.vr += (-(it.rot - target) * kR - it.vr * cR) * dt; it.rot += it.vr * dt;
      it.rot = clamp(it.rot, -.9, .9);
      // squash spring
      it.vsq += (-it.sq * 160 - it.vsq * 9) * dt; it.sq += it.vsq * dt;
      // hops
      if (it.air) {
        it.vy += 1900 * dt; it.ty += it.vy * dt;
        if (it.ty >= 0) { it.ty = 0; it.air = false; it.vsq -= Math.min(it.vy, 600) * .006; it.vr *= .3; it.vy = 0; Sound.tok(.7); }
      } else if (!it.label && !pend) {
        it.rot *= 1 - Math.min(1, dt * (it.name.startsWith('melon') ? 6 : 0));
      }
    }
    // popsicle drips: bead forms, stretches, falls, spreads
    for (const d of this.drops) {
      d.age += dt;
      if (d.state === 'grow') { d.len = Math.min(1, d.len + dt * 1.1); if (d.len >= 1) { d.state = 'fall'; Sound.drip(); } }
      else if (d.state === 'fall') { d.vy += 900 * dt; d.y += d.vy * dt; if (d.y > d.y0 + 46) { d.state = 'pool'; Sound.drip(); } }
      else { d.puddle = Math.min(1, d.puddle + dt * 3); }
    }
    this.drops = this.drops.filter((d) => d.age < 6);
    for (const c of this.crumbs) {
      c.age += dt;
      if (c.y < c.floor) { c.vy += 1500 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.r += c.vr * dt; }
      if (c.y >= c.floor) { c.y = c.floor; if (c.vy > 120) { c.vy *= -.28; c.vx *= .5; c.y -= .5; } else { c.vy = 0; c.vx = 0; } }
    }
    this.crumbs = this.crumbs.filter((c) => c.age < 5);
  }
  draw() {
    const x = this.x, k = this.c.width / PW;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.globalCompositeOperation = 'source-over';
    x.drawImage(this.base, 0, 0, this.c.width, this.c.height);
    x.globalCompositeOperation = 'multiply';
    for (const it of this.items) {
      if (it.label && it.reveal <= 0) continue;
      const [cx, cy] = it.pv;
      const lift = it.label ? 0 : -it.hover * 3;
      const sy = 1 + it.sq, sx = 1 - it.sq * .55;
      x.setTransform(k, 0, 0, k, 0, 0);
      x.translate(cx, cy + it.ty + lift); x.rotate(it.rot); x.scale(sx, sy); x.translate(-cx, -cy);
      if (it.label && it.reveal < 1) {
        // write the words on, left to right
        const o = this.ox; o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, this.off.width, this.off.height);
        o.setTransform(k, 0, 0, k, 0, 0); o.globalCompositeOperation = 'source-over';
        o.drawImage(it.img, it.x, it.y, it.w, it.h);
        const edge = it.x + it.w * it.reveal, soft = 26;
        const g = o.createLinearGradient(edge - soft, 0, edge, 0); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        o.globalCompositeOperation = 'destination-in'; o.fillStyle = g;
        if (it.name === 'lbl_bracket') {
          const ey = it.y + it.h * it.reveal; const gy = o.createLinearGradient(0, ey - soft, 0, ey);
          gy.addColorStop(0, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)'); o.fillStyle = gy;
        }
        o.fillRect(0, 0, PW, PH);
        x.setTransform(1, 0, 0, 1, 0, 0); x.drawImage(this.off, 0, 0);
      } else {
        x.drawImage(it.img, it.x, it.y, it.w, it.h);
      }
    }
    // drips, inked like the drawing: cream fill, quick dark outline
    x.setTransform(k, 0, 0, k, 0, 0);
    for (const c of this.crumbs) {
      x.globalAlpha = 1 - smooth(3.4, 5, c.age);
      x.fillStyle = c.col;
      x.save(); x.translate(c.x, c.y); x.rotate(c.r);
      x.beginPath(); x.moveTo(-c.s, -c.s * .6); x.lineTo(c.s * .8, -c.s * .8); x.lineTo(c.s, c.s * .5); x.lineTo(-c.s * .5, c.s * .8); x.closePath(); x.fill();
      x.restore();
    }
    x.globalAlpha = 1;
    for (const d of this.drops) {
      const fade = 1 - smooth(4, 6, d.age);
      x.globalAlpha = fade;
      x.fillStyle = 'rgb(226, 226, 196)'; x.strokeStyle = 'rgba(38, 38, 44, .8)'; x.lineWidth = 1.3;
      x.beginPath();
      if (d.state === 'pool') {
        x.ellipse(d.x, d.y0 + 50, 4 + d.puddle * 9, 2 + d.puddle * 2.4, 0, 0, Math.PI * 2);
      } else {
        const r = 3.6 * (d.state === 'grow' ? d.len : 1), st = d.state === 'fall' ? Math.min(14, d.vy * .02) : 0;
        const y = d.state === 'grow' ? d.y0 + d.len * 6 : d.y;
        x.moveTo(d.x, y - r - 4 - st); x.quadraticCurveTo(d.x + r * 1.1, y - r * .2, d.x + r, y);
        x.arc(d.x, y, r, 0, Math.PI); x.quadraticCurveTo(d.x - r * 1.1, y - r * .2, d.x, y - r - 4 - st);
      }
      x.fill(); x.stroke(); x.globalAlpha = 1;
    }
  }
}


/* ======================================================= more sounds */
Object.assign(Sound, {
  meow() {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o.frequency.setValueAtTime(420, t); o.frequency.linearRampToValueAtTime(720, t + .16); o.frequency.exponentialRampToValueAtTime(380, t + .55);
    f.type = 'bandpass'; f.Q.value = 3; f.frequency.setValueAtTime(900, t); f.frequency.linearRampToValueAtTime(1600, t + .18); f.frequency.linearRampToValueAtTime(800, t + .55);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.16, t + .05); g.gain.exponentialRampToValueAtTime(.0001, t + .6);
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + .62);
  },
  sweep(f0, f1, dur, vol, q = 1.2) {
    if (!this.on || !this.ctx) return;
    const c = this.ctx, t = c.currentTime, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = this.noise; f.type = 'bandpass'; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + dur * .2); g.gain.exponentialRampToValueAtTime(.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 2); s.stop(t + dur + .05);
  },
  slurp() { this.sweep(700, 2600, .35, .5, 4); [80, 170, 260].forEach((d) => setTimeout(() => this.blip(500 + Math.random() * 400, 300, .06, .08), d)); },
  pour() { this.sweep(300, 1400, 1.1, .45, .8); },
  whoosh() { this.sweep(260, 1800, .32, .5, .9); },
  clink() { this.blip(2600, 2500, .35, .12); this.blip(3900, 3800, .25, .05); },
  ting() { this.blip(1900, 1880, .5, .1); this.blip(2850, 2830, .35, .05); },
  splash() { this.hiss(1100, .7, .5, .6); this.plop(.8); },
  cheer() { this.sweep(700, 1100, 1.2, .35, .6); },
  chime() { [1320, 1760, 2093].forEach((f, i) => setTimeout(() => this.blip(f, f, .4, .06), i * 70)); },
  click() { this.blip(1400, 900, .03, .15, 'square'); },
});

/* ======================================================= pen effects in the artist's line */
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
  x.closePath(); x.fillStyle = `rgba(${PEN}, ${.86 * alpha})`; x.fill();
  x.lineWidth = 1.1; x.strokeStyle = `rgba(${PEN}, ${.18 * alpha})`; x.stroke();
}
const arcPts = (cx, cy, rx, ry, a0, a1, n = 24) => Array.from({ length: n + 1 }, (_, i) => { const a = a0 + (a1 - a0) * i / n; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]; });
const ease = (t) => (t = clamp(t, 0, 1), t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

/* the lamplight: the artist's own yellow pencil hatching, tinted, faded at the edges */
let GLOW_TEX = null;
function glowTexture(img) {
  if (GLOW_TEX) return GLOW_TEX;
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height);
  for (let i = 0; i < d.data.length; i += 4) { const a = d.data[i]; d.data[i] = 250; d.data[i + 1] = 214; d.data[i + 2] = 96; d.data[i + 3] = a; }
  x.putImageData(d, 0, 0); GLOW_TEX = c; return c;
}

function letterSegments(alpha, w, h) {
  const col = new Float32Array(w);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (alpha[y * w + x] > 60) col[x]++;
  const segs = []; let s0 = -1, gap = 0;
  for (let x = 0; x <= w; x++) {
    const on = x < w && col[x] > 0;
    if (on) { if (s0 < 0) s0 = x; gap = 0; }
    else if (s0 >= 0 && ++gap >= 3) { segs.push([s0, x - gap + 1]); s0 = -1; }
  }
  if (s0 >= 0) segs.push([s0, w]);
  // merge slivers into neighbours so dots/accents travel with their letter
  return segs.reduce((a, sg) => { const l = a[a.length - 1]; if (l && (sg[1] - sg[0] < 6 || sg[0] - l[1] < 2)) l[1] = sg[1]; else a.push(sg); return a; }, []);
}
function editable(it) {
  const c = document.createElement('canvas'); c.width = it.w; c.height = it.h;
  const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(it.orig, 0, 0);
  it.img = c; it.ctx = x; it.alpha = alphaOf(c);
  it.area0 = it.alpha.reduce((n, a) => n + (a > 50), 0);
}
function areaLeft(it) { return it.alpha.reduce((n, a) => n + (a > 50), 0) / Math.max(1, it.area0); }
function meanColor(data, mask) {
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < data.length; i += 16) if (mask[i + 3] > 128 && data[i + 3] > 200) { r += data[i]; g += data[i + 1]; b += data[i + 2]; n++; }
  return n ? [r / n, g / n, b / n] : [230, 220, 200];
}

/* ======================================================= a page of drawings that respond */
class SketchPage {
  constructor(pid, recs, base, imgs, canvas) {
    this.pid = pid; this.c = canvas; this.x = canvas.getContext('2d'); this.base = base;
    this.fx = []; this.zones = []; this.items = []; this.t = 0; this.breeze = 0; this.gust = 0; this.nextGust = 6;
    this.writeT = 99;
    let k = 0;
    for (const r of recs) {
      if (r.zone) { this.zones.push(r); continue; }
      const it = Object.assign({}, r, { img: imgs[k], orig: imgs[k++] });
      it.alpha = alphaOf(it.img);
      it.pv = r.pv || [it.x + it.w / 2, it.y + it.h];
      Object.assign(it, { tx: 0, ty: 0, vx: 0, vy: 0, rot: 0, vr: 0, sq: 0, vsq: 0, sc: 1, op: 1, flip: 1, air: false, hover: 0, seed: Math.random() * 100 });
      this.init(it);
      this.items.push(it);
    }
    this.by = Object.fromEntries(this.items.map((i) => [i.id, i]));
    this.draw_order = [...this.items].reverse();          // first-listed sits on top
    for (const it of this.items) if (it.parent) it.par = this.by[it.parent];
    this.glowImg = null;
    this.bind();
  }
  init(it) {
    const b = it.b;
    if (b === 'text') { it.segs = letterSegments(it.alpha, it.w, it.h); it.bounceT = -9; it.reveal = 1; }
    if (b === 'eat' || b === 'scoop' || b === 'pluck' || b === 'slices') { editable(it); it.done = 0; it.wedge = 0; }
    if (b === 'sip') { it.empty = this.emptyCup(it.img); it.drunk = 0; it.drunkTo = 0; it.slosh = 0; }
    if (b === 'fan') { it.fold = 0; it.foldTo = 0; }
    if (b === 'glow') { it.on = 0; it.amt = 0; }
    if (b === 'walk') { it.dest = 0; it.face = 1; it.phase = 0; }
    if (b === 'toss') { it.state = 'home'; it.t = 0; }
    if (b === 'flutter') { it.flyT = -1; }
    if (b === 'crowd') { it.cheer = 0; }
    if (b === 'tree' || b === 'sway') { it.gustAmt = 0; }
    if (b === 'pulse') { it.pulse = 0; it.nextPulse = Math.random() * 1.2; }
    if (it.drips) it.nextDrip = 1 + Math.random() * it.drips.every;
  }
  emptyCup(img) {
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const d = x.getImageData(0, 0, c.width, c.height), p = d.data;
    for (let i = 0; i < p.length; i += 4) {
      const mx = Math.max(p[i], p[i + 1], p[i + 2]), mn = Math.min(p[i], p[i + 1], p[i + 2]);
      if (mn > 120 && (mx - mn) > 14) {                     // pencil colour, not pen line
        const keep = .12; p[i] = 255 - (255 - p[i]) * keep; p[i + 1] = 255 - (255 - p[i + 1]) * keep; p[i + 2] = 255 - (255 - p[i + 2]) * keep;
      }
    }
    x.putImageData(d, 0, 0); return c;
  }
  onShow() { if (this.shownOnce) return; this.shownOnce = true; this.writeT = reduced ? 99 : -.25; }
  resize() { fitCanvas(this.c); }

  /* ---------------------------------------------------------------- input */
  toLocal(it, px, py) {
    const chain = []; for (let i = it; i; i = i.par) chain.unshift(i);
    let x = px, y = py;
    for (const c of chain) {
      const [cx, cy] = c.pv; const a = -c.rot;
      let dx = x - (cx + c.tx), dy = y - (cy + c.ty);
      let rx = dx * Math.cos(a) - dy * Math.sin(a), ry = dx * Math.sin(a) + dy * Math.cos(a);
      rx /= (1 - c.sq * .55) * c.sc * (c.flip || 1); ry /= (1 + c.sq) * c.sc;
      x = rx + cx; y = ry + cy;
    }
    return [x - it.x, y - it.y];
  }
  hit(px, py) {
    for (const it of this.items) {
      if (it.op < .3 || it.b === 'water' && false) continue;
      if (it.b === 'glow' && Math.hypot(px - it.glow[0] - it.tx, py - it.glow[1] - it.ty) < 62) return it;
      const [lx, ly] = this.toLocal(it, px, py);
      const pad = it.b === 'text' ? 6 : 2;
      for (let oy = -pad; oy <= pad; oy += 2) for (let ox = -pad; ox <= pad; ox += 2) {
        const X = Math.round(lx + ox), Y = Math.round(ly + oy);
        if (X >= 0 && Y >= 0 && X < it.w && Y < it.h && it.alpha[Y * it.w + X] > 50) return it;
      }
      if ((it.b === 'eat' || it.b === 'scoop' || it.b === 'slices' || it.b === 'pluck') && it.done && lx >= 0 && ly >= 0 && lx < it.w && ly < it.h) return it;
    }
    for (const z of this.zones) { const [x0, y0, x1, y1] = z.box; if (px >= x0 && px <= x1 && py >= y0 && py <= y1) return z; }
    return null;
  }
  bind() {
    const c = this.c;
    c.addEventListener('pointermove', (e) => {
      const p = pagePoint(c, e); const h = this.hit(p.x, p.y);
      c.style.cursor = h && !h.zone ? 'pointer' : 'default';
      for (const i of this.items) i.hoverT = i === h ? 1 : 0;
      if (h && h.b === 'pendulum' && this.lastP) h.vr += clamp((p.x - this.lastP.x) * .004, -.2, .2);
      this.lastP = p;
    });
    c.addEventListener('pointerleave', () => { for (const i of this.items) i.hoverT = 0; this.lastP = null; });
    c.addEventListener('pointerdown', (e) => {
      App.touched();
      const p = pagePoint(c, e); const h = this.hit(p.x, p.y);
      if (h) this.tap(h, p.x, p.y);
    });
  }

  /* ---------------------------------------------------------------- reactions */
  hop(it, power = 1, delay = 0) {
    setTimeout(() => {
      if (it.air) return;
      it.sq = -.12 * power;
      setTimeout(() => { it.air = true; it.vy = -430 * power; it.vr += (Math.random() - .5) * 1.6 * power; it.vsq += 2 * power; Sound.tok(.8 + Math.random() * .4); }, 70);
    }, delay);
  }
  group(it) { return this.items.filter((o) => o.group && o.group === it.group && o !== it); }
  tap(it, px, py) {
    const side = px < it.pv[0] ? -1 : 1;
    switch (it.b) {
      case 'birds': this.flock(px, py, 3 + (Math.random() * 3 | 0)); Sound.sweep(2500, 4200, .3, .15, 2); break;
      case 'text': it.bounceT = this.t; Sound.blip(880, 1320, .08, .05); break;
      case 'hop':
        if (it.step) { this.items.filter((o) => o.group === it.group).forEach((o, i) => { for (let k = 0; k < 4; k++) this.hop(o, .45, (k * 2 + i) * 190); }); break; }
        if (it.tip) { it.vr -= 2.2; it.vsq -= 1; Sound.tok(1.3); setTimeout(() => Sound.tok(1.1), 160); break; }
        this.hop(it, 1); this.group(it).forEach((o, i) => this.hop(o, .45, 130 + i * 110)); break;
      case 'pendulum': it.vr += side * (it.k < 20 ? 2.4 : 1.4); Sound.tok(1.4); break;
      case 'tail': it.vr += 4; break;
      case 'walk': this.walk(it); break;
      case 'glow':
        it.on = !it.on; Sound.click(); if (it.swing) it.vr += side * .6;
        if (it.on) setTimeout(() => Sound.blip(220, 220, .4, .03), 40); break;
      case 'sip': this.sip(it); break;
      case 'eat': case 'scoop': this.eat(it, px, py); break;
      case 'pluck': this.pluck(it, px, py); break;
      case 'slices': this.slice(it); break;
      case 'fan': it.foldTo = it.foldTo ? 0 : 1; Sound.whoosh(); [0, 90, 180, 270].forEach((d) => setTimeout(() => Sound.click(), d + 60)); break;
      case 'lid': this.hop(it, 1.35); it.vr += side * -.9; setTimeout(() => Sound.clink(), 60); it.lidUp = true; break;
      case 'clam': it.clamT = 0; Sound.tok(.7); break;
      case 'flutter': if (it.flyT < 0) { it.flyT = 0; Sound.sweep(1800, 3200, .4, .08, 3); } break;
      case 'toss': this.toss(it); break;
      case 'splash': case 'water': this.ripple(clamp(px, 380, 780), clamp(py, 640, 700), 1); Sound.splash(); break;
      case 'crowd': it.cheer = 1; Sound.cheer(); break;
      case 'tree': it.gustAmt = 1; Sound.sweep(400, 900, .8, .25, .7); break;
      case 'sway': it.gustAmt = 1; it.vr += side * .05; Sound.sweep(500, 1200, .6, .2, .7); break;
      case 'squish':
        it.sq = -.085; it.vsq = 0; Sound.squish();
        if (it.kick) this.items.filter((o) => o.group === it.kick).forEach((o, i) => this.hop(o, .7, 90 + i * 70));
        if (it.kick === 'glasses') setTimeout(() => Sound.clink(), 520);
        break;
      case 'flip': if (!it.air) { it.air = true; it.vy = -720; it.flipT = 0; it.sq = -.1; Sound.whoosh(); } break;
      case 'pulse': for (const o of this.items) if (o.b === 'pulse') o.pulse = 1.6; Sound.blip(500, 1000, .12, .06); break;
      default: it.vr += side * 1.1; it.vsq -= 1.1; Sound.tok(1);
    }
    if (it.b === 'hop' && it.group === 'glasses') setTimeout(() => Sound.clink(), 380);
  }
  walk(it) {
    const [lo, hi] = it.range;
    it.sq = -.14; it.vy = -260; it.air = true; Sound.meow();
    it.dest = Math.abs(it.tx - lo) < Math.abs(it.tx - hi) ? hi : lo;
    if (Math.abs(it.dest - it.tx) < 40) it.dest = (lo + hi) / 2;
    const tail = this.items.find((o) => o.par === it); if (tail) tail.vr += 5;
  }
  sip(it) {
    if (it.drunkTo >= .999) { it.drunkTo = 0; it.slosh = 1; Sound.pour(); return; }
    it.drunkTo = Math.min(1, it.drunkTo + .2); it.slosh = 1; it.vsq -= .6; Sound.slurp();
    for (let i = 0; i < 5; i++) this.fx.push({ k: 'bubble', it, x: it.x + it.w * (.3 + Math.random() * .4), y: it.level[1] - 10 - Math.random() * 30, r: 2 + Math.random() * 3, age: -i * .08, seed: Math.random() * 9 });
  }
  /* bites (teeth marks) and scoops (smooth spoonfuls), taken from the edge nearest the tap */
  eat(it, px, py) {
    if (it.done) { editable(it); it.done = 0; it.sq = -.3; it.vsq = 4; Sound.blip(420, 840, .18, .12); return; }
    const [lx, ly] = [px - it.x, py - it.y];
    let e = null;
    outer: for (let r = 6; r < 260; r += 5) for (let k = 0; k < 28; k++) {
      const a = k / 28 * Math.PI * 2, X = Math.round(lx + Math.cos(a) * r), Y = Math.round(ly + Math.sin(a) * r);
      if (X < 0 || Y < 0 || X >= it.w || Y >= it.h || it.alpha[Y * it.w + X] < 30) { e = [X, Y, a]; break outer; }
    }
    const R = it.r;
    let cx = lx, cy = ly;
    if (e) { cx = e[0] + Math.cos(e[2]) * R * .3; cy = e[1] + Math.sin(e[2]) * R * .3; }
    const go = () => {
      const piece = this.carve(it, cx, cy, R, { teeth: it.b === 'eat', piece: true });
      it.vr += (Math.random() - .5) * .5; it.vsq -= .8;
      if (areaLeft(it) < .12) { it.done = 1; }
      return piece;
    };
    const tool = it.tool && this.by[it.tool];
    if (tool && !tool.busy) this.useTool(tool, cx + it.x, cy + it.y, go, it);
    else { go(); Sound.crunch(); }
  }
  pluck(it, px, py) {
    if (it.done) { editable(it); it.done = 0; it.sq = -.2; it.vsq = 3; Sound.blip(420, 840, .18, .12); return; }
    const lx = px - it.x, ly = py - it.y;
    const go = () => {
      const piece = this.carve(it, lx, ly, it.r, { teeth: false, ring: false, piece: true, crumbs: false });
      if (areaLeft(it) < .15) it.done = 1;
      return piece;
    };
    const tool = it.tool && this.by[it.tool];
    if (tool && !tool.busy) this.useTool(tool, px, py, go, it, true);
    else { const piece = go(); if (piece) this.fx.push({ k: 'piece', img: piece, x: it.x, y: it.y, x0: it.x, y0: it.y, vx: (Math.random() - .5) * 120, vy: -320, rot: 0, vr: (Math.random() - .5) * 4, age: 0, cx: px, cy: py }); Sound.tok(1.6); }
  }
  useTool(tool, tx, ty, go, target, carry = false) {
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
    const mk = (fn) => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#000'; fn(g); return [c, g]; };
    const [mask, mg] = mk((g) => { shape(g, 0); g.globalCompositeOperation = 'destination-out'; protect(g); });
    const md = mg.getImageData(0, 0, W, H).data, bd = before.data;
    let piece = null;
    if (opt.piece) {
      [piece] = mk((g) => { g.drawImage(it.img, 0, 0); g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0); });
    }
    let tmp = null;
    if (opt.ring !== false) {
      const mean = meanColor(bd, md), face = mean.map((v) => Math.round(255 - (255 - v) * .45));
      [tmp] = mk((g) => {
        g.fillStyle = `rgb(${face})`; shape(g, 11);
        g.globalCompositeOperation = 'destination-out'; shape(g, 2.6);
        g.globalCompositeOperation = 'source-over';
        const [ring] = mk((rg) => { rg.fillStyle = `rgb(${PEN})`; shape(rg, 2.8); rg.globalCompositeOperation = 'destination-out'; shape(rg, 0); });
        g.drawImage(ring, 0, 0);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(it.img, 0, 0);
        g.globalCompositeOperation = 'destination-out'; protect(g);
      });
    }
    if (opt.crumbs !== false) {
      let made = 0, tries = 0;
      while (made < 12 && tries++ < 500) {
        const X = Math.random() * W | 0, Y = Math.random() * H | 0, i = (Y * W + X) * 4;
        if (md[i + 3] > 128 && bd[i + 3] > 200) {
          this.fx.push({ k: 'crumb', x: X + it.x, y: Y + it.y, vx: (Math.random() - .5) * 200, vy: -Math.random() * 220 - 40, r: Math.random() * 6, vr: (Math.random() - .5) * 18,
            s: 1.6 + Math.random() * 2.4, col: `rgb(${bd[i]},${bd[i + 1]},${bd[i + 2]})`, floor: it.pv[1] + Math.random() * 30, age: 0 });
          made++;
        }
      }
    }
    ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(mask, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; if (tmp) ctx.drawImage(tmp, 0, 0);
    it.alpha = alphaOf(it.img);
    return piece;
  }
  slice(it) {
    const knife = it.knife && this.by[it.knife];
    if (it.wedge >= it.wedges.length) {
      editable(it); it.wedge = 0; it.done = 0; it.sq = -.25; it.vsq = 3;
      if (knife) { knife.op = 1; knife.tx = knife.ty = 0; knife.rot = 0; knife.sq = -.3; knife.gone = false; }
      Sound.blip(420, 840, .18, .12); return;
    }
    const [a0, a1] = it.wedges[it.wedge++];
    const [cx, cy] = [it.c[0] - it.x, it.c[1] - it.y];
    const W = it.w, H = it.h, ctx = it.ctx;
    const wedge = (g, pad = 0) => {
      g.beginPath(); g.moveTo(cx, cy);
      for (let a = a0 - pad; a <= a1 + pad + .01; a += 3) { const r = a * Math.PI / 180; g.lineTo(cx + Math.cos(r) * 600, cy + Math.sin(r) * 600); }
      g.closePath(); g.fill();
    };
    const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); g.fillStyle = '#000'; return [c, g]; };
    const [piece, pg] = mk(); pg.drawImage(it.img, 0, 0); pg.globalCompositeOperation = 'destination-in'; wedge(pg);
    if (!it.body) {                               // the pizza itself (not its pale shadow): colour or pen
      const [bc, bg] = mk(); bg.drawImage(it.orig, 0, 0);
      const d = bg.getImageData(0, 0, W, H), q = d.data;
      for (let i = 0; i < q.length; i += 4) {
        const mx = Math.max(q[i], q[i + 1], q[i + 2]), mn = Math.min(q[i], q[i + 1], q[i + 2]);
        const body = q[i + 3] > 60 && (mn < 150 || (mx - mn) / (mx || 1) > .22 && q[i] > q[i + 2]);
        q[i + 3] = body ? 255 : 0;
      }
      bg.putImageData(d, 0, 0); bg.filter = 'blur(1px)'; it.body = bc;
    }
    const [cut, cg] = mk();                       // pen line along the new cut edges, on the pizza side only
    for (const a of [a0, a1]) { const r = a * Math.PI / 180; penPath(cg, [[cx + Math.cos(r) * 4, cy + Math.sin(r) * 4], [cx + Math.cos(r) * 300, cy + Math.sin(r) * 300]], a, 1.1, 1, false); }
    cg.globalCompositeOperation = 'destination-in'; cg.drawImage(it.img, 0, 0); cg.drawImage(it.body, 0, 0);
    ctx.globalCompositeOperation = 'destination-out'; wedge(ctx);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(cut, 0, 0);
    it.alpha = alphaOf(it.img);
    const mid = (a0 + a1) / 2 * Math.PI / 180;
    const fly = { k: 'piece', img: piece, x: it.x, y: it.y, x0: it.x, y0: it.y, vx: Math.cos(mid) * 90 + 40, vy: -380, rot: 0, vr: (Math.random() < .5 ? -1 : 1) * 1.4, age: 0, cx: it.c[0], cy: it.c[1], g: 500, life: 1.4 };
    this.fx.push(fly);
    if (knife && !knife.gone) { knife.gone = true; knife.flyWith = fly; }
    if (it.wedge >= it.wedges.length) it.done = 1;
    Sound.sweep(900, 2200, .25, .25, 2);
  }
  toss(it) {
    if (it.state !== 'home') return;
    it.state = 'fly'; it.t = 0; Sound.ting();
  }
  ripple(x, y, s = 1) {
    for (let i = 0; i < 3; i++) this.fx.push({ k: 'ring', x, y, age: -i * .22, s, seed: Math.random() * 9 });
    for (let i = 0; i < 7; i++) { const a = -Math.PI * (.15 + .7 * Math.random()); this.fx.push({ k: 'drop', x, y, vx: Math.cos(a) * 120 * s, vy: Math.sin(a) * 240 * s, age: 0, seed: Math.random() * 9, floor: y }); }
  }
  flock(x, y, n) {
    for (let i = 0; i < n; i++) {
      const dir = Math.random() < .5 ? -1 : 1;
      this.fx.push({ k: 'bird', x: x + (Math.random() - .5) * 60, y: y + (Math.random() - .5) * 40, vx: dir * (60 + Math.random() * 60), vy: -60 - Math.random() * 60,
        ph: Math.random() * 6, fr: 8 + Math.random() * 3, sc: .9 + Math.random() * .4, age: 0, seed: Math.random() * 99 });
    }
  }

  /* ---------------------------------------------------------------- simulation */
  update(t, dt) {
    this.t = t; this.writeT += dt;
    this.nextGust -= dt;
    if (this.nextGust < 0 && !reduced) { this.nextGust = 7 + Math.random() * 8; this.gust = 1; }
    this.gust = Math.max(0, this.gust - dt * .45);
    this.breeze = reduced ? .1 : .35 + .2 * Math.sin(t * .47) + this.gust * .9;
    let wt = this.writeT;
    for (const it of this.items) {
      if (it.b === 'text') { const d = clamp(it.w / 420, .35, .9); it.reveal = clamp(wt / d, 0, 1); wt -= d * .8; }
      it.hover = lerp(it.hover, it.hoverT || 0, 1 - Math.exp(-dt * 12));
      const pend = it.b === 'pendulum' || it.b === 'tail' || (it.b === 'glow' && it.swing);
      const kR = pend ? (it.k || 18) : it.b === 'text' ? 90 : 70, cR = pend ? 1.2 : it.b === 'text' ? 9 : 6;
      let target = 0;
      if (pend && !reduced) target = Math.sin(t * 1.1 + it.seed) * (it.idle ?? .02) + Math.sin(t * .43 + it.seed) * (it.idle ?? .02) * .6;
      if (it.b === 'tail') target = Math.sin(t * 2.3 + it.seed) * .16 + (it.par && Math.abs(it.par.vx) > 5 ? Math.sin(t * 9) * .25 : 0);
      if (it.b === 'flip' && it.air) { it.flipT += dt; it.rot = -ease(it.flipT / .8) * Math.PI * 2; }
      else { it.vr += (-(it.rot - target) * kR - it.vr * cR) * dt; it.rot += it.vr * dt; it.rot = clamp(it.rot, -1.2, 1.2); }
      it.vsq += (-it.sq * 160 - it.vsq * 9) * dt; it.sq += it.vsq * dt;
      if (it.air) {
        it.vy += 1900 * dt; it.ty += it.vy * dt;
        if (it.ty >= 0) {
          it.ty = 0; it.air = false; it.vsq -= Math.min(it.vy, 700) * .006; it.vy = 0;
          if (it.b === 'flip') it.rot = 0; else it.vr *= .3;
          if (it.b === 'lid') { Sound.clink(); it.lidUp = false; } else if (it.b !== 'walk') Sound.tok(.7);
        }
      }
      if (it.b === 'walk') {
        const d = it.dest - it.tx, sp = 170;
        it.vx = Math.abs(d) > 2 ? Math.sign(d) * Math.min(sp, Math.abs(d) * 4 + 30) : 0;
        it.tx += it.vx * dt;
        if (it.vx) { it.phase += dt * 11; if (!it.air) it.ty = -Math.abs(Math.sin(it.phase)) * 5; it.rot = Math.sin(it.phase * 2) * .025; }
        else if (!it.air) it.ty *= .8;
        it.flip = lerp(it.flip, it.vx ? (Math.sign(it.vx) === (it.faces || -1) ? 1 : -1) : it.flip >= 0 ? 1 : -1, 1 - Math.exp(-dt * 14));
      }
      if (it.b === 'sip') {
        it.drunk += (it.drunkTo - it.drunk) * (1 - Math.exp(-dt * (it.drunkTo < it.drunk ? 2 : 5)));
        it.slosh = Math.max(0, it.slosh - dt * .8);
      }
      if (it.b === 'fan') it.fold += (it.foldTo - it.fold) * (1 - Math.exp(-dt * 7));
      if (it.b === 'glow') it.amt += ((it.on ? 1 : 0) - it.amt) * (1 - Math.exp(-dt * (it.on ? 6 : 3)));
      if (it.b === 'crowd') it.cheer = Math.max(0, it.cheer - dt * .6);
      if (it.gustAmt !== undefined) it.gustAmt = Math.max(0, it.gustAmt - dt * .55);
      if (it.b === 'pulse') {
        it.nextPulse -= dt; if (it.nextPulse < 0) { it.nextPulse = 1.3; it.pulse = Math.max(it.pulse, 1); }
        it.pulse = Math.max(0, it.pulse - dt * 3);
      }
      if (it.b === 'clam' && it.clamT !== undefined) {
        it.clamT += dt; const u = it.clamT;
        it.sq = u < .14 ? -.32 * (u / .14) : u < .5 ? -.32 : -.32 * Math.max(0, 1 - (u - .5) / .12);
        if (u > .55 && !it.sparkled) { it.sparkled = true; this.fx.push({ k: 'spark', x: it.pearl[0], y: it.pearl[1], age: 0, seed: Math.random() * 9 }); Sound.chime(); }
        if (u > 1) { it.clamT = undefined; it.sparkled = false; }
      }
      if (it.b === 'flutter' && it.flyT >= 0) {
        it.flyT += dt; const u = it.flyT / 3;
        it.tx = Math.sin(u * Math.PI) * 110 + Math.sin(u * 7 * Math.PI) * 12;
        it.ty = -Math.sin(u * Math.PI) * 150 + Math.cos(u * 5 * Math.PI) * 14 - Math.sin(u * Math.PI) * 20;
        it.rot = Math.sin(u * 9) * .18;
        if (u >= 1) { it.flyT = -1; it.tx = it.ty = 0; it.vr += .5; }
      }
      if (it.b === 'toss') this.updateToss(it, dt);
      if (it.anim) this.updateTool(it, dt);
      if (it.gone && it.flyWith) {
        const f = it.flyWith; it.tx = f.x - f.x0; it.ty = f.y - f.y0; it.rot = f.rot; it.op = Math.max(0, 1 - f.age / (f.life || 1));
        if (f.age > (f.life || 1)) { it.flyWith = null; it.op = 0; }
      }
      if (it.drips && !reduced) {
        it.nextDrip -= dt;
        if (it.nextDrip < 0) {
          it.nextDrip = it.drips.every * (.6 + Math.random() * .8);
          const [x, y] = it.drips.at[Math.random() * it.drips.at.length | 0];
          this.fx.push({ k: 'drip', x: x + it.tx, y0: y + it.ty, y: y + it.ty, vy: 0, len: 0, age: 0, state: 'grow', puddle: 0, col: it.drips.col });
        }
      }
    }
    // effects
    for (const f of this.fx) {
      f.age += dt;
      if (f.age < 0) continue;
      switch (f.k) {
        case 'crumb':
          if (f.y < f.floor) { f.vy += 1500 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.r += f.vr * dt; }
          if (f.y >= f.floor) { f.y = f.floor; if (f.vy > 120) { f.vy *= -.28; f.vx *= .5; f.y -= .5; } else { f.vy = 0; f.vx = 0; } }
          break;
        case 'piece': if (!f.held) { f.vy += (f.g ?? 700) * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.vr * dt; } break;
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
    const life = { crumb: 5, piece: 1.2, drop: .7, bird: 8, bubble: 1.2, drip: 6, ring: 1.8, spark: 1 };
    this.fx = this.fx.filter((f) => f.age < (f.life || life[f.k] || 2) && !(f.k === 'bird' && (f.x < -80 || f.x > PW + 80 || f.y < -60)) && !(f.k === 'piece' && f.held === false && false));
  }
  updateToss(it, dt) {
    if (it.state === 'fly') {
      it.t += dt; const u = Math.min(1, it.t / 1.05);
      const dx = it.target[0] - it.pv[0], dy = it.target[1] - it.pv[1];
      it.tx = dx * u; it.ty = dy * u - 300 * Math.sin(Math.PI * u);
      it.flip = Math.cos(u * Math.PI * 7) || .05; it.sc = 1 - .72 * u;
      if (u >= 1) { it.state = 'gone'; it.t = 0; it.op = 0; this.ripple(it.target[0], it.target[1], .9); Sound.splash(); }
    } else if (it.state === 'gone') {
      it.t += dt;
      if (it.t > 2.2) { it.state = 'home'; it.tx = it.ty = 0; it.flip = 1; it.sc = 1; it.op = 1; it.sq = -.4; it.vsq = 5; Sound.blip(700, 1400, .1, .05); }
    }
  }
  updateTool(tool, dt) {
    const a = tool.anim; a.t += dt;
    const out = .38, hold = .16, back = .5;
    if (a.t < out) { const u = easeOut(a.t / out); tool.tx = a.dx * u; tool.ty = a.dy * u - Math.sin(u * Math.PI) * 40; tool.rot = -.25 * u; }
    else if (a.t < out + hold) {
      tool.rot = -.25 + .35 * ((a.t - out) / hold);
      if (!a.done) {
        a.done = true;
        const res = a.go();
        Sound.crunch();
        if (a.carry && res) this.fx.push(a.held = { k: 'piece', img: res, x: a.target.x, y: a.target.y, x0: a.target.x, y0: a.target.y, vx: 0, vy: 0, rot: 0, vr: 0, age: 0, held: true, life: 9 });
        else if (!a.carry) { const col = meanColorOf(res ? res.getContext('2d') : null); this.fx.push(a.held = { k: 'ball', col, r: a.target.r * .45, x: 0, y: 0, age: 0, life: 9, held: true }); }
      }
    } else if (a.t < out + hold + back) {
      const u = ease((a.t - out - hold) / back);
      tool.tx = a.dx * (1 - u); tool.ty = a.dy * (1 - u) - Math.sin(u * Math.PI) * 60; tool.rot = .1 * (1 - u);
    } else { tool.tx = tool.ty = tool.rot = 0; tool.anim = null; tool.busy = false; if (a.held) a.held.age = 99; tool.vr += .6; return; }
    if (a.held) {
      const [hx, hy] = tool.tip || tool.pv;
      const fade = a.t > out + hold ? 1 - (a.t - out - hold) / back : 1;
      if (a.held.k === 'piece') { a.held.x = a.target.x + (tool.tx - a.dx); a.held.y = a.target.y + (tool.ty - a.dy); a.held.op = fade; }
      else { a.held.x = hx + tool.tx; a.held.y = hy + tool.ty - a.held.r * .6; a.held.op = fade; }
    }
  }

  /* ---------------------------------------------------------------- drawing */
  setT(x, it, k) {
    if (it.par) this.setT(x, it.par, k); else x.setTransform(k, 0, 0, k, 0, 0);
    const [cx, cy] = it.pv;
    const lift = (it.b === 'hop' || it.b === 'wobble') && !it.air ? -it.hover * 3 : 0;
    x.translate(cx + it.tx, cy + it.ty + lift); x.rotate(it.rot);
    x.scale((1 - it.sq * .55) * it.sc * (it.flip || 1), (1 + it.sq) * it.sc);
    x.translate(-cx, -cy);
  }
  strips(x, it, horizontal, size, fn) {
    if (horizontal) for (let y = 0; y < it.h; y += size) { const [dx, dy] = fn(y); x.drawImage(it.img, 0, y, it.w, Math.min(size, it.h - y), it.x + dx, it.y + y + dy, it.w, Math.min(size, it.h - y) + .6); }
    else for (let X = 0; X < it.w; X += size) { const [dx, dy] = fn(X); x.drawImage(it.img, X, 0, Math.min(size, it.w - X), it.h, it.x + X + dx, it.y + dy, Math.min(size, it.w - X) + .6, it.h); }
  }
  drawItem(x, it, k) {
    const LAYERED = { sway: 40, tree: 40, crowd: 12, water: 8, fan: 30 };
    const pad = LAYERED[it.b];
    if (pad !== undefined) {
      // draw the pieces opaquely on their own sheet first, so overlaps don't double the pencil under multiply
      const o = this.layerC || (this.layerC = document.createElement('canvas')), ox = this.layerX || (this.layerX = o.getContext('2d'));
      const W = Math.ceil((it.w + pad * 2) * k), H = Math.ceil((it.h + pad * 2) * k);
      if (o.width < W || o.height < H) { o.width = Math.max(o.width, W); o.height = Math.max(o.height, H); }
      ox.setTransform(1, 0, 0, 1, 0, 0); ox.clearRect(0, 0, W, H);
      ox.setTransform(k, 0, 0, k, (pad - it.x) * k, (pad - it.y) * k);
      ox.globalCompositeOperation = 'source-over';
      this.drawBody(ox, it);
      x.globalAlpha = it.op; this.setT(x, it, k);
      x.drawImage(o, 0, 0, W, H, it.x - pad, it.y - pad, W / k, H / k);
      x.globalAlpha = 1;
      return;
    }
    x.globalAlpha = it.op;
    this.setT(x, it, k);
    this.drawBody(x, it);
    x.globalAlpha = 1;
    if (it.b === 'lid' && it.ty < -2) {      // the open tin's rim, drawn in pen while the lid is up
      x.setTransform(k, 0, 0, k, 0, 0);
      const cxr = it.pv[0], cyr = it.y + it.h - 14, a = clamp(-it.ty / 20, 0, 1);
      penPath(x, arcPts(cxr, cyr, it.w / 2 - 10, 22, Math.PI * .02, Math.PI * .98, 30), 3, 1, a, false);
      penPath(x, arcPts(cxr, cyr, it.w / 2 - 10, 22, Math.PI * 1.02, Math.PI * 1.98, 30), 5, .9, a * .8, false);
    }
  }
  drawBody(x, it) {
    const t = this.t;
    switch (it.b) {
      case 'text': {
        const tb = t - it.bounceT;
        it.segs.forEach(([a, b], i) => {
          const u = tb - i * .045;
          const dy = u > 0 && u < .5 ? -Math.sin(u / .5 * Math.PI) * 14 * (1 - u) : 0;
          const rev = clamp((it.reveal * it.w - a) / Math.max(1, b - a), 0, 1);
          if (rev <= 0) return;
          const ww = Math.max(1, Math.round((b - a) * rev));
          x.drawImage(it.img, a, 0, ww, it.h, it.x + a, it.y + dy, ww, it.h);
        });
        break;
      }
      case 'sway': {
        const A = (it.amp || 6) * (this.breeze + it.gustAmt * 2.5);
        this.strips(x, it, true, 5, (y) => { const d = (it.y + y - it.pv[1]) / it.h; const f = Math.pow(Math.max(0, d), 1.25); return [f * A * Math.sin(t * 1.7 + it.seed - d * 2.2) + f * it.gustAmt * 8 * Math.sin(t * 9 - d * 4), 0]; });
        break;
      }
      case 'tree': {
        const A = 5 * (this.breeze + it.gustAmt * 3);
        this.strips(x, it, true, 4, (y) => { const d = (it.pv[1] - (it.y + y)) / it.h; const f = Math.pow(clamp(d, 0, 1), 1.6); return [f * A * Math.sin(t * 1.3 + it.seed) + f * it.gustAmt * 10 * Math.sin(t * 8 - d * 3), 0]; });
        break;
      }
      case 'crowd': {
        const amp = 1.4 + it.cheer * 5;
        this.strips(x, it, false, 9, (X) => { const i = X / 9; return [Math.sin(t * .7 + i * .9) * 1.3, -Math.abs(Math.sin(t * (4 + (i % 3)) + i * 1.7)) * amp]; });
        break;
      }
      case 'water': this.strips(x, it, true, 3, (y) => [Math.sin((it.y + y) * .16 + t * 2.1) * 1.7 + Math.sin((it.y + y) * .05 - t * 1.3) * 1.1, 0]); break;
      case 'fan': {
        const p = ease(it.fold);
        if (p < .002) { x.drawImage(it.img, it.x, it.y); break; }
        const N = 16, [a0, a1] = it.a.map((d) => d * Math.PI / 180), [px, py] = it.pv;
        for (let i = N - 1; i >= 0; i--) {
          const s0 = a0 + (a1 - a0) * i / N, s1 = a0 + (a1 - a0) * (i + 1) / N;
          x.save();
          x.translate(px, py); x.rotate((a0 - s0) * p); x.translate(-px, -py);
          x.beginPath(); x.moveTo(px, py);
          const ext = i === 0 ? .6 : .012, ext2 = i === N - 1 ? .6 : .012;
          for (let a = s0 - ext; a <= s1 + ext2 + 1e-4; a += .02) x.lineTo(px + Math.cos(a) * 560, py + Math.sin(a) * 560);
          x.closePath(); x.clip();
          x.drawImage(it.img, it.x, it.y);
          x.restore();
        }
        break;
      }
      case 'sip': {
        const top = it.level[0] + (it.level[1] - it.level[0]) * it.drunk;
        x.drawImage(it.empty, it.x, it.y);
        if (it.drunk < .995) {
          x.save(); x.beginPath(); x.moveTo(it.x, it.y + it.h);
          for (let X = 0; X <= it.w; X += 6) x.lineTo(it.x + X, top + Math.sin(X * .06 + t * 6) * (1.5 + it.slosh * 5));
          x.lineTo(it.x + it.w, it.y + it.h); x.closePath(); x.clip();
          x.drawImage(it.img, it.x, it.y); x.restore();
        }
        break;
      }
      case 'flutter': {
        const ax = it.axis || it.pv[0];
        const flap = it.flyT >= 0 ? .25 + .75 * Math.abs(Math.cos(t * 26)) : 1 - .08 * (Math.sin(t * 1.4) + 1) / 2;
        x.translate(ax, 0); x.scale(flap, 1); x.translate(-ax, 0);
        x.drawImage(it.img, it.x, it.y); break;
      }
      case 'pulse': {
        const e = it.pulse > 1 ? 1 + (it.pulse - 1) * .6 : it.pulse;
        const [cx, cy] = it.c, s = 1 + .1 * e;
        x.translate(cx, cy); x.scale(s, s); x.translate(-cx, -cy);
        x.drawImage(it.img, it.x, it.y); break;
      }
      default: x.drawImage(it.img, it.x, it.y);
    }
  }
  drawGlow(x, it, k) {
    if (it.amt < .01) return;
    const [gx, gy, gr] = it.glow;
    const tex = GLOW_TEX; if (!tex) return;
    if (!this.glowC) { this.glowC = document.createElement('canvas'); this.glowX = this.glowC.getContext('2d'); }
    const S = Math.ceil(gr * 2), g = this.glowX;
    if (this.glowC.width !== S) { this.glowC.width = S; this.glowC.height = S; }
    g.globalCompositeOperation = 'source-over'; g.clearRect(0, 0, S, S);
    g.drawImage(tex, 0, 0, S, S);
    const flick = .92 + .08 * Math.sin(this.t * 13) * Math.sin(this.t * 7.3);
    const rg = g.createRadialGradient(gr, gr, 0, gr, gr, gr);
    rg.addColorStop(0, `rgba(0,0,0,${.95 * flick})`); rg.addColorStop(.35, `rgba(0,0,0,${.6 * flick})`); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.globalCompositeOperation = 'destination-in'; g.fillStyle = rg; g.fillRect(0, 0, S, S);
    x.setTransform(k, 0, 0, k, 0, 0);
    x.globalAlpha = it.amt * .9;
    x.drawImage(this.glowC, gx - gr + it.tx, gy - gr + it.ty);
    x.globalAlpha = 1;
  }
  drawFx(x, k) {
    x.setTransform(k, 0, 0, k, 0, 0);
    for (const f of this.fx) {
      if (f.age < 0) continue;
      switch (f.k) {
        case 'crumb':
          x.globalAlpha = 1 - smooth(3.4, 5, f.age); x.fillStyle = f.col;
          x.save(); x.translate(f.x, f.y); x.rotate(f.r); x.beginPath(); x.moveTo(-f.s, -f.s * .6); x.lineTo(f.s * .8, -f.s * .8); x.lineTo(f.s, f.s * .5); x.lineTo(-f.s * .5, f.s * .8); x.closePath(); x.fill(); x.restore();
          break;
        case 'piece': {
          x.globalAlpha = f.held ? (f.op ?? 1) : Math.max(0, 1 - f.age / (f.life || 1.2));
          const cx = f.cx ?? f.x + f.img.width / 2, cy = f.cy ?? f.y + f.img.height / 2;
          x.save(); x.translate(cx + (f.x - (f.x0 ?? (f.x0 = f.x))), cy + (f.y - (f.y0 ?? (f.y0 = f.y)))); x.rotate(f.rot); x.translate(-cx, -cy);
          x.drawImage(f.img, f.x0, f.y0); x.restore();
          break;
        }
        case 'ball': {
          x.globalAlpha = f.op ?? 1;
          x.fillStyle = `rgb(${f.col})`; x.beginPath(); x.ellipse(f.x, f.y, f.r, f.r * .8, 0, 0, Math.PI * 2); x.fill();
          penPath(x, arcPts(f.x, f.y, f.r, f.r * .8, 0, Math.PI * 2, 26), 2, .8, f.op ?? 1, false);
          break;
        }
        case 'ring': {
          const u = f.age / 1.8, rx = 8 + u * 70 * f.s, a = (1 - u) * .9;
          penPath(x, arcPts(f.x, f.y, rx, rx * .28, Math.PI * 1.08, Math.PI * 1.92, 18), f.seed, .7, a, true);
          penPath(x, arcPts(f.x, f.y, rx, rx * .28, Math.PI * .1, Math.PI * .9, 18), f.seed + 2, .8, a, true);
          break;
        }
        case 'drop': penPath(x, [[f.x, f.y], [f.x - f.vx * .02, f.y - f.vy * .02]], f.seed, .7, 1 - f.age / .7, true); break;
        case 'spark': {
          const u = f.age, a = 1 - u;
          for (let i = 0; i < 4; i++) {
            const ang = i * Math.PI / 2 + .3, r0 = 22 + u * 18, r1 = r0 + 16 * (1 - u * .5);
            penPath(x, [[f.x + Math.cos(ang) * r0, f.y + Math.sin(ang) * r0], [f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1]], f.seed + i, .8, a, true);
          }
          break;
        }
        case 'bubble': {
          const it = f.it, top = it.level[0] + (it.level[1] - it.level[0]) * it.drunk;
          if (f.y < top + 4) break;
          penPath(x, arcPts(f.x + Math.sin(f.age * 9 + f.seed) * 2, f.y, f.r, f.r, 0, Math.PI * 2, 10), f.seed, .45, 1 - f.age / 1.2, false);
          break;
        }
        case 'bird': {
          const sp = 19 * f.sc, fl = Math.sin(f.ph), up = 9 * f.sc, a = Math.min(1, f.age * 4) * (1 - smooth(6, 8, f.age));
          const tipY = f.y - fl * up, ctlY = f.y - up * (.55 + .45 * fl) - 3 * f.sc, dir = Math.sign(f.vx) || 1;
          const wing = (s) => [[f.x + s * sp, tipY + s * dir * 1.2 * f.sc], [f.x + s * sp * .42, ctlY], [f.x, f.y + 1.2 * f.sc]];
          penStroke(x, [...wing(-1), ...wing(1).reverse().slice(1)], f.seed, Math.min(1.15, .75 + f.sc * .3), a);
          break;
        }
        case 'drip': {
          const fade = 1 - smooth(4, 6, f.age);
          x.globalAlpha = fade; x.fillStyle = `rgb(${f.col})`; x.strokeStyle = `rgba(${PEN}, .8)`; x.lineWidth = 1.3; x.beginPath();
          if (f.state === 'pool') x.ellipse(f.x, f.y0 + 54, 3 + f.puddle * 8, 1.6 + f.puddle * 2.2, 0, 0, Math.PI * 2);
          else {
            const r = 3.4 * (f.state === 'grow' ? f.len : 1), st = f.state === 'fall' ? Math.min(14, f.vy * .02) : 0;
            const y = f.state === 'grow' ? f.y0 + f.len * 6 : f.y;
            x.moveTo(f.x, y - r - 4 - st); x.quadraticCurveTo(f.x + r * 1.1, y - r * .2, f.x + r, y);
            x.arc(f.x, y, r, 0, Math.PI); x.quadraticCurveTo(f.x - r * 1.1, y - r * .2, f.x, y - r - 4 - st);
          }
          x.fill(); x.stroke();
          break;
        }
      }
      x.globalAlpha = 1;
    }
  }
  frame(t, dt) {
    this.update(t, dt);
    const x = this.x, k = this.c.width / PW;
    x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over'; x.globalAlpha = 1;
    x.drawImage(this.base, 0, 0, this.c.width, this.c.height);
    x.globalCompositeOperation = 'multiply';
    for (const it of this.draw_order) if (it.op > .01 && !(it.b === 'text' && it.reveal <= 0)) this.drawItem(x, it, k);
    for (const it of this.items) if (it.b === 'glow') this.drawGlow(x, it, k);
    this.drawFx(x, k);
  }
}
function meanColorOf(ctx) {
  if (!ctx) return [230, 220, 200];
  const d = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < d.length; i += 64) if (d[i + 3] > 200 && d[i] + d[i + 1] + d[i + 2] < 700) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
  return n ? [r / n | 0, g / n | 0, b / n | 0] : [230, 220, 200];
}

/* ======================================================= the notebook */
const SPREADS = [
  { L: 'treats', R: 'sunset', place: 'Rome, Italy', hints: ['<strong>Tap</strong> the sea', '<strong>Drag</strong> the sky to move the sun', '<strong>Tap</strong> the treats', 'The popsicle is for eating'] },
  { L: 'ro_L', R: 'ro_R', place: 'Rome, Italy', hints: ['<strong>Toss</strong> a coin in the fountain', '<strong>Light</strong> the lamp', '<strong>Serve</strong> the pizza', '<strong>Tap</strong> the Colosseum'] },
  { L: 'fr_L', R: 'fr_R', place: 'Seillans &amp; Fayence, France', hints: ['<strong>Tap</strong> the cat', '<strong>Light</strong> the lantern', '<strong>Dig into</strong> the banana split', '<strong>Tap</strong> the sky'] },
  { L: 'es_L', R: 'es_R', place: 'Spain', hints: ['<strong>Sip</strong> the agua fresca', '<strong>Eat</strong> the gelato and tapas', '<strong>Tap</strong> the words'] },
  { L: 'sh_L', R: 'sh_R', place: 'Tianzifang, Shanghai', hints: ['<strong>Fold</strong> the fan', '<strong>Open</strong> the tin and the oyster', '<strong>Tap</strong> the butterfly', '<strong>Tap</strong> the cat'] },
  { L: 'fu_L', R: 'fu_R', place: 'Furniture studies', hints: ['<strong>Turn on</strong> the lamp', '<strong>Sit</strong> on the sofas', '<strong>Clink</strong> the glasses'] },
  { L: 'cl_L', R: 'cl_R', place: 'Clothes I saw', hints: ['<strong>Toss</strong> the cap', '<strong>Tap</strong> the sneakers', '<strong>Tap</strong> a dress for a breeze'] },
];
const Pages = {};               // pid -> { sheet, obj, ready }
let PAGE_META = null, ORIG = null;

function makeSheet(side, html) {
  const d = document.createElement('div'); d.className = 'page ' + side;
  d.innerHTML = html + '<div class="light"></div><div class="sheen"></div>';
  return d;
}
async function loadOriginals() {
  if (ORIG) return ORIG;
  ORIG = (async () => {
    const names = ['left_base', 'melon0', 'melon1', 'melon2', 'cherry', 'popsicle', 'eclair', 'lbl_melon', 'lbl_bracket', 'lbl_cherry', 'lbl_pop', 'lbl_eclair'];
    const [meta, ...imgs] = await Promise.all([
      fetch(A + 'meta.json').then((r) => r.json()),
      loadImg(A + 'right_base.webp'), loadImg(A + 'sun.png'), loadImg(A + 'right_geo.png'), loadImg(A + 'right_cover.png'),
      ...names.map((n) => loadImg(A + n + (n === 'left_base' ? '.webp' : '.png'))),
    ]);
    const [base, sun, geo, cover, ...rest] = imgs;
    return { meta, right: { base, sun, geo, cover }, left: Object.fromEntries(names.map((n, i) => [n, rest[i]])) };
  })();
  return ORIG;
}
function ensurePage(pid, side) {
  if (Pages[pid]) return Pages[pid].ready;
  const P = Pages[pid] = {};
  P.ready = (async () => {
    if (pid === 'treats') {
      const o = await loadOriginals();
      P.sheet = makeSheet(side, '<canvas id="treats" aria-label="Colored pencil drawing of Roman treats: watermelon cubes, a cherry, a pistachio cheesecake popsicle and a fig and honey éclair, with handwritten labels."></canvas>');
      P.obj = new Treats(P.sheet.querySelector('canvas'), o.left, o.meta.left);
      P.frame = (t, dt) => { P.obj.update(t, dt); P.obj.draw(); };
    } else if (pid === 'sunset') {
      const o = await loadOriginals();
      P.sheet = makeSheet(side, '<canvas id="sunset" aria-label="Colored pencil drawing of the sun setting over the sea behind a line of mountains."></canvas><canvas id="birds" aria-hidden="true" style="pointer-events:none"></canvas>');
      const cs = P.sheet.querySelectorAll('canvas');
      P.obj = new Sunset(cs[0], cs[1], o.right, o.meta.right);
      P.frame = (t, dt) => P.obj.frame(t, dt, App.s);
      P.isSunset = true;
    } else {
      if (!PAGE_META) PAGE_META = fetch(A + 'pages.json').then((r) => r.json());
      const meta = (await PAGE_META)[pid];
      const recs = meta.filter((r) => !r.zone);
      const [base, glow, ...imgs] = await Promise.all([loadImg(`${A}${pid}/base.webp`), loadImg(A + 'glow.webp'), ...recs.map((r) => loadImg(`${A}${pid}/${r.id}.webp`))]);
      glowTexture(glow);
      P.sheet = makeSheet(side, `<canvas aria-label="Colored pencil and ink sketchbook page"></canvas>`);
      P.obj = new SketchPage(pid, meta, base, imgs, P.sheet.querySelector('canvas'));
      P.frame = (t, dt) => P.obj.frame(t, dt);
    }
    if (Layout.pageW) P.obj.resize();
    return P;
  })();
  return P.ready;
}
const ensureSpread = (i) => Promise.all([ensurePage(SPREADS[i].L, 'left'), ensurePage(SPREADS[i].R, 'right')]);

const Book = {
  cur: 0, flip: null,
  visible() {
    const S = (i) => [Pages[SPREADS[i].L], Pages[SPREADS[i].R]];
    const v = S(this.cur);
    if (this.flip) v.push(...S(this.flip.to));
    return v.filter((p) => p && p.obj);
  },
  async go(dir, drag) {
    const to = this.cur + dir;
    if (this.flip || to < 0 || to >= SPREADS.length) return false;
    this.flip = { pending: true, to, dir };
    await ensureSpread(to);
    const a = SPREADS[this.cur], b = SPREADS[to];
    const aL = Pages[a.L], aR = Pages[a.R], bL = Pages[b.L], bR = Pages[b.R];
    const leaf = document.createElement('div'); leaf.className = 'leaf ' + (dir > 0 ? 'fwd' : 'back');
    const front = document.createElement('div'); front.className = 'face front';
    const back = document.createElement('div'); back.className = 'face back';
    leaf.append(front, back);
    if (dir > 0) { front.append(aR.sheet); back.append(bL.sheet); $('slotR').append(bR.sheet); }
    else { front.append(aL.sheet); back.append(bR.sheet); $('slotL').append(bL.sheet); }
    $('book').append(leaf);
    [bL, bR].forEach((p) => { p.obj.resize(); p.obj.onShow && p.obj.onShow(); });
    Object.assign(this.flip, { pending: false, leaf, front, back, angle: 0, from: 0, target: 180, t: 0, dur: reduced ? .01 : .95, dragging: !!drag, a: [aL, aR], b: [bL, bR] });
    Sound.sweep(500, 1600, .5, .25, .6);
    this.setUI(to);
    return true;
  },
  step(dt) {
    const f = this.flip; if (!f || f.pending) return;
    if (!f.dragging) {
      f.t += dt; const u = Math.min(1, f.t / f.dur);
      f.angle = f.from + (f.target - f.from) * ease(u);
      if (u >= 1) return this.finish(f.target >= 180);
    }
    const ang = clamp(f.angle, 0, 180);
    f.leaf.style.transform = `rotateY(${f.dir > 0 ? -ang : ang}deg)`;
    const s = Math.sin(ang * Math.PI / 180);
    f.front.style.setProperty('--sh', (ang < 90 ? s * .55 : 0).toFixed(3));
    f.back.style.setProperty('--sh', (ang > 90 ? s * .55 : 0).toFixed(3));
    $('cast').style.opacity = (s * .5).toFixed(3);
    $('cast').className = 'cast ' + (f.dir > 0 ? (ang < 90 ? 'on-right' : 'on-left') : (ang < 90 ? 'on-left' : 'on-right'));
  },
  release(vx) {
    const f = this.flip; if (!f || !f.dragging) return;
    f.dragging = false; f.from = f.angle; f.t = 0;
    const done = f.angle > 80 || vx * f.dir < -0.4;
    f.target = done ? 180 : 0; f.dur = Math.max(.25, .7 * Math.abs(f.target - f.angle) / 180);
    if (!done) this.setUI(this.cur);
  },
  finish(done) {
    const f = this.flip; const [aL, aR] = f.a, [bL, bR] = f.b;
    if (done) {
      if (f.dir > 0) $('slotL').replaceChildren(bL.sheet); else $('slotR').replaceChildren(bR.sheet);
      $('slotL').replaceChildren(bL.sheet); $('slotR').replaceChildren(bR.sheet);
      this.cur = f.to;
    } else {
      $('slotL').replaceChildren(aL.sheet); $('slotR').replaceChildren(aR.sheet);
    }
    f.leaf.remove(); $('cast').style.opacity = 0; this.flip = null;
    this.setUI(this.cur);
    if (this.cur + 1 < SPREADS.length) setTimeout(() => ensureSpread(this.cur + 1), 400);
    if (done) Sound.tok(.5);
  },
  setUI(i) {
    const s = SPREADS[i];
    $('place').innerHTML = s.place;
    $('count').textContent = `${i + 1} / ${SPREADS.length}`;
    $('prev').disabled = i === 0; $('next').disabled = i === SPREADS.length - 1;
    const sun = s.R === 'sunset';
    $('scrubRow').hidden = !sun; $('play').hidden = !sun;
    $('hints').innerHTML = s.hints.map((h) => `<li>${h}</li>`).join('');
    try { history.replaceState(null, '', '#spread-' + (i + 1)); } catch (e) {}
  },
};

/* ======================================================= app */
const App = {
  s: 0, playing: !reduced, holding: false, dir: 1, hold: 0, t0: performance.now(),
  touchedOnce: false,
  touched() {
    if (!this.touchedOnce) { this.touchedOnce = true; setTimeout(() => { $('hints').style.opacity = .6; }, 2500); }
  },
  setTime(s, fromUser) {
    this.s = s; $('time').value = Math.round(s * 1000);
    const mins = 19 * 60 + 58 + Math.round(s * 42);
    $('clock').textContent = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
    if (fromUser) { this.dir = 1; this.hold = 0; }
  },
};

async function start() {
  const m = /spread-(\d+)/.exec(location.hash || '');
  Book.cur = m ? clamp(+m[1] - 1, 0, SPREADS.length - 1) : 0;
  await ensureSpread(Book.cur);
  const s0 = SPREADS[Book.cur];
  $('slotL').replaceChildren(Pages[s0.L].sheet); $('slotR').replaceChildren(Pages[s0.R].sheet);
  Book.visible().forEach((p) => p.obj.onShow && p.obj.onShow());
  Book.setUI(Book.cur);
  const resize = () => {
    Layout.pageW = $('slotL').clientWidth;
    Object.values(Pages).forEach((p) => p.obj && p.obj.resize());
  };
  new ResizeObserver(resize).observe($('book')); resize();
  setTimeout(() => ensureSpread(Math.min(Book.cur + 1, SPREADS.length - 1)), 600);

  // controls
  const playBtn = $('play');
  const setPlay = (v) => { App.playing = v; playBtn.setAttribute('aria-pressed', v); const l = v ? 'Pause the sunset' : 'Play the sunset'; playBtn.setAttribute('aria-label', l); playBtn.title = l; };
  setPlay(App.playing);
  playBtn.addEventListener('click', () => setPlay(!App.playing));
  const soundBtn = $('sound');
  soundBtn.addEventListener('click', () => {
    const v = soundBtn.getAttribute('aria-pressed') !== 'true';
    soundBtn.setAttribute('aria-pressed', v); soundBtn.setAttribute('aria-label', v ? 'Turn sound off' : 'Turn sound on');
    Sound.toggle(v);
  });
  const range = $('time');
  range.addEventListener('input', () => { App.holding = true; App.setTime(range.value / 1000, true); });
  range.addEventListener('change', () => { App.holding = false; });
  ['pointerup', 'pointercancel'].forEach((ev) => range.addEventListener(ev, () => { App.holding = false; }));
  $('prev').addEventListener('click', () => Book.go(-1));
  $('next').addEventListener('click', () => Book.go(1));
  addEventListener('keydown', (e) => {
    if (e.target.closest && e.target.closest('input')) return;
    if (e.key === 'ArrowRight') Book.go(1); else if (e.key === 'ArrowLeft') Book.go(-1);
  });
  // drag a page by its outer edge
  for (const [id, dir] of [['cornerR', 1], ['cornerL', -1]]) {
    const el = $(id); let lastX = 0, lastT = 0, vx = 0;
    el.addEventListener('pointerdown', async (e) => {
      el.setPointerCapture(e.pointerId); lastX = e.clientX; lastT = performance.now(); vx = 0;
      const ok = await Book.go(dir, true);
      if (!ok) return;
      el.onpointermove = (ev) => {
        const f = Book.flip; if (!f || !f.dragging) return;
        const r = $('book').getBoundingClientRect(), spine = r.left + r.width / 2, pw = r.width / 2;
        const rel = dir > 0 ? (ev.clientX - spine) / pw : (spine - ev.clientX) / pw;
        f.angle = Math.acos(clamp(rel, -1, 1)) * 180 / Math.PI;
        const now = performance.now(); vx = (ev.clientX - lastX) / Math.max(1, now - lastT); lastX = ev.clientX; lastT = now;
      };
    });
    const up = () => { el.onpointermove = null; Book.release(vx); };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }

  // phone: slide between the two pages of a spread
  const sc = $('scroller'), dots = [...$('dots').children], slots = [$('slotL'), $('slotR')];
  dots.forEach((d, i) => d.addEventListener('click', () => slots[i].scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })));
  const syncDots = () => { const mid = sc.scrollLeft + sc.clientWidth / 2; let best = 0, bd = 1e9; slots.forEach((p, i) => { const r = p.offsetLeft + p.offsetWidth / 2 + $('book').offsetLeft; const dd = Math.abs(r - mid); if (dd < bd) { bd = dd; best = i; } }); dots.forEach((d, i) => d.setAttribute('aria-current', i === best)); };
  sc.addEventListener('scroll', syncDots, { passive: true });
  if (matchMedia('(max-width: 760px)').matches) requestAnimationFrame(() => { $('slotR').scrollIntoView({ inline: 'center', block: 'nearest' }); syncDots(); });

  App.setTime(0);
  let prev = performance.now();
  const SET = 55, RISE = 24, HOLD_DUSK = 7, HOLD_GOLD = 9;
  App.hold = 4;
  const loop = (now) => {
    const dt = Math.min(.05, (now - prev) / 1000); prev = now;
    const t = (now - App.t0) / 1000;
    const vis = Book.visible();
    const sunVisible = vis.some((p) => p.isSunset);
    if (sunVisible && App.playing && !App.holding) {
      if (App.hold > 0) App.hold -= dt;
      else {
        const ns = App.s + App.dir * dt / (App.dir > 0 ? SET : RISE);
        if (ns >= 1) { App.dir = -1; App.hold = HOLD_DUSK; App.setTime(1); }
        else if (ns <= 0) { App.dir = 1; App.hold = HOLD_GOLD; App.setTime(0); }
        else App.setTime(ns);
      }
    }
    document.documentElement.style.setProperty('--dusk', sunVisible && !Book.flip ? (smooth(.45, 1, App.s) * .9).toFixed(3) : '0');
    Book.step(dt);
    for (const p of vis) p.frame(t, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.sketchbook = Object.assign(App, { Book, Pages });
start().catch((e) => { console.error(e); });
})();
