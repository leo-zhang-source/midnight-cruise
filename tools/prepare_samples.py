#!/usr/bin/env python3
"""Turn the downloaded CC0 previews (assets/src) into the engine's sample set (assets/samples/*.wav):
48 kHz, 16-bit stereo, leading silence trimmed, peak-normalised to -1 dBFS, tail faded. Needs ffmpeg + numpy."""
import os, subprocess, numpy as np, wave
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SR = 48000
# name: (source, max_seconds, fade_seconds)
PICK = {
  'kick909': ('kick909', 0.6, 0.08), 'gated_snare': ('gated_snare', 1.0, 0.05), 'dx_snare3': ('dx_snare3', 0.3, 0.04),
  'clap808': ('clap808', 0.4, 0.05), 'hat909_c2': ('hat909_c2', 0.18, 0.04), 'hat909_o4': ('hat909_o4', 0.6, 0.15),
  'crash_f': ('crash_f', 4.2, 1.6), 'revcrash': ('revcrash', 3.1, 0.0), 'sim_tom1': ('sim_tom1', 0.6, 0.08),
}
os.makedirs(os.path.join(ROOT, 'assets/samples'), exist_ok=True)
for name, (src, maxs, fade) in PICK.items():
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', os.path.join(ROOT, 'assets/src', src + '.ogg'), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, dtype=np.float32).reshape(-1, 2).astype(np.float64)
    if name != 'revcrash':
        env = np.abs(x).max(1); on = int(np.argmax(env > env.max() * 0.02)); x = x[max(0, on - 24):]
    x = x[: int(maxs * SR)]
    if fade > 0:
        n = int(fade * SR); x[-n:] *= np.linspace(1, 0, n)[:, None] ** 2
    x[:16] *= np.linspace(0, 1, 16)[:, None]
    x *= 10 ** (-1 / 20) / np.abs(x).max()
    pcm = np.clip(np.round(x * 32767), -32768, 32767).astype('<i2')
    with wave.open(os.path.join(ROOT, 'assets/samples', name + '.wav'), 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    print(f'{name:12s} {len(x)/SR:5.2f}s')
