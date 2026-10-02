// Clinical logic: drug matching, interactions, allergy cross-reactivity, missed-dose guidance.
import fs from 'node:fs';
import { globalIndexSearch } from './globalIndex.js';

const drugs = JSON.parse(fs.readFileSync('data/pk-drugs.json', 'utf8'));
const labels = JSON.parse(fs.readFileSync('data/build/labels.json', 'utf8'));
const { names, adj } = JSON.parse(fs.readFileSync('data/build/interactions.json', 'utf8'));
const brandAliases = JSON.parse(fs.readFileSync('data/brand-aliases.json', 'utf8'));
const ocrRescue = JSON.parse(fs.readFileSync('data/ocr-rescue.json', 'utf8'));

const SEV = { 3: 'major', 2: 'moderate', 1: 'minor', 0: 'unknown' };
const ddIndex = new Map(names.map((n, i) => [n.toLowerCase(), i]));

/* ---------- matching ---------- */

// Dose forms and strengths that doctors write around the drug name.
const NOISE = /\b(tab|tabs|tablet|cap|caps|capsule|syp|syrup|susp|inj|injection|drops|cream|oint|sachet|mg|ml|mcg|gm|g|bd|od|tds|qid|hs|sos|prn|stat|daily|twice|thrice|x|no|nos)\b|[0-9]+(\.[0-9]+)?/gi;
const clean = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s.]/g, ' ').replace(NOISE, ' ').replace(/\s+/g, ' ').trim();

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Every searchable string -> the catalogue entry it belongs to.
const lexicon = [];
for (const d of drugs) {
  lexicon.push({ term: d.generic.toLowerCase(), drug: d, kind: 'generic' });
  for (const b of d.brands) lexicon.push({ term: b.toLowerCase(), drug: d, kind: 'brand' });
}
for (const a of brandAliases) {
  const d = drugs.find((x) => x.generic.toLowerCase() === String(a.generic).toLowerCase());
  if (d) lexicon.push({ term: String(a.brand).toLowerCase(), drug: d, kind: 'brand', aliasSource: a.source });
}

/**
 * Resolve free text (often noisy OCR) to a catalogue drug.
 * Returns the best candidate with a 0-1 confidence, or null below threshold.
 */
// Header and footer lines on a prescription slip that must never be read as drugs.
const NON_DRUG = /\b(patient|name|age|sex|date|dr|doctor|clinic|hospital|ph|phone|address|signature|sign|mbbs|fcps|rx|advice|follow|review|diagnosis|regd|reg|no)\b/i;
export const looksLikeMedicineLine = (line) => {
  const s = String(line || '');
  if (NON_DRUG.test(s)) {
    // Keep it only if it also carries an explicit dose form or strength.
    return /\b(tab|cap|syp|susp|inj|drops|sachet|oint)\b/i.test(s) || /\d+\s?(mg|ml|mcg|gm)\b/i.test(s);
  }
  return true;
};

// OCR often turns package lettering into predictable variants (e.g. 1/l, 0/o).
// Keep a small, explicit alias layer before fuzzy matching so a clear brand can
// still be recovered without lowering the global confidence threshold.
const OCR_ALIASES = new Map([
  ...brandAliases.map((a) => [String(a.brand).toLowerCase(), String(a.brand)]),
  ['valmera', 'Valmera'], ['va1mera', 'Valmera'], ['valm era', 'Valmera'],
  ['valrnera', 'Valmera'], ['valmara', 'Valmera'], ['mirogabalin', 'Mirogabalin'],
  ['mirogaba1in', 'Mirogabalin'], ['mirogaballn', 'Mirogabalin'],
  ['calcite 600', 'Calcite 600'], ['calcite', 'Calcite'],
  ['cobolmin sl', 'Cobolmin SL'], ['cobolmin sl 500 mcg', 'Cobolmin SL 500 mcg'],
  ['wilgesic', 'Wilgesic'], ['wilgesic forte', 'Wilgesic Forte'],
]);

const normalizeOcr = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s.]/g, ' ')
  .replace(/1/g, 'l').replace(/0/g, 'o').replace(/5/g, 's')
  .replace(/rn/g, 'm').replace(/vv/g, 'w').replace(/\s+/g, ' ').trim();

export function matchDrug(raw, { limit = 5, minConfidence = 0.55 } = {}) {
  const original = String(raw || '');
  const rawKey = original.toLowerCase().replace(/[^a-z0-9\s.]/g, ' ').replace(/\s+/g, ' ').trim();
  const q = clean(original);
  if (!q) return { best: null, candidates: [] };

  // Explicit aliases are safer than broad fuzzy matching for branded packs.
  const normalizedKey = normalizeOcr(rawKey);
  const normalizedTokens = normalizedKey.split(' ').filter(Boolean);
  const aliasKey = OCR_ALIASES.has(rawKey) ? rawKey
    : (OCR_ALIASES.has(q) ? q
      : (OCR_ALIASES.has(normalizedKey) ? normalizedKey
        : (normalizedTokens.find((token) => OCR_ALIASES.has(token)) || clean(normalizedKey))));
  const aliasTerm = OCR_ALIASES.get(aliasKey) || OCR_ALIASES.get(normalizedTokens.join(' '));
  if (aliasTerm) {
    const exact = lexicon.find((x) => x.term === aliasTerm.toLowerCase());
    if (exact) {
      const hit = { generic: exact.drug.generic, urdu: exact.drug.urdu, matchedOn: exact.term, brand: exact.kind === 'brand' ? exact.term : '', confidence: 0.99 };
      return { best: hit, candidates: [hit] };
    }
  }
  const globalHits = globalIndexSearch(original, Math.max(limit, 8));
  if (globalHits.length) {
    const mapped = globalHits.map((g) => ({
      generic: g.generic, urdu: '', matchedOn: g.brand || g.pack || g.generic,
      brand: g.brand || '', confidence: Math.min(0.99, Math.max(0.86, g.confidence || 0.86)),
      global: true, rxcui: g.rxcui || '', strength: g.strength || '', dosageForm: g.dosageForm || '',
    }));
    // A persistent global index result is safer than fuzzy-matching it to an unrelated local drug.
    return { best: mapped[0], candidates: mapped.slice(0, limit) };
  }
  const tokens = q.split(' ').filter((t) => t.length >= 3);
  const probes = [q, ...tokens];
  const scores = new Map();

  for (const entry of lexicon) {
    let best = 0;
    const shortTerm = entry.term.length <= 4;
    for (const p of probes) {
      let s;
      if (p === entry.term) s = 1;
      // "Alp" (a brand) must not fuzzy-match "Ali" (a patient's name).
      else if (shortTerm) continue;
      else if (entry.term.startsWith(p) || p.startsWith(entry.term)) {
        s = 0.9 * (Math.min(p.length, entry.term.length) / Math.max(p.length, entry.term.length));
      } else {
        const dist = levenshtein(p, entry.term);
        s = 1 - dist / Math.max(p.length, entry.term.length);
        // OCR reads letters wrongly far more often than it invents them, so be
        // forgiving on similar-length words and harsh on length mismatches.
        if (Math.abs(p.length - entry.term.length) > 3) s *= 0.6;
      }
      if (entry.kind === 'brand') s *= 1.02; // prescriptions in Pakistan name brands
      best = Math.max(best, s);
    }
    const prev = scores.get(entry.drug.generic);
    if (!prev || best > prev.score) scores.set(entry.drug.generic, { score: best, drug: entry.drug, via: entry.term });
  }

  const ranked = [...scores.values()].sort((a, b) => b.score - a.score).slice(0, limit)
    .map((r) => ({ generic: r.drug.generic, urdu: r.drug.urdu, matchedOn: r.via, brand: (r.drug.brands || []).find((b) => b.toLowerCase() === r.via) || '', confidence: Math.min(1, +r.score.toFixed(3)) }));
  const best = ranked[0] && ranked[0].confidence >= minConfidence ? ranked[0] : null;
  return { best, candidates: ranked };
}


function rescueScanLine(line) {
  const normalized = normalizeOcr(line);
  if (!normalized) return [];
  const out = [];
  for (const r of ocrRescue) {
    const f = normalizeOcr(r.fragment);
    if (!f || f.length < 3) continue;
    // Only rescue fragments that are explicitly present in OCR output. This is
    // deliberately not broad fuzzy matching: false-positive medicine names are
    // more dangerous than leaving a line for confirmation.
    const present = f.includes(' ') ? normalized.includes(f) : new RegExp(`\\b${f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(normalized);
    if (!present) continue;
    const d = r.generic ? getDrug(r.generic) : null;
    if (!d) continue;
    out.push({
      generic: d.generic, urdu: d.urdu, matchedOn: r.fragment, brand: r.brand,
      confidence: 0.62, sourceLine: line, rescue: true,
      rescueNote: r.source,
    });
  }
  return out;
}

export function matchScanText(lines, { limit = 8 } = {}) {
  const cleanLines = (Array.isArray(lines) ? lines : [lines]).map(String).map((x) => x.trim()).filter(Boolean);
  const candidates = [];
  const seen = new Set();
  // Safety rule: prescription OCR is suggestion-only. Do NOT turn arbitrary
  // handwriting/OCR noise into a medicine merely because a fuzzy match exists.
  // A candidate below this threshold is shown as unrecognised text instead.
  const SCAN_MIN = 0.78;
  for (const line of cleanLines) {
    const hit = matchDrug(line, { limit: 3, minConfidence: SCAN_MIN });
    let accepted = false;
    for (const c of hit.candidates) {
      if (c.confidence < SCAN_MIN || seen.has(c.generic)) continue;
      seen.add(c.generic);
      candidates.push({ ...c, sourceLine: line, rescue: false });
      accepted = true;
    }
    // If normal fuzzy matching cannot reach the safe threshold, use only an
    // explicit OCR fragment rescue. These results are always review-required.
    if (!accepted) {
      for (const c of rescueScanLine(line)) {
        if (seen.has(c.generic)) continue;
        seen.add(c.generic);
        candidates.push(c);
      }
    }
  }
  // A package name may be split across OCR lines; only accept the joined pass
  // when it independently reaches the same conservative confidence threshold.
  if (cleanLines.length > 1) {
    const joined = cleanLines.join(' ');
    const hit = matchDrug(joined, { limit: 5, minConfidence: SCAN_MIN });
    for (const c of hit.candidates) {
      if (c.confidence < SCAN_MIN || seen.has(c.generic)) continue;
      seen.add(c.generic);
      candidates.push({ ...c, sourceLine: joined, rescue: false });
    }
    for (const c of rescueScanLine(joined)) {
      if (seen.has(c.generic)) continue;
      seen.add(c.generic);
      candidates.push(c);
    }
  }
  return candidates.sort((a, b) => b.confidence - a.confidence).slice(0, limit);
}

export const getDrug = (generic) => drugs.find((d) => d.generic.toLowerCase() === String(generic).toLowerCase()) || null;
export const allDrugs = () => drugs;
export const getLabel = (generic) => labels[generic] || null;

/* ---------- interactions ---------- */

/**
 * Check every pair among the given drugs. Drugs absent from DDInter are reported
 * as unchecked rather than silently passing as safe.
 */
export function checkInteractions(generics) {
  const resolved = generics.map(getDrug).filter(Boolean);
  const found = [];
  const unchecked = [];
  let checkedPairs = 0;
  let noKnownInteractionPairs = 0;

  for (const d of resolved) if (d.interactionData === 'none') unchecked.push(d.generic);

  for (let i = 0; i < resolved.length; i++) {
    for (let j = i + 1; j < resolved.length; j++) {
      const A = resolved[i], B = resolved[j];
      if (A.interactionData === 'none' || B.interactionData === 'none') continue;
      const ia = ddIndex.get(A.ddinter.toLowerCase());
      const ib = ddIndex.get(B.ddinter.toLowerCase());
      if (ia === undefined || ib === undefined) continue;
      checkedPairs += 1;
      const hit = (adj[ia] || []).find(([other]) => other === ib);
      if (!hit) { noKnownInteractionPairs += 1; continue; }
      const severity = SEV[hit[1]];
      if (severity === 'unknown') { noKnownInteractionPairs += 1; continue; }
      found.push({
        a: A.generic, b: B.generic, aUrdu: A.urdu, bUrdu: B.urdu, severity,
        advice: adviceFor(severity, A, B),
        adviceUr: adviceForUr(severity, A, B),
      });
    }
  }

  // Same-class duplicates are a real-world prescribing error the pair list won't catch.
  const duplicates = [];
  const byGroup = {};
  for (const d of resolved) (byGroup[d.allergyGroup] ||= []).push(d.generic);
  for (const [group, list] of Object.entries(byGroup)) {
    if (list.length > 1) duplicates.push({ group, drugs: list });
  }

  const order = { major: 0, moderate: 1, minor: 2 };
  found.sort((x, y) => order[x.severity] - order[y.severity]);
  return { interactions: found, duplicates, unchecked,
    summary: { major: found.filter((f) => f.severity === 'major').length,
      moderate: found.filter((f) => f.severity === 'moderate').length,
      minor: found.filter((f) => f.severity === 'minor').length,
      checkedPairs, noKnownInteractionPairs } };
}

function adviceFor(sev, A, B) {
  if (sev === 'major') return `Do not take ${A.generic} and ${B.generic} together without asking a doctor or pharmacist first.`;
  if (sev === 'moderate') return `${A.generic} and ${B.generic} can affect each other. Space the doses apart and tell your doctor you take both.`;
  return `${A.generic} and ${B.generic} have a mild interaction. Usually fine, but mention it at your next visit.`;
}
function adviceForUr(sev, A, B) {
  if (sev === 'major') return `${A.urdu} اور ${B.urdu} ایک ساتھ نہ لیں۔ پہلے ڈاکٹر یا فارماسسٹ سے پوچھیں۔`;
  if (sev === 'moderate') return `${A.urdu} اور ${B.urdu} ایک دوسرے پر اثر ڈال سکتی ہیں۔ وقفے سے لیں اور ڈاکٹر کو بتائیں۔`;
  return `${A.urdu} اور ${B.urdu} میں معمولی تعامل ہے۔ عام طور پر ٹھیک ہے، ڈاکٹر کو بتا دیں۔`;
}


/* ---------- prescription review ---------- */

// High-value administration-separation rules used for prescription review.
// These are intentionally narrow and evidence-backed: the app must not invent a
// universal gap for every medicine pair. The prescription/label wins.
const SEPARATION_RULES = [
  {
    antibiotics: ['Ciprofloxacin'], supplements: ['Calcium Carbonate','Ferrous Sulfate','Zinc Sulfate'],
    hoursBefore: 2, hoursAfter: 4,
    level: 'major',
    en: 'Separate this supplement from ciprofloxacin. For oral ciprofloxacin, leave at least 2 hours before or 4 hours after the supplement unless the product label says otherwise.',
    ur: 'اس سپلیمنٹ اور سیپروفلوکساسن کے درمیان وقفہ رکھیں۔ عام طور پر سیپروفلوکساسن سپلیمنٹ سے کم از کم 2 گھنٹے پہلے یا 4 گھنٹے بعد لی جاتی ہے، مگر دوا کے لیبل کی ہدایت کو ترجیح دیں۔'
  },
  {
    antibiotics: ['Doxycycline'], supplements: ['Calcium Carbonate','Ferrous Sulfate','Zinc Sulfate'],
    hoursBefore: 2, hoursAfter: 2,
    level: 'major',
    en: 'Separate this mineral supplement from doxycycline because calcium, iron and zinc can reduce absorption. Leave about 2 hours before or after the dose, following the product label/pharmacist advice.',
    ur: 'اس منرل سپلیمنٹ اور ڈوکسی سائیکلین کے درمیان وقفہ رکھیں کیونکہ کیلشیم، آئرن اور زنک جذب کم کر سکتے ہیں۔ عموماً خوراک سے تقریباً 2 گھنٹے پہلے یا بعد وقفہ رکھا جاتا ہے؛ لیبل یا فارماسسٹ کی ہدایت کو ترجیح دیں۔'
  },
  {
    antibiotics: ['Levofloxacin'], supplements: ['Calcium Carbonate','Ferrous Sulfate','Zinc Sulfate'],
    hoursBefore: 2, hoursAfter: 2,
    level: 'major',
    en: 'Mineral supplements can reduce fluoroquinolone absorption. Keep calcium, iron and zinc separated from levofloxacin and follow the exact product label for the interval.',
    ur: 'کیلشیم، آئرن اور زنک جیسے منرل سپلیمنٹ فلوروکوئنولون اینٹی بائیوٹک کے جذب کو کم کر سکتے ہیں۔ لیوو فلوکساسن اور سپلیمنٹ کے درمیان وقفہ رکھیں اور درست وقفے کے لیے لیبل کی ہدایت دیکھیں۔'
  }
];

const uniq = (xs) => [...new Set(xs)];
export function prescriptionReview(generics) {
  const resolved = uniq(generics.map(getDrug).filter(Boolean).map((d) => d.generic));
  const antibiotics = resolved.filter((g) => getDrug(g)?.class === 'antibiotic');
  const supplements = resolved.filter((g) => getDrug(g)?.class === 'supplement');
  const alerts = [];
  for (const rule of SEPARATION_RULES) {
    for (const a of antibiotics) for (const s of supplements) {
      if (rule.antibiotics.includes(a) && rule.supplements.includes(s)) {
        alerts.push({ antibiotic: a, supplement: s, level: rule.level, hoursBefore: rule.hoursBefore,
          hoursAfter: rule.hoursAfter, message: rule.en, messageUr: rule.ur });
      }
    }
  }
  return {
    medicines: resolved.map((g) => ({ generic: g, type: getDrug(g)?.class === 'antibiotic' ? 'antibiotic' : getDrug(g)?.class === 'supplement' ? 'supplement' : 'medicine' })),
    antibiotics, supplements, spacingAlerts: alerts,
    summary: { antibiotics: antibiotics.length, supplements: supplements.length, spacingAlerts: alerts.length },
    note: 'This is a screening aid. Prescription instructions, medicine-specific labeling and pharmacist/doctor advice take priority.'
  };
}

/* ---------- allergy ---------- */

// Documented cross-reactivity between drug families.
const CROSS = {
  penicillin: [{ group: 'cephalosporin', risk: 'low', note: 'Around 1-3% of people allergic to penicillin also react to cephalosporins.' }],
  cephalosporin: [{ group: 'penicillin', risk: 'low', note: 'Some cross-reactivity with penicillins is possible.' }],
  sulfonamide: [{ group: 'sulfonamide', risk: 'high', note: 'Includes some diuretics and antibiotics that share the sulfa group.' }],
  nsaid: [{ group: 'nsaid', risk: 'high', note: 'A reaction to one NSAID often means a reaction to others, including aspirin.' }],
  macrolide: [{ group: 'macrolide', risk: 'high', note: 'Azithromycin, clarithromycin and erythromycin are closely related.' }],
  quinolone: [{ group: 'quinolone', risk: 'high', note: 'Ciprofloxacin and levofloxacin are in the same family.' }],
};

export function checkAllergies(generics, allergyGroups = []) {
  const alerts = [];
  const patient = allergyGroups.map((g) => String(g).toLowerCase());
  for (const g of generics) {
    const d = getDrug(g);
    if (!d) continue;
    if (patient.includes(d.allergyGroup)) {
      alerts.push({ drug: d.generic, urdu: d.urdu, severity: 'direct', group: d.allergyGroup,
        message: `You have recorded an allergy to ${d.allergyGroup}. ${d.generic} belongs to this group — do not take it without medical advice.`,
        messageUr: `آپ کو ${d.allergyGroup} سے الرجی درج ہے۔ ${d.urdu} اسی گروپ کی دوا ہے — ڈاکٹر سے مشورہ کیے بغیر نہ لیں۔` });
      continue;
    }
    for (const allergy of patient) {
      for (const x of CROSS[allergy] || []) {
        if (x.group === d.allergyGroup) {
          alerts.push({ drug: d.generic, urdu: d.urdu, severity: x.risk === 'high' ? 'cross-high' : 'cross-low',
            group: d.allergyGroup, message: `You are allergic to ${allergy}. ${x.note} Check with a pharmacist before taking ${d.generic}.`,
            messageUr: `آپ کو ${allergy} سے الرجی ہے۔ ${d.urdu} لینے سے پہلے فارماسسٹ سے مشورہ کریں۔` });
        }
      }
    }
  }
  return { alerts, checked: generics.length };
}

/* ---------- missed dose ---------- */

// Medicine-specific guidance. The unsafe default is "just take it now", so each
// class gets its own rule and doubling is never advised.
const MISSED = {
  prn: { en: 'This medicine is taken only when you need it. Skip the missed dose — do not take two at once.', ur: 'یہ دوا صرف ضرورت پر لی جاتی ہے۔ چھوٹی ہوئی خوراک چھوڑ دیں — دو ایک ساتھ نہ لیں۔', double: false },
  antibiotic_fixed: { en: 'Take it as soon as you remember. If your next dose is due in under 4 hours, skip the missed one. Never take two together, and finish the full course even if you feel better.', ur: 'یاد آتے ہی لے لیں۔ اگر اگلی خوراک 4 گھنٹے سے کم میں ہے تو چھوڑ دیں۔ دو ایک ساتھ نہ لیں، اور کورس پورا کریں چاہے طبیعت بہتر ہو۔', double: false, escalate: 2 },
  once_daily: { en: 'If you remember on the same day, take it. If it is already the next day, skip it and carry on as normal.', ur: 'اگر اسی دن یاد آئے تو لے لیں۔ اگلا دن ہو چکا ہو تو چھوڑ دیں اور معمول جاری رکھیں۔', double: false },
  hypo_risk: { en: 'Only take it if you are about to eat. If the meal has passed, skip it — taking it without food can drop your blood sugar dangerously low.', ur: 'صرف اس صورت لیں اگر آپ کھانا کھانے والے ہیں۔ کھانا گزر چکا ہو تو چھوڑ دیں — خالی پیٹ لینے سے شوگر خطرناک حد تک گر سکتی ہے۔', double: false, escalate: 2 },
  with_food_skip: { en: 'Take it with your next meal. Do not take a double dose to catch up — that commonly causes stomach upset.', ur: 'اگلے کھانے کے ساتھ لے لیں۔ دگنی خوراک نہ لیں — اس سے معدہ خراب ہوتا ہے۔', double: false },
  levothyroxine: { en: 'Take it later the same day on an empty stomach. If you only remember the next day, take that day\'s dose as usual — do not double.', ur: 'اسی دن بعد میں خالی پیٹ لے لیں۔ اگلے دن یاد آئے تو صرف اس دن کی خوراک لیں — دگنی نہ لیں۔', double: false },
  anticoagulant: { en: 'Take it the same day if you remember. Never take a double dose — that raises bleeding risk. Tell your pharmacist you missed one.', ur: 'اسی دن یاد آئے تو لے لیں۔ دگنی خوراک ہرگز نہ لیں — خون بہنے کا خطرہ بڑھتا ہے۔ فارماسسٹ کو بتائیں۔', double: false, escalate: 1 },
  insulin: { en: 'Do not take a catch-up dose. Check your blood sugar and follow your usual sliding scale, or contact your doctor.', ur: 'چھوٹی ہوئی خوراک بعد میں نہ لگائیں۔ شوگر چیک کریں اور معمول کے مطابق چلیں، یا ڈاکٹر سے رابطہ کریں۔', double: false, escalate: 1 },
  steroid_taper: { en: 'Take it as soon as you remember. Do not stop this medicine suddenly — contact your doctor if you have missed more than one dose.', ur: 'یاد آتے ہی لے لیں۔ یہ دوا اچانک بند نہ کریں — ایک سے زیادہ خوراک چھوٹ جائے تو ڈاکٹر سے رابطہ کریں۔', double: false, escalate: 1 },
  ssri: { en: 'Take it as soon as you remember, unless your next dose is close. Missing several doses can cause dizziness and flu-like feelings.', ur: 'یاد آتے ہی لے لیں، اگر اگلی خوراک قریب نہ ہو۔ کئی خوراکیں چھوٹنے سے چکر اور بخار جیسی کیفیت ہو سکتی ہے۔', double: false, escalate: 3 },
  anticonvulsant: { en: 'Take it as soon as you remember — missed doses can trigger a seizure. Do not double up. Contact your doctor if you missed more than one.', ur: 'یاد آتے ہی لے لیں — خوراک چھوٹنے سے دورہ پڑ سکتا ہے۔ دگنی نہ لیں۔ ایک سے زیادہ چھوٹ جائے تو ڈاکٹر سے رابطہ کریں۔', double: false, escalate: 1 },
  no_double_bp: { en: 'Take it when you remember. If it is nearly time for the next dose, skip it — two together can drop your blood pressure too far.', ur: 'یاد آتے ہی لے لیں۔ اگلی خوراک کا وقت قریب ہو تو چھوڑ دیں — دو ایک ساتھ لینے سے بلڈ پریشر بہت گر سکتا ہے۔', double: false },
  diuretic: { en: 'Take it if it is still morning or early afternoon. Skip it if the evening has started, or you will be up at night passing urine.', ur: 'صبح یا دوپہر تک ہو تو لے لیں۔ شام ہو چکی ہو تو چھوڑ دیں، ورنہ رات بھر پیشاب آتا رہے گا۔', double: false },
  sedative: { en: 'Skip the missed dose if you are near your next one. Do not take extra — these medicines build up and cause heavy drowsiness.', ur: 'اگلی خوراک قریب ہو تو چھوڑ دیں۔ زیادہ نہ لیں — یہ دوائیں جمع ہو کر شدید غنودگی پیدا کرتی ہیں۔', double: false },
  supplement: { en: 'Simply take it when you remember, or resume tomorrow. Missing one dose is not a problem.', ur: 'یاد آنے پر لے لیں یا کل سے دوبارہ شروع کریں۔ ایک خوراک چھوٹنا مسئلہ نہیں۔', double: false },
  inhaler_prn: { en: 'This inhaler is used when you have symptoms. Use it if you feel breathless — there is no missed dose to make up.', ur: 'یہ انہیلر علامات ہونے پر استعمال ہوتا ہے۔ سانس پھولے تو استعمال کریں — چھوٹی ہوئی خوراک پوری کرنے کی ضرورت نہیں۔' , double: false },
};

export function missedDoseGuidance(generic, { hoursLate = 0, consecutiveMisses = 1 } = {}) {
  const d = getDrug(generic);
  if (!d) return null;
  const rule = MISSED[d.missedRule] || MISSED.once_daily;
  const escalate = rule.escalate !== undefined && consecutiveMisses >= rule.escalate;
  return {
    drug: d.generic, urdu: d.urdu, rule: d.missedRule,
    guidance: rule.en, guidanceUr: rule.ur,
    neverDouble: rule.double === false,
    hoursLate, consecutiveMisses,
    escalate,
    escalation: escalate
      ? (consecutiveMisses >= 3
        ? { level: 'pharmacist', message: `${consecutiveMisses} doses of ${d.generic} missed in a row. A pharmacist should review this.` }
        : { level: 'caregiver', message: `${consecutiveMisses} missed doses of ${d.generic}. Your caregiver has been notified.` })
      : null,
    courseWarning: d.course ? 'This is an antibiotic. Stopping early can let the infection come back stronger and build resistance.' : null,
    courseWarningUr: d.course ? 'یہ اینٹی بائیوٹک ہے۔ کورس ادھورا چھوڑنے سے انفیکشن دوبارہ اور زیادہ شدت سے ہو سکتا ہے۔' : null,
  };
}

/* ---------- food & lifestyle ---------- */

export function foodAdvice(generic) {
  const d = getDrug(generic);
  if (!d) return null;
  const notes = [];
  if (d.avoidDairy) notes.push({ item: 'Milk, yoghurt, lassi', en: 'Do not take with dairy — calcium blocks absorption. Leave 2 hours either side.', ur: 'دودھ، دہی یا لسی کے ساتھ نہ لیں — کیلشیم دوا کو جذب ہونے سے روکتا ہے۔ 2 گھنٹے کا وقفہ رکھیں۔' });
  if (d.avoidGrapefruit) notes.push({ item: 'Grapefruit', en: 'Avoid grapefruit juice — it raises the level of this medicine in your blood.', ur: 'چکوترے کا رس نہ لیں — یہ دوا کی مقدار خون میں بڑھا دیتا ہے۔' });
  if (d.avoidAlcohol) notes.push({ item: 'Alcohol', en: 'Do not drink alcohol during the course and for 48 hours after — it causes severe vomiting with this medicine.', ur: 'اس دوا کے دوران اور 48 گھنٹے بعد تک الکحل نہ لیں — شدید قے ہو سکتی ہے۔' });
  if (d.timing === 'empty_stomach') notes.push({ item: 'Chai / breakfast', en: 'Take it 30-60 minutes before chai or breakfast, on an empty stomach.', ur: 'چائے یا ناشتے سے 30-60 منٹ پہلے خالی پیٹ لیں۔' });
  if (d.class === 'nsaid') notes.push({ item: 'Empty stomach', en: 'Always take with food — on an empty stomach this can irritate or ulcerate the stomach.', ur: 'ہمیشہ کھانے کے ساتھ لیں — خالی پیٹ معدے میں زخم بنا سکتی ہے۔' });
  return { drug: d.generic, timing: d.timing, notes, drowsy: !!d.drowsy, noDriving: !!d.noDriving };
}

export const stats = () => ({
  drugs: drugs.length,
  brands: drugs.reduce((n, d) => n + d.brands.length, 0),
  interactionDrugs: names.length,
  interactionPairs: Object.values(adj).reduce((n, a) => n + a.length, 0) / 2,
  labels: Object.keys(labels).length,
});

/* ---------- pricing (DRAP) ---------- */

let prices = { byGeneric: {} };
try { prices = JSON.parse(fs.readFileSync('data/build/prices.json', 'utf8')); } catch { /* optional dataset */ }

/**
 * Real Pakistani retail prices for a drug, cheapest first, so a patient can see
 * whether a cheaper brand of the same ingredient exists.
 */
export function priceFor(generic, { strength = null, brand = null, form = null, limit = 8 } = {}) {
  const d = getDrug(generic);
  if (!d) return null;
  const all = prices.byGeneric?.[d.generic] || [];

  // Comparing a syrup against an injection is not a saving, so compare like with like.
  const formOf = (name) => {
    const n = name.toLowerCase();
    if (/injection|vial|ampoule|infusion/.test(n)) return 'injection';
    if (/syrup|suspension|solution|drops|elixir/.test(n)) return 'liquid';
    if (/cream|ointment|gel|lotion/.test(n)) return 'topical';
    if (/sachet|powder|granule/.test(n)) return 'sachet';
    return 'oral';
  };
  const wanted = form || 'oral';
  let list = all.filter((p) => formOf(p.name) === wanted);
  if (!list.length) list = all;

  if (strength) {
    const num = String(strength).match(/\d+/)?.[0];
    if (num) {
      const same = list.filter((p) => p.name.includes(num));
      if (same.length) list = same;
    }
  }

  const shown = list.slice(0, limit);
  const cheapest = list[0] || null;
  const dearest = list[list.length - 1] || null;

  // A saving only makes sense against the brand the patient actually holds.
  const current = brand
    ? list.find((p) => new RegExp(`\\b${String(brand).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(p.name))
    : null;
  const saving = current && cheapest && current.price > cheapest.price
    ? { from: current, to: cheapest, rupees: +(current.price - cheapest.price).toFixed(2),
        percent: Math.round(100 * (1 - cheapest.price / current.price)) }
    : null;

  return {
    drug: d.generic, urdu: d.urdu, form: wanted, count: list.length, products: shown,
    cheapest, current, saving,
    range: cheapest && dearest && dearest.price > cheapest.price
      ? { min: cheapest.price, max: dearest.price,
          spread: Math.round(100 * (1 - cheapest.price / dearest.price)) }
      : null,
    source: prices.source || null,
  };
}

/* ---------- renal & hepatic ---------- */

/**
 * Cockcroft-Gault creatinine clearance. Returns null unless every input is present,
 * because a half-filled estimate is worse than none.
 */
export function estimateKidney({ age, weightKg, creatinine, sex }) {
  const a = Number(age), w = Number(weightKg), cr = Number(creatinine);
  if (!a || !w || !cr || a <= 0 || w <= 0 || cr <= 0) return null;
  let crcl = ((140 - a) * w) / (72 * cr);
  if (String(sex).toLowerCase().startsWith('f')) crcl *= 0.85;
  crcl = Math.round(crcl);
  const stage = crcl >= 90 ? 'normal' : crcl >= 60 ? 'mild' : crcl >= 30 ? 'moderate' : crcl >= 15 ? 'severe' : 'failure';
  return { crcl, stage, formula: 'Cockcroft-Gault' };
}

export function organReview(generics, { kidney = null, liverDisease = false } = {}) {
  const flags = [];
  for (const g of generics) {
    const d = getDrug(g);
    if (!d) continue;
    if (d.renal && kidney?.crcl != null) {
      const { avoidBelow, adjustBelow, note, noteUr } = d.renal;
      if (avoidBelow != null && kidney.crcl < avoidBelow) {
        flags.push({ drug: d.generic, urdu: d.urdu, organ: 'kidney', level: 'avoid',
          message: `Kidney function is ${kidney.crcl} mL/min. ${note}`, messageUr: noteUr });
      } else if (adjustBelow != null && kidney.crcl < adjustBelow) {
        flags.push({ drug: d.generic, urdu: d.urdu, organ: 'kidney', level: 'adjust',
          message: `Kidney function is ${kidney.crcl} mL/min. ${note}`, messageUr: noteUr });
      }
    }
    if (d.hepatic && liverDisease) {
      flags.push({ drug: d.generic, urdu: d.urdu, organ: 'liver', level: d.hepatic.level,
        message: d.hepatic.note, messageUr: d.hepatic.noteUr });
    }
  }
  const order = { avoid: 0, adjust: 1, caution: 2 };
  flags.sort((a, b) => (order[a.level] ?? 3) - (order[b.level] ?? 3));
  // Say plainly when nothing could be checked, rather than implying all-clear.
  const checkable = generics.map(getDrug).filter((d) => d && (d.renal || d.hepatic)).length;
  return { flags, checkable, kidney, liverDisease,
    incomplete: !kidney && !liverDisease ? 'No kidney or liver information entered, so these checks were not run.' : null };
}

/* ---------- side effect reporting ---------- */

// Symptoms that mean stop and get help, regardless of which medicine caused them.
const RED_FLAGS = [
  { match: /breath|saans|choking|wheez|suffocat/i, en: 'Difficulty breathing', ur: 'سانس لینے میں دشواری' },
  { match: /swell|soojan|face|lip|tongue|throat/i, en: 'Swelling of face, lips or tongue', ur: 'چہرے، ہونٹ یا زبان کی سوجن' },
  { match: /blister|peel|severe rash|skin.*(com|fall)/i, en: 'Blistering or peeling skin', ur: 'جلد پر چھالے یا کھال اترنا' },
  { match: /chest pain|seene? me?in dard|heart/i, en: 'Chest pain', ur: 'سینے میں درد' },
  { match: /bleed|khoon|blood in|black stool|vomit.*blood/i, en: 'Bleeding', ur: 'خون آنا' },
  { match: /yellow|jaundice|peeli|dark urine/i, en: 'Yellow eyes or skin', ur: 'آنکھیں یا جلد کا پیلا ہونا' },
  { match: /faint|behosh|unconscious|collapse|seizure|fit|dora/i, en: 'Fainting or fits', ur: 'بے ہوشی یا دورہ' },
  { match: /confus|slurred|weakness on one side|stroke/i, en: 'Confusion or slurred speech', ur: 'الجھن یا زبان لڑکھڑانا' },
];

/**
 * Triages a reported symptom: emergency red flags first, then whether the medicine
 * is actually known to cause it.
 */
// Patients describe symptoms in plain words (and Roman Urdu); labels use clinical
// terms. Without this bridge, real side effects read as "not known".
const SYMPTOM_SYNONYMS = {
  sleepy: ['somnolence', 'drowsi', 'sedation', 'fatigue'],
  drowsy: ['somnolence', 'sedation'],
  tired: ['fatigue', 'asthenia', 'malaise'],
  neend: ['somnolence', 'drowsi'],
  dizzy: ['dizziness', 'vertigo', 'lightheaded'],
  chakkar: ['dizziness', 'vertigo'],
  sick: ['nausea', 'vomiting'],
  vomit: ['vomiting', 'emesis'],
  ulti: ['vomiting', 'nausea'],
  matli: ['nausea'],
  itchy: ['pruritus', 'itching'],
  itching: ['pruritus'],
  khujli: ['pruritus', 'itching', 'rash'],
  rash: ['rash', 'urticaria', 'erythema'],
  dana: ['rash', 'urticaria'],
  loose: ['diarrhea', 'diarrhoea'],
  dast: ['diarrhea', 'diarrhoea'],
  motions: ['diarrhea', 'diarrhoea'],
  constipated: ['constipation'],
  qabz: ['constipation'],
  headache: ['headache', 'cephalgia'],
  sardard: ['headache'],
  stomach: ['abdominal', 'gastrointestinal', 'dyspepsia'],
  pait: ['abdominal', 'gastrointestinal'],
  heartburn: ['dyspepsia', 'gastroesophageal', 'reflux'],
  cramps: ['cramp', 'myalgia', 'spasm'],
  'muscle': ['myalgia', 'myopathy', 'rhabdomyolysis'],
  ache: ['pain', 'algia'],
  swelling: ['edema', 'oedema', 'angioedema'],
  bruise: ['bruising', 'ecchymosis', 'purpura', 'bleed', 'hemorrh', 'haemorrh'],
  bruising: ['bruising', 'ecchymosis', 'purpura', 'bleed', 'hemorrh', 'haemorrh'],
  nakseer: ['epistaxis', 'nosebleed', 'bleed'],
  appetite: ['anorexia', 'appetite'],
  weight: ['weight'],
  sweating: ['hyperhidrosis', 'diaphoresis', 'sweating'],
  thirsty: ['polydipsia', 'thirst'],
  urine: ['urinary', 'micturition'],
  peshab: ['urinary', 'micturition'],
};

export function reportSideEffect(generic, symptom) {
  const text = String(symptom || '').trim();
  if (!text) return null;
  const d = getDrug(generic);

  const red = RED_FLAGS.filter((f) => f.match.test(text));

  // On an anticoagulant or antiplatelet, easy bruising is an early bleeding sign.
  if (d?.bleedRisk && /bruis|bleed|khoon|nakseer|nose ?bleed|gums|black stool|purple/i.test(text)) {
    return { severity: 'emergency', drug: d.generic, symptom: text, matched: ['bleeding risk'],
      advice: `${d.generic} thins your blood, so unusual bruising or bleeding needs checking today. Do not stop the medicine yourself — contact your doctor or pharmacist now.`,
      adviceUr: `${d.urdu} خون پتلا کرتی ہے، اس لیے غیر معمولی نیل یا خون آنا آج ہی چیک کروائیں۔ دوا خود سے بند نہ کریں — ابھی ڈاکٹر یا فارماسسٹ سے رابطہ کریں۔`,
      action: 'emergency' };
  }

  if (red.length) {
    return { severity: 'emergency', drug: d?.generic || generic, symptom: text,
      matched: red.map((r) => r.en),
      advice: `Stop taking ${d?.generic || 'this medicine'} and get medical help now. ${red.map((r) => r.en).join(' and ')} can be a serious reaction.`,
      adviceUr: `${d?.urdu || 'یہ دوا'} فوراً بند کریں اور طبی مدد لیں۔ ${red.map((r) => r.ur).join(' اور ')} سنگین ردعمل ہو سکتا ہے۔`,
      action: 'emergency' };
  }

  const label = d ? getLabel(d.generic) : null;
  // symptom_index carries the fuller adverse-reactions + warnings text; the short
  // adverse_reactions field alone often holds only section cross-references.
  const known = label?.symptom_index || label?.adverse_reactions || '';
  // Compare on meaningful words only, so "mild nausea" still matches "nausea".
  const lowerKnown = known.toLowerCase();
  const words = text.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3);
  const hit = [];
  for (const w of words) {
    // Match the word itself, its stem, or any clinical synonym.
    const stem = w.replace(/(ing|ed|s)$/, '');
    const probes = [w, stem.length > 3 ? stem : null, ...(SYMPTOM_SYNONYMS[w] || SYMPTOM_SYNONYMS[stem] || [])]
      .filter(Boolean);
    if (probes.some((x) => lowerKnown.includes(x))) hit.push(w);
  }

  if (hit.length) {
    return { severity: 'known', drug: d.generic, symptom: text, matched: hit,
      advice: `This is a recognised side effect of ${d.generic}. It is usually not dangerous, but tell your doctor if it gets worse or does not settle.`,
      adviceUr: `یہ ${d.urdu} کا معروف مضر اثر ہے۔ عام طور پر خطرناک نہیں، لیکن بڑھے تو ڈاکٹر کو بتائیں۔`,
      action: 'monitor', reference: (label?.adverse_reactions || known).slice(0, 300) };
  }

  return { severity: 'unknown', drug: d?.generic || generic, symptom: text, matched: [],
    advice: `This is not listed as a common side effect of ${d?.generic || 'this medicine'}. Keep a note of when it happens and ask a pharmacist — do not stop the medicine on your own.`,
    adviceUr: `یہ ${d?.urdu || 'اس دوا'} کے عام مضر اثرات میں شامل نہیں۔ نوٹ رکھیں اور فارماسسٹ سے پوچھیں — دوا خود سے بند نہ کریں۔`,
    action: 'ask_pharmacist' };
}

export const priceStats = () => ({ products: prices.products || 0, generics: Object.keys(prices.byGeneric || {}).length });
