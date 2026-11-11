// Main-thread side of the audio: context, worklet node, CC0 samples, output volume/mute, clock mapping.
// The context is created suspended at load and resumed inside the START DRIVE gesture; any later
// gesture re-resumes it if the browser suspended or interrupted it.
import { SAMPLE_FILES } from './samples.js';
import { Synth } from './synth.js';

// Fallback when AudioWorklet is unavailable (non-secure origins, embedded previews, old browsers):
// the very same Synth runs on the main thread inside a ScriptProcessorNode with a worklet-like port.
function makeCompatNode(ctx) {
  const s = new Synth();
  let K = null, started = false, n = 0;
  const node = ctx.createScriptProcessor(2048, 1, 2);
  const handle = (m) => {
    if (m.type === 'clock') K = m.K;
    else if (m.type === 'ev') s.event(m.ev);
    else if (m.type === 'evs') for (const ev of m.evs) s.event(ev);
    else if (m.type === 'sample') s.setSample(m.name, m.L, m.R);
  };
  node.port = { postMessage: (m) => handle(m), onmessage: null };
  const bl = new Float32Array(128), br = new Float32Array(128);
  node.onaudioprocess = (e) => {
    const L = e.outputBuffer.getChannelData(0), R = e.outputBuffer.getChannelData(1);
    if (K === null) { L.fill(0); R.fill(0); return; }
    if (!started) { s.offset = K + e.playbackTime; s.frame = 0; started = true; }
    for (let o = 0; o < L.length; o += 128) {
      const k = Math.min(128, L.length - o);
      s.process(bl, br, k); L.set(bl.subarray(0, k), o); R.set(br.subarray(0, k), o);
    }
    if ((++n & 3) === 0 && node.port.onmessage) node.port.onmessage({ data: { type: 'level', rms: s.levels.music, T: s.offset + s.frame / 48000 } });
  };
  return node;
}

const AUDIO_TYPES = new Set(['start', 'skip', 'replay', 'home', 'restart', 'brk', 'turbo', 'env', 'auto', 'music', 'sfx', 'lane', 'revive', 'pause']);   // every event the simulation reads, plus sounds

function b64ToArrayBuffer(b64) {
  const bin = atob(b64), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u.buffer;
}

export class AudioEngine {
  constructor() {
    this.ctx = null; this.node = null; this.out = null; this.K = null;
    this.volume = 0.8; this.muted = false; this.state = 'off'; this.error = null;
    this.samples = 0; this.level = 0;
  }

  prepare() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) { this.fail('This browser has no Web Audio support'); return Promise.resolve(false); }
    try { this.ctx = new AC({ sampleRate: 48000, latencyHint: 'interactive' }); } catch (e) { this.ctx = new AC(); }
    this.state = 'loading';
    this.ready = this._load();
    return this.ready;
  }
  fail(msg, err) { this.state = 'failed'; this.error = msg; console.warn('[audio]', msg, err || ''); }

  // Worklet source, most portable first: inline bundle (standalone build) → bundled file → ES module.
  async _addWorklet() {
    const tries = [];
    if (window.__MC_WORKLET_SRC) {
      // data: URLs load from file:// pages in Chrome and Safari (blob: URLs do not); blob kept as a fallback
      tries.push(() => 'data:text/javascript;base64,' + btoa(unescape(encodeURIComponent(window.__MC_WORKLET_SRC))));
      tries.push(() => URL.createObjectURL(new Blob([window.__MC_WORKLET_SRC], { type: 'text/javascript' })));
    }
    tries.push(() => new URL('./worklet.bundle.js', import.meta.url).href);
    tries.push(() => new URL('./worklet.js', import.meta.url).href);
    let last;
    for (const t of tries) { try { await this.ctx.audioWorklet.addModule(t()); return; } catch (e) { last = e; } }
    throw last;
  }

  async _load() {
    try {
      try {
        if (/[?&]audio=compat\b/.test(location.search)) throw new Error('forced by ?audio=compat');
        if (!this.ctx.audioWorklet || !window.AudioWorkletNode) throw new Error('AudioWorklet unavailable (non-secure context?)');
        await this._addWorklet();
        this.node = new AudioWorkletNode(this.ctx, 'midnight-synth', { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        this.mode = 'worklet';
      } catch (werr) {
        console.warn('[audio] AudioWorklet path failed, using ScriptProcessor fallback:', werr && werr.message);
        this.node = makeCompatNode(this.ctx);
        this.mode = 'compat';
      }
      this.node.port.onmessage = (e) => { if (e.data.type === 'level') { this.level = e.data.rms; this.renderT = e.data.T; } };
      this.out = this.ctx.createGain();
      this.out.gain.value = this.volume * this.volume;
      this.node.connect(this.out).connect(this.ctx.destination);
      if (this.state === 'loading') this.state = 'ready';
      if (this.ctx.sampleRate !== 48000) console.warn('[audio] context runs at', this.ctx.sampleRate, 'Hz');
      this._loadSamples();
      return true;
    } catch (err) {
      this.fail('Audio engine could not load', err);
      return false;
    }
  }

  // CC0 one-shots: decoded here, handed to the worklet. Until they arrive the synth's own drums play.
  async _loadSamples() {
    await Promise.all(SAMPLE_FILES.map(async (name) => {
      try {
        let ab;
        if (window.__MC_ASSETS && window.__MC_ASSETS[name]) ab = b64ToArrayBuffer(window.__MC_ASSETS[name]);
        else ab = await (await fetch(new URL(`../../assets/samples/${name}.wav`, import.meta.url))).arrayBuffer();
        const buf = await new Promise((res, rej) => { const p = this.ctx.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
        const L = buf.getChannelData(0).slice(), R = (buf.numberOfChannels > 1 ? buf.getChannelData(1) : buf.getChannelData(0)).slice();
        this.node.port.postMessage({ type: 'sample', name, L, R }, [L.buffer, R.buffer]);
        this.samples++;
      } catch (e) { console.warn('[audio] sample failed:', name, e); }
    }));
  }

  // Must be called synchronously inside a user gesture. sceneNow(perfTime): scene time.
  start(sceneNow, allEvents) {
    if (!this.ctx || this.state === 'running' || this.state === 'starting' || this.state === 'failed') { this.resume(); return; }
    this.state = 'starting';
    const p = Promise.all([this.ctx.resume(), this.ready]);
    const go = () => {
      // K maps context time → scene time so that the sample being HEARD matches the picture clock.
      const lat = (this.ctx.baseLatency || 0) + (this.ctx.outputLatency || 0);
      this.lat = lat;
      this.K = sceneNow(performance.now()) - this.ctx.currentTime + lat;
      this.node.port.postMessage({ type: 'evs', evs: allEvents().filter((e) => AUDIO_TYPES.has(e.type)) });
      this.node.port.postMessage({ type: 'clock', K: this.K });
      this.state = 'running';
      // watchdog: if the output device never pulls audio (context "running" but its clock frozen),
      // report it instead of failing silently
      const c0 = this.ctx.currentTime;
      setTimeout(() => { if (this.state === 'running' && this.ctx.currentTime - c0 < 0.2) { this.stalled = true; console.warn('[audio] output device is not running (audio clock frozen)'); } }, 1500);
    };
    p.then(([, ok]) => (ok ? go() : this.fail(this.error || 'Audio engine could not load')), (e) => this.fail('The browser blocked audio playback', e));
  }
  // Re-resume after the browser suspends/interrupts the context (call from any user gesture).
  resume() { if (this.ctx && this.ctx.state !== 'running' && this.ctx.state !== 'closed' && this.state === 'running') this.ctx.resume().catch(() => {}); }
  // 'off' | 'loading' | 'ready' | 'starting' | 'running' | 'suspended' | 'failed'
  get status() {
    if (this.state === 'running' && this.ctx && this.ctx.state !== 'running') return 'suspended';
    if (this.state === 'running' && this.stalled) return 'stalled';
    return this.state;
  }

  send(ev) {
    if (!AUDIO_TYPES.has(ev.type) || !this.node) return;
    if (this.state === 'running') this.node.port.postMessage({ type: 'ev', ev });
  }
  // Scene time of the sample being heard right now (null if not running or no reliable timestamp).
  heardSceneTime(perfNow) {
    if (this.state !== 'running' || this.K === null) return null;
    const ts = this.ctx.getOutputTimestamp ? this.ctx.getOutputTimestamp() : null;
    if (ts && ts.contextTime > 0 && ts.performanceTime > 0 && Math.abs(perfNow - ts.performanceTime) < 500) {
      return ts.contextTime + (perfNow - ts.performanceTime) / 1000 + this.K;
    }
    return null;
  }
  setVolume(v) { this.volume = v; this._apply(); }
  setMuted(m) { this.muted = m; this._apply(); }
  _apply() {
    if (!this.out) return;
    const g = this.muted ? 0 : this.volume * this.volume;
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(g, t, 0.015);
  }
}
