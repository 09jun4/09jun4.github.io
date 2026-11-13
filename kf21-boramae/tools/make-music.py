#!/usr/bin/env python3
"""KF-21 BORAMAE 배경음악 생성기: 오케스트라풍 시네마틱 루프를 덧셈 합성으로 만든다(샘플·외부 음원 없음, 자작곡).
   D단조, 96BPM, 16마디(40초). 현악 패드 + 저음 현 스타카토 오스티나토 + 호른·트럼펫 선율 + 팀파니·큰북·스네어·심벌.
   모든 음과 잔향을 루프 길이로 감아 넣어(원형) 끝과 처음이 그대로 이어진다.
   사용: python3 tools/make-music.py  →  assets/audio/music.mp3 (루프 + 앞부분 1.5초를 덧붙인 파일. 게임이 겹쳐서 루프로 만든다)"""
import numpy as np, wave, subprocess, os, sys

SR = 32000
BPM = 96
BEAT = 60 / BPM
BARS = 16
L = BARS * 4 * BEAT            # 40초
N = int(round(L * SR))
rng = np.random.default_rng(21)
mixL = np.zeros(N); mixR = np.zeros(N)

def hz(m): return 440.0 * 2 ** ((m - 69) / 12)

def put(sig, start, gain=1.0, pan=0.0):
    """신호를 start(초)에 넣는다. 루프 끝을 넘으면 처음으로 감긴다."""
    i0 = int(round(start * SR)) % N
    idx = (i0 + np.arange(len(sig))) % N
    np.add.at(mixL, idx, sig * gain * np.sqrt(0.5 * (1 - pan)))
    np.add.at(mixR, idx, sig * gain * np.sqrt(0.5 * (1 + pan)))

def env(n, a, r, sustain=1.0, d=0.0):
    """attack a초, (decay d초로 sustain까지), release r초"""
    e = np.full(n, sustain)
    na = max(1, int(a * SR)); nr = max(1, int(r * SR)); nd = int(d * SR)
    e[:na] = np.linspace(0, 1, na) ** 1.5
    if nd: e[na:na + nd] = np.linspace(1, sustain, min(nd, max(0, n - na)))[: max(0, min(nd, n - na))]
    e[-nr:] *= np.linspace(1, 0, nr) ** 1.3
    return e

def additive(f, n, weights, vib=0.0, vibrate=5.2, detune=0.0, phase=None):
    t = np.arange(n) / SR
    ph = 2 * np.pi * f * (1 + detune) * t
    if vib: ph = ph + vib * f / vibrate * np.sin(2 * np.pi * vibrate * t) * np.minimum(1, t / 0.6)
    out = np.zeros(n)
    for k, w in enumerate(weights, start=1):
        if f * k > 11000: break
        out += w * np.sin(k * ph + (rng.uniform(0, 6.283) if phase is None else phase))
    return out

def brass(m, dur, gain, bright=1.0):
    n = int((dur + 0.25) * SR)
    e = env(n, 0.07, 0.22, sustain=0.82, d=0.25)
    soft = additive(hz(m), n, [1 / k ** 1.3 for k in range(1, 7)], vib=0.008, vibrate=5.6)
    hard = additive(hz(m), n, [(1 / k ** 0.75) * np.exp(-k / 14) for k in range(1, 22)], vib=0.008, vibrate=5.6)
    return (soft * 0.75 + hard * 0.55 * bright * e ** 2) * e * gain

def stacc(m, gain):
    n = int(0.3 * SR)
    t = np.arange(n) / SR
    s = additive(hz(m), n, [np.exp(-k / 9) / k for k in range(1, 20)], detune=rng.uniform(-0.002, 0.002))
    bow = rng.standard_normal(n) * np.exp(-t / 0.012) * 0.25  # 활이 닿는 소리
    return (s * np.exp(-t / 0.085) * np.minimum(1, t / 0.006) + bow) * gain

def drum(f, decay, gain, noise=0.25, drop=1.7):
    n = int(decay * 5 * SR)
    t = np.arange(n) / SR
    fr = f * (1 + (drop - 1) * np.exp(-t / 0.03))
    ph = 2 * np.pi * np.cumsum(fr) / SR
    body = np.sin(ph) + 0.35 * np.sin(1.5 * ph) * np.exp(-t / (decay * 0.5))
    nz = np.cumsum(rng.standard_normal(n)); nz -= np.convolve(nz, np.ones(64) / 64, 'same')
    nz = nz / (np.abs(nz).max() + 1e-9) * np.exp(-t / 0.05)
    return (body * np.exp(-t / decay) + nz * noise) * gain

def noise_hp(n):
    x = rng.standard_normal(n)
    return np.diff(np.diff(x, prepend=0), prepend=0) * 0.5

def snare(gain):
    n = int(0.16 * SR); t = np.arange(n) / SR
    return (np.diff(rng.standard_normal(n), prepend=0) * np.exp(-t / 0.035) + 0.5 * np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.03)) * gain

def swell(dur, gain):
    n = int(dur * SR); t = np.arange(n) / SR
    return noise_hp(n) * (t / dur) ** 3 * gain

def crash(gain):
    n = int(3.2 * SR); t = np.arange(n) / SR
    return noise_hp(n) * np.exp(-t / 0.9) * np.minimum(1, t / 0.004) * gain

def beat(bar, b): return ((bar - 1) * 4 + (b - 1)) * BEAT

# ── 화성: 두 마디씩 Dm – Bb – F – C – Dm – Bb – Gm – A ──
CH = [
    ('Dm', 38, [50, 57, 62, 65]), ('Bb', 34, [46, 53, 58, 62]), ('F', 41, [53, 57, 60, 65]), ('C', 36, [48, 55, 60, 64]),
    ('Dm', 38, [50, 57, 62, 65, 69]), ('Bb', 34, [46, 53, 58, 62, 65]), ('Gm', 31, [43, 50, 58, 62, 67]), ('A', 33, [45, 52, 57, 61, 64]),
]
mixL[:] = 0; mixR[:] = 0
parts = {k: (np.zeros(N), np.zeros(N)) for k in ('pad', 'ost', 'brass', 'perc', 'bass')}
def into(part):
    global mixL, mixR
    mixL, mixR = parts[part]

for i, (name, root, notes) in enumerate(CH):
    start = i * 8 * BEAT
    big = i >= 4  # 뒤쪽 8마디가 더 크다
    # 현악 패드
    into('pad')
    for j, m in enumerate(notes):
        n = int((8 * BEAT + 0.5) * SR)
        w = [np.exp(-k / (8.0 if big else 6.0)) / k for k in range(1, 26)]
        s = sum(additive(hz(m), n, w, vib=0.012, vibrate=5.0 + v * 0.4, detune=dt) for v, dt in enumerate((-0.004, 0.0, 0.0045)))
        put(s * env(n, 0.4, 0.6), start - 0.05, 0.05 * (1.25 if big else 1.0), pan=(-0.5 + j / max(1, len(notes) - 1)) * 0.9)
        if big and j >= len(notes) - 2:  # 높은 현: 한 옥타브 위를 얇게
            s2 = sum(additive(hz(m + 12), n, [np.exp(-k / 5.0) / k for k in range(1, 14)], vib=0.014, vibrate=5.6 + v * 0.3, detune=dt) for v, dt in enumerate((-0.003, 0.0035)))
            put(s2 * env(n, 0.8, 0.7), start - 0.05, 0.022, pan=0.35)
    # 베이스: 콘트라베이스 + 낮은 사인
    into('bass')
    n = int((8 * BEAT + 0.3) * SR)
    b = additive(hz(root), n, [np.exp(-k / 3.5) / k for k in range(1, 12)], vib=0.004) + 0.8 * additive(hz(root), n, [1.0], phase=0)
    put(b * env(n, 0.12, 0.4), start, 0.11)
    # 스타카토 오스티나토(8분음표): 근음·5도·옥타브
    into('ost')
    fifth = 7
    pat = [0, 0, 12, 0, fifth, 0, 12, fifth]
    acc = [1.0, 0.55, 0.75, 0.55, 0.85, 0.55, 0.75, 0.62]
    for bar in range(2):
        for e8 in range(8):
            tt = start + bar * 4 * BEAT + e8 * BEAT / 2
            g = 0.085 * acc[e8] * (1.2 if big else 0.85)
            put(stacc(root + 12 + pat[e8], g), tt, 1.0, pan=-0.25)
            put(stacc(root + 24 + pat[e8], g * 0.5), tt + 0.004, 1.0, pan=0.3)
    # 타악: 마디 첫 박 팀파니, 뒤쪽은 4박 뒤 여린박에 한 번 더
    into('perc')
    for bar in range(2):
        t0 = start + bar * 4 * BEAT
        put(drum(hz(root + 12), 0.5, 0.34 if big else 0.24), t0, 1.0, pan=0.15)
        if big:
            put(drum(hz(root + 12), 0.35, 0.2), t0 + 3.5 * BEAT, 1.0, pan=0.15)
            put(drum(hz(root + 19), 0.3, 0.16), t0 + 2 * BEAT, 1.0, pan=0.15)
            for s16 in range(16):  # 행진 스네어: 16분음표, 박마다 강세
                a = 1.0 if s16 % 4 == 0 else 0.65 if s16 % 4 == 3 else 0.32
                put(snare(0.05 * a), t0 + s16 * BEAT / 4, 1.0, pan=-0.2)
        else:
            put(drum(hz(root + 12), 0.3, 0.12), t0 + 3 * BEAT, 1.0, pan=0.15)

# 큰북과 심벌: 구간이 바뀌는 자리(1마디, 9마디)
into('perc')
for bar in (1, 9):
    put(drum(48, 0.9, 0.6, noise=0.4, drop=2.2), beat(bar, 1), 1.0)
    put(crash(0.035 if bar == 9 else 0.022), beat(bar, 1), 1.0, pan=-0.1)
put(swell(4 * BEAT, 0.03), beat(8, 1), 1.0, pan=0.1)   # 9마디로 넘어가는 심벌 롤
put(swell(4 * BEAT, 0.032), beat(16, 1), 1.0, pan=0.1)  # 루프 처음으로 넘어가는 심벌 롤
for k in range(8):  # 16마디 끝: 팀파니 롤이 처음으로 밀어 넣는다
    put(drum(hz(45), 0.18, 0.08 + 0.022 * k), beat(16, 3) + k * BEAT / 4, 1.0, pan=0.15)

# ── 선율(금관) ── (음, 시작 마디, 박, 길이 박)
MEL_A = [  # 호른: 낮고 넓게
    (57, 1, 1, 4), (62, 2, 1, 3), (65, 2, 4, 1),
    (65, 3, 1, 3), (62, 3, 4, 1), (58, 4, 1, 4),
    (60, 5, 1, 2), (65, 5, 3, 2), (69, 6, 1, 3), (67, 6, 4, 1),
    (67, 7, 1, 4), (64, 8, 1, 2), (60, 8, 3, 1), (64, 8, 4, 1),
]
MEL_B = [  # 트럼펫 + 호른: 한 옥타브 위에서 크게
    (74, 9, 1, 3), (72, 9, 4, 1), (69, 10, 1, 2), (74, 10, 3, 2),
    (77, 11, 1, 3), (74, 11, 4, 1), (70, 12, 1, 4),
    (67, 13, 1, 2), (70, 13, 3, 2), (74, 14, 1, 3), (72, 14, 4, 1),
    (73, 15, 1, 3), (76, 15, 4, 1), (76, 16, 1, 2), (73, 16, 3, 2),
]
into('brass')
for m, bar, b, d in MEL_A:
    put(brass(m, d * BEAT, 0.085, bright=0.55), beat(bar, b), 1.0, pan=-0.3)
    put(brass(m - 12, d * BEAT, 0.05, bright=0.4), beat(bar, b) + 0.01, 1.0, pan=-0.45)
for m, bar, b, d in MEL_B:
    put(brass(m, d * BEAT, 0.095, bright=1.0), beat(bar, b), 1.0, pan=0.3)
    put(brass(m - 12, d * BEAT, 0.085, bright=0.7), beat(bar, b) + 0.012, 1.0, pan=-0.3)
    put(brass(m - 24, d * BEAT, 0.05, bright=0.5), beat(bar, b) + 0.02, 1.0, pan=0.0)

# ── 잔향: 지수 감쇠 잡음과의 원형 합성곱(끝의 꼬리가 처음으로 이어진다) ──
def reverb(x, seed, decay, wet):
    r = np.random.default_rng(seed)
    n = int(2.8 * SR); t = np.arange(n) / SR
    ir = r.standard_normal(n) * np.exp(-t / decay)
    ir = np.convolve(ir, np.ones(6) / 6, 'same')  # 고음을 조금 깎는다
    ir[: int(0.012 * SR)] = 0
    ir /= np.sqrt((ir ** 2).sum())
    irp = np.zeros(N); irp[:n] = ir
    return x + wet * np.real(np.fft.ifft(np.fft.fft(x) * np.fft.fft(irp)))

WET = {'pad': 0.55, 'ost': 0.3, 'brass': 0.6, 'perc': 0.45, 'bass': 0.12}
outL = np.zeros(N); outR = np.zeros(N)
for k, (pl, pr) in parts.items():
    outL += reverb(pl, 11, 0.75, WET[k]); outR += reverb(pr, 29, 0.78, WET[k])

# 마스터: 최대값 맞춤 + 부드러운 클립
peak = max(np.abs(outL).max(), np.abs(outR).max())
outL = np.tanh(outL / peak * 1.5) / np.tanh(1.5) * 0.9; outR = np.tanh(outR / peak * 1.5) / np.tanh(1.5) * 0.9

# 파일: 루프 + 앞부분 1.5초(게임이 이 겹침으로 이음매 없는 루프를 만든다)
ext = int(1.5 * SR)
st = np.stack([np.concatenate([outL, outL[:ext]]), np.concatenate([outR, outR[:ext]])], axis=1)
pcm = (np.clip(st, -1, 1) * 32767).astype('<i2')
here = os.path.dirname(os.path.abspath(__file__))
wav = os.path.join(here, 'music.wav'); mp3 = os.path.join(here, '..', 'assets', 'audio', 'music.mp3')
with wave.open(wav, 'wb') as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', wav, '-b:a', '128k', mp3], check=True)
os.remove(wav)
print(f'loop {L:.3f}s, file {(N + ext) / SR:.3f}s, peak {peak:.3f} → {os.path.normpath(mp3)} ({os.path.getsize(mp3) // 1024}KB)')
