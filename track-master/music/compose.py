# Track Master menu theme — 200 BPM jungle / DnB / breakcore, synthesized from scratch.
# Output: intro.wav (8 bars + tail) and loop.wav (16 bars, seamless).
import numpy as np
from scipy.signal import butter, lfilter, fftconvolve
import sys

SR = 44100
REPORT = False
BPM = 200
BEAT = 60.0 / BPM          # 0.3 s
STEP = BEAT / 4            # 16th = 0.075 s
BAR = BEAT * 4             # 1.2 s
rng = np.random.default_rng(7)

def mtof(m): return 440.0 * 2 ** ((m - 69) / 12.0)

def bp(lo, hi, x, order=2):
    b, a = butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band'); return lfilter(b, a, x)
def lp(fc, x, order=2):
    b, a = butter(order, min(fc, SR * 0.45) / (SR / 2), 'low'); return lfilter(b, a, x)
def hp(fc, x, order=2):
    b, a = butter(order, fc / (SR / 2), 'high'); return lfilter(b, a, x)

def saw(f, n, maxh=40, phase=0.0):
    t = np.arange(n) / SR
    out = np.zeros(n)
    H = int(min(maxh, (SR * 0.45) / f))
    for h in range(1, H + 1):
        out += np.sin(2 * np.pi * f * h * t + phase * h) / h
    return out * 0.6

def sq(f, n, maxh=25):
    t = np.arange(n) / SR
    out = np.zeros(n)
    H = int(min(maxh, (SR * 0.45) / f))
    for h in range(1, H + 1, 2):
        out += np.sin(2 * np.pi * f * h * t) / h
    return out * 0.8

def env_ad(n, a, d, curve=1.0):
    t = np.arange(n) / SR
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / d)
    return e ** curve

def env_adsr(n, a, d, s, r, gate):
    t = np.arange(n) / SR
    e = np.where(t < a, t / a, s + (1 - s) * np.exp(-(t - a) / d))
    e = np.where(t > gate, e * np.exp(-(t - gate) / r), e)
    return e

class Mix:
    def __init__(self, seconds):
        self.n = int(seconds * SR)
        self.bus = {}
        self.kicks = []
    def add(self, name, t, sig, pan=0.0):
        if name not in self.bus: self.bus[name] = np.zeros((2, self.n))
        i = int(round(t * SR))
        if i >= self.n: return
        sig = sig[: self.n - i]
        if i < 0: sig = sig[-i:]; i = 0
        L = np.cos((pan + 1) * np.pi / 4); R = np.sin((pan + 1) * np.pi / 4)
        self.bus[name][0, i:i + len(sig)] += sig * L * 1.414
        self.bus[name][1, i:i + len(sig)] += sig * R * 1.414
    def get(self, name):
        return self.bus.get(name, np.zeros((2, self.n)))

# ---------------------------------------------------------------- drums
def kick(vel=1.0):
    n = int(0.32 * SR); t = np.arange(n) / SR
    f = 48 + 150 * np.exp(-t / 0.028)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.16)
    click = hp(1500, rng.standard_normal(n)) * np.exp(-t / 0.004) * 0.35
    return np.tanh((body + click) * 1.6) * vel * 0.9

def snare(vel=1.0, pitch=1.0, dec=0.075):
    n = int(0.3 * SR); t = np.arange(n) / SR
    tone = (np.sin(2 * np.pi * 185 * pitch * t) + 0.5 * np.sin(2 * np.pi * 330 * pitch * t)) * np.exp(-t / 0.05)
    nz = bp(1500 * pitch, 8000, rng.standard_normal(n)) * np.exp(-t / dec)
    crack = hp(3000, rng.standard_normal(n)) * np.exp(-t / 0.012)
    return np.tanh((tone * 1.0 + nz * 0.8 + crack * 0.35) * 1.3) * vel * 0.7

def hat(vel=1.0, open_=False):
    d = 0.14 if open_ else 0.025
    n = int((d * 5) * SR); t = np.arange(n) / SR
    # metallic: square partials + noise
    m = sum(np.sign(np.sin(2 * np.pi * f * t)) for f in (205.3, 304.4, 369.6, 522.7, 540.0, 800.0))
    x = hp(7000, m * 0.3 + rng.standard_normal(n) * 0.7) * np.exp(-t / d)
    return x * vel * 0.16

def ride(vel=1.0):
    n = int(0.9 * SR); t = np.arange(n) / SR
    m = sum(np.sin(2 * np.pi * f * t) for f in (3100, 4270, 5230, 6890, 8110))
    x = hp(4000, m * 0.4 + rng.standard_normal(n) * 0.35) * np.exp(-t / 0.35)
    return x * vel * 0.08

def crash(vel=1.0):
    n = int(2.2 * SR); t = np.arange(n) / SR
    x = hp(4500, rng.standard_normal(n)) * np.exp(-t / 0.45)
    return x * vel * 0.16

def boom():  # sub impact
    n = int(1.2 * SR); t = np.arange(n) / SR
    f = 32 + 80 * np.exp(-t / 0.08)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.45) * 0.8

def shaker(vel=1.0):
    n = int(0.06 * SR); t = np.arange(n) / SR
    return bp(5000, 12000, rng.standard_normal(n)) * env_ad(n, 0.004, 0.012) * vel * 0.22

def rim(vel=1.0, pitch=1.0):
    n = int(0.08 * SR); t = np.arange(n) / SR
    x = np.sin(2 * np.pi * 820 * pitch * t) * np.exp(-t / 0.012) + bp(2000, 6000, rng.standard_normal(n)) * np.exp(-t / 0.008) * 0.6
    return x * vel * 0.3

def tom(vel=1.0, f0=140):
    n = int(0.25 * SR); t = np.arange(n) / SR
    f = f0 + f0 * 0.6 * np.exp(-t / 0.03)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.12) * vel * 0.5

# patterns: list of (step, kind, vel, extra)
def pat(kind):
    K, S, g = 'k', 's', 0.32
    if kind == 'amen1':
        return [(0, K, 1), (2, K, .9), (4, S, 1), (7, S, g), (9, S, .8), (10, K, .95), (11, K, .7), (12, S, 1), (15, S, g)]
    if kind == 'amen2':
        return [(0, K, 1), (2, K, .9), (4, S, 1), (7, S, g), (9, S, .8), (10, K, .95), (12, S, 1), (14, S, .45), (15, S, g)]
    if kind == 'chop':
        return [(0, K, 1), (2, S, .9), (3, K, .8), (6, S, 1), (7, S, g), (8, K, 1), (10, S, .9), (11, S, .4), (12, K, .9),
                (13, S, .7), (14, S, .85), (15, S, 1)]
    if kind == 'stutter':
        base = [(0, K, 1), (2, K, .9), (4, S, 1), (7, S, g), (9, S, .8), (10, K, .95)]
        return base + [(12 + i * 0.5, S, .55 + i * 0.06, 1.0 - i * 0.05) for i in range(8)]
    if kind == 'roll':
        base = [(0, K, 1), (2, K, .9), (4, S, 1), (6, S, .7)]
        return base + [(8 + i * 0.5, S, .35 + i * 0.045, 0.85 + i * 0.03) for i in range(16)]
    if kind == 'think':
        return [(0, K, 1), (3, S, g), (4, S, 1), (6, K, .8), (7, K, .7), (9, S, .6), (10, K, .9), (12, S, 1), (13, S, g), (14, K, .6), (15, S, .5)]
    if kind == 'chop2':
        return [(0, K, 1), (1, S, .5), (2, S, .9), (3, K, .7), (5, K, .8), (6, S, 1), (8, K, .9), (8.5, S, .3), (9, S, .7), (11, K, .8),
                (12, S, 1), (13, K, .6), (13.5, S, .5), (14, S, .8), (14.5, S, .6), (15, S, .9)]
    if kind == 'trip':  # sextuplet snare cascade in the 2nd half
        return [(0, K, 1), (2, K, .9), (4, S, 1), (6, K, .8)] + [(8 + i * (8 / 12.0), S, .4 + i * 0.05, 1.25 - i * 0.03) for i in range(12)]
    if kind == 'stutter2':
        base = [(0, K, 1), (2, S, .8), (3, K, .7), (4, S, 1), (6, K, .8)]
        return base + [(8 + i * 0.25, S, .7, 1.0) for i in range(8)] + [(10 + i * 0.5, S, .4 + i * 0.07, 0.8 + i * 0.06) for i in range(12)]
    if kind == 'half':  # half-time build
        return [(0, K, 1), (8, S, 1), (10, K, .8)]
    if kind == 'build8':
        return [(0, K, 1)] + [(i * 2, S, .3 + i * 0.07, 0.9 + i * 0.02) for i in range(8)]
    if kind == 'build16':
        return [(0, K, 1)] + [(i, S, .45 + i * 0.03, 1.0 + i * 0.015) for i in range(16)]
    if kind == 'build32':
        return [(0, K, 1)] + [(i * 0.5, S, .55 + i * 0.014, 1.2 + i * 0.012) for i in range(24)]
    return []

def drums(mx, t0, kind, hats='8', ride_on=False, ghost=True):
    for ev in pat(kind):
        st, k, v = ev[0], ev[1], ev[2]
        t = t0 + st * STEP
        if k == 'k':
            mx.add('kick', t, kick(v)); mx.kicks.append(t)
        else:
            p = ev[3] if len(ev) > 3 else 1.0
            mx.add('snare', t, snare(v, p), pan=rng.uniform(-.08, .08))
    busy = set(int(ev[0]) for ev in pat(kind) if float(ev[0]).is_integer())
    if ghost and kind:
        # ghost snares on the free 16ths + 32nd flams before the backbeats
        for s in range(16):
            if s not in busy and s % 2 == 1 and rng.random() < 0.55:
                mx.add('snare', t0 + s * STEP, snare(rng.uniform(.12, .26), rng.uniform(.95, 1.1), 0.05), pan=rng.uniform(-.2, .2))
        for s in (4, 12):
            if rng.random() < 0.6: mx.add('snare', t0 + (s - 0.5) * STEP, snare(.22, 1.05, 0.04), pan=-.15)
        for s in range(16):  # rim clicks
            if s not in busy and rng.random() < 0.18:
                mx.add('perc', t0 + s * STEP, rim(rng.uniform(.4, .8), rng.choice([1.0, 1.26, 1.5])), pan=rng.choice([-.6, .6]))
        if rng.random() < 0.3:  # tom run
            s0 = rng.choice([12, 13])
            for i, f in enumerate((180, 150, 120)):
                mx.add('perc', t0 + (s0 + i) * STEP, tom(.7, f), pan=(-.4 + i * .4))
    if hats:
        for s in range(16):
            if s % 2 == 0: mx.add('hat', t0 + s * STEP, hat(.75 if s % 4 == 2 else .5), pan=.25)
            elif hats == '16' or s in (3, 13): mx.add('hat', t0 + s * STEP, hat(.3), pan=.3)
            if hats == '16' and rng.random() < 0.15:  # 32nd hat roll
                for j in range(1, 3): mx.add('hat', t0 + (s + j * 0.5) * STEP, hat(.22 + j * .06), pan=.35)
        if kind not in ('', 'half'):
            mx.add('hat', t0 + 14 * STEP, hat(.45, True), pan=.25)
            if rng.random() < 0.5: mx.add('hat', t0 + 6 * STEP, hat(.35, True), pan=.25)
        if hats == '16':
            for s in range(16):
                mx.add('perc', t0 + s * STEP, shaker(.9 if s % 4 == 2 else .45), pan=-.45)
    if ride_on:
        for s in (0, 4, 8, 12):
            mx.add('ride', t0 + s * STEP, ride(.9 if s % 8 == 0 else .6), pan=-.35)
        for s in (2, 6, 10, 14):
            mx.add('ride', t0 + s * STEP, ride(.4), pan=-.35)

# ---------------------------------------------------------------- harmony
CHORDS = [  # 2 bars each
    (53, [0, 3, 7]),   # Fm
    (49, [0, 4, 7]),   # Db
    (56, [0, 4, 7]),   # Ab
    (51, [0, 4, 7]),   # Eb
]
MEL = [  # simple, long notes (half-time feel over the fast drums)
    [(0, 77, 12), (12, 75, 4), (16, 72, 16)],
    [(0, 77, 12), (12, 80, 4), (16, 77, 16)],
    [(0, 75, 12), (12, 79, 4), (16, 72, 16)],
    [(0, 75, 12), (12, 74, 4), (16, 70, 16)],
]
BASS_RH = [(0, 6, 0), (6, 4, 0), (10, 2, 12), (12, 4, 0), (16, 6, 0), (22, 2, 12), (24, 3, 0), (27, 5, 7)]

def lead_note(m, n_steps, bright=1.0):
    n = int(n_steps * STEP * SR + 0.18 * SR)
    f = mtof(m); t = np.arange(n) / SR
    vib = 1 + 0.004 * np.sin(2 * np.pi * 6 * t) * np.minimum(1, t / 0.15)
    # pitch-modulated saw via phase accumulation, 3 detuned voices
    out = np.zeros(n)
    for d in (-0.006, 0, 0.007):
        ph = 2 * np.pi * np.cumsum(f * (1 + d) * vib) / SR
        H = int(min(30, (SR * 0.45) / (f * 1.01)))
        for h in range(1, H + 1):
            out += np.sin(ph * h) / h * (1.0 if h % 2 else 0.75)
    out += sq(f / 2, n, 12) * 0.25
    e = env_adsr(n, 0.004, 0.12, 0.65, 0.07, n_steps * STEP)
    return lp(2500 + 3500 * bright, out * e * 0.11, 2)

def pluck(m, vel=1.0):
    n = int(0.35 * SR); f = mtof(m)
    x = saw(f, n, 24) + sq(f * 2, n, 8) * 0.3
    return lp(4500, x * env_ad(n, 0.002, 0.09), 2) * 0.16 * vel

def pad(chord, seconds):
    root, iv = chord
    n = int((seconds + 0.6) * SR)
    out = np.zeros(n)
    for k in iv + [12]:
        f = mtof(root + k)
        for d in (-0.01, -0.004, 0.003, 0.009):
            out += saw(f * (1 + d), n, 14, phase=rng.uniform(0, 6.28))
    e = env_adsr(n, 0.35, 1.0, 0.85, 0.5, seconds)
    return lp(1800, out * e, 2) * 0.03

def reese(m, n_steps):
    n = int(n_steps * STEP * SR + 0.06 * SR)
    f = mtof(m)
    x = saw(f * 0.996, n, 60) + saw(f * 1.004, n, 60, phase=1.3) + saw(f * 2.002, n, 20) * 0.25
    e = env_adsr(n, 0.004, 0.2, 0.9, 0.03, n_steps * STEP)
    x = np.tanh(x * e * 1.8)
    t = np.arange(n) / SR
    wob = 0.5 + 0.5 * np.sin(2 * np.pi * (1 / (BEAT * 2)) * t)
    y = lp(380, x) * (1 - wob) + lp(1200, x) * wob
    sub = np.sin(2 * np.pi * f / 2 * t) * e * 0.9 if f > 60 else np.sin(2 * np.pi * f * t) * e * 0.9
    return y * 0.33, sub * 0.42

def riser(seconds):
    n = int(seconds * SR); t = np.arange(n) / SR
    x = rng.standard_normal(n)
    # crossfade from low band to high band as it rises
    a = (t / seconds) ** 2
    y = bp(300, 1500, x) * (1 - a) + hp(3000, x) * a
    tone = np.sin(2 * np.pi * np.cumsum(200 + 1600 * a) / SR) * 0.15
    return (y * 0.12 + tone) * (t / seconds) ** 1.5

def down(seconds):
    n = int(seconds * SR); t = np.arange(n) / SR
    x = hp(2000, rng.standard_normal(n)) * np.exp(-t / (seconds * 0.4))
    tone = np.sin(2 * np.pi * np.cumsum(1400 * np.exp(-t / 0.4) + 80) / SR) * np.exp(-t / (seconds * 0.3)) * 0.12
    return x * 0.07 + tone

def revcrash(seconds):
    c = crash(1.0)[: int(seconds * SR)]
    return c[::-1] * 0.8

# ---------------------------------------------------------------- arrangement
def compose_loop(mx, T):
    kinds = ['amen1', 'think', 'amen2', 'chop', 'amen1', 'chop2', 'think', 'stutter',
             'amen1', 'chop2', 'amen2', 'trip', 'think', 'chop', 'stutter2', 'roll']
    for b, k in enumerate(kinds):
        drums(mx, T + b * BAR, k, hats='16', ride_on=b >= 8)
    mx.add('fx', T, crash(1.0), pan=-.2); mx.add('fx', T, boom())
    mx.add('fx', T + 8 * BAR, crash(.9), pan=.2); mx.add('fx', T + 8 * BAR, boom() * 0.7)
    mx.add('fx', T + 8 * BAR - 1.0, revcrash(1.0), pan=-.3)
    mx.add('fx', T + 14 * BAR, riser(2 * BAR), pan=0)
    mx.add('fx', T, down(1.4), pan=.3)
    for half in range(2):
        for c in range(4):
            t0 = T + (half * 8 + c * 2) * BAR
            root, iv = CHORDS[c]
            mx.add('pad', t0, pad(CHORDS[c], 2 * BAR))
            # bass
            for st, ln, off in BASS_RH:
                if half == 1 and c == 3 and st >= 24:  # breakcore drop: bass stops for the roll
                    continue
                r, s = reese(root - 24 + off, ln)
                mx.add('bass', t0 + st * STEP, r); mx.add('sub', t0 + st * STEP, s)
            # lead
            for st, m, ln in MEL[c]:
                mx.add('lead', t0 + st * STEP, lead_note(m, ln, 0.35 + 0.25 * half), pan=-.05)
            # arp
            tones = [root + 12 + k for k in iv] + [root + 24]
            seq = [0, 1, 2, 3, 2, 1, 2, 3] if half == 0 else [0, 2, 1, 3, 2, 3, 1, 2]
            for s in range(32):
                if s % 2 == 1 or half == 0: continue
                mx.add('arp', t0 + s * STEP, pluck(tones[seq[s % 8]], .8 if s % 4 == 0 else .55), pan=(-.5 if s % 2 else .5))

def compose_intro(mx):
    # 8 bars: atmosphere -> filtered break -> snare build -> into loop
    for c in range(4):
        t0 = c * 2 * BAR
        mx.add('pad', t0, pad(CHORDS[c], 2 * BAR) * 1.3)
        root, iv = CHORDS[c]
        tones = [root + 12 + k for k in iv] + [root + 24]
        for s in range(32):
            a = (c * 32 + s) / 128.0
            mx.add('arpI', t0 + s * STEP, pluck(tones[[0, 1, 2, 3, 2, 1, 2, 3][s % 8]], 0.35 + 0.5 * a), pan=(-.5 if s % 2 else .5))
    # lead teaser over bars 4-5 (Fm figure, half speed feel)
    for st, m, ln in MEL[0][:6]:
        mx.add('lead', 4 * BAR + st * STEP * 2, lead_note(m, ln * 2, 0.3) * 0.8)
    # drums: bars 2-3 hats only, 4-5 half-time filtered, 6 build16, 7 build32
    for b in (2, 3):
        drums(mx, b * BAR, '', hats='8', ghost=False)
    for b in (4, 5):
        drums(mx, b * BAR, 'half', hats='16')
    drums(mx, 6 * BAR, 'build16', hats='8')
    drums(mx, 7 * BAR, 'build32', hats=None, ghost=False)
    # sub bass pedal bars 4-7
    for b in range(4, 8):
        r, s = reese(29, 16)
        mx.add('bass', b * BAR, r * 0.6); mx.add('sub', b * BAR, s)
    mx.add('fx', 0, down(3.0) * 0.7, pan=.2)
    mx.add('fx', 4 * BAR, boom() * 0.6)
    mx.add('fx', 4 * BAR, riser(4 * BAR) * 0.9)
    mx.add('fx', 8 * BAR - 1.2, revcrash(1.2), pan=.2)

# ---------------------------------------------------------------- effects
def make_ir(seconds, seed):
    r = np.random.default_rng(seed)
    n = int(seconds * SR); t = np.arange(n) / SR
    ir = r.standard_normal((2, n)) * np.exp(-t / (seconds / 5.5))
    ir[:, : int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))
    ir = np.stack([lp(7000, ir[0]), lp(7000, ir[1])])
    return ir / np.sqrt((ir ** 2).sum(axis=1, keepdims=True)) * 0.6

IR = make_ir(1.8, 3)
def reverb(x, amt):
    return np.stack([fftconvolve(x[0], IR[0])[: x.shape[1]], fftconvolve(x[1], IR[1])[: x.shape[1]]]) * amt

def pingpong(x, delay, fb, amt):
    d = int(delay * SR); y = np.zeros_like(x)
    src = (x[0] + x[1]) * 0.5
    tap = src.copy(); side = 0
    for i in range(1, 7):
        sh = np.zeros_like(src); sh[d * i:] = tap[: len(src) - d * i] if d * i < len(src) else 0
        y[side] += sh * (fb ** (i - 1)); side ^= 1
    return lp(5000, y[0]), lp(5000, y[1]), amt

def sidechain(n, kicks, depth=0.65, rel=0.09):
    t = np.arange(n) / SR
    g = np.ones(n)
    for k in kicks:
        i = int(k * SR)
        if i >= n: continue
        seg = t[i:min(n, i + int(0.4 * SR))] - k
        g[i:i + len(seg)] = np.minimum(g[i:i + len(seg)], 1 - depth * np.exp(-seg / rel))
    return g

def master(mx):
    n = mx.n
    sc = sidechain(n, mx.kicks)
    d = {k: mx.get(k) for k in ('kick', 'snare', 'hat', 'ride', 'perc', 'fx', 'pad', 'bass', 'sub', 'lead', 'arp', 'arpI')}
    # intro arp opens its filter over 8 bars
    if np.abs(d['arpI']).sum() > 0:
        segs = 16; L = n // segs; out = np.zeros_like(d['arpI'])
        for i in range(segs):
            fc = 500 * (1 + i * 0.9)
            a, b_ = i * L, (i + 1) * L if i < segs - 1 else n
            out[:, a:b_] = np.stack([lp(fc, d['arpI'][0])[a:b_], lp(fc, d['arpI'][1])[a:b_]])
        d['arp'] = d['arp'] + out
    if REPORT:
        for k,v in d.items(): print('  stem',k,round(20*np.log10(np.sqrt((v**2).mean())+1e-9),1))
    drums_ = d['kick'] * 1.15 + d['snare'] * 1.5 + d['hat'] * 1.4 + d['ride'] * 1.2 + d['perc'] * 1.3
    dpk = np.percentile(np.abs(drums_), 99.5) + 1e-9
    drums_ = np.tanh(drums_ / dpk * 1.4) * dpk * 0.85 + drums_ * 0.35   # parallel-crushed drum bus
    music = d['pad'] * sc * 0.8 + d['bass'] * sc * 0.75 + d['sub'] * sc * 0.85 + d['lead'] * 1.0 + d['arp'] * sc * 1.2
    dl0, dl1, amt = pingpong(d['lead'] + d['arp'] * 0.5, BEAT * 0.75, 0.45, 0.22)
    wet = reverb(d['snare'] * 0.12 + d['perc'] * 0.2 + d['lead'] * 0.6 + d['pad'] * 0.6 + d['arp'] * 0.4 + d['fx'] * 0.5, 0.55)
    mixb = drums_ * 1.6 + music + d['fx'] + wet + np.stack([dl0, dl1]) * amt
    # glue: highpass the mud, soft clip
    mixb = np.stack([hp(28, mixb[0]), hp(28, mixb[1])])
    pk = np.percentile(np.abs(mixb), 99.9); mixb = np.tanh(mixb / pk * 1.15) / np.tanh(1.15)
    return mixb

def write_wav(path, x):
    import wave
    pcm = (np.clip(x.T, -1, 1) * 32767).astype('<i2')
    with wave.open(path, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

if __name__ == '__main__':
    out = sys.argv[1]
    LOOP = 16 * BAR
    mx = Mix(2 * LOOP + 3)
    rng = np.random.default_rng(11); compose_loop(mx, 0.0)
    rng = np.random.default_rng(11); compose_loop(mx, LOOP)
    m = master(mx)
    loop = m[:, int(LOOP * SR): int(2 * LOOP * SR)]
    INTRO = 8 * BAR
    mi = Mix(INTRO + 2.0)
    compose_intro(mi)
    intro = master(mi)
    peak = max(np.abs(loop).max(), np.abs(intro).max())
    write_wav(out + '/loop.wav', loop / peak * 0.93)
    write_wav(out + '/intro.wav', intro / peak * 0.93)
    print('loop', loop.shape[1] / SR, 'intro', intro.shape[1] / SR)
