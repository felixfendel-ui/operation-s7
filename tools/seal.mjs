// Verschlüsselt stations.json (lokal, nicht im Repository) zu stations.dat (veröffentlicht).
// Kein echter Schutz, aber Rätsel und Lösungen stehen so nicht im Klartext im Browser oder auf GitHub.
// Aufruf im Ordner schnitzeljagd:  node tools/seal.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const KEY = 'S7·Isar·Silberfuchs·Einheit';
const data = Buffer.from(JSON.stringify(JSON.parse(readFileSync('stations.json', 'utf8'))), 'utf8');
const key = Buffer.from(KEY, 'utf8');
const out = Buffer.alloc(data.length);
for (let i = 0; i < data.length; i++) out[i] = data[i] ^ key[i % key.length];
writeFileSync('stations.dat', out.toString('base64'));
console.log('stations.dat geschrieben (' + out.length + ' Bytes)');
