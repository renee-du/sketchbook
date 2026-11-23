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
const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];
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

/* ======================================================= a page of drawings that respond */
const isPalette = (col) => Array.isArray(col) && !(col.length === 3 && typeof col[0] === 'number') && col.every((c) => c === null || (Array.isArray(c) && c.length === 3 && typeof c[0] === 'number'));
class SketchPage {
  get items() { return this.S.items; } set items(v) { this.S.items = v; }
  get fx() { return this.S.fx; } set fx(v) { this.S.fx = v; }
  get by() { return this.S.by; } set by(v) { this.S.by = v; }
  constructor(pid, recs, base, imgs, canvas, extra, shared) {
    this.pid = pid; this.c = canvas; this.x = canvas.getContext('2d'); this.base = base;
    this.off = shared ? shared.off : 0; this.span = shared ? 1800 : PW;
    const room = shared && shared.room;
    this.zones = []; this.t = 0; this.gust = 0; this.nextGust = 6; this.breeze = .3;
    if (room && room.S) { this.S = room.S; this.opaque = true; this.listOrder = [...this.items].reverse(); this.bind(); return; }
    this.S = { items: [], fx: [], by: {}, lastT: -1 };
    if (room) room.S = this.S;
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
      const p = pagePoint(c, e); p.x += this.off; this.pointer = p;
      const d = this.dragging;
      if (d) {
        const dx = p.x - d.sx, dy = p.y - d.sy;
        if (!d.moved && Math.hypot(dx, dy) > 7) { d.moved = true; Sound.tok(.6); }
        if (d.moved) {
          const it = d.it, ntx = clamp(d.tx0 + dx, -it.x - it.w * .3, this.span - it.x - it.w * .7), nty = clamp(d.ty0 + dy, -it.y - it.h * .2, PH - it.y - it.h * .85);
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
      const p = pagePoint(c, e); p.x += this.off;
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
      case 'lid': { const lid = this.by.lid; lid.open = !lid.open; lid.anim2 = { t: 0, from: [lid.tx, lid.ty, lid.rot], to: lid.open ? [34, -86, -.2] : [0, 0, 0], dur: lid.open ? .75 : .55 }; break; }
      case 'pearl': this.fx.push({ k: 'spark', x: it.pearl[0], y: it.pearl[1], age: 0, seed: Math.random() * 9 }); Sound.chime(); break;
      case 'toss': if (it.state === 'home') { it.state = 'fly'; it.tt = 0; Sound.ting(); } break;
      case 'splash': this.ripple(clamp(px, 380, 780), clamp(py, 640, 700), 1); Sound.splash(); break;
      case 'jingle': it.vr += side * 1.6; Sound.jingle(); break;
      case 'pet': it.petT = this.t; break;
      case 'flutter': this.items.filter((o) => o.b === 'flutter').forEach((o) => o.burst = 1.4); { const d = this.by.dangle; if (d) d.vr += .9; } break;
      case 'wobble': it.vr += side * (it.k < 16 ? 1.6 : .9); break;
      case 'melt': {      // the gelato softens: a drop gathers at the rim and runs down
        it.sq = -.03; it.vsq = -.5;
        const [mx, my] = it.melt[(it.meltIx = ((it.meltIx || 0) + 1) % it.melt.length)];
        this.fx.push({ k: 'drip', x: mx, y0: my, y: my, vy: 0, len: 0, age: 0, state: 'grow', puddle: 0, col: it.col, slow: true });
        break;
      }
      case 'shiver': { it.sq = -.04; it.vsq = -.8; const sg = this.by.sign; if (sg) sg.vr += 1.1; break; }
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
      if (X < 0 || Y < 0 || X >= it.w || Y >= it.h || it.alpha[Y * it.w + X] < 30 || (it.stick && Math.abs(X + it.x - it.stick[0][0]) < 4 && it.alpha[Y * it.w + X] < 200)) { e = [X, Y, a]; break outer; }
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
    if (it.stick) {                  // the skewer shows through where the food was eaten
      const [st] = mk((g) => {
        const [[ax, ay], [bx, by]] = it.stick;
        penPath(g, [[ax - it.x, ay - it.y], [bx - it.x, by - it.y]], 2, .95, 1, false);
        g.globalCompositeOperation = 'destination-in'; g.drawImage(mask, 0, 0);
      });
      ctx.drawImage(st, 0, 0);
    }
    it.alpha = alphaOf(it.img);
    return piece;
  }
  /* serve a slice: it lifts away trailing strings of melted cheese that stretch, thin and snap */
  slice(it) {
    const knife = it.knife && this.by[it.knife];
    if (knife && knife.saw) return;
    if (it.wedge >= it.wedges.length) {
      editable(it); it.wedge = 0; it.done = 0; it.sq = -.25; it.vsq = 3;
      if (knife) knife.anim2 = { t: 0, from: [knife.tx, knife.ty, knife.rot], to: [0, 0, 0], dur: .8 };
      return;
    }
    if (knife) {              // the knife comes over, saws along the new cut, then lifts away
      const a1 = it.wedges[it.wedge][1] * Math.PI / 180, dir = [Math.cos(a1), Math.sin(a1)];
      const mid = [it.c[0] + dir[0] * 105, it.c[1] + dir[1] * 105];
      knife.saw = { t: 0, from: [knife.tx, knife.ty, knife.rot], to: [mid[0] - knife.pv[0], mid[1] - knife.pv[1], a1 + .33], dir, pizza: it };
      return;
    }
    this.cutSlice(it);
  }
  cutSlice(it) {
    const knife = it.knife && this.by[it.knife];
    const wi = it.wedge, [a0, a1] = it.wedges[it.wedge++];
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
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineWidth = 4; ctx.strokeStyle = '#000'; wedge(ctx); ctx.stroke();
    // ink the new cut edges, only where pizza is still on the pan
    const [cut, cg] = mk();
    for (const a of [a0, a1]) { const r = a * Math.PI / 180; penPath(cg, [[cx + Math.cos(r) * 3, cy + Math.sin(r) * 3], [cx + Math.cos(r) * 240, cy + Math.sin(r) * 240]], a, .9, 1, false); }
    cg.globalCompositeOperation = 'destination-in'; cg.drawImage(it.body, 0, 0);
    cg.drawImage(it.img, 0, 0);
    cg.globalCompositeOperation = 'destination-out'; cg.lineWidth = 7; cg.strokeStyle = '#000'; wedge(cg); cg.stroke();
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(cut, 0, 0);
    it.alpha = alphaOf(it.img);
    const mid = (a0 + a1) / 2 * Math.PI / 180, dir = [Math.cos(mid), Math.sin(mid)];
    const strands = [];
    for (const a of [a0, a1]) for (const f of [.25, .5, .72]) {
      const r = a * Math.PI / 180, rr = 140 * f + 18;
      strands.push({ ax: it.c[0] + Math.cos(r) * rr, ay: it.c[1] + Math.sin(r) * rr, snap: 60 + Math.random() * 60, w: 1.8 + Math.random() * 1.6, seed: Math.random() * 9 });
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
    if (this.S.lastT === t) { this.t = t; return; }
    this.S.lastT = t;
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
      if (it.id === 'lid') { const u = clamp(-it.ty / 86, 0, 1); it.lift = u * .9; it.sc = 1 + u * .06; }   // nearer to you as it rises
      it.gustAmt = Math.max(0, it.gustAmt - dt * .55);
      if (it.state) this.updateToss(it, dt);
      if (it.anim) this.updateTool(it, dt);
      if (it.saw) {
        const sw = it.saw; sw.t += dt;
        const T1 = .5, T2 = 1.5, T3 = 2.1;
        if (sw.t < T1) { const u = ease(sw.t / T1); it.tx = lerp(sw.from[0], sw.to[0], u); it.ty = lerp(sw.from[1], sw.to[1], u) - Math.sin(u * Math.PI) * 30; it.rot = lerp(sw.from[2], sw.to[2], u); }
        else if (sw.t < T2) {
          const u = (sw.t - T1) / (T2 - T1), stroke = Math.sin(u * Math.PI * 7) * 16 * (1 - u * .3), press = Math.sin(u * Math.PI * 14) * .8;
          it.tx = sw.to[0] + sw.dir[0] * stroke; it.ty = sw.to[1] + sw.dir[1] * stroke + press; it.rot = sw.to[2];
          if (!sw.marked && u > .15) { sw.marked = true; this.fx.push({ k: 'cutline', it: sw.pizza, a: Math.atan2(sw.dir[1], sw.dir[0]), age: 0, life: T2 - T1 }); }
          if (Math.random() < dt * 14) { const r = 30 + Math.random() * 150; const px = sw.pizza.c[0] + sw.dir[0] * r, py = sw.pizza.c[1] + sw.dir[1] * r; this.fx.push({ k: 'crumb', x: px, y: py, vx: (Math.random() - .5) * 60, vy: -60 - Math.random() * 60, r: 0, vr: 6, s: 1.2 + Math.random(), col: Math.random() < .5 ? 'rgb(222,140,96)' : 'rgb(236,206,150)', floor: py + 8, age: 0 }); }
        } else {
          if (!sw.cut) { sw.cut = true; this.cutSlice(sw.pizza); sw.from2 = [it.tx, it.ty, it.rot]; }
          const rest = sw.pizza.rest, u = ease((sw.t - T2) / (T3 - T2));
          const to = [rest[0] - it.pv[0], rest[1] - it.pv[1], rest[2]];
          it.tx = lerp(sw.from2[0], to[0], u); it.ty = lerp(sw.from2[1], to[1], u) - Math.sin(u * Math.PI) * 40; it.rot = lerp(sw.from2[2], to[2], u);
          if (sw.t >= T3) it.saw = null;
        }
      }
      if (it.anim2) {
        const a = it.anim2, D = a.dur || .7; a.t += dt;
        const v = clamp(a.t / D, 0, 1), u = 1 - Math.pow(1 - v, 3) + Math.sin(v * Math.PI) * .06;     // eases out with a touch of overshoot
        it.tx = lerp(a.from[0], a.to[0], u); it.ty = lerp(a.from[1], a.to[1], u); it.rot = lerp(a.from[2], a.to[2], u);
        if (a.t >= D) { it.anim2 = null; it.tx = a.to[0]; it.ty = a.to[1]; it.rot = a.to[2]; }
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
    if (!reduced) for (const it of this.items) {
      if (it.steam && it.op > .5 && !it.done && Math.random() < dt * 1.3) { const [sx, sy] = it.steam[Math.random() * it.steam.length | 0]; this.fx.push({ k: 'steam', x: sx + (Math.random() - .5) * 30, y: sy, age: 0, life: 3.2, seed: Math.random() * 9 }); }
      if (it.fizz && it.drunk < .9 && Math.random() < dt * 2.2) { const [x0, y0, x1, y1] = it.fizz; this.fx.push({ k: 'bubble', it, x: x0 + Math.random() * (x1 - x0), y: y1 - Math.random() * 20, r: 1.4 + Math.random() * 1.8, age: 0, life: 2.4, seed: Math.random() * 9, slow: true }); }
      if (it.glint && it.op > .5 && Math.random() < dt * .12) this.fx.push({ k: 'spark', x: it.glint[0] + it.tx, y: it.glint[1] + it.ty, age: 0, seed: Math.random() * 9, small: true });
    }
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
        case 'bubble': f.y -= dt * (f.slow ? 22 : 38); break;
        case 'steam': f.y -= dt * 26; f.x += Math.sin(f.age * 1.7 + f.seed) * dt * 10; break;
        case 'drip':
          if (f.state === 'grow') { f.len = Math.min(1, f.len + dt * (f.slow ? .7 : 1.1)); if (f.len >= 1) f.state = 'fall'; }
          else if (f.state === 'fall') { f.vy += (f.slow ? 260 : 900) * dt; f.y += f.vy * dt; if (f.y > f.y0 + (f.slow ? 34 : 50)) { f.state = 'pool'; } }
          else f.puddle = Math.min(1, f.puddle + dt * 3);
          break;
      }
    }
    const life = { crumb: 5, drop: .7, bird: 8, bubble: 1.2, steam: 3.2, drip: 6, ring: 1.8, spark: 1, mark: .9 };
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
  T(x, k) { x.setTransform(k, 0, 0, k, -this.off * k, 0); }
  setT(x, it, k) {
    if (it.par) this.setT(x, it.par, k); else this.T(x, k);
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
    const LAYERED = { sway: 40, tree: 40, crowd: 12, water: 8, fan: 40, warp: 30 };
    const pad = LAYERED[it.b];
    const mode = this.opaque || it.opaque ? 'source-over' : 'multiply';
    if (it.lift > .02) {                    // picked up: a soft shadow on the page below
      if (!it.sil) { it.sil = canvasOf(it.w, it.h); const g = it.sil.getContext('2d'); g.drawImage(it.img, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgb(60,50,45)'; g.fillRect(0, 0, it.w, it.h); }
      this.T(x, k); x.globalCompositeOperation = 'multiply'; x.globalAlpha = .16 * it.lift;
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
    if (it.rim) {                    // the tin's open mouth, drawn in pen while the lid is off
      const lid = this.by.lid, a = clamp(-lid.ty / 26, 0, 1);
      if (a > .01) {
        this.T(x, k); x.globalCompositeOperation = 'multiply';
        const [cx, cy, rx, ry] = it.rim;
        x.save(); x.beginPath(); x.ellipse(cx, cy, rx - 3, ry - 2, 0, 0, Math.PI * 2); x.clip();
        x.globalAlpha = .35 * a; x.fillStyle = 'rgb(215, 210, 200)'; x.fillRect(cx - rx, cy - ry, rx * 2, ry * 2 + 30);
        x.globalAlpha = 1; for (let i = 0; i < 9; i++) { const xx = cx - rx + 30 + i * 26; penPath(x, [[xx, cy - ry + 4], [xx - 10, cy + 2]], i, .35, .45 * a); }
        x.restore();
        penPath(x, arcPts(cx, cy, rx, ry, Math.PI * 1.02, Math.PI * 1.98, 34), 3, 1, a, false);
        penPath(x, arcPts(cx, cy + 4, rx - 7, ry - 5, Math.PI * 1.08, Math.PI * 1.92, 28), 5, .55, a * .7, false);
      }
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
        const idle = reduced ? 0 : .09 * (.5 + .5 * Math.sin(t * 2.3 + it.seed)) + .05 * Math.sin(t * 7.7);
        const f = 1 - (idle + it.burst * .75 * (.5 + .5 * Math.sin(t * 34)));
        x.translate(ax, ay); x.rotate(th); x.scale(1, f); x.rotate(-th); x.translate(-ax, -ay);
        x.drawImage(it.img, it.x, it.y); break;
      }
      case 'warp': this.drawWarp(x, it); break;
      default: x.drawImage(it.img, it.x, it.y);
    }
  }
  /* the cat breathes, shifts its weight, looks about, flicks its ears and swishes its tail:
     the drawing itself is gently bent on a fine mesh, so the linework stays the artist's */
  catState(it, t, dt) {
    const S = it.cs || (it.cs = { look: 0, lookV: 0, lookTo: 0, next: 2, tilt: 0, tiltV: 0, tiltTo: 0, ear: [-9, -9], nextEar: 2.5, swish: 0, tailPhase: 0, purr: 0, blink: 0, nextBlink: 3, stroke: 0 });
    S.next -= dt;
    // stroking: the pointer moving over the cat keeps it purring
    const pp = this.pointer;
    if (pp && this.lastP && pp.x > it.x && pp.x < it.x + it.w && pp.y > it.y && pp.y < it.y + it.h) S.stroke = Math.min(1, S.stroke + Math.hypot(pp.x - this.lastP.x, pp.y - this.lastP.y) * .004);
    S.stroke = Math.max(0, S.stroke - dt * .25);
    const wantPurr = (it.petT !== undefined && t - it.petT < 4.5) || S.stroke > .2 ? 1 : 0;
    S.purr += (wantPurr - S.purr) * (1 - Math.exp(-dt * (wantPurr ? 2.4 : .9)));
    S.nextBlink -= dt; if (S.nextBlink < 0) { S.nextBlink = 2.5 + Math.random() * 4; S.blink = 1; }
    S.blink = Math.max(0, S.blink - dt * 5);
    const p = this.pointer;
    // left alone, the cat gets on with its own life: looks about, sniffs, stretches, swishes its tail
    if (!S.act || t - S.act.t > S.act.dur) {
      if (S.act) S.rest = t + 1 + Math.random() * 2.5, S.act = null;
      if (S.purr < .2 && (!S.rest || t > S.rest)) {
        const k = ['scan', 'sniff', 'stretch', 'swish', 'scan', 'swish'][Math.random() * 6 | 0];
        S.act = { k, t, dur: { scan: 3.2, sniff: 2.2, stretch: 3.4, swish: 2.6 }[k], dir: Math.random() < .5 ? -1 : 1 };
        if (k === 'stretch') S.ear[0] = S.ear[1] = t;
      }
    }
    const A = S.act, au = A ? clamp((t - A.t) / A.dur, 0, 1) : 0, env = A ? Math.sin(au * Math.PI) : 0;
    S.stretch = A && A.k === 'stretch' ? Math.pow(env, .7) : 0;
    S.sniff = A && A.k === 'sniff' ? env : 0;
    S.swish = Math.max(S.swish * Math.exp(-dt * 1.5), A && A.k === 'swish' ? env : 0);
    const moved = p && this.lastMoveT !== undefined && t - this.lastMoveT < 2.5;
    if (p && this.lastP && (p.x !== this.lastP.x || p.y !== this.lastP.y)) this.lastMoveT = t;
    if (A && A.k === 'scan' && !moved) { S.lookTo = A.dir * (au < .5 ? .3 : -.24); S.tiltTo = A.dir * .06; }
    else if (S.sniff) { S.lookTo = -.12; S.tiltTo = .05; }
    else if (moved && Math.hypot(p.x - it.head[0], p.y - it.head[1]) < 420) S.lookTo = clamp((p.x - it.head[0]) / 600, -.22, .22) + clamp((p.y - it.head[1]) / 900, -.1, .1);
    else if (S.next < 0) { S.next = 2 + Math.random() * 3.5; S.lookTo = (Math.random() - .5) * .5; S.tiltTo = (Math.random() - .5) * .18; }
        if (S.purr > .3) { S.tiltTo = -.14 * S.purr; S.lookTo = pp ? clamp((pp.x - it.head[0]) / 500, -.16, .16) : -.06; }
    // critically damped springs: quick to start, soft to settle
    const spring = (x, v, to, w) => { const a = -2 * w * v - w * w * (x - to); v += a * dt; return [x + v * dt, v]; };
    [S.look, S.lookV] = spring(S.look, S.lookV, S.lookTo, 5.5);
    [S.tilt, S.tiltV] = spring(S.tilt, S.tiltV, S.tiltTo, 4);
    S.nextEar -= dt; if (S.nextEar < 0) { S.nextEar = 2 + Math.random() * 5; S.ear[Math.random() < .5 ? 0 : 1] = t; }
    S.tailPhase += dt * (.9 + S.purr * .3 + S.swish * 2.2);
    return S;
  }
  warpAt(it, S, X, Y, t) {
    let x = X, y = Y;
    const feet = clamp((1196 - Y) / 140, 0, 1);                     // paws stay planted
    // breathing: the ribcage rises and the belly fills
    const br = (Math.sin(t * 1.55) * .5 + .5);
    const torso = clamp(1 - Math.abs(X - 450) / 190, 0, 1) * clamp((1150 - Y) / 140, 0, 1);
    y -= br * 3.6 * torso; y += br * 2.2 * torso * clamp((Y - 1060) / 60, 0, 1);
    // the stretch: front end lowers and reaches, hindquarters rise
    if (S.stretch > .01) {
      const front = clamp((X - 420) / 160, 0, 1), rear = clamp((420 - X) / 160, 0, 1), up = clamp((1180 - Y) / 200, 0, 1);
      y += S.stretch * (9 * front - 5 * rear) * up; x += S.stretch * 7 * front * up;
    }
    // sniffing: the head dips toward the ground, nose twitching
    if (S.sniff > .01) {
      const hw2 = 1 - smooth(40, 100, Math.hypot(X - it.head[0], Y - it.head[1]));
      y += S.sniff * (8 + Math.sin(t * 22) * 1.2) * hw2; x += S.sniff * 4 * hw2;
    }
    // a purr is felt more than seen: a fine tremor through the body
    if (S.purr > .02) { const v = Math.sin(t * 57) * .45 * S.purr * torso; x += v; y += v * .5; }
    // weight shifting from one side to the other
    x += Math.sin(t * .42) * 2.8 * feet;
    // head turns and tilts on the neck
    const [nx, ny] = it.neck, dH = Math.hypot(X - it.head[0], Y - it.head[1]);
    const hw = 1 - smooth(48, 92, dH);
    if (hw > 0) {
      const a = (S.look * .9 + S.tilt + Math.sin(t * 1.55) * .012) * hw, c = Math.cos(a), s = Math.sin(a);
      const dx = x - nx, dy = y - ny; x = nx + dx * c - dy * s + S.look * 10 * hw; y = ny + dx * s + dy * c;
    }
    // ears flick
    it.ears.forEach(([ex, ey], i) => {
      const age = t - S.ear[i]; if (age < 0 || age > .32) return;
      const w = 1 - smooth(6, 22, Math.hypot(X - ex, Y - ey)); if (w <= 0) return;
      const a = Math.sin(age / .32 * Math.PI) * .5 * w * (i ? 1 : -1), c = Math.cos(a), s = Math.sin(a), bx = ex, by = ey + 16;  // flick
      const dx = x - bx, dy = y - by; x = bx + dx * c - dy * s; y = by + dx * s + dy * c;
    });
    // the tail swings from its root, more toward the tip, with a wave travelling down it
    const [tx, ty] = it.tail;
    if (X < tx + 6 && Y > ty - 40) {
      const sd = clamp((tx - X) / 140, 0, 1);
      if (sd > 0) {
        const a = (Math.sin(S.tailPhase - sd * 2.2) * (.22 - S.purr * .08 + S.swish * .2) + Math.sin(t * .37) * .08 + S.purr * .42) * Math.pow(sd, 1.25);
        const c = Math.cos(a), s = Math.sin(a), dx = x - tx, dy = y - ty;
        x = tx + dx * c - dy * s; y = ty + dx * s + dy * c;
      }
    }
    return [x, y];
  }
  drawWarp(x, it) {
    const t = this.t, S = this.catState(it, t, this.dt || .016), G = 16;
    const nx = Math.ceil(it.w / G), ny = Math.ceil(it.h / G);
    const P = [];
    for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) { const u = Math.min(i * G, it.w), v = Math.min(j * G, it.h); P.push([u, v, ...this.warpAt(it, S, it.x + u, it.y + v, t)]); }
    const tri = (a, b, c) => {
      // affine map from sprite triangle to warped triangle
      const [u0, v0, x0, y0] = a, [u1, v1, x1, y1] = b, [u2, v2, x2, y2] = c;
      const den = (u1 - u0) * (v2 - v0) - (u2 - u0) * (v1 - v0); if (!den) return;
      const A = ((x1 - x0) * (v2 - v0) - (x2 - x0) * (v1 - v0)) / den, C = ((x2 - x0) * (u1 - u0) - (x1 - x0) * (u2 - u0)) / den;
      const B = ((y1 - y0) * (v2 - v0) - (y2 - y0) * (v1 - v0)) / den, D = ((y2 - y0) * (u1 - u0) - (y1 - y0) * (u2 - u0)) / den;
      const E = x0 - A * u0 - C * v0, F = y0 - B * u0 - D * v0;
      const cx = (x0 + x1 + x2) / 3, cy = (y0 + y1 + y2) / 3, g = (p) => [p[0] + (p[0] - cx) * .06, p[1] + (p[1] - cy) * .06];
      const [p0, p1, p2] = [g([x0, y0]), g([x1, y1]), g([x2, y2])];
      x.save(); x.beginPath(); x.moveTo(...p0); x.lineTo(...p1); x.lineTo(...p2); x.closePath(); x.clip();
      x.transform(A, B, C, D, E, F); x.drawImage(it.img, 0, 0); x.restore();
    };
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const a = P[j * (nx + 1) + i], b = P[j * (nx + 1) + i + 1], c = P[(j + 1) * (nx + 1) + i], d = P[(j + 1) * (nx + 1) + i + 1];
      // skip cells with nothing drawn in them
      const u = Math.min(it.w - 1, a[0] + G / 2) | 0, v = Math.min(it.h - 1, a[1] + G / 2) | 0;
      let any = false;
      for (let yy = a[1]; yy < Math.min(it.h, a[1] + G) && !any; yy += 4) for (let xx = a[0]; xx < Math.min(it.w, a[0] + G); xx += 4) if (it.alpha[yy * it.w + xx] > 8) { any = true; break; }
      if (!any) continue;
      tri(a, b, c); tri(b, d, c);
    }
    // eyelids: quick blinks, and the slow contented squeeze of a happy cat
    const close = Math.max(Math.sin(Math.min(1, S.blink) * Math.PI) * .95, clamp(S.purr * 1.3, 0, 1));
    if (close > .02 && it.eyes) for (const [ex, ey, rx, ry] of it.eyes) {
      const [wx, wy] = this.warpAt(it, S, ex, ey, t);
      x.save(); x.globalAlpha = close; x.fillStyle = 'rgb(251, 250, 247)';
      x.beginPath(); x.ellipse(wx, wy, rx * 1.2, ry * 1.25, -.08, 0, Math.PI * 2); x.fill(); x.restore();
      penPath(x, arcPts(wx, wy - ry * .3, rx * 1.05, ry * (.4 + .5 * close), Math.PI * .12, Math.PI * .88, 12), ex, .75, close, true);
    }
    // fur lifting along the back while it's stroked
    if (S.purr > .03) {
      const back = [[372, 1036], [398, 1022], [424, 1012], [450, 1006], [476, 1003], [502, 1002], [528, 1005]];
      back.forEach(([bx, by], i) => {
        const [wx, wy] = this.warpAt(it, S, bx, by, t), lift = S.purr * (.7 + .3 * Math.sin(t * 5 + i));
        penPath(x, [[wx, wy - 1], [wx + 2 - i * .3, wy - 5 - 4 * lift], [wx + 5, wy - 7 - 5 * lift]], i * 3, .42, S.purr * .85, true);
      });
      // the purr itself: soft vibration marks beside the chest
      for (let k = 0; k < 3; k++) {
        const ph = (t * 1.6 + k / 3) % 1, a = Math.sin(ph * Math.PI) * S.purr * .7, r = 10 + ph * 16;
        const [cx, cy] = this.warpAt(it, S, 640, 1068, t);
        penPath(x, arcPts(cx + 6, cy, r * .6, r, -Math.PI * .35, Math.PI * .35, 10), k * 7, .5, a, true);
      }
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
    this.T(x, k); x.globalCompositeOperation = 'multiply';
    x.globalAlpha = Math.min(1, it.amt * 1.1) * .9;
    x.drawImage(this.glowC, gx - gr + it.tx + ox, gy - gr + it.ty + oy);
    x.globalAlpha = 1;
  }
  drawFx(x, k) {
    this.T(x, k); x.globalCompositeOperation = 'multiply';
    for (const f of this.fx) {
      if (f.age < 0) continue;
      this.T(x, k);
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
        case 'cutline': {    // the cut deepening as the knife saws
          const p = f.it, u = clamp(f.age / f.life, 0, 1), len = 30 + 200 * u;
          penPath(x, [[p.c[0] + Math.cos(f.a) * 4, p.c[1] + Math.sin(f.a) * 4], [p.c[0] + Math.cos(f.a) * len, p.c[1] + Math.sin(f.a) * len]], 3, .8, .7 * Math.min(1, u * 4), false);
          break;
        }
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
          const u = f.age, a = (1 - u) * (f.small ? Math.sin(u * Math.PI) * 1.4 : 1), sc = f.small ? .45 : 1;
          for (let i = 0; i < 4; i++) { const ang = i * Math.PI / 2 + .3, r0 = (22 + u * 18) * sc, r1 = r0 + 16 * (1 - u * .5) * sc; penPath(x, [[f.x + Math.cos(ang) * r0, f.y + Math.sin(ang) * r0], [f.x + Math.cos(ang) * r1, f.y + Math.sin(ang) * r1]], f.seed + i, .8, a, true); }
          break;
        }
        case 'bubble': { const it = f.it, top = it.level[0] + (it.level[1] - it.level[0]) * it.drunk; if (f.y < top + 4) break; penPath(x, arcPts(f.x + Math.sin(f.age * 9 + f.seed) * 2, f.y, f.r, f.r, 0, Math.PI * 2, 10), f.seed, f.slow ? .32 : .45, (1 - f.age / (f.life || 1.2)) * (f.slow ? .6 : 1), false); break; }
        case 'steam': {      // a wisp of heat: a soft pencil squiggle that rises and thins
          const u = f.age / f.life, a = Math.sin(u * Math.PI) * .35, pts = [];
          for (let i = 0; i < 9; i++) pts.push([f.x + Math.sin(i * .9 + f.age * 2 + f.seed) * (4 + u * 6), f.y - i * 6]);
          penPath(x, pts, f.seed, .45, a, true); break;
        }
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
    this.T(x, k);
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
      x.fillStyle = 'rgb(250, 236, 190)'; x.fill();
      penPath(x, L, st.seed, .3, .45); penPath(x, R.reverse(), st.seed + 1, .3, .45);
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

/* ======================================================= the turning page (WebGL)
   The sheet is a bent strip: each column's angle lags behind the spine by an amount that grows
   toward the free edge, so the page lifts, curls and lays down like paper. */
let PAPER_IMG = null;
class Curl {
  constructor(canvas) {
    this.c = canvas;
    const gl = this.gl = canvas.getContext('webgl', { antialias: true, premultipliedAlpha: true, alpha: true });
    if (!gl) return;
    const vs = `attribute vec3 p; attribute vec2 uv; attribute vec2 sh; varying vec2 vUv; varying vec2 vSh; uniform vec2 res;
      void main(){ vUv = uv; vSh = sh; gl_Position = vec4(p.x / res.x * 2. - 1., 1. - p.y / res.y * 2., p.z, 1.); }`;
    const fs = `precision mediump float; varying vec2 vUv; varying vec2 vSh; uniform sampler2D tf, tb; uniform float mirrorF, mirrorB;
      void main(){
        bool front = vSh.y > 0.;
        vec2 u = front ? vec2(mirrorF > .5 ? 1. - vUv.x : vUv.x, vUv.y) : vec2(mirrorB > .5 ? 1. - vUv.x : vUv.x, vUv.y);
        vec4 c = front ? texture2D(tf, u) : texture2D(tb, u);
        float s = vSh.x;
        gl_FragColor = vec4(c.rgb * s + vec3(.05) * max(0., s - 1.), 1.);
      }`;
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    const pr = this.pr = gl.createProgram(); gl.attachShader(pr, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(pr); gl.useProgram(pr);
    this.NU = 56; this.NV = 22;
    const nV = (this.NU + 1) * (this.NV + 1);
    this.pos = new Float32Array(nV * 3); this.uv = new Float32Array(nV * 2); this.sh = new Float32Array(nV * 2);
    const idx = [];
    for (let j = 0; j <= this.NV; j++) for (let i = 0; i <= this.NU; i++) { const v = j * (this.NU + 1) + i; this.uv[v * 2] = i / this.NU; this.uv[v * 2 + 1] = j / this.NV; }
    for (let j = 0; j < this.NV; j++) for (let i = 0; i < this.NU; i++) { const a = j * (this.NU + 1) + i, b = a + 1, c = a + this.NU + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
    this.nIdx = idx.length;
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    const attr = (name, data, size) => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW); const l = gl.getAttribLocation(pr, name); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, size, gl.FLOAT, false, 0, 0); return b; };
    this.bP = attr('p', this.pos, 3); this.bU = attr('uv', this.uv, 2); this.bS = attr('sh', this.sh, 2);
    this.u = { res: gl.getUniformLocation(pr, 'res'), mf: gl.getUniformLocation(pr, 'mirrorF'), mb: gl.getUniformLocation(pr, 'mirrorB') };
    gl.uniform1i(gl.getUniformLocation(pr, 'tf'), 0); gl.uniform1i(gl.getUniformLocation(pr, 'tb'), 1);
    this.tex = [gl.createTexture(), gl.createTexture()];
    this.tex.forEach((t) => { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); });
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
  }
  setTextures(front, back) {
    const gl = this.gl; if (!gl) return;
    [front, back].forEach((img, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, this.tex[i]); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); });
  }
  /* theta: 0 (lying flat where it started) .. PI (lying on the other side). dir: 1 right->left, -1 left->right */
  draw(theta, dir, grabV, lay, peek = 0) {
    const gl = this.gl; if (!gl) return null;
    const dpr = Math.min(devicePixelRatio || 1, 2), r = this.c.getBoundingClientRect();
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (this.c.width !== W || this.c.height !== H) { this.c.width = W; this.c.height = H; }
    gl.viewport(0, 0, W, H); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const { spineX, top, pw, ph } = lay;                 // in canvas css px
    const f = ph * 3.2, cy = top + ph / 2;
    const sinT = Math.sin(theta), bend = sinT * .95 + .05 * Math.sin(theta * 2);
    const L = [-.32, -.38, .87], NU = this.NU, NV = this.NV;
    let edge = 0;
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, lagK = 1 + .9 * Math.abs(v - grabV);
      let x = 0, z = 0, a = 0;
      for (let i = 0; i <= NU; i++) {
        const u = i / NU;
        a = theta - bend * Math.pow(u, 1.25) * lagK * .62;
        // hovering: just the corner under the pointer lifts, curling up off the page
        if (peek > 0) a += peek * 1.25 * Math.pow(clamp((u - .5) / .5, 0, 1), 1.7) * Math.exp(-Math.pow((v - grabV) / .3, 2));
        a = clamp(a, 0, Math.PI);
        if (i > 0) { x += Math.cos(a) * pw / NU; z += Math.sin(a) * pw / NU; }
        const X = dir * x, Y = (v - .5) * ph, k = f / (f - z);
        const o = j * (NU + 1) + i;
        this.pos[o * 3] = (spineX + X * k) * dpr; this.pos[o * 3 + 1] = (cy + Y * k) * dpr; this.pos[o * 3 + 2] = -z / (ph * 4);
        // normal of the sheet at this column (front side)
        const nx = -dir * Math.sin(a), nz = Math.cos(a);
        const dF = nx * L[0] + nz * L[2], dB = -nx * L[0] - nz * L[2];
        const facing = nz;                        // > 0: the front faces us
        const lit = facing > 0 ? dF : dB;
        const curve = Math.abs(a - theta) * .25;
        this.sh[o * 2] = clamp(.8 + .28 * lit - curve * .22, .62, 1.06);
        this.sh[o * 2 + 1] = facing;
        if (j === Math.round(NV / 2) && i === NU) edge = spineX + X * k;
      }
    }
    gl.useProgram(this.pr);
    gl.uniform2f(this.u.res, W, H);
    gl.uniform1f(this.u.mf, dir > 0 ? 0 : 1); gl.uniform1f(this.u.mb, dir > 0 ? 1 : 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bP); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.pos);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.bS); gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.sh);
    for (let i = 0; i < 2; i++) { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, this.tex[i]); }
    gl.drawElements(gl.TRIANGLES, this.nIdx, gl.UNSIGNED_SHORT, 0);
    return edge;
  }
  clear() { const gl = this.gl; if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); } }
}
/* a page as it looks on paper: paper colour + grain, the drawing multiplied on, the spine's shade */
function snapshot(P, side) {
  const cs = P.sheet.querySelectorAll('canvas'), c0 = cs[0];
  const w = Math.min(c0.width || 900, 1100), h = Math.round(w * PH / PW);
  const c = canvasOf(w, h), x = c.getContext('2d');
  x.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() || '#fbf9f5';
  x.fillRect(0, 0, w, h);
  if (PAPER_IMG) { x.globalCompositeOperation = 'multiply'; const ps = w / (Layout.pageW || w) * 300; for (let yy = 0; yy < h; yy += ps) for (let xx = 0; xx < w; xx += ps) x.drawImage(PAPER_IMG, xx, yy, ps, ps); }
  x.globalCompositeOperation = 'multiply';
  cs.forEach((cv) => { try { x.drawImage(cv, 0, 0, w, h); } catch (e) {} });
  const g = side === 'left' ? x.createLinearGradient(w, 0, 0, 0) : x.createLinearGradient(0, 0, w, 0);
  g.addColorStop(0, 'rgba(120,100,80,.55)'); g.addColorStop(.022, 'rgba(200,190,180,.25)'); g.addColorStop(.07, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, w, h);
  return c;
}

/* ======================================================= the notebook */
const SPREADS = [
  { L: 'treats', R: 'sunset' },
  { L: 'ro_L', R: 'ro_R' },
  { L: 'es_L', R: 'es_R' },
  { L: 'sh_L', R: 'sh_R' },
  { L: 'fu_L', R: 'fu_R' },
];
const ROOMS = { fu: {} };
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
      const roomId = pid.slice(0, 2), room = ROOMS[roomId];
      const meta = (await PAGE_META)[room ? roomId : pid], dir = room ? roomId : pid;
      const recs = meta.filter((r) => !r.zone);
      const [base, glow, ...imgs] = await Promise.all([loadImg(`${A}${pid}/base.webp`), loadImg(A + 'glow.webp'), ...recs.map((r) => loadImg(`${A}${dir}/${r.id}.webp`))]);
      setHatch(glow);
      const extra = {};
      const maps = [...recs.filter((r) => r.pieces).map((r) => [r.id, `${r.id}_pieces.png`]), ...recs.filter((r) => r.cmask).map((r) => [r.id + '_c', `${r.id}_c.png`])];
      await Promise.all(maps.map(async ([key, file]) => {
        const im = await loadImg(`${A}${dir}/${file}`);
        const c = canvasOf(im.width, im.height), g = c.getContext('2d'); g.drawImage(im, 0, 0);
        const d = g.getImageData(0, 0, im.width, im.height).data, lab = new Uint8Array(im.width * im.height);
        for (let i = 0; i < lab.length; i++) lab[i] = d[i * 4];
        extra[key] = lab;
      }));
      P.sheet = makeSheet(side, `<canvas aria-label="Colored pencil and ink sketchbook page"></canvas>`);
      P.obj = new SketchPage(pid, meta, base, imgs, P.sheet.querySelector('canvas'), extra, room ? { room, off: pid.endsWith('R') ? 900 : 0 } : null);
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
    if (this.flip && !this.flip.pending) v.push(...S(this.flip.to));
    return v.filter((p) => p && p.obj);
  },
  peekState: null,
  async peek(dir, v) {
    const to = this.cur + dir;
    if (this.flip || to < 0 || to >= SPREADS.length || matchMedia('(max-width: 760px)').matches) return;
    const P = this.peekState;
    if (P && P.dir === dir) { P.v = v; P.to = 1; return; }
    if (P) this.endPeek();
    const st = this.peekState = { dir, v, amt: 0, to: 1, ready: false };
    await ensureSpread(to);
    if (this.peekState !== st || this.flip) return;
    const a = SPREADS[this.cur], b = SPREADS[to], t = (performance.now() - App.t0) / 1000;
    const turning = dir > 0 ? Pages[a.R] : Pages[a.L], under = dir > 0 ? Pages[b.R] : Pages[b.L];
    for (const p of [turning, under]) { p.obj.resize(); p.frame(t, .0001); }
    Curl1.setTextures(snapshot(turning, dir > 0 ? 'right' : 'left'), snapshot(dir > 0 ? Pages[b.L] : Pages[b.R], dir > 0 ? 'left' : 'right'));
    st.slot = $('slot' + (dir > 0 ? 'R' : 'L')); st.orig = turning.sheet; st.slot.replaceChildren(under.sheet);
    st.ready = true;
  },
  unpeek() { if (this.peekState) this.peekState.to = 0; },
  endPeek() {
    const P = this.peekState; if (!P) return;
    if (P.ready && !this.flip) { P.slot.replaceChildren(P.orig); Curl1.clear(); }
    $('cast').style.opacity = 0; this.peekState = null;
  },
  stepPeek(dt) {
    const P = this.peekState; if (!P || this.flip) return;
    P.amt += (P.to - P.amt) * (1 - Math.exp(-dt * (P.to ? 9 : 7)));
    if (!P.ready) return;
    if (P.to === 0 && P.amt < .01) return this.endPeek();
    Curl1.draw(0, P.dir, P.v, this.layout(), P.amt * (.55 + .25 * Math.abs(P.v - .5) * 2));
  },
  async go(dir, drag) {
    const to = this.cur + dir;
    if (this.flip || to < 0 || to >= SPREADS.length) return false;
    if (this.peekState) { const P = this.peekState; if (P.ready) P.slot.replaceChildren(P.orig); this.peekState = null; }
    this.flip = { pending: true, to, dir };
    await ensureSpread(to);
    const a = SPREADS[this.cur], b = SPREADS[to];
    const aL = Pages[a.L], aR = Pages[a.R], bL = Pages[b.L], bR = Pages[b.R];
    const t = (performance.now() - App.t0) / 1000;
    for (const p of [aL, aR, bL, bR]) { p.obj.resize(); p.frame(t, .0001); }
    // the page that turns, front and back, as paper
    const front = dir > 0 ? snapshot(aR, 'right') : snapshot(aL, 'left');
    const back = dir > 0 ? snapshot(bL, 'left') : snapshot(bR, 'right');
    Curl1.setTextures(front, back);
    if (dir > 0) $('slotR').replaceChildren(bR.sheet); else $('slotL').replaceChildren(bL.sheet);
    $('slot' + (dir > 0 ? 'R' : 'L')).classList.add('under');
    Object.assign(this.flip, { pending: false, angle: 0, from: 0, target: Math.PI, t: 0, dur: reduced ? .01 : 1.15, dragging: !!drag, grabV: drag ? drag.v : .82, a: [aL, aR], b: [bL, bR] });
    Sound.page();
    this.setUI(to);
    this.step(0);
    return true;
  },
  layout() {
    const cv = $('curl').getBoundingClientRect(), bk = $('book').getBoundingClientRect(), sl = $('slotL').getBoundingClientRect();
    return { spineX: bk.left + bk.width / 2 - cv.left, top: sl.top - cv.top, pw: sl.width, ph: sl.height };
  },
  step(dt) {
    const f = this.flip; if (!f || f.pending) return;
    if (!f.dragging) {
      f.t += dt; const u = Math.min(1, f.t / f.dur);
      // lifts quickly, travels, then settles slowly — like a page let go of
      const e = u < .5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2.2) / 2;
      f.angle = f.from + (f.target - f.from) * e;
      if (u >= 1) return this.finish(f.target > 1);
    }
    const ang = clamp(f.angle, 0, Math.PI), lay = this.layout();
    const edge = Curl1.draw(ang, f.dir, f.grabV, lay);
    // shadow the turning page throws on the page beneath
    const cast = $('cast'), s = Math.sin(ang);
    const onRight = (f.dir > 0) === (ang < Math.PI / 2);
    const bk = $('book').getBoundingClientRect(), cv = $('curl').getBoundingClientRect();
    const ex = edge + cv.left - bk.left;
    cast.className = 'cast ' + (onRight ? 'on-right' : 'on-left');
    cast.style.opacity = (s * .9).toFixed(3);
    cast.style.setProperty('--edge', (onRight ? ex : bk.width - ex).toFixed(1) + 'px');
    cast.style.setProperty('--spread', (30 + 90 * s).toFixed(1) + 'px');
  },
  release(vx) {
    const f = this.flip; if (!f || !f.dragging) return;
    f.dragging = false; f.from = f.angle; f.t = 0;
    const done = f.angle > 1.3 || vx * f.dir < -0.35;
    f.target = done ? Math.PI : 0; f.dur = Math.max(.3, .85 * Math.abs(f.target - f.angle) / Math.PI);
    if (!done) this.setUI(this.cur);
  },
  finish(done) {
    const f = this.flip; const [aL, aR] = f.a, [bL, bR] = f.b;
    if (done) { $('slotL').replaceChildren(bL.sheet); $('slotR').replaceChildren(bR.sheet); this.cur = f.to; }
    else { $('slotL').replaceChildren(aL.sheet); $('slotR').replaceChildren(aR.sheet); }
    $('slotL').classList.remove('under'); $('slotR').classList.remove('under');
    Curl1.clear(); $('cast').style.opacity = 0; this.flip = null;
    this.setUI(this.cur);
    if (this.cur + 1 < SPREADS.length) setTimeout(() => ensureSpread(this.cur + 1), 400);
    if (done) Sound.tok(.45);
  },
  setUI(i) {
    const s = SPREADS[i];
    $('count').textContent = `${i + 1} / ${SPREADS.length}`;
    $('prev').disabled = i === 0; $('next').disabled = i === SPREADS.length - 1;
    const sun = s.R === 'sunset';
    $('scrubRow').hidden = !sun; $('play').hidden = !sun;
    try { history.replaceState(null, '', '#spread-' + (i + 1)); } catch (e) {}
  },
};
let Curl1 = null;

/* ======================================================= app */
const App = {
  s: 0, playing: !reduced, holding: false, dir: 1, hold: 0, t0: performance.now(),
  touchedOnce: false,
  touched() {
    this.touchedOnce = true;
  },
  setTime(s, fromUser) {
    this.s = s; $('time').value = Math.round(s * 1000);
    const mins = 19 * 60 + 58 + Math.round(s * 42);
    $('clock').textContent = `${Math.floor(mins / 60)}:${String(mins % 60).padStart(2, '0')}`;
    if (fromUser) { this.dir = 1; this.hold = 0; }
  },
};

async function start() {
  Curl1 = new Curl($('curl'));
  loadImg(A + 'paper.webp').then((i) => { PAPER_IMG = i; }).catch(() => {});
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
    let downX = 0;
    const vOf = (e) => { const br = $('book').getBoundingClientRect(); return clamp((e.clientY - br.top) / br.height, 0, 1); };
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') Book.peek(dir, vOf(e)); });
    el.addEventListener('pointermove', (e) => { if (!e.buttons && e.pointerType === 'mouse') Book.peek(dir, vOf(e)); });
    el.addEventListener('pointerleave', () => Book.unpeek());
    el.addEventListener('pointerdown', async (e) => {
      el.setPointerCapture(e.pointerId); lastX = e.clientX; lastT = performance.now(); vx = 0; downX = e.clientX;
      const br = $('book').getBoundingClientRect();
      const ok = await Book.go(dir, { v: clamp((e.clientY - br.top) / br.height, 0, 1) });
      if (!ok) return;
      el.onpointermove = (ev) => {
        const f = Book.flip; if (!f || !f.dragging) return;
        const r = $('book').getBoundingClientRect(), spine = r.left + r.width / 2, pw = r.width / 2;
        const rel = dir > 0 ? (ev.clientX - spine) / pw : (spine - ev.clientX) / pw;
        f.angle = Math.acos(clamp(rel, -1, 1));
        const now = performance.now(); vx = (ev.clientX - lastX) / Math.max(1, now - lastT); lastX = ev.clientX; lastT = now;
      };
    });
    const up = (e) => {
      el.onpointermove = null;
      if (e && Math.abs(e.clientX - downX) < 8) vx = -dir;      // a tap: let the page go all the way over
      Book.release(vx);
    };
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
    Book.step(dt); Book.stepPeek(dt);
    for (const p of vis) p.frame(t, dt);
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
window.sketchbook = Object.assign(App, { Book, Pages });
start().catch((e) => { console.error(e); });
})();
