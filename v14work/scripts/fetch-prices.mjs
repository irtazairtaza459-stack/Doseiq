// Scrapes DRAP's public Drug Pricing Index and keeps the products that match the
// catalogue, so the app can show a real MRP and cheaper same-ingredient brands.
import fs from 'node:fs';

const drugs = JSON.parse(fs.readFileSync('data/pk-drugs.json', 'utf8'));
const PAGES = Number(process.env.PAGES || 1069);
const CONCURRENCY = 6;

// What counts as a match: the generic's own name, its DDInter name, or any brand.
const needles = [];
for (const d of drugs) {
  const add = (term, kind) => term && needles.push({ term: term.toLowerCase(), generic: d.generic, kind });
  add(d.generic.split('/')[0], 'generic');
  if (d.ddinter !== d.generic) add(d.ddinter, 'generic');
  for (const b of d.brands) add(b, 'brand');
}

const strip = (s) => s.replace(/<[^>]+>/g, ' ').replace(/&#0?39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

function parse(html) {
  const out = [];
  for (const tr of html.match(/<tr[^>]*>[\s\S]*?<\/tr>/g) || []) {
    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/g) || []).map(strip);
    if (cells.length < 6) continue;
    const [name, reg, maker, category, pack, price, from] = cells;
    if (!/^Rs/i.test(price)) continue;
    out.push({ name, reg, maker, category, pack,
      price: Number(price.replace(/[^\d.]/g, '')) || null, from: from || null });
  }
  return out;
}

const seen = new Set();
const kept = [];
let done = 0, failed = 0;

async function page(n) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await fetch(`https://e.dra.gov.pk/public/price?page=${n}`, { signal: AbortSignal.timeout(25000) });
      if (!r.ok) throw new Error(r.status);
      const rows = parse(await r.text());
      for (const row of rows) {
        const hay = row.name.toLowerCase();
        // Prefer a generic-name hit; a brand hit is only trusted at a word boundary.
        const hit = needles.find((x) => x.kind === 'generic' && hay.includes(x.term))
          || needles.find((x) => x.kind === 'brand' && new RegExp(`\\b${x.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(hay));
        if (!hit) continue;
        const key = row.reg + row.pack;
        if (seen.has(key)) continue;
        seen.add(key);
        kept.push({ ...row, generic: hit.generic });
      }
      done++;
      return;
    } catch { if (attempt) failed++; }
  }
}

const queue = Array.from({ length: PAGES }, (_, i) => i + 1);
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    await page(queue.shift());
    if (done % 100 === 0 && done) process.stdout.write(`\r  ${done}/${PAGES} pages, ${kept.length} kept`);
  }
});
await Promise.all(workers);

// Group by generic, cheapest first, so "cheaper alternative" is a single lookup.
const byGeneric = {};
for (const p of kept) (byGeneric[p.generic] ||= []).push(p);
for (const g of Object.keys(byGeneric)) {
  byGeneric[g].sort((a, b) => (a.price ?? 1e9) - (b.price ?? 1e9));
  byGeneric[g] = byGeneric[g].slice(0, 40);
}

fs.writeFileSync('data/build/prices.json', JSON.stringify({
  source: 'DRAP Drug Pricing Index (e.dra.gov.pk)', fetched: new Date().toISOString(),
  pages: PAGES, products: kept.length, byGeneric,
}));
console.log(`\n  pages ok:  ${done}/${PAGES}  (failed ${failed})`);
console.log(`  products:  ${kept.length}`);
console.log(`  generics:  ${Object.keys(byGeneric).length}/${drugs.length} priced`);
