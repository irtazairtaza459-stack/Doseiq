import { globalIndexSearch, rememberGlobalRecords } from './globalIndex.js';

// Global medicine retrieval layer.
// Uses public NLM RxNorm + DailyMed and FDA openFDA endpoints as a fallback
// when a medicine is not present in DoseIQ's Pakistan/local catalogue.

const CACHE_TTL = 10 * 60 * 1000;
const cache = new Map();

async function getJson(url, timeoutMs = 7000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json', 'user-agent': 'DoseIQ/2.0 medicine-information' },
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const text = (v) => Array.isArray(v) ? v.filter(Boolean).join(' ') : (v == null ? '' : String(v));
const first = (v) => Array.isArray(v) ? (v[0] || '') : (v || '');
const stripHtml = (v) => text(v).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

function extractLabel(record) {
  if (!record) return null;
  const open = record.openfda || {};
  const field = (name) => stripHtml(record[name]);
  return {
    generic: first(open.generic_name), brand: first(open.brand_name), manufacturer: first(open.manufacturer_name),
    route: first(open.route), dosageForm: first(open.dosage_form), productType: first(open.product_type),
    purpose: field('indications_and_usage'), dosage: field('dosage_and_administration'),
    warnings: field('warnings_and_cautions') || field('boxed_warning'),
    contraindications: field('contraindications'), adverse: field('adverse_reactions'),
    pregnancy: field('pregnancy') || field('pregnancy_or_breast_feeding'), interactions: field('drug_interactions'),
    overdose: field('overdosage'), howToUse: field('instructions_for_use'),
    pediatric: field('pediatric_use'), geriatric: field('geriatric_use'),
    storage: field('storage_and_handling'), inactive: field('inactive_ingredient'),
    boxedWarning: field('boxed_warning'), effectiveTime: record.effective_time || '',
    source: 'FDA openFDA drug labeling',
    sourceUrl: 'https://open.fda.gov/apis/drug/label/',
  };
}

async function rxNorm(name) {
  const url = `https://rxnav.nlm.nih.gov/REST/drugs.json?name=${encodeURIComponent(name)}&expand=psn`;
  const data = await getJson(url);
  const groups = data?.drugGroup?.conceptGroup || [];
  const out = [];
  for (const g of groups) for (const c of (g.conceptProperties || [])) {
    if (!c?.name) continue;
    out.push({ rxcui: c.rxcui, name: c.name, synonym: c.synonym || '', tty: c.tty, psn: c.psn || '' });
  }
  const seen = new Set();
  return out.filter((x) => !seen.has(x.rxcui) && seen.add(x.rxcui)).slice(0, 20);
}

async function rxApproximate(name) {
  const url = `https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=${encodeURIComponent(name)}&maxEntries=8&option=1`;
  const data = await getJson(url);
  return (data?.approximateGroup?.candidate || []).filter((x) => x?.name || x?.rxcui).slice(0, 8);
}

async function fdaLabels(name) {
  const fields = ['generic_name', 'brand_name'];
  const records = [];
  for (const field of fields) {
    const q = encodeURIComponent(`${field}:"${String(name).replace(/"/g, '')}"`);
    const data = await getJson(`https://api.fda.gov/drug/label.json?search=${q}&limit=8`);
    for (const r of (data?.results || [])) records.push(extractLabel(r));
  }
  const seen = new Set();
  return records.filter((r) => {
    const k = `${key(r.generic)}|${key(r.brand)}|${r.effectiveTime}`;
    return !seen.has(k) && seen.add(k);
  }).slice(0, 8);
}

async function dailyMedNames(name) {
  const url = `https://dailymed.nlm.nih.gov/dailymed/services/v2/drugnames.json?drug_name=${encodeURIComponent(name)}&name_type=both&pagesize=10`;
  const data = await getJson(url);
  const rows = data?.data || [];
  return rows.map((r) => ({ name: r[0], type: r[1], source: 'DailyMed' })).filter((x) => x.name).slice(0, 10);
}

export async function globalDrugSearch(name) {
  const q = String(name || '').trim();
  if (q.length < 2) return { found: false, query: q, candidates: [], labels: [], sources: [] };
  const cacheKey = `search:${key(q)}`;
  const localGlobalIndex = globalIndexSearch(q, 12);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL) return hit.value;

  const [rx, labels, daily] = await Promise.all([rxNorm(q), fdaLabels(q), dailyMedNames(q)]);
  let approximate = [];
  if (!rx.length) approximate = await rxApproximate(q);

  // A natural-language question often contains the medicine name plus extra words.
  // RxNorm's approximate matcher is specifically designed for that case, including
  // misspellings and dosage-form noise. Fetch FDA labels for the best candidates.
  let resolvedLabels = labels;
  if (!resolvedLabels.length && approximate.length) {
    const names = [...new Set(approximate.map((x) => x.name).filter(Boolean))].slice(0, 3);
    const labelSets = await Promise.all(names.map((n) => fdaLabels(n)));
    resolvedLabels = labelSets.flat();
  }
  const approxCandidates = approximate.map((x) => ({
    rxcui: x.rxcui, name: x.name || `RxCUI ${x.rxcui}`, score: x.score, rank: x.rank, source: 'RxNorm/NLM approximate match'
  }));
  const candidates = [...localGlobalIndex.map((x) => ({ ...x, source: 'DoseIQ global medicine index' })), ...rx.map((x) => ({ ...x, source: 'RxNorm/NLM' })), ...approxCandidates, ...daily.map((x) => ({ ...x }))];
  const persisted = rememberGlobalRecords([
    ...labels.map((l) => ({ generic: l.generic, brand: l.brand, dosageForm: l.dosageForm, sources: ['FDA openFDA'], sourceUrl: l.sourceUrl })),
    ...rx.map((x) => ({ generic: x.name, rxcui: x.rxcui, aliases: [x.name, x.synonym, x.psn].filter(Boolean), sources: ['RxNorm / NLM'], sourceUrl: 'https://rxnav.nlm.nih.gov/' })),
    ...localGlobalIndex,
  ]);
  const result = {
    found: candidates.length > 0 || labels.length > 0,
    query: q,
    candidates: candidates.slice(0, 20),
    labels: resolvedLabels,
    sources: [
      { name: 'RxNorm / RxNav (NLM)', url: 'https://rxnav.nlm.nih.gov/' },
      { name: 'FDA openFDA drug labeling', url: 'https://open.fda.gov/apis/drug/label/' },
      { name: 'DailyMed (NLM)', url: 'https://dailymed.nlm.nih.gov/dailymed/' },
      { name: 'DoseIQ global medicine index', url: '' },
    ],
  };
  cache.set(cacheKey, { at: Date.now(), value: result });
  return result;
}

function chooseLabel(labels, q) {
  if (!labels.length) return null;
  const qk = key(q);
  return [...labels].sort((a, b) => {
    const as = key(a.generic) === qk || key(a.brand) === qk ? 2 : 0;
    const bs = key(b.generic) === qk || key(b.brand) === qk ? 2 : 0;
    return bs - as;
  })[0];
}

export function globalAnswer(question, result) {
  const label = chooseLabel(result.labels || [], question);
  const candidate = result.candidates?.[0] || null;
  if (!label && !candidate) return null;

  const lower = String(question).toLowerCase();
  let topic = 'overview';
  if (/side.?effect|reaction|nuqsan|mudarat/.test(lower)) topic = 'adverse';
  else if (/pregnan|hamal|breast|feeding|doodh pil/.test(lower)) topic = 'pregnancy';
  else if (/interact|together|sath|saath|mil kar|mix/.test(lower)) topic = 'interactions';
  else if (/dose|dosage|kitni|how much|mg|ml/.test(lower)) topic = 'dosage';
  else if (/how to take|kaise|kesay|kese|leni|khani|kab|when|time|timing/.test(lower)) topic = 'dosage';
  else if (/warning|danger|risk|contraind|mana|ehtiyat|precaution/.test(lower)) topic = 'warnings';
  else if (/overdose|extra dose|zyada|ziyada/.test(lower)) topic = 'overdose';
  else if (/storage|store|rakh/.test(lower)) topic = 'storage';

  const name = label?.generic || candidate?.name || result.query;
  const brand = label?.brand ? ` (${label.brand})` : '';
  const sections = {
    adverse: label?.adverse,
    pregnancy: label?.pregnancy,
    interactions: label?.interactions,
    dosage: label?.dosage || label?.howToUse,
    warnings: label?.warnings || label?.contraindications,
    overdose: label?.overdose,
    storage: label?.storage,
    overview: label?.purpose,
  };
  const content = sections[topic] || label?.purpose || '';
  const answer = content
    ? `${name}${brand}\n\n${content.slice(0, 5000)}`
    : `${name}${brand} was found in the global medicine sources, but a detailed answer for this question was not available in the retrieved label.`;

  const urTopic = {
    adverse: 'مضر اثرات', pregnancy: 'حمل/دودھ پلانے سے متعلق معلومات', interactions: 'ادویات کے باہمی اثرات',
    dosage: 'خوراک اور استعمال کا طریقہ', warnings: 'انتباہات اور احتیاط', overdose: 'زیادہ خوراک', storage: 'محفوظ رکھنے کی ہدایات', overview: 'استعمال',
  }[topic];
  const answerUr = content
    ? `${name} — ${urTopic}\n\nنیچے دی گئی معلومات سرکاری/قابلِ اعتماد لیبل ڈیٹا سے حاصل کی گئی ہے۔ مکمل تفصیل انگریزی میں اصل ماخذ پر موجود ہے۔\n\n${content.slice(0, 1400)}`
    : `${name} کے بارے میں عالمی دوا کے ماخذ میں ریکارڈ ملا، لیکن اس سوال کا تفصیلی جواب دستیاب لیبل میں نہیں ملا۔`;

  return {
    answered: true, global: true, drug: name, answer, answerUr,
    topic, confidence: label ? 0.94 : 0.78,
    label, candidate, sources: result.sources,
    disclaimer: 'Global medicine data is retrieved from public sources and may vary by country, product, formulation, and label version. It is not a substitute for a doctor or pharmacist.',
  };
}
