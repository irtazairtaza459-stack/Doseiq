// The first few sentences of an FDA adverse-reactions section are often just
// cross-references. Pull a longer window so symptom matching has real text.
import fs from 'node:fs';

const drugs = JSON.parse(fs.readFileSync('data/pk-drugs.json', 'utf8'));
const OUT = 'data/build/labels.json';
const cache = JSON.parse(fs.readFileSync(OUT, 'utf8'));

const clean = (t, maxChars) => {
  let s = String(t).replace(/\s+/g, ' ').replace(/\[see [^\]]*\]/gi, '')
    .replace(/^\s*(ADVERSE REACTIONS|\d+(\.\d+)*)\s*/i, '').trim();
  if (s.length > maxChars) s = s.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
  return s;
};

const alias = { Paracetamol: 'acetaminophen', Salbutamol: 'albuterol',
  'Co-trimoxazole': 'sulfamethoxazole', 'Amoxicillin/Clavulanate': 'amoxicillin',
  Valproate: 'valproic acid', 'Hyoscine Butylbromide': 'scopolamine' };

let improved = 0;
for (const d of drugs) {
  if (cache[d.generic]?._manual) continue;
  const name = (alias[d.generic] || d.generic).toLowerCase();
  let res = null;
  for (const q of [`openfda.generic_name:"${name}"`, `openfda.substance_name:"${name}"`]) {
    try {
      const r = await fetch(`https://api.fda.gov/drug/label.json?search=${encodeURIComponent(q)}&limit=1`);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.results?.length) { res = j.results[0]; break; }
    } catch { /* try next */ }
  }
  if (!res) continue;
  // Join the sections where a patient's symptom is actually likely to appear.
  const merged = [res.adverse_reactions?.[0], res.warnings_and_cautions?.[0], res.warnings?.[0]]
    .filter(Boolean).join(' ');
  if (merged) {
    cache[d.generic] ||= {};
    cache[d.generic].symptom_index = clean(merged, 4000);
    if (!cache[d.generic].adverse_reactions) cache[d.generic].adverse_reactions = clean(merged, 600);
    improved++;
  }
  await new Promise((s) => setTimeout(s, 150));
}
fs.writeFileSync(OUT, JSON.stringify(cache, null, 1));

const probe = ['nausea', 'diarrhea', 'rash', 'dizziness', 'headache'];
const covered = probe.map((p) => [p, Object.values(cache).filter((c) => (c.symptom_index || '').toLowerCase().includes(p)).length]);
console.log(`enriched: ${improved}/${drugs.length}`);
console.log('symptom coverage:', covered.map(([p, n]) => `${p}=${n}`).join('  '));
