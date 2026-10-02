// Compiles the 14 DDInter ATC CSVs into a compact interaction index.
import fs from 'node:fs';
import path from 'node:path';

const RAW = 'data/raw';
const OUT = 'data/build';
fs.mkdirSync(OUT, { recursive: true });

const LEVEL = { Major: 3, Moderate: 2, Minor: 1, Unknown: 0 };

const ids = new Map();          // lowercased name -> numeric id
const names = [];               // id -> canonical name
const id = (name) => {
  const k = name.toLowerCase();
  let v = ids.get(k);
  if (v === undefined) { v = names.push(name) - 1; ids.set(k, v); }
  return v;
};

// pairKey -> severity, keeping the most severe when a pair appears in several ATC files
const pairs = new Map();

for (const file of fs.readdirSync(RAW).filter((f) => /^ddi_[A-Z]\.csv$/.test(f))) {
  const lines = fs.readFileSync(path.join(RAW, file), 'utf8').split('\n');
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].trim();
    if (!row) continue;
    // Drug names may contain commas inside parentheses, so split from the known column count
    const cols = row.split(',');
    if (cols.length < 5) continue;
    const level = cols[cols.length - 1].trim();
    if (!(level in LEVEL)) continue;
    const a = cols[1].trim(), b = cols[3].trim();
    if (!a || !b || a === b) continue;
    let x = id(a), y = id(b);
    if (x > y) [x, y] = [y, x];
    const key = x * 100000 + y;
    const sev = LEVEL[level];
    const prev = pairs.get(key);
    if (prev === undefined || sev > prev) pairs.set(key, sev);
  }
}

// Adjacency index: drugId -> [[otherId, severity], ...] for O(1) lookup at request time
const adj = {};
for (const [key, sev] of pairs) {
  const x = Math.floor(key / 100000), y = key % 100000;
  (adj[x] ||= []).push([y, sev]);
  (adj[y] ||= []).push([x, sev]);
}

fs.writeFileSync(path.join(OUT, 'interactions.json'), JSON.stringify({ names, adj }));

const dist = { Major: 0, Moderate: 0, Minor: 0, Unknown: 0 };
for (const s of pairs.values()) dist[Object.keys(LEVEL).find((k) => LEVEL[k] === s)]++;
console.log(`drugs:        ${names.length}`);
console.log(`unique pairs: ${pairs.size}`);
console.log(`severity:     ${JSON.stringify(dist)}`);
console.log(`size:         ${(fs.statSync(path.join(OUT, 'interactions.json')).size / 1e6).toFixed(1)} MB`);
