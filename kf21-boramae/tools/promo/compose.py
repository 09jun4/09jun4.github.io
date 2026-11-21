#!/usr/bin/env python3
"""홍보 영상 합성: 캡처한 장면(720x1280)을 1080x1920으로 키우고 자막·전환·기기 모형·엔딩을 얹고, 효과음 기록으로 소리를 섞는다.
   python3 tools/promo/compose.py <캡처 폴더> <출력 mp4>"""
import json, os, subprocess, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

SRC = sys.argv[1]; OUTF = sys.argv[2]
HERE = os.path.dirname(os.path.abspath(__file__))
AUD = os.path.join(HERE, '..', '..', 'assets', 'audio')
W, H, FPS = 1080, 1920, 60
OV = os.path.join(SRC, 'overlays')

# ── 타임라인(프레임) ──
SEGS = [('takeoff', 204), ('gun', 120), ('missile', 240), ('bombA', 100), ('bombB', 140), ('coast', 120), ('boss', 300)]
DEV, END = 300, 276
start = {}; t = 0
for n, k in SEGS: start[n] = t; t += k
start['devices'] = t; t += DEV
start['end'] = t; t += END
TOTAL = t
assert TOTAL == 1800, TOTAL
CAPS = [  # (이미지, 시작 프레임, 끝 프레임)
    ('c_takeoff', 10, start['gun'] - 8), ('c_cockpit', start['gun'] + 6, start['missile'] - 6), ('c_chase', start['missile'] + 6, start['bombA'] - 6),
    ('c_bomb', start['bombA'] + 6, start['coast'] - 6), ('c_campaign', start['coast'] + 4, start['boss'] - 4), ('c_boss', start['boss'] + 6, start['devices'] - 8),
    ('c_devices', start['devices'] + 6, start['end'] - 6),
]
FLASH = [start[k] for k in ('gun', 'bombA', 'coast', 'boss', 'devices', 'end')]
CAP_Y = 250

def load(name): return Image.open(os.path.join(OV, name + '.png')).convert('RGBA')
caps = {c[0]: load(c[0]) for c in CAPS}
labels = {k: load(k) for k in ('l_pc', 'l_mobile')}
logo = load('logo')

def ease(u): u = min(1, max(0, u)); return u * u * (3 - 2 * u)

def frame_path(seg, i): return os.path.join(SRC, seg, f'{i:05d}.jpg')

def game_frame(seg, i):
    im = Image.open(frame_path(seg, i)).convert('RGB').resize((W, H), Image.LANCZOS)
    return im.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=2))

# 기기 모형 배경과 틀(한 번만 그린다)
LAP = (60, 500, 1020, 1040)      # 노트북 화면(960x540)
PHN = (48, 1240, 1032, 1695)     # 휴대폰 화면(984x455 ≈ 844x390 비율)
def device_base():
    bg = Image.new('RGB', (W, H))
    d = ImageDraw.Draw(bg)
    for y in range(H):  # 남색 그라데이션
        k = y / H
        d.line([(0, y), (W, y)], fill=(int(8 + 10 * k), int(18 + 14 * k), int(30 + 22 * k)))
    for x in range(0, W, 60): d.line([(x, 0), (x, H)], fill=(18, 34, 50))
    for y in range(0, H, 60): d.line([(0, y), (W, y)], fill=(18, 34, 50))
    return bg
def device_frame():
    fr = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    d = ImageDraw.Draw(fr)
    x0, y0, x1, y1 = LAP
    d.rounded_rectangle([x0 - 22, y0 - 22, x1 + 22, y1 + 30], radius=26, outline=(70, 82, 96), width=3, fill=None)
    d.rounded_rectangle([x0 - 20, y0 - 20, x1 + 20, y1 + 28], radius=24, outline=(26, 30, 36), width=18)
    d.ellipse([W / 2 - 5, y0 - 15, W / 2 + 5, y0 - 5], fill=(60, 66, 74))
    d.polygon([(x0 - 26, y1 + 30), (x1 + 26, y1 + 30), (x1 + 50, y1 + 66), (x0 - 50, y1 + 66)], fill=(150, 158, 168))
    d.rounded_rectangle([x0 - 50, y1 + 64, x1 + 50, y1 + 76], radius=6, fill=(110, 116, 124))
    d.rounded_rectangle([W / 2 - 90, y1 + 30, W / 2 + 90, y1 + 40], radius=5, fill=(120, 128, 138))
    x0, y0, x1, y1 = PHN
    d.rounded_rectangle([x0 - 34, y0 - 22, x1 + 34, y1 + 22], radius=58, fill=None, outline=(26, 30, 36), width=26)
    d.rounded_rectangle([x0 - 36, y0 - 24, x1 + 36, y1 + 24], radius=60, fill=None, outline=(80, 92, 106), width=3)
    d.rounded_rectangle([x0 - 22, y0 + (y1 - y0) / 2 - 36, x0 - 12, y0 + (y1 - y0) / 2 + 36], radius=5, fill=(10, 12, 14))  # 카메라 구멍
    # 화면 모서리를 둥글게(바깥을 틀 색으로 덮는다)
    m = Image.new('L', (x1 - x0, y1 - y0), 0); ImageDraw.Draw(m).rounded_rectangle([0, 0, x1 - x0 - 1, y1 - y0 - 1], radius=34, fill=255)
    return fr, m
DBG = device_base(); DFR, PMASK = device_frame()

def devices(i):
    im = DBG.copy()
    lap = Image.open(frame_path('laptop', i)).convert('RGB').resize((LAP[2] - LAP[0], LAP[3] - LAP[1]), Image.LANCZOS)
    im.paste(lap, LAP[:2])
    ph = Image.open(frame_path('phone', i)).convert('RGB').resize((PHN[2] - PHN[0], PHN[3] - PHN[1]), Image.LANCZOS)
    im.paste(ph, PHN[:2], PMASK)
    im = im.convert('RGBA'); im.alpha_composite(DFR)
    a = ease(i / 18)
    for lab, y in (('l_pc', LAP[3] + 92), ('l_mobile', PHN[3] + 40)):
        L = labels[lab]; L2 = L.copy(); L2.putalpha(L.getchannel('A').point(lambda v: int(v * a)))
        im.alpha_composite(L2, ((W - L.width) // 2 + int((1 - a) * 40), y))
    return im.convert('RGB')

HERO = Image.open(os.path.join(SRC, 'hero.png')).convert('RGB')
def endcard(i):
    z = 1.0 + 0.07 * (i / END)
    w, h = int(W / z), int(H / z)
    x, y = (W - w) // 2, int((H - h) * 0.4)
    im = HERO.crop((x, y, x + w, y + h)).resize((W, H), Image.LANCZOS)
    im = ImageEnhance.Brightness(im).enhance(1 - 0.45 * ease(i / 30)).convert('RGBA')
    a = ease((i - 8) / 24)
    if a > 0:
        L = logo.copy(); L.putalpha(logo.getchannel('A').point(lambda v: int(v * a)))
        sc = 1.08 - 0.08 * a
        L = L.resize((int(W * sc), int(H * sc)), Image.LANCZOS)
        im.alpha_composite(L, ((W - L.width) // 2, (H - L.height) // 2 - 40))
    if i > END - 24: im = Image.blend(im.convert('RGB'), Image.new('RGB', (W, H)), ease((i - (END - 24)) / 24)).convert('RGBA')  # 끝에서 검게
    return im.convert('RGB')

def overlay_caption(im, f):
    for name, a0, a1 in CAPS:
        if a0 <= f < a1:
            k = min(ease((f - a0) / 14), ease((a1 - f) / 10))
            C = caps[name]; C2 = C.copy(); C2.putalpha(C.getchannel('A').point(lambda v: int(v * k)))
            im = im.convert('RGBA'); im.alpha_composite(C2, (0, CAP_Y + int((1 - k) * 36)))
            return im.convert('RGB')
    return im

def flash(im, f):
    for s in FLASH:
        if s <= f < s + 7:
            return Image.blend(im, Image.new('RGB', (W, H), (255, 255, 255)), 0.55 * (1 - (f - s) / 7))
    return im

def video():
    enc = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                            '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', OUTF + '.video.mp4'], stdin=subprocess.PIPE)
    for f in range(TOTAL):
        if f < start['devices']:
            seg = max((n for n, _ in SEGS if start[n] <= f), key=lambda n: start[n])
            im = game_frame(seg, f - start[seg])
        elif f < start['end']: im = devices(f - start['devices'])
        else: im = endcard(f - start['end'])
        im = flash(overlay_caption(im, f), f)
        enc.stdin.write(im.tobytes())
        if f % 120 == 0: print('frame', f, flush=True)
    enc.stdin.close(); enc.wait()

# ── 소리 ──
SR = 48000
def decode(name):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', os.path.join(AUD, name), '-f', 'f32le', '-ac', '2', '-ar', str(SR), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype='<f4').reshape(-1, 2).copy()
def resample(x, rate):
    if rate == 1: return x
    n = int(len(x) / rate); idx = np.arange(n) * rate
    i0 = np.floor(idx).astype(int); fr = (idx - i0)[:, None]; i1 = np.minimum(i0 + 1, len(x) - 1)
    return x[i0] * (1 - fr) + x[i1] * fr

def audio():
    N = int(TOTAL / FPS * SR) + SR
    mix = np.zeros((N, 2))
    def put(x, t, gain=1.0, fade_in=0.0, fade_out=0.0, length=None):
        x = x.copy()
        if length is not None: x = x[: int(length * SR)]
        if fade_in: k = min(len(x), int(fade_in * SR)); x[:k] *= np.linspace(0, 1, k)[:, None]
        if fade_out: k = min(len(x), int(fade_out * SR)); x[-k:] *= np.linspace(1, 0, k)[:, None]
        i = int(t * SR)
        if i < 0: x = x[-i:]; i = 0
        n = min(len(x), N - i)
        if n > 0: mix[i:i + n] += x[:n] * gain
    S = {k: decode(f) for k, f in [('music', 'music.mp3'), ('engine', 'engine.mp3'), ('start', 'engine-start.mp3'), ('takeoff', 'takeoff.mp3'), ('gun', 'gun.mp3'), ('missile', 'missile.mp3'), ('fall', 'bomb-fall.mp3'), ('boom', 'explosion.mp3')]}
    sec = lambda f: f / FPS
    # 배경음악: 큰 구간(음악 20초)이 폭격 장면에 오도록 10초부터
    mus = S['music'][int(10.3 * SR):]
    mus = np.concatenate([mus, S['music'][int(0.3 * SR):]])
    put(mus, 0, 0.5, fade_in=0.4, fade_out=1.6, length=TOTAL / FPS)
    # 이륙: 시동음 → 이륙 굉음
    put(S['start'], 0.0, 0.45, fade_out=1.4, length=1.9)
    put(S['takeoff'], 0.75, 0.8, fade_out=0.6, length=sec(start['gun']) - 0.75 + 0.3)
    # 엔진 바탕음(비행 장면 내내)
    eng = np.concatenate([S['engine'][SR:int(17 * SR)]] * 3)
    put(eng, sec(start['gun']), 0.16, fade_in=0.2, fade_out=0.5, length=sec(start['end']) - sec(start['gun']))
    # 게임에서 기록한 소리
    def boom_gain(d): return (max(0.0, min(1.0, 1 - (d - 250) / 4250)) ** 2) * 0.92 + 0.08 if d is not None else 1.0
    gun_loop = S['gun'][int(0.1 * SR):int(1.3 * SR)]
    for seg in [n for n, _ in SEGS] + ['laptop']:
        p = os.path.join(SRC, seg, 'sound.json')
        if not os.path.exists(p): continue
        log = json.load(open(p))['log']
        base = sec(start['devices'] if seg == 'laptop' else start[seg])
        slow = 1.0
        shots = [sec(f) for f, n, o in log if n == 'gun']
        # 기관포: 연속 발사 구간마다 연발 소리를 이어 붙인다
        spans = []
        for s in shots:
            if spans and s - spans[-1][1] < 0.2: spans[-1][1] = s
            else: spans.append([s, s])
        for a, b in spans:
            L = b - a + 0.12
            loop = np.concatenate([gun_loop] * (int(L / 1.2) + 2))
            put(loop, base + a, 0.42, fade_in=0.004, fade_out=0.06, length=L)
        for f, n, o in log:
            t = base + sec(f)
            if n == 'missile_launch': put(S['missile'], t, 0.7)
            elif n == 'explosion':
                if seg == 'boss': put(resample(S['boom'], 0.72), t, 1.0); put(resample(S['boom'], 0.5), t + 0.05, 0.5)  # 킬캠: 낮고 길게
                else: put(S['boom'], t, 0.85 * boom_gain(o and o.get('distance')))
            elif n == 'bomb_explosion': put(S['boom'], t, 1.0)
    # 폭탄 낙하음: 장면이 잘려도 착탄(폭격 B의 폭발) 순간에 끝나게
    lb = json.load(open(os.path.join(SRC, 'bombB', 'sound.json')))['log']
    hit = next((sec(f) for f, n, o in lb if n == 'bomb_explosion'), 0.6) + sec(start['bombB'])
    put(S['fall'], hit - 2.7, 0.5, fade_in=0.1)
    # 엔딩: 낮고 큰 울림
    put(resample(S['boom'], 0.55), sec(start['end']) + 0.02, 0.55, fade_out=1.5, length=3.0)
    peak = np.abs(mix).max()
    mix = np.tanh(mix / max(peak, 1e-6) * 1.6) / np.tanh(1.6) * 0.92
    mix = mix[: int(TOTAL / FPS * SR)]
    import wave
    with wave.open(OUTF + '.wav', 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((mix * 32767).astype('<i2').tobytes())

if __name__ == '__main__':
    if 'audio' in sys.argv[3:] or len(sys.argv) <= 3: audio()
    if 'video' in sys.argv[3:] or len(sys.argv) <= 3: video()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', OUTF + '.video.mp4', '-i', OUTF + '.wav', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', OUTF], check=True)
    print('done', OUTF)
