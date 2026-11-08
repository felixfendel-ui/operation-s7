# Operation S7 – Der Isar-Code

GPS-Schnitzeljagd als mobile Web-App (reines HTML/CSS/JS, keine Abhängigkeiten, offline-fähig).
Route: Hohenschäftlarn → Wolfratshausen → Ebenhausen → Kloster Schäftlarn → Höllriegelskreuth → Pullach → zurück. Dauer ca. 4 h.

## Route (10 Stationen, Codewort ISARAGENT)

Die Fragmente sind **verschlüsselt** (Geheimalphabet, kein Caesar-Verschieben), damit man das Codewort nicht vorzeitig erraten kann. Erst am Finale zeigt die App die Geheimtabelle mit Täusch-Einträgen; damit wird aus `QWMZMKFXB` das Wort ISARAGENT.

| # | Station | Anreise | Lösung | Fragment (Klartext) |
|---|---------|---------|--------|----------|
| 1 | Hauptquartier (zu Hause) – Briefing | – | 7 | Q (I) |
| 2 | S-Bahnhof Hohenschäftlarn | zu Fuß ~12 min | Biber | W (S) |
| 3 | Bahnhof Wolfratshausen | S7 → Wolfratshausen, 3 Stationen | Loisach | M (A) |
| 4 | Marienplatz Wolfratshausen | zu Fuß ~10 min | 7 | Z (R) |
| 5 | S-Bahnhof Ebenhausen-Schäftlarn | S7 → München, 2 Stationen | 65 | M (A) |
| 6 | Kloster Schäftlarn | zu Fuß ~20 min bergab | 12 | K (G) |
| 7 | Aussichtspunkt Burg Grünwald | 🚐 Abholung am Kloster (Papa = „Graufalke“, Verpflegung) zum Bf Hohenschäftlarn, S7 → Höllriegelskreuth | 2 | F (E) |
| 8 | Kirche Heilig Geist, Pullach | zu Fuß am Isar-Hochufer ~25 min | 4518 | X (N) |
| 9 | S-Bahnhof Pullach | zu Fuß ~5 min | 30 | B (T) |
| 10 | Hauptquartier – Tresor | S7 → Wolfratshausen bis Hohenschäftlarn, zu Fuß | ISARAGENT | – |

Am Ende zeigt die App den **Tresor-Code** (`lockCode` in `stations.json`). Passend dazu ein Zahlenschloss an die Geschenk-Kiste hängen – Code vorher im Admin-Modus unter „Spiel-Einstellungen“ oder direkt in `stations.json` anpassen.

## Admin-Modus

5× schnell auf das S7-Logo tippen (oder `?admin` an die URL hängen), PIN `1212` (änderbar).

- **Aktuelle Position als neue Station** – erfasst die GPS-Position, danach Texte/Lösung im Editor ergänzen
- **📍 Hier setzen** – Koordinaten einer bestehenden Station mit der aktuellen Position überschreiben
- **Simulation** – „Am Ziel“ / „300 m vor Ziel“ zum Testen am Schreibtisch
- **Spiel hierher / Station freischalten / Fortschritt zurücksetzen**
- **JSON herunterladen / kopieren / importieren**

Admin-Änderungen werden nur **auf diesem Gerät** gespeichert (localStorage). Damit sie für alle gelten: JSON exportieren und `stations.json` im Repository ersetzen.

## Team-Modus: alle 8 Kinder auf eigenen Handys

Ein Team, zwei Trupps (🟥 A und 🟦 B), gemeinsamer Spielstand in Echtzeit.

- **Geteilte Geheimakten:** An jeder Station sieht Trupp A nur die eine Hälfte der Hinweise, Trupp B die andere (`clueA`/`clueB`, gemeinsame Frage `teamQ`). Allein ist kein Rätsel eindeutig lösbar – die Trupps müssen sich ihre Akten vorlesen. Beim Finale hat jeder Trupp eine Hälfte der Geheimtabelle, die verschlüsselten Fragmente hat nur Jasper.
- **Rollen wechseln an jeder Station:** 🧭 Navigator (einer pro Trupp, nur er sieht den Richtungspfeil; die anderen sehen Entfernung und „heiß/kalt“), 🔐 Codeknacker (einer fürs ganze Team, nur er kann die Lösung eintippen), alle anderen 🕵️ Agenten. Jasper ist ⭐ Einsatzleiter und knackt den Tresor.
- **Notfälle:** „Navigator ausgefallen? Pfeil hier anzeigen“ auf jedem Handy, „Codeknacker ausgefallen? Selbst eingeben“ auf Jaspers Handy.
- Freischalten kann jedes Handy, das am Ziel ankommt. Tipps, „Weiter“ und Lösungen landen sofort bei allen.

**Einrichten (zu Hause, vor dem Start):**
1. Auf Jaspers Handy: Admin-Modus → „👥 Team-Modus einrichten“. Es erscheint ein QR-Code (später jederzeit über den Knopf **👥 Team** unten links).
2. Die anderen Kinder scannen den QR-Code mit der Handy-Kamera, geben ihren Namen ein und erlauben Standort + Kompass. Die Trupps werden abwechselnd verteilt; im Team-Panel kann man durch Antippen tauschen.
3. Jasper startet die Mission – alle Handys springen gleichzeitig los.

**Wichtig:** Jaspers Handy ist die Zentrale. Die App hält den Bildschirm automatisch wach; trotzdem sollte die App auf Jaspers Handy offen bleiben (Powerbank!). Ist sie kurz zu, holt sie verpasste Aktionen beim Öffnen nach. Die Handys der anderen Kinder verschicken **keine** Standorte – nur Spielaktionen und den Vornamen. Der grüne/rote Punkt oben rechts zeigt die Verbindung.

## Einladung vorab per Link

Admin-Modus auf **Jaspers Handy** → „💌 Einladung erstellen“: Datum, Uhrzeit, Ende, Treffpunkt, Telefonnummer für Zusagen, „Antwort bis“, Ausrüstung und Eltern-Infos eintragen → „Speichern & Link erzeugen“ → „🔗 Einladung teilen“ (z. B. in die WhatsApp-Gruppe).

- Die Kinder sehen eine geheime „Einberufung“ mit Countdown, tragen ihren Agentennamen ein und sagen per WhatsApp (oder SMS) zu. Eltern finden unten „Infos für Eltern“.
- Das Spiel bleibt versiegelt. Am Einsatztag öffnen die Kinder **denselben Link** wieder, melden sich automatisch im Team an und starten, sobald Jasper die Mission startet.
- Testläufe auf Jaspers Handy vor dem Einsatztag landen nicht bei den Gästen. Danach trotzdem „Fortschritt zurücksetzen“.
- Der Einladungslink ist zugleich der Team-Link. Im Admin-Modus deshalb **nicht** „Team-Modus beenden“, sonst funktioniert die verschickte Einladung am Tag nicht mehr.
- Datum, Treffpunkt und Telefonnummer stecken nur im Link (Teil nach `#`), nicht im öffentlichen Repository und nicht auf einem Server. Wer den Link hat, sieht sie – also nur an die Gäste schicken.

## Live-Verbindung zu Papa (ntfy.sh)

Jaspers App meldet jedes Ereignis (Station erreicht, falsche Antwort, Tipp genutzt, gelöst, Mission erfüllt) und alle 2 Minuten seine Position. Über den gelben **📻 Funk**-Knopf kann er Papa schreiben (Schnellknöpfe: Tipp gebraucht, Alles gut, In der S-Bahn, Bitte anrufen, Verlaufen). Papas Antworten erscheinen bei Jasper als Einblendung mit Ton.

**Einrichten (auf Jaspers Handy, vor dem Start):**
1. Admin-Modus öffnen → „📡 Live-Verbindung einrichten“. Es wird ein geheimer Zufallskanal erzeugt (nur auf diesem Gerät gespeichert, nicht im Repository).
2. „🔗 Papa-Link teilen“ → an Papas Handy schicken. Der Link öffnet die **Papa-Zentrale**: Karte mit Route und Spur, aktueller Stand, Rätsel mit Lösung und Tipp, Verlauf, Chat mit Schnellantworten („💡 Tipp schicken“ sendet den Tipp der aktuellen Station).
3. Für Push-Benachrichtigungen: App **ntfy** (iOS/Android) installieren → Kanal abonnieren → Server `ntfy.sh`, Kanalname `<kanal>-log` (steht im Admin-Bereich). Über den Kanal `<kanal>-papa` kann Papa auch direkt aus der ntfy-App antworten.
4. „📨 Testnachricht“ drücken – sie sollte auf Papas Handy ankommen.

**Gut zu wissen:**
- Updates kommen nur, solange die App auf Jaspers Handy geöffnet ist (sie hält den Bildschirm wach). Wird sie trotzdem gesperrt, pausiert der Browser; die Papa-Zentrale zeigt dann „seit X Min. keine Meldung“. Nachrichten aus Funklöchern werden automatisch nachgesendet.
- Datenschutz: ntfy.sh ist ein öffentlicher Dienst; die Daten (Name, Position, Nachrichten) sind nicht verschlüsselt und nur durch den geheimen Kanalnamen geschützt. ntfy.sh löscht sie nach ca. 12 Stunden. Den Papa-Link nicht weitergeben; nach der Feier im Admin-Modus „Live aus“ oder einen neuen Kanal erzeugen.
- Nach Testläufen in der Papa-Zentrale „🧹 Ansicht leeren“ drücken.

## Stationsformat (`stations.json`)

```json
{
  "id": "bf-pullach", "title": "S-Bahnhof Pullach", "targetName": "S-Bahnhof Pullach",
  "lat": 48.05896, "lon": 11.52184, "radius": 60,
  "mission": "Text während der Anreise", "story": "Text bei Ankunft",
  "riddle": "Rätsel", "answers": ["30", "dreissig"], "hint": "Tipp",
  "fragment": "T", "solved": "Text nach dem Lösen (inkl. Weg zur nächsten Station)",
  "free": false, "final": false
}
```

Formatierung in Texten: `**fett**`, Zeilenumbruch `\n`, `{name}` = Agentenname. Antworten werden ohne Groß/Kleinschreibung, Leerzeichen und Satzzeichen verglichen (ä = ae).
Freischaltung: Abstand ≤ Radius + GPS-Ungenauigkeit (max. 25 m). Ist das GPS im Isartal ungenau, erscheint in der Nähe ein Button „Ich bin da – aber nichts passiert“.

## Auf GitHub Pages veröffentlichen

```bash
cd schnitzeljagd
git init && git add . && git commit -m "Operation S7"
gh repo create operation-s7 --public --source=. --push
gh api -X POST repos/{owner}/operation-s7/pages -f "source[branch]=main" -f "source[path]=/"
```

Oder im Browser: Repository anlegen, Dateien hochladen, **Settings → Pages → Deploy from a branch → main / (root)**.
Die App läuft dann unter `https://<benutzername>.github.io/operation-s7/` (HTTPS ist für GPS und Kompass Pflicht).

Hinweis: Ein öffentliches Repository zeigt `stations.json` inkl. Lösungen. Deshalb liegt das Hauptquartier auf einem öffentlichen Punkt in der Nachbarschaft (Radius 220 m) statt auf der Hausadresse; persönliche Notizen stehen nur lokal in `PRIVAT.md` (nicht im Repository).

## Lokal testen

```bash
python3 -m http.server 8737
```

## Am Tag der Feier (Ende November)

- **Extraktion am Kloster:** Nach dem Rätsel am Kloster schickt der Silberfuchs ein „Extraktionsfahrzeug“. Papa ist Fahrer **Graufalke** und holt das Team vor dem Kloster ab. Erkennungssignal: Papa sagt „Die Isar fließt nach Norden.“, die Kinder antworten „Und der Fuchs kennt jeden Weg.“ Im Auto gibt es die **Agenten-Verpflegung**, dann geht es zum S-Bahnhof Hohenschäftlarn. Losfahren, sobald in der Papa-Zentrale „Station 6 erreicht“ erscheint (dann bleiben ca. 10–15 Minuten fürs Rätsel). Für 8 Kinder plus Begleitung braucht es zwei Autos oder einen Bus.
- Proviant-Idee passend zur Story: Brezen, Obst, Saft in einer „Verpflegungskiste“ mit TOP-SECRET-Aufkleber, Schokotaler als „Goldmünzen“ (Vorgeschmack auf das Münzrätsel an der Burg).

- **Sonnenuntergang in München ca. 16:30 Uhr**, danach wird es schnell dunkel – **Start spätestens 12:00 Uhr**, besser 11:30.
- Der Abstieg von Ebenhausen zum Kloster und der Weg am Isar-Hochufer (Höllriegelskreuth → Pullach) sind im November nass und mit Laub bedeckt: feste Schuhe. Wird es knapp: von Höllriegelskreuth eine Station mit der S7 nach Pullach fahren und Station 8 im Admin-Modus mit „Aktuelle Station freischalten“ öffnen – das Rätsel und das Fragment bleiben erhalten.
- Tresor-Code: siehe `lockCode` – passendes Zahlenschloss besorgen oder anpassen.
- Der Agentenname ist mit „Jasper“ vorbelegt (`agentName`).

## Tipps für den Tag

- Handy voll laden + Powerbank; Bildschirm geht sonst aus und GPS pausiert – beim Entsperren aktualisiert sich alles.
- Die App vorher einmal online öffnen, dann funktioniert sie auch bei Funklöchern.
- S7 südlich von Höllriegelskreuth etwa alle 20 min – Fahrplan in der MVV-App prüfen, Tageskarte für die Strecke Wolfratshausen–Pullach einplanen.
- Pausen: Kloster Schäftlarn (Bräustüberl) oder Pullach – im November warmen Tee/Kakao in der Thermoskanne mitnehmen.
