import sys, wave, numpy as np
def load(p):
    w = wave.open(p); n = w.getnframes(); raw = w.readframes(n)
    a = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
    v = (a[:,0].astype(np.int32) | (a[:,1].astype(np.int32) << 8) | (a[:,2].astype(np.int32) << 16))
    v = np.where(v >= 1 << 23, v - (1 << 24), v).astype(np.float64) / 8388608.0
    return v.reshape(-1, 2)
x = load(sys.argv[1]); m = x.mean(axis=1)
sr = 48000; N = 8192; win = np.hanning(N); acc = np.zeros(N // 2 + 1); k = 0
for i in range(0, len(m) - N, N // 2):
    acc += np.abs(np.fft.rfft(m[i:i+N] * win)) ** 2; k += 1
acc /= k; f = np.fft.rfftfreq(N, 1 / sr)
bands = [(20, 60), (60, 120), (120, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 16000)]
ref = None
print('band (Hz)      dB/oct-normalised   (pink = flat)')
for lo, hi in bands:
    s = acc[(f >= lo) & (f < hi)].sum() / np.log2(hi / lo)
    db = 10 * np.log10(s + 1e-20)
    if ref is None: ref = db
    print(f'{lo:>5}-{hi:<6} {db - ref:7.1f} dB')
L, R = x[:,0], x[:,1]
print('stereo correlation', np.corrcoef(L, R)[0,1].round(3), ' side/mid dB', round(10*np.log10(((L-R)**2).mean()/((L+R)**2).mean()),1))
