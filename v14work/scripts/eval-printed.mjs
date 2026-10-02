// Measures the full pipeline on printed prescription slips: OCR the whole page,
// then resolve each line the way the app does.
import fs from 'node:fs';
import { createWorker } from 'tesseract.js';
import { matchDrug, looksLikeMedicineLine } from '../server/engine.js';

const DIR = 'data/raw/printed';
const truth = JSON.parse(fs.readFileSync(`${DIR}/truth.json`, 'utf8'));
const worker = await createWorker('eng');

let expected = 0, found = 0, spurious = 0;
const failures = [];

for (const t of truth) {
  const { data } = await worker.recognize(`${DIR}/${t.file}`);
  const lines = (data.text || '').split('\n').map((l) => l.trim()).filter((l) => l.length > 2);

  // What the app would show the patient.
  const predicted = new Set();
  for (const line of lines) {
    if (!looksLikeMedicineLine(line)) continue;
    const m = matchDrug(line, { minConfidence: 0.62 }).best;
    if (m) predicted.add(m.generic);
  }
  // What it should have shown.
  const want = new Set();
  for (const d of t.drugs) {
    const m = matchDrug(d, { minConfidence: 0.6 }).best;
    if (m) want.add(m.generic);
  }

  expected += want.size;
  for (const w of want) {
    if (predicted.has(w)) found++;
    else failures.push({ file: t.file, missed: w });
  }
  for (const p of predicted) if (!want.has(p)) spurious++;
}
await worker.terminate();

console.log('─'.repeat(52));
console.log(`printed slips:      ${truth.length}`);
console.log(`medicines expected: ${expected}`);
console.log(`correctly found:    ${found}  (${(100 * found / expected).toFixed(1)}%)`);
console.log(`missed:             ${expected - found}`);
console.log(`false positives:    ${spurious}`);
console.log('─'.repeat(52));
if (failures.length) {
  console.log('\nmissed:');
  for (const f of failures.slice(0, 10)) console.log(`  ${f.file}  ${f.missed}`);
}
fs.writeFileSync('data/build/ocr-eval-printed.json', JSON.stringify({
  when: new Date().toISOString(), slips: truth.length, expected, found, spurious,
  recall: +(found / expected).toFixed(3),
}, null, 1));
