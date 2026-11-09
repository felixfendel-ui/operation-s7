# Macht aus Papas Sprachmemos „Funksprüche vom Silberfuchs“: Funk-Klang (Bandpass), Rauschen + Piep davor/danach.
# Eingabe: stimme/start.*, stimme/halbzeit.*, stimme/finale.*  (m4a/mp3/wav/caf – z. B. Sprachmemos vom iPhone)
# Ausgabe: audio/papa-start.m4a usw. + audio/papa.json. Die App spielt sie statt der Computerstimme
# beim Intro, bei der Abholung am Kloster und beim Finale.
# Aufruf im Ordner schnitzeljagd:  python3 tools/papa_voice.py
import os, glob, json, math, random, struct, subprocess, tempfile, wave
RATE = 22050
def read_any(path):
    with tempfile.TemporaryDirectory() as td:
        w = os.path.join(td, 'in.wav')
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', 'LEI16@%d' % RATE, '-c', '1', path, w], check=True)
        with wave.open(w) as f: raw = f.readframes(f.getnframes())
    return [v / 32768 for v in struct.unpack('<%dh' % (len(raw) // 2), raw)]
def radio_fx(x):
    # Hochpass ~350 Hz, Tiefpass ~3200 Hz, leichte Sättigung -> klingt nach Funkgerät
    out, hp, lp, prev = [], 0.0, 0.0, 0.0
    a_hp = 1 / (1 + 2 * math.pi * 350 / RATE); a_lp = (2 * math.pi * 3200 / RATE) / (1 + 2 * math.pi * 3200 / RATE)
    peak = max(1e-6, max(abs(v) for v in x))
    for v in x:
        v = v / peak * 0.9
        hp = a_hp * (hp + v - prev); prev = v
        lp = lp + a_lp * (hp - lp)
        out.append(math.tanh(lp * 2.2) * 0.75 + random.uniform(-1, 1) * 0.012)
    return out
def tone(f, d, vol=0.25):
    n = int(RATE * d); return [vol * math.sin(2 * math.pi * f * i / RATE) * min(1, i / 200, (n - i) / 200) for i in range(n)]
def noise(d, vol=0.18):
    n = int(RATE * d); o = []; last = 0.0
    for i in range(n):
        last = 0.6 * last + 0.4 * random.uniform(-1, 1); o.append(vol * last * min(1, i / 300, (n - i) / 600))
    return o
def write_m4a(samples, dest):
    with tempfile.TemporaryDirectory() as td:
        w = os.path.join(td, 'x.wav')
        with wave.open(w, 'w') as f:
            f.setnchannels(1); f.setsampwidth(2); f.setframerate(RATE)
            f.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(s * 32767)))) for s in samples))
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '48000', w, dest], check=True)
made = []
for name in ['start', 'halbzeit', 'finale']:
    src = sorted(glob.glob(os.path.join('stimme', name + '.*')))
    if not src: continue
    x = radio_fx(read_any(src[0]))
    write_m4a(noise(0.5) + tone(1250, 0.09) + [0.0] * int(RATE * 0.2) + x + [0.0] * int(RATE * 0.2) + noise(0.35) + tone(900, 0.08), os.path.join('audio', 'papa-' + name + '.m4a'))
    made.append('papa-' + name); print('✓', name, '←', src[0])
json.dump(made, open(os.path.join('audio', 'papa.json'), 'w'))
print('fertig:', made or 'keine Aufnahmen in stimme/ gefunden')
