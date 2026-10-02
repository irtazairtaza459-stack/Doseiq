import express from 'express';
import compression from 'compression';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as engine from './engine.js';
import { globalDrugSearch, globalAnswer } from './global.js';
import { globalIndexStats, globalIndexSearch, rememberGlobalRecords } from './globalIndex.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const app = express();

app.use(compression());
app.use(express.json({ limit: '10mb' }));

const ok = (res, body) => res.json({ ok: true, ...body });
const bad = (res, code, msg) => res.status(code).json({ ok: false, error: msg });
const asList = (v) => (Array.isArray(v) ? v : typeof v === 'string' ? [v] : []);
const inferIntervalHours = (line = '') => {
  const m = String(line).toLowerCase().match(/every\s+(\d{1,2})\s*hours?/);
  return m ? Number(m[1]) : null;
};
const inferFrequencyFromLine = (line = '') => {
  const x = String(line).toLowerCase().replace(/\s+/g, ' ');
  if (/\bq\.?i\.?d\b|\bqid\b|4\s*(x|times)|four times/.test(x)) return 4;
  if (/\bt\.?d\.?s\b|\btds\b|3\s*(x|times)|three times/.test(x)) return 3;
  if (/\bb\.?d\.?\b|\bbid\b|2\s*(x|times)|twice|two times/.test(x)) return 2;
  if (/\b(od|qd|once daily|once a day|1\s*(x|time)|daily)\b/.test(x)) return 1;
  const m = x.match(/every\s+(\d{1,2})\s*hours?/);
  return m ? Math.max(1, Math.round(24 / Number(m[1]))) : 1;
};

app.get('/api/health', (_req, res) => ok(res, { status: 'up', data: { ...engine.stats(), ...engine.priceStats() } }));

app.get('/api/about', (_req, res) => {
  const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data/build', f), 'utf8')); } catch { return null; } };
  ok(res, {
    data: engine.stats(),
    sources: [
      { name: 'DDInter 2.0', use: 'Drug-drug interactions, severity-graded', licence: 'Free academic use' },
      { name: 'openFDA drug labels', use: 'Indications, side effects, pregnancy, overdose', licence: 'Public domain' },
      { name: 'RxNorm / RxNav (NIH)', use: 'Drug name normalisation', licence: 'Public domain' },
      { name: 'DRAP Drug Pricing Index', use: 'Pakistani retail prices and cheaper alternatives', licence: 'Public government data' },
      { name: 'Pakistani brand catalogue', use: 'Local brand names, Urdu text, timing, missed-dose, renal and hepatic rules', licence: 'Written for this project' },
      { name: 'DoseIQ global medicine index', use: 'Persistent verified global medicine cache with brand/generic aliases', licence: 'Internal index built from cited public sources' },
    ],
    accuracy: {
      printed: read('ocr-eval-printed.json'),
      handwritten: read('ocr-eval.json'),
      methodsTried: read('ocr-findings.json'),
      note: 'Measured on real samples, not estimated. Five OCR configurations were tested against handwriting; none worked. The app requires the patient to confirm every scanned line.',
    },
  });
});

app.get('/api/drugs', (_req, res) => {
  ok(res, { drugs: engine.allDrugs().map((d) => ({
    generic: d.generic, urdu: d.urdu, brands: d.brands, class: d.class, components: d.components || [],
    purposeEn: d.purposeEn, purposeUr: d.purposeUr, timing: d.timing,
    course: !!d.course, interactionData: d.interactionData })) });
});

app.get('/api/drugs/:generic', (req, res) => {
  const d = engine.getDrug(req.params.generic);
  if (!d) return bad(res, 404, 'drug not found');
  ok(res, { drug: d, label: engine.getLabel(d.generic), food: engine.foodAdvice(d.generic) });
});

// Resolve noisy text (OCR output or typed search) to catalogue drugs.
app.post('/api/match', (req, res) => {
  const { text, limit } = req.body || {};
  if (!text) return bad(res, 400, 'text is required');
  ok(res, engine.matchDrug(text, { limit: limit || 5 }));
});

// Accepts raw OCR lines from the browser and returns a reviewable medicine list.
app.post('/api/scan/parse', (req, res) => {
  const lines = asList(req.body?.lines).map((l) => String(l).trim()).filter(Boolean);
  if (!lines.length) return bad(res, 400, 'lines[] is required');
  const usable = lines.filter(engine.looksLikeMedicineLine);
  const ranked = engine.matchScanText(usable, { limit: 12 });
  const items = [];
  const seen = new Set();
  for (const hit of ranked) {
    if (seen.has(hit.generic)) continue;
    const d = engine.getDrug(hit.generic);
    if (!d) continue;
    seen.add(hit.generic);
    const line = hit.sourceLine || '';
    const dose = (line.match(/\b\d+(\.\d+)?\s?(mg|ml|mcg|gm|g)\b/i) || [null])[0];
    const m = line.match(/(?:x|for)\s*(\d{1,2})\s*(?:days?|din)/i) || line.match(/\b(\d{1,2})\s*days?\b/i);
    const n = m ? Number(m[1]) : null;
    items.push({
      sourceLine: line, generic: hit.generic, urdu: hit.urdu, brand: hit.brand || '', confidence: hit.confidence,
      matchedOn: hit.matchedOn, needsReview: hit.rescue ? true : hit.confidence < 0.8,
      rescue: !!hit.rescue, rescueNote: hit.rescueNote || '',
      alternatives: ranked.filter((x) => x.generic !== hit.generic).slice(0, 3),
      dose, days: n && n >= 1 && n <= 30 ? n : null,
      frequency: inferFrequencyFromLine(line),
      intervalHours: inferIntervalHours(line),
      timing: d.timing, purposeEn: d.purposeEn, purposeUr: d.purposeUr,
    });
  }
  const prescription = engine.prescriptionReview(items.map((x) => x.generic));
  ok(res, { items, prescription, linesRead: lines.length, matched: items.length, reviewRequired: items.some((x) => x.needsReview) || items.length < usable.length,
    unrecognisedLines: usable.filter((line) => !items.some((x) => x.sourceLine === line)),
    note: 'Handwritten OCR is not reliable enough to auto-select medicines. Only high-confidence matches are shown; confirm every medicine name, strength and instruction against the original prescription before saving.' });
});


app.post('/api/safety/interactions', (req, res) => {
  const drugs = asList(req.body?.drugs);
  if (drugs.length < 2) return bad(res, 400, 'at least 2 drugs are required');
  ok(res, engine.checkInteractions(drugs));
});

app.post('/api/safety/allergy', (req, res) => {
  const drugs = asList(req.body?.drugs);
  if (!drugs.length) return bad(res, 400, 'drugs[] is required');
  ok(res, engine.checkAllergies(drugs, asList(req.body?.allergies)));
});

// One call that runs every check a prescription needs.
app.post('/api/safety/review', (req, res) => {
  const drugs = asList(req.body?.drugs);
  if (!drugs.length) return bad(res, 400, 'drugs[] is required');
  const interactions = drugs.length > 1 ? engine.checkInteractions(drugs) : { interactions: [], duplicates: [], unchecked: [], summary: { major: 0, moderate: 0, minor: 0 } };
  const allergy = engine.checkAllergies(drugs, asList(req.body?.allergies));
  const food = drugs.map((d) => engine.foodAdvice(d)).filter((f) => f && f.notes.length);
  const risk = interactions.summary.major > 0 || allergy.alerts.some((a) => a.severity !== 'cross-low')
    ? 'high' : interactions.summary.moderate > 0 || allergy.alerts.length ? 'medium' : 'low';
  ok(res, { risk, interactions, allergy, food,
    escalate: risk === 'high' ? 'A pharmacist should review this combination before you continue.' : null });
});

app.post('/api/safety/prescription', (req, res) => {
  const drugs = asList(req.body?.drugs);
  if (!drugs.length) return bad(res, 400, 'drugs[] is required');
  ok(res, engine.prescriptionReview(drugs));
});

// Real Pakistani retail prices from DRAP, cheapest same-ingredient option first.
app.post('/api/price', (req, res) => {
  const { drug, brand, strength, form } = req.body || {};
  if (!drug) return bad(res, 400, 'drug is required');
  const r = engine.priceFor(drug, { brand, strength, form });
  if (!r) return bad(res, 404, 'drug not found');
  ok(res, r);
});

// Kidney/liver dose review. Estimates creatinine clearance when the inputs allow it.
app.post('/api/safety/organ', (req, res) => {
  const drugs = asList(req.body?.drugs);
  if (!drugs.length) return bad(res, 400, 'drugs[] is required');
  const { age, weightKg, creatinine, sex, liverDisease } = req.body || {};
  const kidney = engine.estimateKidney({ age, weightKg, creatinine, sex });
  ok(res, engine.organReview(drugs, { kidney, liverDisease: !!liverDisease }));
});

// Symptom triage: emergency red flags first, then whether the drug is known to cause it.
app.post('/api/side-effect', (req, res) => {
  const { drug, symptom } = req.body || {};
  if (!drug || !symptom) return bad(res, 400, 'drug and symptom are required');
  const r = engine.reportSideEffect(drug, symptom);
  if (!r) return bad(res, 404, 'drug not found');
  ok(res, r);
});

app.post('/api/missed-dose', (req, res) => {
  const { drug, hoursLate, consecutiveMisses } = req.body || {};
  if (!drug) return bad(res, 400, 'drug is required');
  const g = engine.missedDoseGuidance(drug, {
    hoursLate: Number(hoursLate) || 0,
    consecutiveMisses: Number(consecutiveMisses) || 1,
  });
  if (!g) return bad(res, 404, 'drug not found');
  ok(res, g);
});

// Optional human-pharmacist handoff. Configure contact details in environment variables;
// the app never pretends that an AI response is a licensed pharmacist.
app.post('/api/pharmacist-request', (req, res) => {
  const { question = '', medicines = [] } = req.body || {};
  const email = process.env.PHARMACIST_EMAIL || '';
  const whatsapp = process.env.PHARMACIST_WHATSAPP || '';
  if (!email && !whatsapp) return ok(res, { configured: false, message: 'Human pharmacist support is not configured for this deployment.' });
  ok(res, { configured: true, email, whatsapp, question: String(question).slice(0, 2000), medicines: asList(medicines).slice(0, 20) });
});

// Retrieval-based answers over the catalogue. No LLM, so it never invents a fact.
app.get('/api/global/index', (req, res) => {
  const q = String(req.query.q || '').trim();
  ok(res, { query: q, results: q ? globalIndexSearch(q, 20) : [], stats: globalIndexStats() });
});

app.post('/api/global/import', (req, res) => {
  const records = Array.isArray(req.body?.records) ? req.body.records : [];
  const saved = rememberGlobalRecords(records);
  ok(res, { saved: saved.length, stats: globalIndexStats() });
});

app.get('/api/global/search', async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return bad(res, 400, 'q is required');
  try { ok(res, await globalDrugSearch(q)); }
  catch { ok(res, { found: false, query: q, candidates: [], labels: [], sources: [], error: 'global sources unavailable' }); }
});

app.post('/api/global/ask', async (req, res) => {
  const q = String(req.body?.question || '').trim();
  if (!q) return bad(res, 400, 'question is required');
  try {
    const result = await globalDrugSearch(q);
    const answer = globalAnswer(q, result);
    if (!answer) return ok(res, { answered: false, global: true, answer: 'No verified global medicine record was found for that name.', answerUr: 'اس نام کی کوئی تصدیق شدہ عالمی دوا کی معلومات نہیں مل سکیں۔', sources: result.sources });
    ok(res, answer);
  } catch {
    ok(res, { answered: false, global: true, answer: 'Global medicine sources are temporarily unavailable. Please try again or use the medicine package name.', answerUr: 'عالمی دوا کے ماخذ اس وقت دستیاب نہیں۔ براہ کرم دوبارہ کوشش کریں یا پیک پر لکھا نام درج کریں۔' });
  }
});

app.post('/api/ask', async (req, res) => {
  const q = String(req.body?.question || '').trim();
  if (!q) return bad(res, 400, 'question is required');
  const { best } = engine.matchDrug(q, { minConfidence: 0.62 });
  if (!best || best.global) {
    try {
      const global = await globalDrugSearch(q);
      const globalResult = globalAnswer(q, global);
      if (globalResult) return ok(res, globalResult);
    } catch { /* local answer remains the safe fallback */ }
    return ok(res, { answered: false,
      answer: 'I could not identify the medicine in local or global medicine sources. Please type the exact name as written on the pack.',
      answerUr: 'میں اس دوا کو مقامی یا عالمی دوا کے ماخذ میں شناخت نہیں کر سکا۔ براہ کرم پیک پر لکھا ہوا درست نام درج کریں۔' });
  }

  const d = engine.getDrug(best.generic);
  const food = engine.foodAdvice(d.generic);
  const label = engine.getLabel(d.generic);
  const lower = q.toLowerCase();
  let answer, answerUr;

  if (/milk|dairy|doodh|lassi|yoghurt|dahi/.test(lower)) {
    const dairy = food.notes.find((n) => /dairy|Milk/i.test(n.item));
    answer = dairy ? dairy.en : `${d.generic} does not have a known problem with milk or dairy.`;
    answerUr = dairy ? dairy.ur : `${d.urdu} کے ساتھ دودھ یا دہی کا کوئی معلوم مسئلہ نہیں۔`;
  } else if (/kab|when|time|timing|waqt|khani|leni/.test(lower)) {
    const map = { before_meal: ['Take it before food.', 'کھانے سے پہلے لیں۔'], after_meal: ['Take it after food.', 'کھانے کے بعد لیں۔'], with_meal: ['Take it with food.', 'کھانے کے ساتھ لیں۔'], empty_stomach: ['Take it on an empty stomach, 30-60 minutes before eating.', 'خالی پیٹ، کھانے سے 30-60 منٹ پہلے لیں۔'], morning: ['Take it in the morning.', 'صبح لیں۔'], night: ['Take it at night.', 'رات کو لیں۔'], any: ['It can be taken at any time of day.', 'دن میں کسی بھی وقت لی جا سکتی ہے۔'] };
    const [en, ur] = map[d.timing] || map.any;
    answer = `${d.generic} — ${en}`; answerUr = `${d.urdu} — ${ur}`;
  } else if (/side.?effect|nuqsan|reaction/.test(lower)) {
    answer = label?.adverse_reactions || `Common side effects of ${d.generic} are listed on the pack insert.`;
    answerUr = `${d.urdu} کے مضر اثرات کے لیے نیچے دی گئی تفصیل دیکھیں۔`;
  } else if (/pregnan|hamal|breastfeed/.test(lower)) {
    answer = label?.pregnancy || 'Pregnancy information is not available for this medicine here — ask a pharmacist.';
    answerUr = 'حمل سے متعلق معلومات کے لیے فارماسسٹ سے پوچھیں۔';
  } else if (/drive|driving|gari/.test(lower)) {
    answer = d.noDriving || d.drowsy ? `${d.generic} can make you drowsy. Do not drive until you know how it affects you.` : `${d.generic} does not usually affect driving.`;
    answerUr = d.noDriving || d.drowsy ? `${d.urdu} سے نیند آ سکتی ہے۔ گاڑی نہ چلائیں۔` : `${d.urdu} عام طور پر ڈرائیونگ پر اثر نہیں کرتی۔`;
  } else {
    answer = `${d.generic} (${d.brands[0]}) — ${d.purposeEn}`;
    answerUr = `${d.urdu} — ${d.purposeUr}`;
  }

  ok(res, { answered: true, drug: d.generic, urdu: d.urdu, confidence: best.confidence,
    answer, answerUr,
    disclaimer: 'Information from open medicine data. Not a substitute for a pharmacist or doctor.' });
});

// An unknown /api path is a client error, not a page — answer in JSON rather
// than falling through to the SPA and returning HTML with a 200.
app.use('/api', (_req, res) => bad(res, 404, 'unknown endpoint'));

// Static client (built by Vite). Kept last so it never shadows the API.
const dist = path.join(ROOT, 'client', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  app.get('/', (_req, res) => res.type('text').send('DoseIQ API is running. Build the client with `npm run build`.'));
}

app.use((err, _req, res, _next) => { console.error(err); bad(res, 500, 'internal error'); });

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  const s = engine.stats();
  console.log(`DoseIQ on :${PORT} — ${s.drugs} drugs, ${s.brands} brands, ${s.interactionPairs.toLocaleString()} interactions`);
});
