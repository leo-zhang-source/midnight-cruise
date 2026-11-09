// Render pipeline + VHS finishing chain:
// world (MSAA, half-float) → chrome title layer → neon light buffer → composite
// → dual-filter bloom pyramid → VHS pass (tracking, RGB split, chroma bleed,
// tone curve, scanlines, tape noise, grain, vignette, CRT aperture, glint, flare, dither).
import * as THREE from '../vendor/three.module.min.js';

const QUAD_VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

class Pass {
  constructor(frag, uniforms) {
    this.mat = new THREE.ShaderMaterial({ uniforms, vertexShader: QUAD_VERT, fragmentShader: frag, depthTest: false, depthWrite: false });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.mesh.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.mesh);
    this.cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.u = uniforms;
  }
  render(r, target) { r.setRenderTarget(target); r.render(this.scene, this.cam); }
}

const COMPOSITE = /* glsl */`
  precision highp float; varying vec2 vUv;
  uniform sampler2D tScene, tFg, tNeon; uniform vec2 uPx; uniform float uShadow, uFgA;
  void main(){
    vec4 sc = texture2D(tScene, vUv);
    vec4 fg = texture2D(tFg, vUv) * uFgA;
    vec3 ne = texture2D(tNeon, vUv).rgb;
    // soft drop shadow of the chrome title (separates it from the sun)
    float sh = 0.0;
    for (int i = 0; i < 12; i++) {
      float a = float(i) * 2.39996; float r = sqrt(float(i) + 0.5) / 3.6;
      vec2 o = vec2(cos(a), sin(a)) * r * 14.0 * uPx + vec2(0.0, -7.0) * uPx;
      sh += texture2D(tFg, vUv + o).a;
    }
    sh = sh / 12.0 * uFgA;
    vec3 col = sc.rgb * (1.0 - sh * uShadow);
    col = col * (1.0 - fg.a) + fg.rgb;
    col += ne;
    gl_FragColor = vec4(col, 1.0);
  }`;

const DOWN = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform vec2 uPx; uniform float uPre;
  vec3 pre(vec3 c){ if (uPre < 0.5) return c; float l = max(c.r, max(c.g, c.b)); float k = clamp((l - 0.85) / 0.7, 0.0, 1.0); return c * k * k * (3.0 - 2.0 * k); }
  void main(){
    vec3 c = pre(texture2D(tSrc, vUv).rgb) * 4.0;
    c += pre(texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uPx).rgb);
    c += pre(texture2D(tSrc, vUv + vec2( 1.0, -1.0) * uPx).rgb);
    c += pre(texture2D(tSrc, vUv + vec2(-1.0,  1.0) * uPx).rgb);
    c += pre(texture2D(tSrc, vUv + vec2( 1.0,  1.0) * uPx).rgb);
    gl_FragColor = vec4(c / 8.0, 1.0);
  }`;
const UP = /* glsl */`
  precision highp float; varying vec2 vUv; uniform sampler2D tSrc, tBase; uniform vec2 uPx; uniform float uMix;
  void main(){
    vec3 c = vec3(0.0);
    c += texture2D(tSrc, vUv + vec2(-2.0, 0.0) * uPx).rgb;
    c += texture2D(tSrc, vUv + vec2( 2.0, 0.0) * uPx).rgb;
    c += texture2D(tSrc, vUv + vec2(0.0, -2.0) * uPx).rgb;
    c += texture2D(tSrc, vUv + vec2(0.0,  2.0) * uPx).rgb;
    c += texture2D(tSrc, vUv + vec2(-1.0, -1.0) * uPx).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2( 1.0, -1.0) * uPx).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2(-1.0,  1.0) * uPx).rgb * 2.0;
    c += texture2D(tSrc, vUv + vec2( 1.0,  1.0) * uPx).rgb * 2.0;
    gl_FragColor = vec4(c / 12.0 + texture2D(tBase, vUv).rgb * uMix, 1.0);
  }`;

const VHS = /* glsl */`
  precision highp float; varying vec2 vUv;
  uniform sampler2D tComp, tBloom, tFg; uniform vec2 uRes, uTex; uniform float uT, uScale, uAspect;
  uniform float uRgb, uTrack, uTrackY, uNoise, uScan, uVig, uFlash, uCrt, uBloom, uSpeed, uFfwd, uRew, uWarp, uHz;
  uniform vec4 uGlint; uniform vec3 uFlare; uniform vec3 cA, cB;
  float h11(float p){ p = fract(p * .1031); p *= p + 33.33; p *= p + p; return fract(p); }
  float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
  float rr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
  vec3 tone(vec3 c){ vec3 s = 0.78 + 0.22 * (1.0 - exp(-(c - 0.78) / 0.22)); return mix(c, s, step(0.78, c)); }
  void main(){
    vec2 uv = vUv;
    float frame = floor(uT * 30.0);
    // ── CRT aperture (opening) ──
    float inside = 1.0; vec2 p = uv - 0.5;
    if (uCrt > 0.001) {
      float ay = mix(0.5, 0.39, uCrt);
      float axFull = 0.5, axBox = min(0.5, 0.39 * (4.0 / 3.0) / uAspect);
      float ax = mix(axFull, axBox, uCrt);
      vec2 cext = vec2(mix(1.0, min(1.0, (4.0/3.0) / uAspect), uCrt), 1.0);
      float rad = 0.05 * uCrt;
      vec2 pp = p * vec2(uAspect, 1.0);
      float d = rr(pp, vec2(ax * uAspect, ay), rad);
      inside = 1.0 - smoothstep(-0.002, 0.002, d);
      vec2 q = p / (2.0 * vec2(ax, ay)) * cext;
      float r2 = dot(q, q);
      q *= 1.0 + uCrt * 0.12 * r2;
      uv = q + 0.5;
    }
    // ── tracking disturbance, head switching, transport effects ──
    float y = uv.y;
    float band = exp(-pow((y - uTrackY) / 0.07, 2.0));
    float rowN = h11(floor(y * uRes.y / (3.0 * uScale)) + frame * 7.0);
    float xo = uTrack * band * (rowN - 0.5) * 0.06 + uTrack * 0.004 * sin(y * 40.0 + uT * 13.0);
    xo += smoothstep(0.035, 0.0, y) * (h11(floor(y * uRes.y / uScale) + frame) - 0.3) * 0.012;
    xo += uWarp * 0.0025 * sin(y * 22.0 + uT * 9.0);
    float ffb = 0.0;
    if (uFfwd > 0.0) { float fy = fract(y * 3.0 - uT * 4.0); ffb = smoothstep(0.0, 0.02, fy) * smoothstep(0.08, 0.02, fy); xo += ffb * 0.04 * uFfwd; uv.y += uFfwd * 0.01 * sin(uT * 70.0); }
    if (uRew > 0.0) { float ry = fract(y * 2.0 + uT * 3.0); ffb = smoothstep(0.0, 0.03, ry) * smoothstep(0.12, 0.03, ry); xo -= ffb * 0.05 * uRew; uv.y = fract(uv.y + uRew * 0.15 * uT); }
    uv.x += xo;
    // ── speed: radial zoom blur from the vanishing point ──
    vec2 vp = vec2(0.5, uHz);
    vec3 col;
    vec2 o = vec2(uRgb * uScale / uRes.x, 0.0);
    vec2 rad = (uv - vp);
    vec2 ca = rad * 0.004 * uSpeed;
    float spd = uSpeed * (1.0 - 0.9 * texture2D(tFg, uv).a);
    if (spd > 0.01) {
      vec3 acc = vec3(0.0); float wsum = 0.0;
      for (int k = 0; k < 6; k++) {
        float f = float(k) / 5.0; float wk = 1.0 - f * 0.6;
        vec2 su = uv - rad * f * 0.024 * spd;
        acc += vec3(texture2D(tComp, su + o + ca).r, texture2D(tComp, su).g, texture2D(tComp, su - o - ca).b) * wk; wsum += wk;
      }
      col = acc / wsum;
    } else {
      col = vec3(texture2D(tComp, uv + o).r, texture2D(tComp, uv).g, texture2D(tComp, uv - o).b);
    }
    // ── luma sharpening: restores edge contrast lost to resampling (luma only, so no colour halos) ──
    vec3 nb = texture2D(tComp, uv + vec2(uTex.x, 0.0)).rgb + texture2D(tComp, uv - vec2(uTex.x, 0.0)).rgb
            + texture2D(tComp, uv + vec2(0.0, uTex.y)).rgb + texture2D(tComp, uv - vec2(0.0, uTex.y)).rgb;
    float Yc = dot(col, vec3(0.299, 0.587, 0.114)), Yn = dot(nb * 0.25, vec3(0.299, 0.587, 0.114));
    col += clamp(Yc - Yn, -0.08, 0.08) * 0.6 * (1.0 - min(spd, 1.0));
    // ── VHS chroma bleed: luma stays sharp, chroma smears a little to the right ──
    vec3 sm = vec3(0.0);
    for (int k = 1; k <= 2; k++) sm += texture2D(tComp, uv - vec2(float(k) * 1.6 * uScale / uRes.x, 0.0)).rgb;
    sm = (sm + col) / 3.0;
    float Y = dot(col, vec3(0.299, 0.587, 0.114));
    float Ys = dot(sm, vec3(0.299, 0.587, 0.114));
    col = Y + (sm - Ys) * 0.5 + (col - Y) * 0.5;
    // ── bloom (wide) ──
    col += texture2D(tBloom, uv).rgb * 0.15 * uBloom;
    // ── star glint & lens flare ──
    if (uGlint.z > 0.001) {
      vec2 d = (vUv - uGlint.xy) * vec2(uAspect, 1.0) / (uGlint.w * 0.02);
      float core = exp(-dot(d, d) * 2.5);
      float sx = exp(-abs(d.y) * 9.0) * exp(-abs(d.x) * 0.35);
      float sy = exp(-abs(d.x) * 9.0) * exp(-abs(d.y) * 0.55);
      vec2 r45 = mat2(0.7071, -0.7071, 0.7071, 0.7071) * d;
      float sd = exp(-abs(r45.y) * 14.0) * exp(-abs(r45.x) * 1.4) + exp(-abs(r45.x) * 14.0) * exp(-abs(r45.y) * 1.4);
      col += (vec3(1.0) * (core * 2.5 + sx + sy * 0.8) + cB * sd * 0.5) * uGlint.z;
    }
    if (uFlare.z > 0.001) {
      vec2 fp = uFlare.xy; vec2 d = (vUv - fp) * vec2(uAspect, 1.0);
      col += cA * exp(-abs(d.y) / 0.0035) * exp(-abs(d.x) / 0.55) * uFlare.z * 1.4;
      col += vec3(1.0) * exp(-abs(d.y) / 0.0012) * exp(-abs(d.x) / 0.25) * uFlare.z;
      col += cB * exp(-length(d) / 0.08) * uFlare.z * 0.5;
      for (int k = 0; k < 4; k++) {
        float fk = float(k); float f = -0.35 - fk * 0.45;
        vec2 gp = vec2(0.5) + (fp - vec2(0.5)) * f;
        float gd = length((vUv - gp) * vec2(uAspect, 1.0));
        float rr2 = 0.02 + fk * 0.018;
        float ring = smoothstep(rr2, rr2 - 0.004, gd) * 0.25 + exp(-pow((gd - rr2) / 0.003, 2.0)) * 0.6;
        col += mix(cA, cB, fk / 3.0) * ring * uFlare.z * 0.18;
      }
    }
    col += uFlash;
    col = tone(max(col, 0.0));
    // ── scanlines (~2 px spacing at 1080p, scaled) ──
    float per = max(2.0, 2.0 * uScale);
    float sl = 0.5 + 0.5 * cos(6.2831853 * gl_FragCoord.y / per);
    col *= 1.0 - uScan * 0.09 * (1.0 - sl);
    // ── tape noise, dropouts and grain (seeded by the frame) ──
    float line = floor(gl_FragCoord.y / (2.0 * uScale));
    float spk = step(0.9993, h21(vec2(line, frame))) * step(0.82, h21(vec2(floor(gl_FragCoord.x / (24.0 * uScale)), line + frame)));
    float tn = (h21(gl_FragCoord.xy + frame * 13.1) - 0.5);
    col += spk * 0.14 * (0.4 + uNoise * 2.0) + tn * (0.014 + uNoise * 0.32) * (0.35 + 0.45 * Y);
    col += band * uTrack * (h21(vec2(gl_FragCoord.x * 0.05, line + frame)) - 0.4) * 0.5;
    col += ffb * (uFfwd + uRew) * 0.25;
    // ── vignette ──
    vec2 vq = (vUv - 0.5) * vec2(uAspect, 1.0);
    col *= 1.0 - uVig * pow(length(vq) * 0.95, 2.4);
    col = mix(vec3(0.004, 0.0, 0.01), col, inside);
    // ── dither ──
    col += (h21(gl_FragCoord.xy + fract(uT) * 91.0) + h21(gl_FragCoord.yx * 1.3 + 7.0) - 1.0) / 255.0;
    gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
  }`;

export class Post {
  constructor(renderer) {
    this.r = renderer;
    this.half = renderer.capabilities.isWebGL2 && renderer.extensions.has('EXT_color_buffer_float');
    const type = this.half ? THREE.HalfFloatType : THREE.UnsignedByteType;
    this.type = type;
    const mk = (samples = 0, depth = false) => new THREE.WebGLRenderTarget(4, 4, { type, samples, depthBuffer: depth, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false });
    this.rtScene = mk(4, true); this.rtFg = mk(4, true); this.rtNeon = mk(0, false); this.rtComp = mk(0, false);
    this.rtFgAcc = mk(0, false);   // motion-blur accumulation of the chrome layer (sub-frames)
    this.levels = [];
    for (let i = 0; i < 6; i++) this.levels.push(mk(0, false));
    this.ups = [];
    for (let i = 0; i < 5; i++) this.ups.push(mk(0, false));
    this.comp = new Pass(COMPOSITE, { tScene: { value: null }, tFg: { value: null }, tNeon: { value: null }, uPx: { value: new THREE.Vector2() }, uShadow: { value: 0.55 }, uFgA: { value: 1 } });
    this.down = new Pass(DOWN, { tSrc: { value: null }, uPx: { value: new THREE.Vector2() }, uPre: { value: 0 } });
    this.up = new Pass(UP, { tSrc: { value: null }, tBase: { value: null }, uPx: { value: new THREE.Vector2() }, uMix: { value: 1 } });
    this.acc = new Pass('precision highp float; varying vec2 vUv; uniform sampler2D tSrc; uniform float uW; void main(){ gl_FragColor = texture2D(tSrc, vUv) * uW; }', { tSrc: { value: null }, uW: { value: 1 } });
    Object.assign(this.acc.mat, { transparent: true, blending: THREE.CustomBlending, blendEquation: THREE.AddEquation, blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneFactor });
    this.vhs = new Pass(VHS, {
      tComp: { value: null }, tBloom: { value: null }, tFg: { value: null }, uRes: { value: new THREE.Vector2() }, uTex: { value: new THREE.Vector2() }, uT: { value: 0 }, uScale: { value: 1 }, uAspect: { value: 1 },
      uRgb: { value: 1.5 }, uTrack: { value: 0 }, uTrackY: { value: 0.5 }, uNoise: { value: 0 }, uScan: { value: 1 }, uVig: { value: 0.4 }, uFlash: { value: 0 },
      uCrt: { value: 0 }, uBloom: { value: 1 }, uSpeed: { value: 0 }, uFfwd: { value: 0 }, uRew: { value: 0 }, uWarp: { value: 0 }, uHz: { value: 0.44 },
      uGlint: { value: new THREE.Vector4() }, uFlare: { value: new THREE.Vector3() }, cA: { value: new THREE.Vector3() }, cB: { value: new THREE.Vector3() },
    });
    this.samples = 4;
  }
  setSize(w, h, scale, samples) {
    const W = Math.max(2, Math.round(w * scale)), H = Math.max(2, Math.round(h * scale));
    this.W = W; this.H = H; this.outW = w; this.outH = h;
    for (const rt of [this.rtScene, this.rtFg]) { rt.samples = samples; rt.setSize(W, H); }
    this.rtNeon.setSize(W, H); this.rtComp.setSize(W, H); this.rtFgAcc.setSize(W, H);
    let lw = W, lh = H;
    for (let i = 0; i < 6; i++) { lw = Math.max(1, lw >> 1); lh = Math.max(1, lh >> 1); this.levels[i].setSize(lw, lh); if (i < 5) this.ups[i].setSize(lw, lh); }
  }
  // subs: optional frame states across the shutter interval → true sub-frame motion blur of the title.
  render(world, title, s, glint, flare, subs) {
    const r = this.r;
    r.setClearColor(0x000000, 1);
    r.setRenderTarget(this.rtScene); r.clear(); r.render(world.scene, world.camera);
    r.setClearColor(0x000000, 0);
    let fgTex = this.rtFg.texture;
    if (subs && subs.length > 1) {
      r.setRenderTarget(this.rtFgAcc); r.clear();
      for (const sub of subs) {
        title.update(sub, this.outW, this.outH);
        r.setRenderTarget(this.rtFg); r.clear(); r.render(title.scene, title.camera);
        this.acc.u.tSrc.value = this.rtFg.texture; this.acc.u.uW.value = 1 / subs.length;
        this.acc.render(r, this.rtFgAcc);
      }
      title.update(s, this.outW, this.outH);
      fgTex = this.rtFgAcc.texture;
    } else {
      r.setRenderTarget(this.rtFg); r.clear(); r.render(title.scene, title.camera);
    }
    r.setRenderTarget(this.rtNeon); r.clear(); r.render(title.neon.scene, title.camera);
    const c = this.comp.u;
    c.tScene.value = this.rtScene.texture; c.tFg.value = fgTex; c.tNeon.value = this.rtNeon.texture; c.uPx.value.set(1 / this.W, 1 / this.H);
    c.uShadow.value = 0.6; c.uFgA.value = s.post.fgA;
    this.comp.render(r, this.rtComp);
    // bloom pyramid
    let src = this.rtComp;
    for (let i = 0; i < 6; i++) {
      this.down.u.tSrc.value = src.texture; this.down.u.uPx.value.set(0.5 / src.width, 0.5 / src.height); this.down.u.uPre.value = i === 0 ? 1 : 0;
      this.down.render(r, this.levels[i]); src = this.levels[i];
    }
    for (let i = 4; i >= 0; i--) {
      this.up.u.tSrc.value = src.texture; this.up.u.tBase.value = this.levels[i].texture; this.up.u.uPx.value.set(0.5 / src.width, 0.5 / src.height);
      this.up.u.uMix.value = i === 0 ? 0.6 : 1.0;
      this.up.render(r, this.ups[i]); src = this.ups[i];
    }
    const P = s.post, v = this.vhs.u;
    v.tComp.value = this.rtComp.texture; v.tBloom.value = this.ups[0].texture; v.tFg.value = fgTex;
    v.uRes.value.set(this.outW, this.outH); v.uTex.value.set(1 / this.W, 1 / this.H); v.uT.value = s.T; v.uScale.value = this.outH / 1080; v.uAspect.value = this.outW / this.outH;
    v.uRgb.value = 0.6 + 1.5 * (P.rgb - 1); v.uTrack.value = P.tracking; v.uTrackY.value = P.trackY; v.uNoise.value = P.noise; v.uScan.value = P.scan;
    v.uVig.value = P.vignette; v.uFlash.value = P.flash; v.uCrt.value = P.crt; v.uBloom.value = P.bloom; v.uSpeed.value = s.reduced ? 0 : P.speed;
    v.uFfwd.value = P.ffwd; v.uRew.value = P.rewind; v.uWarp.value = P.warp; v.uHz.value = 0.5 - s.layout.shift * 0.5;
    v.uGlint.value.set(glint[0], glint[1], P.glint.i, P.glint.size * this.outH / 1080 * 1.0);
    v.uFlare.value.set(flare[0], flare[1], P.flare.i);
    v.cA.value.set(...s.pal.post); v.cB.value.set(...s.pal.neon);
    r.setRenderTarget(null);
    r.render(this.vhs.scene, this.vhs.cam);
  }
}
