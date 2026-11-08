# Nimmt alle Funksprüche als Audiodateien auf (macOS: say + afconvert), mit Funkrauschen davor/danach.
# Die App spielt sie wie Sprachnachrichten ab – funktioniert auf jedem iPhone, auch mit Stummschalter.
# Aufruf im Ordner schnitzeljagd:  python3 tools/voices.py   (danach committen)
import json, os, re, struct, subprocess, tempfile, wave, random, math

VOICE = 'Reed (Deutsch (Deutschland))'  # genau diese Schreibweise – „Reed“ allein ist die ENGLISCHE Stimme
_voices = subprocess.run(['say', '-v', '?'], capture_output=True, text=True).stdout
if not any(l.startswith(VOICE) and 'de_DE' in l for l in _voices.splitlines()):
    raise SystemExit('Deutsche Stimme nicht gefunden: ' + VOICE)
RATE = 22050
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

def say(text):
    with tempfile.TemporaryDirectory() as td:
        wav = os.path.join(td, 's.wav')
        subprocess.run(['say', '-v', VOICE, '-r', '178', '-o', wav, '--data-format=LEI16@%d' % RATE, text], check=True)
        return read_wav(wav)

def radio(text):
    return noise(0.45) + tone(1250, 0.09) + silence(0.2) + say(speech(text)) + silence(0.25) + noise(0.3) + tone(900, 0.08)

def morse(word):
    M = {'A':'.-','D':'-..','E':'.','I':'..','K':'-.-','M':'--','N':'-.','O':'---','R':'.-.','S':'...','T':'-','U':'..-'}
    u = 0.13; out = silence(0.1)
    for ch in word:
        for s in M[ch]:
            out += tone(660, u if s == '.' else 3 * u, 0.35) + silence(u)
        out += silence(2 * u)
    return out

d = json.load(open('stations.json', encoding='utf-8'))
texts = {d['intro'], 'Hier spricht der Silberfuchs. Wenn du mich hörst, funktioniert der Funk.'}
lock = ('Der Code lautet: ' + ' '.join(str(d['lockCode']))) if d.get('lockCode') else ''
texts.add(d['finale'] + ' ' + lock)
for st in d['stations']:
    if st.get('mission'): texts.add(st['mission'])
    if st.get('solved'): texts.add(st['solved'])
    if st.get('task'): texts.add('Spezialauftrag! ' + st['task']['text'])
    if st.get('morse'):
        texts.add(st['story'] + '. ' + (st.get('teamQ') or ''))
    else:
        texts.add(st['story'] + '. ' + st['riddle'])
        for t in 'AB':
            if st.get('clue' + t):
                texts.add(st['story'] + '. ' + st['clue' + t] + '. ' + (st.get('teamQ') or ''))

os.makedirs(OUT, exist_ok=True)
wanted = {fnv(t): t for t in texts if t}
for f in os.listdir(OUT):                       # veraltete Aufnahmen entfernen
    if f.endswith('.m4a') and f[:-4] not in wanted and not f.startswith(('morse-', 'test')):
        os.remove(os.path.join(OUT, f))
for i, (h, t) in enumerate(sorted(wanted.items())):
    dest = os.path.join(OUT, h + '.m4a')
    if not os.path.exists(dest):
        write_m4a(radio(t), dest)
    print(f'{i + 1}/{len(wanted)} {h}  {speech(t)[:60]}')
for st in d['stations']:
    if st.get('morse'):
        write_m4a(morse(st['morse']), os.path.join(OUT, 'morse-' + st['morse'] + '.m4a'))
write_m4a(tone(880, 0.4) + silence(0.1) + tone(1320, 0.4), os.path.join(OUT, 'test.m4a'))
json.dump(sorted(wanted), open(os.path.join(OUT, 'index.json'), 'w'))
print('fertig:', len(wanted), 'Funksprüche')
