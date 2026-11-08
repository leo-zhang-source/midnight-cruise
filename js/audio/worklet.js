// AudioWorklet host for the deterministic synth. Scene time of a sample = K + contextFrame / sampleRate.
import { Synth } from './synth.js';

class MidnightProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.s = new Synth();
    this.K = null;
    this.started = false; this.n = 0;
    this.port.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'clock') this.K = m.K;
      else if (m.type === 'ev') this.s.event(m.ev);
      else if (m.type === 'evs') for (const ev of m.evs) this.s.event(ev);
      else if (m.type === 'sample') this.s.setSample(m.name, m.L, m.R);
    };
    this.port.postMessage({ type: 'loaded', sr: sampleRate });
  }
  process(inputs, outputs) {
    const out = outputs[0];
    const L = out[0], R = out[1] || out[0];
    if (this.K === null) { L.fill(0); if (R !== L) R.fill(0); return true; }
    if (!this.started) {
      this.s.offset = this.K + currentFrame / sampleRate;
      this.s.frame = 0;
      this.started = true;
    }
    this.s.process(L, R, L.length);
    if ((++this.n & 63) === 0) this.port.postMessage({ type: 'level', rms: this.s.levels.music, T: this.s.offset + this.s.frame / sampleRate });
    return true;
  }
}
registerProcessor('midnight-synth', MidnightProcessor);
