const call = async (path, body) => {
  const res = await fetch(`/api${path}`, body
    ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
    : undefined);
  const json = await res.json().catch(() => ({ ok: false, error: 'bad response' }));
  if (!res.ok || json.ok === false) throw new Error(json.error || `request failed (${res.status})`);
  return json;
};

export const api = {
  health: () => call('/health'),
  drugs: () => call('/drugs'),
  drug: (g) => call(`/drugs/${encodeURIComponent(g)}`),
  match: (text, limit = 5) => call('/match', { text, limit }),
  parseScan: (lines) => call('/scan/parse', { lines }),
  review: (drugs, allergies) => call('/safety/review', { drugs, allergies }),
  prescription: (drugs) => call('/safety/prescription', { drugs }),
  missedDose: (drug, consecutiveMisses) => call('/missed-dose', { drug, consecutiveMisses }),
  ask: (question) => call('/ask', { question }),
  globalAsk: (question) => call('/global/ask', { question }),
  globalSearch: (q) => call(`/global/search?q=${encodeURIComponent(q)}`),
  price: (drug, opts) => call('/price', { drug, ...opts }),
  organ: (drugs, profile) => call('/safety/organ', { drugs, ...profile }),
  sideEffect: (drug, symptom) => call('/side-effect', { drug, symptom }),
  pharmacistRequest: (question, medicines) => call('/pharmacist-request', { question, medicines }),
};
