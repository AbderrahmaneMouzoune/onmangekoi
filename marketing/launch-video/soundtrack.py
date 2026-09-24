"""Bande-son du film de lancement, synthétisée de zéro (aucun sample).

Chaque son est posé à l'instant exact où l'image l'appelle dans `scene.js` :
tic-tac de l'horloge, bulles qui éclatent, impact du « Stop. », drop sur le
logo, balayages des cartes de vote, roulement de tambour du podium.

    python3 soundtrack.py soundtrack.wav
"""

import sys
import wave

import numpy as np
from scipy import signal

SR = 48000
DUR = 49.0
N = int(SR * DUR)
BPM = 120
BEAT = 60 / BPM
rng = np.random.default_rng(3)

music = np.zeros((N, 2))  # piste musicale (compressée par le kick)
fx = np.zeros((N, 2))  # bruitages, au-dessus du mix
send = np.zeros((N, 2))  # départ réverbe


def t_axis(d):
    return np.arange(int(d * SR)) / SR


def place(buf, at, x, gain=1.0, pan=0.0, rev=0.0):
    i = int(at * SR)
    if i >= N or len(x) == 0:
        return
    x = x[: N - i] * gain
    left = np.cos((pan + 1) * np.pi / 4)
    right = np.sin((pan + 1) * np.pi / 4)
    buf[i : i + len(x), 0] += x * left * np.sqrt(2)
    buf[i : i + len(x), 1] += x * right * np.sqrt(2)
    if rev:
        send[i : i + len(x), 0] += x * left * rev
        send[i : i + len(x), 1] += x * right * rev


def lp(x, f, order=2):
    b, a = signal.butter(order, min(f, SR / 2 - 100) / (SR / 2), 'low')
    return signal.lfilter(b, a, x)


def hp(x, f, order=2):
    b, a = signal.butter(order, f / (SR / 2), 'high')
    return signal.lfilter(b, a, x)


def bp(x, lo, hi, order=2):
    b, a = signal.butter(order, [lo / (SR / 2), hi / (SR / 2)], 'band')
    return signal.lfilter(b, a, x)


def env(d, a=0.005, decay=0.2):
    t = t_axis(d)
    e = np.minimum(1, t / max(a, 1e-4)) * np.exp(-np.maximum(0, t - a) / decay)
    return e


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def saw(f, d, detune=0.0):
    t = t_axis(d)
    ph = (f * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + 0.5))


# ── Instruments ──────────────────────────────────────────────


def kick(d=0.45, punch=1.0):
    t = t_axis(d)
    f = 45 + 110 * np.exp(-t * 28) * punch
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t * 7)
    click = hp(rng.standard_normal(len(t)), 2000) * np.exp(-t * 300) * 0.3
    return np.tanh((body + click) * 1.6)


def clap():
    d = 0.35
    t = t_axis(d)
    n = bp(rng.standard_normal(len(t)), 900, 5000)
    e = np.zeros(len(t))
    for off in (0, 0.011, 0.022):
        e += (t >= off) * np.exp(-np.maximum(0, t - off) * (60 if off < 0.02 else 14))
    return n * e * 0.6


def hat(open_=False):
    d = 0.3 if open_ else 0.06
    t = t_axis(d)
    n = hp(rng.standard_normal(len(t)), 7000)
    return n * np.exp(-t * (14 if open_ else 70)) * 0.35


def snare(d=0.2):
    t = t_axis(d)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t * 30)
    n = bp(rng.standard_normal(len(t)), 1500, 8000) * np.exp(-t * 22)
    return tone * 0.5 + n * 0.7


def crash(d=2.5):
    t = t_axis(d)
    n = hp(rng.standard_normal(len(t)), 4000)
    return n * np.exp(-t * 1.6) * 0.3


def pluck(note, d=0.3, bright=4000):
    t = t_axis(d)
    x = saw(midi(note), d) + 0.5 * saw(midi(note), d, 0.004)
    x = lp(x, bright)
    return x * env(d, 0.002, d / 4)


def pad(notes, d, cutoff=1800, attack=0.6):
    t = t_axis(d)
    x = np.zeros(len(t))
    for n in notes:
        for det in (-0.006, 0, 0.005):
            x += saw(midi(n), d, det)
    x = lp(x / (len(notes) * 3), cutoff, 2)
    e = np.minimum(1, t / attack) * np.minimum(1, (d - t) / 0.4)
    return x * np.clip(e, 0, 1)


def stab(notes, d=0.22, cutoff=3200):
    x = np.zeros(int(d * SR))
    for n in notes:
        x += saw(midi(n), d) + 0.6 * saw(midi(n), d, 0.007)
    x = lp(x / len(notes), cutoff)
    return x * env(d, 0.003, 0.08)


def bass(note, d):
    t = t_axis(d)
    f = midi(note)
    x = np.sin(2 * np.pi * f * t) + 0.35 * saw(f, d)
    x = lp(x, 600)
    return np.tanh(x * 1.5) * env(d, 0.004, d * 0.7)


def bell(note, d=2.5):
    t = t_axis(d)
    f = midi(note)
    mod = np.sin(2 * np.pi * f * 3.5 * t) * 2.2 * np.exp(-t * 3)
    return np.sin(2 * np.pi * f * t + mod) * np.exp(-t * 2.2)


def tick(high=True):
    t = t_axis(0.05)
    f = 3200 if high else 2400
    return np.sin(2 * np.pi * f * t) * np.exp(-t * 180) + hp(
        rng.standard_normal(len(t)), 3000
    ) * np.exp(-t * 400) * 0.4


def pop(pitch=1.0):
    d = 0.12
    t = t_axis(d)
    f = 700 * pitch * (1 + 1.5 * np.exp(-t * 60))
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 40)


def whoosh(d, up=True, lo=300, hi=6000):
    t = t_axis(d)
    n = rng.standard_normal(len(t))
    k = t / d if up else 1 - t / d
    out = np.zeros(len(t))
    # Filtre qui balaie : on découpe en tranches courtes
    step = int(0.01 * SR)
    zi = None
    for s in range(0, len(t), step):
        fc = lo * (hi / lo) ** k[s]
        b, a = signal.butter(2, [fc * 0.6 / (SR / 2), min(fc * 1.6, SR / 2 - 100) / (SR / 2)], 'band')
        if zi is None:
            zi = signal.lfilter_zi(b, a) * 0
        out[s : s + step], zi = signal.lfilter(b, a, n[s : s + step], zi=zi)
    shape = (k**2) if up else (1 - t / d) ** 1.5 * np.minimum(1, t / 0.03)
    return out * shape


def impact():
    d = 3.0
    t = t_axis(d)
    f = 30 + 70 * np.exp(-t * 9)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 1.4)
    n = lp(rng.standard_normal(len(t)), 1800) * np.exp(-t * 6)
    return np.tanh((sub * 1.2 + n * 0.6) * 1.5)


def sparkle(at, notes, step=0.06, gain=0.12, pan_spread=0.6):
    for i, n in enumerate(notes):
        place(fx, at + i * step, bell(n, 1.2), gain, pan=((i % 3) - 1) * pan_spread, rev=0.5)


# ════════════════════════════════════════════════════════════
# 1 · Midi (0 → 6)
# ════════════════════════════════════════════════════════════
for i in range(6):
    place(fx, i * 0.5, tick(i % 2 == 0), 0.35, pan=-0.2 if i % 2 else 0.2, rev=0.2)
place(music, 0, pad([45, 52, 57], 3.2, cutoff=500, attack=2.5), 0.35, rev=0.3)
place(fx, 3.0, bell(81, 3.5), 0.22, rev=0.6)
place(fx, 3.0, bell(88, 3.0), 0.12, pan=0.3, rev=0.6)
place(fx, 3.0, impact()[: int(1.5 * SR)], 0.35)
place(music, 3.0, pad([45, 52, 60, 64], 3.0, cutoff=900, attack=0.4), 0.4, rev=0.5)
for i, at in enumerate((3.5, 4.1, 4.6)):
    place(fx, at, whoosh(0.45, up=False, lo=800, hi=4000), 0.12)

# ════════════════════════════════════════════════════════════
# 2 · Le chaos (6 → 13) — tension qui monte, chaque bulle éclate
# ════════════════════════════════════════════════════════════
n_msg = 26
for i in range(n_msg):
    at = 6.15 + 5.9 * (i / n_msg) ** 1.7
    place(fx, at, pop(0.8 + (i * 7 % 11) / 11), 0.3, pan=((i * 5 % 9) / 4.5) - 1, rev=0.15)
for b in range(int((12.5 - 6.0) / (BEAT / 2))):
    at = 6.0 + b * BEAT / 2
    tension = (at - 6) / 6.5
    place(music, at, bass(33, BEAT / 2 * 0.9), 0.45 + 0.3 * tension)
    place(music, at + BEAT / 4, hat(), 0.4 + 0.5 * tension, pan=0.3)
    if b % 2 == 0 and at >= 9.0:
        place(music, at, kick(0.3, 0.6), 0.5 * tension)
place(music, 6.0, pad([45, 48, 52, 56], 6.9, cutoff=1200, attack=4), 0.3, rev=0.4)
place(fx, 9.3, whoosh(3.6, up=True, lo=200, hi=9000), 0.55)
# roulement de caisse claire qui accélère avant la coupure
for k in range(40):
    at = 11.0 + 1.9 * (1 - (1 - k / 40) ** 1.6)
    place(music, at, snare(0.08), 0.1 + 0.35 * k / 40)
place(fx, 12.35, whoosh(0.6, up=False, lo=400, hi=5000), 0.3)

# ════════════════════════════════════════════════════════════
# 3 · Stop (13 → 16) — silence, impact, puis aspiration
# ════════════════════════════════════════════════════════════
place(fx, 13.0, impact(), 0.95, rev=0.6)
place(music, 14.05, pad([53, 57, 60, 64], 1.9, cutoff=1400, attack=0.3), 0.35, rev=0.6)
place(fx, 14.05, bell(76, 2.0), 0.1, rev=0.6)
place(fx, 14.3, bell(79, 2.0), 0.1, rev=0.6)
place(fx, 15.0, pop(1.3), 0.5, rev=0.3)
rev_swell = whoosh(1.0, up=True, lo=300, hi=12000)
place(fx, 15.0, rev_swell, 0.7)
place(fx, 15.4, -np.flip(crash(0.6)), 0.8)

# ════════════════════════════════════════════════════════════
# 4 → 7 · Le drop (16 → 44) : 120 BPM, F – C – Dm – Bb
# ════════════════════════════════════════════════════════════
chords = [
    ([53, 57, 60, 64], 41),  # Fmaj7
    ([52, 55, 60, 64], 36),  # C/E
    ([50, 53, 57, 60], 38),  # Dm7
    ([50, 53, 58, 62], 34),  # Bbmaj7
]
arp_notes = {0: [65, 69, 72, 76], 1: [64, 67, 72, 76], 2: [62, 65, 69, 72], 3: [62, 65, 70, 74]}

drop_start, drop_end = 16.0, 44.0
kicks = []
roll_zone = (34.5, 36.2)
for b in range(int((drop_end - drop_start) / BEAT)):
    at = drop_start + b * BEAT
    bar = b // 4
    ci = bar % 4
    notes, root = chords[ci]
    beat_in_bar = b % 4
    in_roll = roll_zone[0] <= at < roll_zone[1]
    intro = at < 17.0  # une mesure plus aérée sur l'arrivée du logo

    if not in_roll:
        kicks.append(at)
        place(music, at, kick(), 0.95)
        if beat_in_bar in (1, 3) and not intro:
            place(music, at, clap(), 0.55, rev=0.25)
        place(music, at + BEAT / 2, hat(open_=beat_in_bar % 2 == 1), 0.35, pan=0.25)
        place(music, at + BEAT / 4, hat(), 0.15, pan=-0.3)
        place(music, at + 3 * BEAT / 4, hat(), 0.15, pan=-0.3)
        # basse en croches décalées
        place(music, at + BEAT / 2, bass(root, BEAT / 2 * 0.85), 0.55)
        place(music, at, bass(root, BEAT / 2 * 0.6), 0.35)
        # stabs d'accord sur les contretemps
        if not intro:
            place(music, at + BEAT / 2, stab(notes), 0.2, pan=0.15 * (1 if b % 2 else -1), rev=0.3)
    if beat_in_bar == 0:
        place(music, at, pad(notes, BEAT * 4, cutoff=2200, attack=0.15), 0.18, rev=0.4)
    # arpège aigu en doubles-croches sur la démo produit et le podium
    if 21.0 <= at < 40.0 and not in_roll:
        arp = arp_notes[ci]
        for s in range(4):
            place(music, at + s * BEAT / 4, pluck(arp[(beat_in_bar * 4 + s) % 4] + 12, 0.18, 5000), 0.07,
                  pan=0.5 * (1 if s % 2 else -1), rev=0.35)

place(fx, 16.0, crash(3.0), 0.6, rev=0.4)
place(fx, 16.0, impact()[: int(1.2 * SR)], 0.6)
sparkle(16.35, [77, 81, 84, 89, 93], 0.07, 0.1)
sparkle(17.15, [84, 88, 91, 96], 0.05, 0.06)

# Plongée dans le point : aspiration
place(fx, 20.2, whoosh(0.8, up=True, lo=200, hi=10000), 0.6)
place(fx, 21.0, crash(2.0), 0.35, rev=0.3)

# Démo produit : clics, coches, pastilles, balayages
for i in range(5):
    place(fx, 21.6 + i * 0.12, pop(1.6), 0.08)
for i in range(4):
    place(fx, 22.6 + i * 0.28, pluck(84 + [0, 4, 7, 12][i], 0.2, 7000), 0.12, rev=0.3)
place(fx, 24.35, tick(), 0.4)
for at in (25.0, 29.0, 34.0):
    place(fx, at - 0.25, whoosh(0.55, up=False, lo=500, hi=7000), 0.3)
for i in range(6):
    place(fx, 25.3 + i * 0.1, tick(i % 2 == 0), 0.2, pan=-0.3 + i * 0.12)
for i, at in enumerate((26.3, 26.8, 27.25, 27.65, 28.0)):
    place(fx, at, pluck(79 + [0, 2, 4, 7, 9][i], 0.3, 6000), 0.14, pan=-0.4 if i % 2 == 0 else 0.4, rev=0.3)
    place(fx, at, pop(1.2), 0.12)
for i, at in enumerate((29.9, 30.95, 31.95, 32.9)):
    place(fx, at - 0.3, tick(), 0.25)
    place(fx, at, whoosh(0.4, up=False, lo=600, hi=8000), 0.4, pan=[0, 0.6, 0, -0.6][i])
place(fx, 33.3, pluck(84, 0.5, 6000), 0.15, rev=0.4)
place(fx, 33.42, pluck(91, 0.6, 6000), 0.15, rev=0.4)

# Podium : blocs qui montent, roulement, explosion
for at in (34.5, 34.9, 35.5):
    place(fx, at, kick(0.5, 1.4), 0.5)
    place(fx, at, whoosh(0.5, up=True, lo=200, hi=3000), 0.2)
for k in range(48):
    at = roll_zone[0] + (roll_zone[1] - roll_zone[0]) * k / 48
    place(music, at, snare(0.1), 0.12 + 0.45 * (k / 48) ** 1.5, pan=0.15 * (1 if k % 2 else -1))
place(fx, 36.2, impact()[: int(1.5 * SR)], 0.7)
place(fx, 36.2, crash(3.5), 0.7, rev=0.5)
sparkle(36.25, [84, 88, 91, 96, 100, 103, 108], 0.045, 0.09, 0.8)
place(fx, 37.3, bell(84, 2.0), 0.08, rev=0.5)

# Mots-chocs : un coup par phrase
for i, at in enumerate((40.0, 41.0, 42.0, 43.0)):
    notes, _ = chords[i % 4]
    place(fx, at, stab([n + 12 for n in notes], 0.6, 5000), 0.3, rev=0.5)
    place(fx, at, crash(1.0), 0.3)
    place(fx, at - 0.3, whoosh(0.3, up=True, lo=500, hi=9000), 0.25)

# ════════════════════════════════════════════════════════════
# 8 · Fin (44 → 49) — accord final, longue queue
# ════════════════════════════════════════════════════════════
place(fx, 44.0, impact()[: int(2.0 * SR)], 0.6)
place(fx, 44.0, crash(4.0), 0.5, rev=0.6)
place(music, 44.0, pad([41, 53, 57, 60, 64, 67], 5.0, cutoff=2600, attack=0.05), 0.45, rev=0.7)
place(music, 44.0, bass(29, 4.0), 0.6)
sparkle(44.05, [77, 81, 84, 88, 89, 93], 0.08, 0.1)
place(fx, 45.6, pluck(84, 0.8, 5000), 0.15, rev=0.5)
place(fx, 45.7, pluck(88, 0.8, 5000), 0.12, rev=0.5)
place(fx, 45.8, pluck(91, 1.0, 5000), 0.12, rev=0.5)

# ── Sidechain : la musique respire sous chaque kick ─────────
duck = np.ones(N)
dk = t_axis(0.3)
shape = 1 - 0.55 * np.exp(-dk * 14)
for at in kicks:
    i = int(at * SR)
    j = min(N, i + len(shape))
    duck[i:j] = np.minimum(duck[i:j], shape[: j - i])
music *= duck[:, None]

# ── Réverbe (convolution par un bruit à décroissance exponentielle) ──
ir_t = t_axis(2.4)
ir = np.stack(
    [lp(rng.standard_normal(len(ir_t)), 6000) * np.exp(-ir_t * 2.6) for _ in range(2)],
    axis=1,
)
ir /= np.sqrt((ir**2).sum(axis=0))
wet = np.stack([signal.fftconvolve(send[:, c], ir[:, c])[:N] for c in range(2)], axis=1)

mix = music * 0.8 + fx * 0.9 + wet * 0.55

# ── Master : coupe-bas, saturation douce, normalisation, fondu ──
mix = np.stack([hp(mix[:, c], 28) for c in range(2)], axis=1)
mix = np.tanh(mix * 0.9)
mix /= np.max(np.abs(mix)) / 0.93
tt = np.arange(N) / SR
mix *= np.clip((DUR - tt) / 1.4, 0, 1)[:, None]

out = sys.argv[1] if len(sys.argv) > 1 else 'soundtrack.wav'
with wave.open(out, 'wb') as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((mix * 32767).astype('<i2').tobytes())
print(out)
