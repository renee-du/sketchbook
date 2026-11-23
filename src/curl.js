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
  draw(theta, dir, grabV, lay) {
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
