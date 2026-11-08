# Operation Silberfuchs – Der Isar-Code

GPS-Schnitzeljagd als mobile Web-App (reines HTML/CSS/JS, keine Abhängigkeiten, offline-fähig).
Route: Hohenschäftlarn → Wolfratshausen → Ebenhausen → Kloster Schäftlarn → Höllriegelskreuth → Pullach → zurück. Dauer ca. 5 h.

## Route (10 Stationen)

| # | Station | Anreise |
|---|---------|---------|
| 1 | Hauptquartier (zu Hause) – Briefing | – |
| 2 | S-Bahnhof Hohenschäftlarn | zu Fuß ~20 min |
| 3 | Bahnhof Wolfratshausen | S7 → Wolfratshausen, 3 Stationen |
| 4 | Marienplatz Wolfratshausen | zu Fuß ~12 min |
| 5 | S-Bahnhof Ebenhausen-Schäftlarn | S7 → München, 2 Stationen |
| 6 | Kloster Schäftlarn | zu Fuß ~20 min bergab |
| 7 | Aussichtspunkt Burg Grünwald | 🚐 Abholung am Kloster (Papa = „Graufalke“, Verpflegung) zum Bf Hohenschäftlarn, S7 → Höllriegelskreuth |
| 8 | Kirche Heilig Geist, Pullach | zu Fuß am Isar-Hochufer ~25 min |
| 9 | S-Bahnhof Pullach | zu Fuß ~8 min |
| 10 | Hauptquartier – Tresor | S7 → Wolfratshausen bis Hohenschäftlarn, zu Fuß |

Lösungen, Codewort und Tresor-Code stehen absichtlich **nicht** hier, sondern nur lokal in `PRIVAT.md` (das Repository ist öffentlich). Am Ende zeigt die App den Tresor-Code für das Zahlenschloss an der Geschenk-Kiste (änderbar im Admin-Modus unter „Spiel-Einstellungen“).

## Einladungs-Studio für Jasper

Link für Jaspers Handy: `https://felixfendel-ui.github.io/operation-s7/#studio`

- Jasper sieht die **Einsatzleiter-Zentrale**: eigener Deckname (würfelbar), Einladung gestalten (inkl. persönlichem Funkspruch an seine Agenten), Einladung teilen, Liste der eingetragenen Agenten, Countdown.
- **Keine Rätsel:** Die Mission ist auf seinem Handy bis zum Einsatztag versiegelt; der Admin-Modus (Stationen, Lösungen, Papa-Link) braucht die PIN.
- Sein Handy wird dabei automatisch die **Zentrale** für den Team-Modus.
- **Wichtig:** Auf Jaspers Handy einmal den Admin-Modus öffnen und unter „Spiel-Einstellungen“ eine **eigene PIN** setzen – die Standard-PIN steht in diesem öffentlichen Repository. Die PIN wird nur auf dem Gerät gespeichert. Dort auch die Live-Verbindung zu Papa einrichten.

## Zusagen in der App

Gäste tragen sich in der Einladung ein und tippen **„✅ Ich bin dabei“** oder **„❌ Kann leider nicht“**. Die Antwort geht an Jaspers Handy (Zentrale), das sie bestätigt – der Gast sieht dann „Deine Zusage ist angekommen“ und die Liste „Schon im Einsatzteam“.

- Jasper sieht in der Einsatzleiter-Zentrale: wer dabei ist, wer abgesagt hat, wer noch nicht geantwortet hat.
- Papa bekommt jede Antwort als Push (ntfy-App, falls die Live-Verbindung eingerichtet ist) und sieht sie in der Papa-Zentrale.
- ntfy hält Nachrichten ca. 12 Stunden: Jasper sollte seine App in den Tagen bis zur Feier ab und zu öffnen. Unbestätigte Zusagen schickt die Gast-App beim nächsten Öffnen automatisch erneut.
- Wer absagt, wird am Einsatztag nicht ins Team aufgenommen. Zusätzlich gibt es weiterhin den WhatsApp-Knopf (eingeklappt).

## Decknamen

Jeder Agent bekommt automatisch einen Decknamen (z. B. „Sturmbär“, „Mondskorpion“, „Nebelmarder“), den er beliebig neu würfeln kann. Er erscheint in der Einladung („An: Agent …“), in der WhatsApp-Zusage, in der Rollenkarte, in Team-Listen, in der Kopfzeile und in der Geschichte („Willkommen, Agent …“).

## Rätseldaten

Die Stationen werden als `stations.dat` veröffentlicht (verschleiert, nicht im Klartext lesbar). Die bearbeitbare Quelle `stations.json` liegt nur lokal (`.gitignore`). Nach Änderungen:

```bash
node tools/seal.mjs
```

Hinweis: Ältere Versionen im Git-Verlauf enthalten `stations.json` noch im Klartext.

## Admin-Modus

5× schnell auf das S7-Logo tippen (oder `?admin` an die URL hängen), Standard-PIN siehe `PRIVAT.md` (auf jedem Gerät änderbar).

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

## Unterwegs: Geheimdepots & Spezialaufträge

- **📦 Geheimdepots:** Auf den Fußwegen liegen 8 virtuelle Agenten-Gegenstände (Funkgerät, Lupe, Nachtsichtgerät, Dietrich, Tarnumhang, Knopfkamera, Geheimtinte, Spionagebrille) – entlang der echten Fußwege berechnet. Der **Depot-Scanner** zeigt ab 400 m „Depot-Signal“ mit heiß/kalt, aber keine Richtung – die Kinder müssen suchen. Wer bis auf ca. 35 m herankommt, knackt das Depot: +50 Agentenpunkte, Gegenstand ins Agentengepäck. Depots gelten nur auf dem Weg zur jeweiligen Station.
- **📡 Spezialaufträge:** Auf halber Strecke zu einer Station (oder spätestens nach 6 Minuten) kommt ein Funkspruch mit einer Mini-Aufgabe: Maulwurf-Alarm mit 60 Sekunden Funkstille, Beobachtungstest in der S-Bahn, Zahlenjagd, Tarnnamen rückwärts, Spurensicherung im Wald, Agentenfoto, Ja-Nein-Verbot, Undercover-Wort. „Erledigt“ = +30 Punkte.
- Punkte, Depots und Aufträge erscheinen im Missionsbericht beim Finale und in der Papa-Zentrale (Depots als lila Punkte auf der Karte).
- Im Team-Modus kann jedes Handy Depots knacken; den Auftrag löst Jaspers Handy aus, alle sehen ihn.
- Anpassen in `stations.json`: `depots` (Liste mit `id, icon, name, text, lat, lon, pts`) und `task` (`text, pts, secs`) je Station.

## Einladung vorab per Link

Admin-Modus auf **Jaspers Handy** → „💌 Einladung erstellen“: Datum, Uhrzeit, Ende, Treffpunkt, Telefonnummer für Zusagen, „Antwort bis“, Ausrüstung und Eltern-Infos eintragen → „Speichern & Link erzeugen“ → „🔗 Einladung teilen“ (z. B. in die WhatsApp-Gruppe).

- Die Kinder sehen eine geheime „Einberufung“ mit Countdown, tragen ihren Agentennamen ein und sagen per WhatsApp (oder SMS) zu. Eltern finden unten „Infos für Eltern“.
- Das Spiel bleibt versiegelt. Am Einsatztag öffnen die Kinder **denselben Link** wieder, melden sich automatisch im Team an und starten, sobald Jasper die Mission startet.
- Testläufe auf Jaspers Handy vor dem Einsatztag landen nicht bei den Gästen. Danach trotzdem „Fortschritt zurücksetzen“.
- Der Einladungslink ist zugleich der Team-Link. Im Admin-Modus deshalb **nicht** „Team-Modus beenden“, sonst funktioniert die verschickte Einladung am Tag nicht mehr.
- Datum, Treffpunkt und Telefonnummer stecken nur im Link (Teil nach `#`), nicht im öffentlichen Repository und nicht auf einem Server. Wer den Link hat, sieht sie – also nur an die Gäste schicken.

## Live-Verbindung zu Papa (ntfy.sh)

Jaspers App meldet jedes Ereignis (Station erreicht, falsche Antwort, Tipp genutzt, gelöst, Mission erfüllt) und seine Position (alle 2 Minuten, solange er unterwegs ist; im Stehen alle 10 Minuten). Über den gelben **📻 Funk**-Knopf kann er Papa schreiben (Schnellknöpfe: Tipp gebraucht, Alles gut, In der S-Bahn, Bitte anrufen, Verlaufen). Papas Antworten erscheinen bei Jasper als Einblendung mit Ton.

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
  "riddle": "Rätsel", "answers": ["Lösung", "Variante"], "hint": "Tipp",
  "fragment": "X", "solved": "Text nach dem Lösen (inkl. Weg zur nächsten Station)",
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
- **Nur in Safari bzw. Chrome öffnen, nicht als Home-Bildschirm-App.** Auf dem iPhone hat eine Home-Bildschirm-App einen eigenen Speicher – Team, Einladung und Live-Verbindung wären dort weg. (Ein Lesezeichen auf dem Home-Bildschirm öffnet jetzt normal in Safari.)
- **Beim Start zu Hause WLAN aus, mobile Daten an.** ntfy.sh begrenzt Anfragen pro Internet-Anschluss; 8 Handys plus Papa-Zentrale im selben WLAN können kurz ausgebremst werden. Die App versucht es dann automatisch erneut, aber mit mobilen Daten geht es sofort.
- **ntfy-Kontingent:** 250 Nachrichten pro Tag und Anschluss. Eine Jagd braucht auf Jaspers Handy ca. 150–200. Am Vortag nicht mehr ausgiebig testen; der Admin-Modus zeigt das Restkontingent. Wird es knapp, schickt die App Position seltener und lässt Unwichtiges weg.
- Die App vorher einmal online öffnen, dann funktioniert sie auch bei Funklöchern.
- S7 südlich von Höllriegelskreuth etwa alle 20 min – Fahrplan in der MVV-App prüfen, Tageskarte für die Strecke Wolfratshausen–Pullach einplanen.
- Pausen: Kloster Schäftlarn (Bräustüberl) oder Pullach – im November warmen Tee/Kakao in der Thermoskanne mitnehmen.
