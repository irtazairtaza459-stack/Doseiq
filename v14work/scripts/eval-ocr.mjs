// Measures the real scan pipeline (OCR -> fuzzy match) against the labelled
// Pakistani handwriting set. Prints a number we can defend, not a guess.
import fs from 'node:fs';
import path from 'node:path';
import { createWorker } from 'tesseract.js';
import { matchDrug } from '../server/engine.js';

const DIR = 'data/raw/rx';
const rows = fs.readFileSync(path.join(DIR, 'doctor_handwriting_labels.csv'), 'utf8')
  .split('\n').slice(1).map((l) => l.trim()).filter(Boolean)
  .map((l) => { const i = l.lastIndexOf(','); return { file: l.slice(0, i), label: l.slice(i + 1) }; })
  .filter((r) => fs.existsSync(path.join(DIR, 'images', r.file)));

console.log(`labelled samples on disk: ${rows.length}\n`);

// A sample is only scoreable if its true drug is in our catalogue.
const scoreable = [];
for (const r of rows) {
  const truth = matchDrug(r.label, { minConfidence: 0.6 }).best;
  if (truth) scoreable.push({ ...r, truth: truth.generic });
}
console.log(`in catalogue (scoreable):  ${scoreable.length}/${rows.length}`);
console.log(`out of catalogue:          ${rows.length - scoreable.length}\n`);

const worker = await createWorker('eng');
let correct = 0, wrong = 0, noRead = 0;
const misses = [];

for (const s of scoreable) {
  const { data } = await worker.recognize(path.join(DIR, 'images', s.file));
  const text = (data.text || '').replace(/\s+/g, ' ').trim();
  if (!text) { noRead++; misses.push({ ...s, got: '(nothing read)' }); continue; }
  const pred = matchDrug(text, { minConfidence: 0.55 }).best;
  if (pred && pred.generic === s.truth) correct++;
  else { wrong++; misses.push({ ...s, ocr: text, got: pred?.generic || '(no match)' }); }
}
await worker.terminate();

const n = scoreable.length;
console.log('─'.repeat(52));
console.log(`correct:      ${correct}/${n}  (${(100 * correct / n).toFixed(1)}%)`);
console.log(`wrong drug:   ${wrong}`);
console.log(`nothing read: ${noRead}`);
console.log('─'.repeat(52));
console.log('\nsample failures:');
for (const m of misses.slice(0, 8)) {
  console.log(`  truth=${m.truth.padEnd(16)} got=${String(m.got).padEnd(16)} ocr="${(m.ocr || '').slice(0, 34)}"`);
}
fs.writeFileSync('data/build/ocr-eval.json', JSON.stringify({
  when: new Date().toISOString(), samples: rows.length, scoreable: n,
  correct, wrong, noRead, accuracy: +(correct / n).toFixed(3),
}, null, 1));
