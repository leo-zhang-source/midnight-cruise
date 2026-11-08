# Onset + click check for the rendered ignition: compares audio transients with picture cue times.
import wave, numpy as np, sys
def load(p):
    w = wave.open(p); n = w.getnframes(); a = np.frombuffer(w.readframes(n), dtype=np.uint8).reshape(-1, 3)
    v = (a[:,0].astype(np.int32) | (a[:,1].astype(np.int32) << 8) | (a[:,2].astype(np.int32) << 16))
    v = np.where(v >= 1 << 23, v - (1 << 24), v).astype(np.float64) / 8388608.0
    return v.reshape(-1, 2)
sr = 48000
x = load(sys.argv[1]); m = np.abs(x).max(axis=1)
hop = 48  # 1 ms
env = np.array([m[i:i+hop].max() for i in range(0, len(m) - hop, hop)])
def onset_near(t, win=0.03):
    # first 1-ms frame in [cue-5 ms, cue+win] whose peak jumps ≥ 0.12 above the previous 4 ms floor
    i0 = int((t - 0.005) * 1000); i1 = int((t + win) * 1000)
    for i in range(max(i0, 4), i1):
        if env[i] - env[i-4:i].min() >= 0.12: return i / 1000.0
    return float('nan')
for name, t in [('first pulse', 0.5), ('drums in', 2.0), ('tom fill', 5.5), ('SLAM', 6.0), ('cruise downbeat', 10.0 - 1e-3)]:
    if t < len(env) / 1000 - 0.05:
        o = onset_near(t); print(f'{name:16s} cue {t:6.3f} s   audio onset {o:6.3f} s   Δ {1000*(o-t):+5.1f} ms')
# clicks: second-difference spikes far above the local level
d2 = np.abs(np.diff(x[:,0], 2)); lvl = np.convolve(np.abs(x[1:-1,0]), np.ones(480)/480, 'same') + 1e-4
ratio = d2 / lvl
print('max |2nd diff| / local level:', ratio.max().round(2), ' samples with ratio > 4:', int((ratio > 4).sum()))
