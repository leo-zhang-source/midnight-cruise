// "MIDNIGHT" — custom chamfered extended logotype, extruded with 45° bevels and
// rendered with an authored chrome material (stylised horizon gradient on the face,
// environment reflections on the bevels, scrolling grid reflection, light sweeps).
import * as THREE from '../vendor/three.module.min.js';
import { Neon } from './neon.js';

const SHEAR = Math.tan(13 * Math.PI / 180);
const GLYPHS = {
  M: { w: 128, o: [[0, 0], [24, 0], [24, 62], [64, 22], [104, 62], [104, 0], [128, 0], [128, 100], [104, 100], [64, 60], [24, 100], [0, 100]] },
  I: { w: 26, o: [[0, 0], [26, 0], [26, 100], [0, 100]] },
  D: { w: 104, o: [[0, 0], [74, 0], [104, 30], [104, 70], [74, 100], [0, 100]], h: [[24, 20], [24, 80], [66, 80], [80, 66], [80, 34], [66, 20]] },
  N: { w: 108, o: [[0, 0], [24, 0], [24, 64], [84, 0], [108, 0], [108, 100], [84, 100], [84, 36], [24, 100], [0, 100]] },
  G: { w: 104, o: [[30, 0], [104, 0], [104, 52], [54, 52], [54, 32], [80, 32], [80, 20], [34, 20], [24, 30], [24, 70], [34, 80], [104, 80], [104, 100], [30, 100], [0, 70], [0, 30]] },
  H: { w: 108, o: [[0, 0], [24, 0], [24, 40], [84, 40], [84, 0], [108, 0], [108, 100], [84, 100], [84, 60], [24, 60], [24, 100], [0, 100]] },
  T: { w: 104, o: [[40, 0], [64, 0], [64, 80], [104, 80], [104, 100], [0, 100], [0, 80], [40, 80]] },
};
const WORD = 'MIDNIGHT';
const KERN = { MI: 16, ID: 16, DN: 17, NI: 16, IG: 15, GH: 17, HT: 13 };

// cut convex corners sharper than ~100° by c units
function chamfer(pts, c) {
  const out = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[(i + n - 1) % n], q = pts[i], r = pts[(i + 1) % n];
    const ax = q[0] - p[0], ay = q[1] - p[1], bx = r[0] - q[0], by = r[1] - q[1];
    const la = Math.hypot(ax, ay), lb = Math.hypot(bx, by);
    const cross = ax * by - ay * bx, dot = (ax * bx + ay * by) / (la * lb);
    const turn = Math.acos(Math.max(-1, Math.min(1, dot)));
    if (cross > 0 && turn > 1.35 && la > c * 2.2 && lb > c * 2.2) {
      out.push([q[0] - ax / la * c, q[1] - ay / la * c], [q[0] + bx / lb * c, q[1] + by / lb * c]);
    } else out.push(q);
  }
  return out;
}
const area = (pts) => pts.reduce((s, p, i) => { const q = pts[(i + 1) % pts.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0) / 2;

function buildWord() {
  let x = 0; const letters = [];
  for (let i = 0; i < WORD.length; i++) {
    const ch = WORD[i], g = GLYPHS[ch];
    letters.push({ ch, x, g });
    x += g.w + (i < WORD.length - 1 ? KERN[ch + WORD[i + 1]] : 0);
  }
  const width = x + 100 * SHEAR;
  return { letters, width };
}

const CHROME_VERT = /* glsl */`
  varying vec3 vP; varying vec3 vNo; varying vec3 vN; varying vec3 vV;
  void main(){
    vP = position; vNo = normal;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = cameraPosition - w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }`;
const CHROME_FRAG = /* glsl */`
  precision highp float;
  varying vec3 vP; varying vec3 vNo; varying vec3 vN; varying vec3 vV;
  uniform float uShift, uRoad, uSweep, uSweepI, uGather, uDim, uTime, uFlash, uWordW, uSteer;
  uniform vec3 cSky, cHi, cLow, cGround, cHorizon;
  vec3 envR(vec3 R){
    float y = R.y;
    vec3 up = mix(cHi * 1.15, cSky * 0.9, smoothstep(0.02, 0.6, y));
    up = mix(up, cSky * 0.25, smoothstep(0.6, 1.0, y));
    vec3 dn = mix(cGround * 0.5, cLow * 0.75, smoothstep(-0.05, -0.35, y));
    dn = mix(dn, cGround * 0.18, smoothstep(-0.45, -0.85, y));
    vec3 c = y > 0.0 ? up : dn;
    c += cHorizon * exp(-abs(y) / 0.05) * 0.6;
    return c;
  }
  void main(){
    vec3 N = normalize(vN), V = normalize(vV), R = reflect(-V, N);
    float y = vP.y / 100.0;
    float front = smoothstep(0.92, 0.99, vNo.z);
    // stylised chrome face: sky above a hard horizon, glowing ground below
    float h0 = 0.47 + uShift + (vP.x / uWordW - 0.5) * 0.04;
    float hy = y;
    float fw = fwidth(hy) * 1.2;
    float ua = clamp((hy - h0) / (1.0 - h0), 0.0, 1.3);
    vec3 sky = mix(cHi * 1.04, cSky, smoothstep(0.0, 0.36, ua));
    sky = mix(sky, cSky * 0.2, smoothstep(0.42, 1.08, ua));
    sky += cHi * 0.28 * exp(-pow((ua - 0.6) / 0.025, 2.0));
    float ub = clamp((h0 - hy) / h0, 0.0, 1.3);
    vec3 grd = mix(cGround * 0.3, cLow * 0.92, smoothstep(0.0, 0.42, ub));
    grd = mix(grd, mix(cLow, cHi, 0.62) * 1.02, smoothstep(0.55, 1.02, ub));
    // reflected perspective grid scrolling with the road
    float gd = max(h0 - hy, 0.0);
    float rows = fract(0.09 / (gd + 0.035) + uRoad);
    float rowL = smoothstep(0.86, 0.95, rows) * smoothstep(1.0, 0.95, rows);
    float cols = fract(((vP.x - uWordW * 0.5) / (gd * 520.0 + 18.0)) * 1.0);
    float colL = smoothstep(0.08, 0.0, abs(cols - 0.5) - 0.42);
    grd += cLow * (rowL + colL * 0.5) * smoothstep(0.0, 0.05, gd) * 0.55;
    float line = smoothstep(fw * 1.5 + 0.008, 0.0, abs(hy - h0));
    vec3 face = hy > h0 ? sky : grd;
    face = mix(face, cGround * 0.15, line);
    face *= 0.94 + 0.06 * sin(vP.y * 1.7 + vP.x * 0.05);
    // bevels and walls reflect the environment
    vec3 env = envR(R + vec3(uSteer * 0.25, 0.0, 0.0));
    vec3 L = normalize(vec3(-0.45, 0.8, 0.55));
    float spec = pow(max(dot(R, L), 0.0), 36.0);
    float topBevel = smoothstep(0.25, 0.6, N.y) * (1.0 - front);
    vec3 bev = env * 0.95 + vec3(1.0) * spec * 1.8 + cHi * topBevel * 0.55;
    float wall = 1.0 - smoothstep(0.15, 0.5, abs(vNo.z));
    bev = mix(bev, envR(R) * 0.5 + cLow * 0.2 * (1.0 - N.y), wall);
    vec3 col = mix(bev, face, front);
    // light sweep and gathering reflections
    float diag = vP.x + vP.y * 0.65;
    col += vec3(1.0, 0.97, 1.0) * exp(-pow((diag - uSweep) / 26.0, 2.0)) * uSweepI * (0.6 + 0.6 * front);
    if (uGather > 0.0) {
      float g = 0.0;
      for (int k = 0; k < 3; k++) {
        float fk = float(k);
        float p = fract(uTime * (0.55 + 0.4 * fk) * (0.6 + uGather * 1.6) + fk * 0.37);
        float cx = mix(-200.0, uWordW + 200.0, p);
        g += exp(-pow((diag - cx) / (14.0 + 10.0 * fk), 2.0));
      }
      col += cHi * g * uGather * 0.9;
    }
    col = col * uDim + vec3(1.0) * uFlash;
    gl_FragColor = vec4(col, 1.0);
  }`;

export class Title {
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(20, 16 / 9, 10, 6000);
    this.camera.position.set(0, 0, 1600);
    this.root = new THREE.Group();       // layout transform (fit to viewport)
    this.word = new THREE.Group();       // slam animation
    this.scene.add(this.root); this.root.add(this.word);
    const { letters, width } = buildWord();
    this.width = width;
    this.uniforms = {
      uShift: { value: 0 }, uRoad: { value: 0 }, uSweep: { value: -999 }, uSweepI: { value: 0 }, uGather: { value: 0 }, uDim: { value: 1 },
      uTime: { value: 0 }, uFlash: { value: 0 }, uWordW: { value: width }, uSteer: { value: 0 },
      cSky: { value: new THREE.Vector3() }, cHi: { value: new THREE.Vector3() }, cLow: { value: new THREE.Vector3() }, cGround: { value: new THREE.Vector3() }, cHorizon: { value: new THREE.Vector3() },
    };
    this.mat = new THREE.ShaderMaterial({ uniforms: this.uniforms, vertexShader: CHROME_VERT, fragmentShader: CHROME_FRAG });
    this.letters = letters.map((L) => {
      const sh = (p) => new THREE.Vector2(p[0] + L.x + p[1] * SHEAR, p[1]);
      let outer = chamfer(L.g.o, 7);
      if (area(outer) < 0) outer.reverse();
      const shape = new THREE.Shape(outer.map(sh));
      if (L.g.h) { let hole = L.g.h.slice(); if (area(hole) > 0) hole.reverse(); shape.holes.push(new THREE.Path(hole.map(sh))); }
      const geo = new THREE.ExtrudeGeometry(shape, { depth: 18, bevelEnabled: true, bevelThickness: 5, bevelSize: 4.2, bevelSegments: 1, curveSegments: 1 });
      geo.translate(-width / 2, -50, -23);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, this.mat);
      m.userData.cx = L.x + L.g.w / 2 - width / 2 + 50 * SHEAR;
      this.word.add(m);
      return m;
    });
    // chrome gradients live in word space (0..W, 0..100): re-centre in the vertex shader
    this.mat.vertexShader = CHROME_VERT.replace('vP = position;', `vP = position + vec3(${(width / 2).toFixed(3)}, 50.0, 0.0);`);
    // neon subtitle + 1986 plate share the layout transform
    this.neon = new Neon();
    this.neonRoot = new THREE.Group();
    this.neon.group.parent && this.neon.group.parent.remove(this.neon.group);
    this.neon.scene.add(this.neonRoot); this.neonRoot.add(this.neon.group);
    this.neon.group.scale.set(1, -1, 1);
    this.plate = this._plate();
    this.root.add(this.plate);
    this._v = new THREE.Vector3();
  }

  _plate() {
    const W = 1024, H = 96;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d');
    g.clearRect(0, 0, W, H);
    g.fillStyle = '#fff';
    g.font = '600 64px "Chakra Petch"';
    g.textBaseline = 'middle'; g.textAlign = 'center';
    const txt = '1986', sp = 34;
    const widths = [...txt].map((c) => g.measureText(c).width);
    const tw = widths.reduce((a, b) => a + b, 0) + sp * (txt.length - 1);
    let x = W / 2 - tw / 2;
    [...txt].forEach((c, i) => { g.fillText(c, x + widths[i] / 2, H / 2 + 2); x += widths[i] + sp; });
    g.fillRect(40, H / 2 - 1.5, W / 2 - tw / 2 - 70, 3);
    g.fillRect(W / 2 + tw / 2 + 30, H / 2 - 1.5, W / 2 - tw / 2 - 70, 3);
    const tex = new THREE.CanvasTexture(cv); tex.anisotropy = 4; tex.colorSpace = THREE.NoColorSpace;
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uTex: { value: tex }, uA: { value: 0 }, uCol: { value: new THREE.Vector3(0.6, 0.95, 1) }, uWipe: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: /* glsl */`precision highp float; uniform sampler2D uTex; uniform float uA, uWipe; uniform vec3 uCol; varying vec2 vUv;
        void main(){ float a = texture2D(uTex, vUv).r; float m = smoothstep(uWipe, uWipe - 0.04, abs(vUv.x - 0.5) * 2.0);
          gl_FragColor = vec4(uCol * a * uA * m * 1.25, a * uA * m); }`,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.42, H * 0.42), mat);
    m.renderOrder = 10;
    return m;
  }

  // Lay out to the viewport and apply the frame state.
  update(s, w, h) {
    const cam = this.camera, a = w / h;
    cam.aspect = a; cam.fov = 20; cam.updateProjectionMatrix();
    const D = cam.position.z;
    const halfH = D * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)), halfW = halfH * a;
    const L = s.layout;
    const scale = Math.min((L.titleW * 2 * halfW) / this.width, (L.titleCap * 2 * halfH) / 100);
    this.root.scale.setScalar(scale);
    this.root.position.set(L.titleX * halfW, 0, 0);
    this.root.rotation.set(s.title.rotX || 0, s.title.rotY, s.title.rotZ || 0);
    cam.projectionMatrix.elements[9] = -L.titleY;
    cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    this.scale = scale; this.halfW = halfW; this.halfH = halfH;
    // slam animation
    const T = s.title;
    this.word.position.set(0, T.y, T.z);
    this.word.scale.set(T.sx, T.sy, 1);
    this.word.rotation.set(T.rx, 0, 0);
    this.word.visible = T.visible;
    this.letters.forEach((m, i) => { const o = T.letters ? T.letters[i] : null; m.position.set(0, o ? o.y : 0, o ? o.z : 0); m.rotation.set(o ? o.rx : 0, 0, 0); });
    const u = this.uniforms, P = s.pal;
    u.uShift.value = T.shift; u.uRoad.value = T.road; u.uSweep.value = T.sweep; u.uSweepI.value = T.sweepI; u.uGather.value = T.gather;
    u.uDim.value = T.dim; u.uTime.value = s.t; u.uFlash.value = T.flash; u.uSteer.value = s.steer;
    u.cSky.value.set(...P.chromeSky); u.cHi.value.set(...P.chromeHi); u.cLow.value.set(...P.chromeLow); u.cGround.value.set(...P.chromeGround); u.cHorizon.value.set(...P.horizon);
    // neon: positioned relative to the title, drawn in its own light buffer
    const N = s.neon;
    this.neonRoot.position.copy(this.root.position); this.neonRoot.rotation.copy(this.root.rotation); this.neonRoot.scale.setScalar(scale);
    this.neon.group.position.set(L.neonX, L.neonY, 30);
    this.neon.group.rotation.set(0, 0, L.neonRot);
    this.neon.group.scale.set(L.neonS, -L.neonS, 1);
    const nu = this.neon.uniforms;
    nu.uProg.value = N.prog; nu.uPow.value = N.pow; nu.uSurge.value = N.surge; nu.uGlass.value = N.glass; nu.uTime.value = s.t;
    nu.uCol.value.set(...P.neon);
    // 1986 plate
    this.plate.position.set(L.plateX, L.plateY, 10);
    this.plate.material.uniforms.uA.value = s.aux.a;
    this.plate.material.uniforms.uWipe.value = s.aux.wipe;
    this.plate.material.uniforms.uCol.value.set(...P.post).multiplyScalar(0.55).addScalar(0.45);
  }

  // Screen position (0..1, y up) of a point in title space, for the glint/flare.
  project(x, y, w, h) {
    this._v.set(x, y, 26).applyMatrix4(this.word.matrixWorld);
    this._v.project(this.camera);
    return [this._v.x * 0.5 + 0.5, this._v.y * 0.5 + 0.5];
  }
}
