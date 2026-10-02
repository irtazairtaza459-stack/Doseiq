// Pulls FDA label sections for each catalogue drug and trims them to patient-readable length.
import fs from 'node:fs';

const drugs = JSON.parse(fs.readFileSync('data/pk-drugs.json', 'utf8'));
const OUT = 'data/build/labels.json';
const cache = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : {};

const WANT = ['indications_and_usage', 'adverse_reactions', 'warnings_and_cautions',
  'warnings', 'pregnancy', 'overdosage', 'dosage_and_administration',
  'use_in_specific_populations', 'contraindications', 'drug_interactions'];

// FDA label prose is long and legalistic; keep the leading sentences that carry the meaning.
const trim = (txt, maxSentences, maxChars) => {
  if (!txt) return null;
  let t = String(txt)
    .replace(/\s+/g, ' ')
    .replace(/^\s*\d+(\.\d+)*\s+/, '')
    .replace(/\[see [^\]]*\]/gi, '')
    .trim();
  const sentences = t.match(/[^.!?]+[.!?]+/g) || [t];
  t = sentences.slice(0, maxSentences).join(' ').trim();
  if (t.length > maxChars) t = t.slice(0, maxChars).replace(/\s+\S*$/, '') + '…';
  return t || null;
};

const query = async (name) => {
  const tries = [
    `openfda.generic_name:"${name}"`,
    `openfda.substance_name:"${name}"`,
    `indications_and_usage:"${name}"`,
  ];
  for (const q of tries) {
    const url = `https://api.fda.gov/drug/label.json?search=${encodeURIComponent(q)}&limit=1`;
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const j = await r.json();
      if (j.results?.length) return j.results[0];
    } catch { /* try next form */ }
    await new Promise((s) => setTimeout(s, 120));
  }
  return null;
};

let hit = 0, miss = [];
for (const d of drugs) {
  const key = d.generic;
  if (cache[key]) { hit++; continue; }
  // FDA indexes acetaminophen/albuterol rather than the names used in Pakistan
  const alias = { Paracetamol: 'acetaminophen', Salbutamol: 'albuterol',
    'Co-trimoxazole': 'sulfamethoxazole', 'Amoxicillin/Clavulanate': 'amoxicillin',
    Valproate: 'valproic acid', 'Hyoscine Butylbromide': 'scopolamine',
    'Ferrous Sulfate': 'ferrous sulfate', Cholecalciferol: 'cholecalciferol' };
  const res = await query(alias[key] || key.toLowerCase());
  if (!res) { miss.push(key); continue; }
  const rec = {};
  for (const f of WANT) if (res[f]) rec[f] = trim(res[f][0], f === 'indications_and_usage' ? 3 : 4, 600);
  rec._brand = res.openfda?.brand_name?.[0] || null;
  cache[key] = rec;
  hit++;
  await new Promise((s) => setTimeout(s, 180));
}

fs.writeFileSync(OUT, JSON.stringify(cache, null, 1));
console.log(`labels fetched: ${hit}/${drugs.length}`);
if (miss.length) console.log(`no FDA label:   ${miss.join(', ')}`);
const withOverdose = Object.values(cache).filter((c) => c.overdosage).length;
const withPreg = Object.values(cache).filter((c) => c.pregnancy).length;
console.log(`overdose text:  ${withOverdose}   pregnancy text: ${withPreg}`);
