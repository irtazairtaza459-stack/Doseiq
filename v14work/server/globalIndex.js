// Persistent global medicine index.
// This is an expandable cache of verified records returned by RxNorm/DailyMed/FDA.
// It intentionally does not pretend to contain every medicine in the world.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.env.VERCEL ? '/tmp' : process.cwd(), 'data');
const FILE = path.join(ROOT, 'global-medicine-index.json');
const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const seed = [
  {
    generic: 'Doxycycline Monohydrate',
    brand: 'Adoxa',
    strength: '100 mg',
    dosageForm: 'Oral Tablet',
    pack: 'Adoxa Pak 2/100',
    rxcui: '795712',
    aliases: ['Adoxa', 'Adoxa Pak', 'Adoxa Pak 2/100', 'Adoxa 100', 'doxycycline monohydrate 100 mg'],
    sources: ['RxNorm / NLM'],
    sourceUrl: 'https://rxnav.nlm.nih.gov/',
    verified: true,
    importedAt: '2026-09-30T00:00:00.000Z'
  }
];

function read() {
  try {
    const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch {
    fs.mkdirSync(ROOT, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(seed, null, 2));
    return [...seed];
  }
}

let records = read();

function write() {
  fs.mkdirSync(ROOT, { recursive: true });
  const tmp = `${FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2));
  fs.renameSync(tmp, FILE);
}

function mergeRecord(record) {
  const r = {
    generic: String(record.generic || '').trim(),
    brand: String(record.brand || '').trim(),
    strength: String(record.strength || '').trim(),
    dosageForm: String(record.dosageForm || '').trim(),
    pack: String(record.pack || '').trim(),
    rxcui: String(record.rxcui || '').trim(),
    aliases: [...new Set([...(record.aliases || []), record.brand, record.generic, record.pack].filter(Boolean).map(String))],
    sources: [...new Set(record.sources || [])],
    sourceUrl: String(record.sourceUrl || '').trim(),
    verified: record.verified !== false,
    importedAt: record.importedAt || new Date().toISOString(),
  };
  if (!r.generic && !r.brand) return null;
  const identity = r.rxcui || `${norm(r.brand)}|${norm(r.generic)}|${norm(r.strength)}|${norm(r.dosageForm)}`;
  const idx = records.findIndex(x => (x.rxcui && r.rxcui && x.rxcui === r.rxcui) || (!r.rxcui && `${norm(x.brand)}|${norm(x.generic)}|${norm(x.strength)}|${norm(x.dosageForm)}` === identity));
  if (idx >= 0) {
    const old = records[idx];
    records[idx] = {
      ...old, ...r,
      aliases: [...new Set([...(old.aliases || []), ...(r.aliases || [])])],
      sources: [...new Set([...(old.sources || []), ...(r.sources || [])])],
      sourceUrl: r.sourceUrl || old.sourceUrl,
      importedAt: old.importedAt || r.importedAt,
    };
  } else records.push(r);
  return records[idx >= 0 ? idx : records.length - 1];
}

export function rememberGlobalRecords(list) {
  let changed = false;
  const out = [];
  for (const item of Array.isArray(list) ? list : []) {
    const before = records.length;
    const saved = mergeRecord(item);
    if (saved) out.push(saved);
    changed = changed || records.length !== before;
  }
  if (changed || out.length) write();
  return out;
}

export function globalIndexSearch(query, limit = 12) {
  const q = norm(query);
  if (!q) return [];
  const tokens = q.split(' ').filter(Boolean);
  const scored = records.map(r => {
    const hay = [r.brand, r.generic, r.pack, r.strength, r.dosageForm, ...(r.aliases || [])].map(norm).join(' ');
    let score = hay.includes(q) ? 1 : 0;
    for (const t of tokens) if (t.length >= 2 && hay.includes(t)) score += 0.15;
    if (norm(r.brand) === q || norm(r.pack) === q) score += 1;
    return { r, score };
  }).filter(x => x.score > 0).sort((a,b) => b.score - a.score).slice(0, limit);
  return scored.map(x => ({ ...x.r, confidence: Math.min(0.99, x.score / 1.3), source: 'DoseIQ global medicine index' }));
}

export function globalIndexStats() {
  const brands = new Set(records.map(r => norm(r.brand)).filter(Boolean));
  const generics = new Set(records.map(r => norm(r.generic)).filter(Boolean));
  return { records: records.length, brands: brands.size, generics: generics.size, file: 'data/global-medicine-index.json' };
}

export function globalIndexRecords() { return records.slice(); }
