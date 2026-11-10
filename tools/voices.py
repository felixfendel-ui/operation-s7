# Nimmt alle Funksprüche als Audiodateien auf (macOS: say + afconvert), mit Funkrauschen davor/danach.
# Die App spielt sie wie Sprachnachrichten ab – funktioniert auf jedem iPhone, auch mit Stummschalter.
# Aufruf im Ordner schnitzeljagd:  python3 tools/voices.py   (danach committen)
import json, os, re, struct, subprocess, tempfile, wave, random, math

VOICE = 'Reed (Deutsch (Deutschland))'  # genau diese Schreibweise – „Reed“ allein ist die ENGLISCHE Stimme
_voices = subprocess.run(['say', '-v', '?'], capture_output=True, text=True).stdout
if not any(l.startswith(VOICE) and 'de_DE' in l for l in _voices.splitlines()):
    raise SystemExit('Deutsche Stimme nicht gefunden: ' + VOICE)
EN_VOICE = 'Daniel'  # britisch (en_GB) – die „MI6-Zentrale“ für die englischen Funk-Rahmen
if not any(l.startswith(EN_VOICE + ' ') and 'en_' in l for l in _voices.splitlines()):
    raise SystemExit('Englische Stimme nicht gefunden: ' + EN_VOICE)
RATE = 22050
FX = 'agent-2'  # bei Klangänderung erhöhen → alle Funksprüche werden neu aufgenommen
OUT = 'audio'

def fnv(s):  # FNV-1a über UTF-16-Codeeinheiten – identisch zur App (fun.js)
    h = 0x811c9dc5
    b = s.encode('utf-16-le')
    for i in range(0, len(b), 2):
        h ^= b[i] | (b[i + 1] << 8)
        h = (h * 0x01000193) & 0xffffffff
    return format(h, '08x')

EMOJI = re.compile('[\U0001F000-\U0001FAFF☀-➿️‍]')
def speech(t):
    t = t.replace('Agent {name}', 'Agent').replace('{name}', 'Agent')
    t = t.replace('**', '')
    t = EMOJI.sub('', t)
    t = re.sub('[•·–]', ' ', t).replace('→', ' zu ').replace('„', '').replace('“', '').replace('|', ' ')
    return re.sub(r'\s+', ' ', t).strip()

def tone(freq, dur, vol=0.25):
    n = int(RATE * dur)
    return [vol * math.sin(2 * math.pi * freq * i / RATE) * min(1, i / 200, (n - i) / 200) for i in range(n)]
def noise(dur, vol=0.18):
    n = int(RATE * dur); out = []; last = 0.0
    for i in range(n):
        last = 0.6 * last + 0.4 * random.uniform(-1, 1)   # gedämpftes Rauschen, klingt nach Funk
        fade = min(1, i / 300, (n - i) / 600)
        out.append(vol * last * fade)
    return out
def silence(dur): return [0.0] * int(RATE * dur)

def read_wav(path):
    with wave.open(path) as w:
        raw = w.readframes(w.getnframes())
    return [v / 32768 for v in struct.unpack('<%dh' % (len(raw) // 2), raw)]

def write_m4a(samples, dest):
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 'x.wav')
        with wave.open(wav, 'w') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(RATE)
            w.writeframes(b''.join(struct.pack('<h', max(-32767, min(32767, int(s * 32767)))) for s in samples))
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', '40000', wav, dest], check=True)

def say(text, voice=VOICE, rate=178, deep=0.0):
    """deep>0 senkt die Stimme (schneller sprechen, dann langsamer abspielen → tiefer, gleiches Tempo)."""
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 's.wav')
        r = int(rate / (1 - deep)) if deep else rate
        subprocess.run(['say', '-v', voice, '-r', str(r), '-o', wav, '--data-format=LEI16@%d' % RATE, text], check=True)
        x = read_wav(wav)
    if not deep: return x
    f = 1 - deep; n = int(len(x) / f) - 1; out = []
    for i in range(n):
        p = i * f; j = int(p); a = p - j
        out.append(x[j] * (1 - a) + x[j + 1] * a)
    return out

def biquad(x, kind, f0, q=0.707):  # RBJ-Filter: Hoch-/Tiefpass
    w = 2 * math.pi * f0 / RATE; al = math.sin(w) / (2 * q); c = math.cos(w)
    if kind == 'lp': b0, b1, b2 = (1 - c) / 2, 1 - c, (1 - c) / 2
    else:            b0, b1, b2 = (1 + c) / 2, -(1 + c), (1 + c) / 2
    a0, a1, a2 = 1 + al, -2 * c, 1 - al
    b0, b1, b2, a1, a2 = b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0
    y = []; x1 = x2 = y1 = y2 = 0.0
    for v in x:
        o = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2, x1, y2, y1 = x1, v, y1, o; y.append(o)
    return y

def walkie(x, drive=2.4, hiss=0.012):
    """Funkgerät-Klang: schmalbandig (Telefon-Band), leicht übersteuert, mit leisem Rauschen darunter."""
    x = biquad(biquad(biquad(x, 'hp', 320), 'hp', 320), 'lp', 3300)
    x = biquad(x, 'lp', 3300)
    t = math.tanh(drive); last = 0.0; out = []
    for v in x:
        last = 0.5 * last + 0.5 * random.uniform(-1, 1)
        out.append(0.8 * math.tanh(drive * v * 1.6) / t + hiss * last)
    return out

def chirp(f1, f2, dur, vol=0.22):  # Datenburst / Verschlüsselungs-Zwitschern
    n = int(RATE * dur); ph = 0.0; out = []
    for i in range(n):
        ph += 2 * math.pi * (f1 + (f2 - f1) * i / n) / RATE
        out.append(vol * (1 if math.sin(ph) > 0 else -1) * 0.5 * min(1, i / 80, (n - i) / 80))
    return out

def databurst(seed):
    r = random.Random(seed); out = []
    for _ in range(7):
        a = r.choice([900, 1400, 1900, 2400]); out += chirp(a, a + r.choice([-500, 600]), 0.045, 0.14)
    return out

def click(): return noise(0.03, 0.5)

# Englische Agenten-Rahmen (einfaches Englisch – 12-Jährige verstehen das)
EN = {
    'intro':   (['Attention. This is Silver Fox. Encrypted channel open.'], ['Silver Fox, over.']),
    'mission': (['Incoming transmission.', 'Silver Fox to field team. Do you copy?', 'Priority message. Listen carefully.', 'New orders, agents.'],
                ['Silver Fox, over.', 'Over.', 'Move out. Over.', 'Good luck, agents. Over.']),
    'story':   (['Incoming transmission.', 'Intercepted message. Decoding now.', 'Silver Fox to field team.', 'Attention, agents. Eyes open.'],
                ['Silver Fox, over.', 'Over.', 'Waiting for your answer. Over.']),
    'solved':  (['Code confirmed.', 'Excellent work, agents.', 'Well done. Mission accomplished.', 'Affirmative. Correct.'],
                ['Stand by for new orders. Over.', 'Silver Fox, over.', 'Keep moving. Over.']),
    'task':    (['Special assignment. Top secret.', 'Eyes only, agents. Special assignment.'], ['Silver Fox, out.', 'Over.']),
    'finale':  (['Final transmission. All agents, listen carefully.'], ['Silver Fox, over and out.']),
    'test':    (['Radio check. One, two, three.'], ['Signal is loud and clear. Over.']),
}

def radio(text, kind='story', h=''):
    r = random.Random(h + FX)
    o, c = EN.get(kind, EN['story'])
    opener = r.choice(o); closer = r.choice(c)
    voice = walkie(say(opener, EN_VOICE, 170, 0.06) + silence(0.35) + say(speech(text), VOICE, 176, 0.11)
                   + silence(0.45) + say(closer, EN_VOICE, 170, 0.06))
    head = noise(0.35) + click() + databurst(h) + silence(0.12) + tone(1250, 0.07) + silence(0.15)
    tail = silence(0.2) + tone(1000, 0.06) + silence(0.04) + tone(1000, 0.06) + click() + noise(0.25)
    return head + voice + tail

def morse(word):
    M = {'A':'.-','D':'-..','E':'.','I':'..','K':'-.-','M':'--','N':'-.','O':'---','R':'.-.','S':'...','T':'-','U':'..-'}
    u = 0.13; out = silence(0.1)
    for ch in word:
        for s in M[ch]:
            out += tone(660, u if s == '.' else 3 * u, 0.35) + silence(u)
        out += silence(2 * u)
    return out

d = json.load(open('stations.json', encoding='utf-8'))
texts = {d['intro']: 'intro', 'Hier spricht der Silberfuchs. Wenn du mich hörst, funktioniert der Funk.': 'test'}
lock = ('Der Code lautet: ' + ' '.join(str(d['lockCode']))) if d.get('lockCode') else ''
texts[d['finale'] + ' ' + lock] = 'finale'
for st in d['stations']:
    if st.get('mission'): texts[st['mission']] = 'mission'
    if st.get('solved'): texts[st['solved']] = 'solved'
    if st.get('task'): texts['Spezialauftrag! ' + st['task']['text']] = 'task'
    if st.get('morse'):
        texts[st['story'] + '. ' + (st.get('teamQ') or '')] = 'story'
    else:
        texts[st['story'] + '. ' + st['riddle']] = 'story'
        for t in 'AB':
            if st.get('clue' + t):
                texts[st['story'] + '. ' + st['clue' + t] + '. ' + (st.get('teamQ') or '')] = 'story'

os.makedirs(OUT, exist_ok=True)
wanted = {fnv(t): t for t in texts if t}
fxfile = os.path.join(OUT, '.fx')
fresh = not os.path.exists(fxfile) or open(fxfile).read().strip() != FX
for f in os.listdir(OUT):                       # veraltete Aufnahmen entfernen
    if f.endswith('.m4a') and f[:-4] not in wanted and not f.startswith(('morse-', 'test', 'papa')):
        os.remove(os.path.join(OUT, f))
for i, (h, t) in enumerate(sorted(wanted.items())):
    dest = os.path.join(OUT, h + '.m4a')
    if fresh or not os.path.exists(dest):
        write_m4a(radio(t, texts[t], h), dest)
    print(f'{i + 1}/{len(wanted)} {h}  {speech(t)[:60]}')
for st in d['stations']:
    if st.get('morse'):
        write_m4a(morse(st['morse']), os.path.join(OUT, 'morse-' + st['morse'] + '.m4a'))
write_m4a(tone(880, 0.4) + silence(0.1) + tone(1320, 0.4), os.path.join(OUT, 'test.m4a'))
open(fxfile, 'w').write(FX)
json.dump(sorted(wanted), open(os.path.join(OUT, 'index.json'), 'w'))
print('fertig:', len(wanted), 'Funksprüche')
