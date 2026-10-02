import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { Icon, Lat, Sheet, Spinner } from './ui.jsx';

const FEATURES = [
  { icon: 'scan', title: 'Prescription Scan + OCR', text: 'Extract medicine names, strengths and instructions, then review every result before saving.' },
  { icon: 'safety', title: 'Drug–Drug Interactions', text: 'Severity-graded interaction checks with clear actions and an unchecked-data warning.' },
  { icon: 'bell', title: 'Smart Timing Guide', text: 'Visual before/with/after-meal and morning/night timing guidance tied to the medicine record.' },
  { icon: 'bell', title: 'Antibiotic Course Tracker', text: 'Track course progress, missed doses and completion reminders without encouraging self-prescribing.' },
  { icon: 'ask', title: 'Urdu + English Voice Assistant', text: 'Ask medicine questions by voice or text and hear the answer aloud in the selected language.' },
  { icon: 'bell', title: 'Pill Reminders + Snooze', text: 'Browser notifications, snooze controls and missed-dose escalation support.' },
  { icon: 'meds', title: 'Simple Medicine Cards', text: 'Uses, side effects, food warnings, pregnancy information, driving cautions and source details.' },
  { icon: 'meds', title: 'Price + Pharmacy Finder', text: 'Compare local same-ingredient prices and open a nearby-pharmacy search.' },
  { icon: 'alert', title: 'Side-Effect Reporter', text: 'Log symptoms and route emergency red flags or pharmacist follow-up appropriately.' },
  { icon: 'alert', title: 'Emergency Mode', text: 'Extra-dose guidance, warning signs, emergency calling and caregiver contact shortcuts.' },
  { icon: 'ask', title: 'Pharmacist Handoff', text: 'Optional human-pharmacist handoff that can be connected through deployment contact settings.' },
  { icon: 'safety', title: 'Renal + Hepatic Checks', text: 'Flags medicines whose dosing may need adjustment when kidney or liver information is present.' },
  { icon: 'alert', title: 'Allergy + Cross-Reactivity', text: 'Checks recorded allergy groups and highlights direct or documented cross-reactivity concerns.' },
  { icon: 'bell', title: 'Smart Missed-Dose Management', text: 'Medicine-specific missed-dose rules avoid the unsafe default of automatically doubling a dose.' },
  { icon: 'safety', title: 'Escalation System', text: 'Repeated missed doses can move from caregiver alert to pharmacist review instead of silently failing.' },
];

const GUIDES = [
  ['Antibiotics', 'Understand common antibiotic medicines, their uses and important safety information.'],
  ['Medicine safety', 'Learn how medicine interactions, allergies and missed doses can affect safe use.'],
  ['Prescription scanning', 'See how DoseIQ turns a prescription image into a reviewable medicine list.'],
];

function normalizeResult(c) {
  return {
    generic: c.generic || c.name || '',
    brand: c.brand || c.synonym || '',
    source: c.source || 'DoseIQ',
    confidence: c.confidence,
    rxcui: c.rxcui,
  };
}

export default function Landing({ lang, onLaunch, onLanguageChange }) {
  const [drugs, setDrugs] = useState([]);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState([]);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let live = true;
    api.drugs().then((r) => live && setDrugs(r.drugs || [])).catch(() => {});
    return () => { live = false; };
  }, []);

  const antibiotics = useMemo(
    () => drugs.filter((d) => String(d.class || '').toLowerCase() === 'antibiotic').slice(0, 6),
    [drugs],
  );

  // Search the local catalogue first, then fall back to RxNorm/FDA/DailyMed.
  // Results stay on this page instead of navigating the user away.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setHits([]); setSearching(false); return undefined; }
    let live = true;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [local, global] = await Promise.all([
          api.match(q, 8).catch(() => ({ candidates: [] })),
          api.globalSearch(q).catch(() => ({ candidates: [], labels: [] })),
        ]);
        if (!live) return;
        const localHits = (local.candidates || []).map((c) => ({ ...normalizeResult(c), local: true }));
        const globalCandidates = (global.candidates || []).map(normalizeResult);
        const labels = (global.labels || []).map((l) => ({ generic: l.generic || '', brand: l.brand || '', source: l.source || 'FDA labeling', label: l }));
        const all = [...localHits, ...globalCandidates, ...labels];
        const seen = new Set();
        setHits(all.filter((x) => {
          const k = `${String(x.generic).toLowerCase()}|${String(x.brand).toLowerCase()}`;
          if (!x.generic || seen.has(k)) return false;
          seen.add(k); return true;
        }).slice(0, 10));
      } finally { if (live) setSearching(false); }
    }, 220);
    return () => { live = false; clearTimeout(timer); };
  }, [query]);

  const openResult = async (hit) => {
    const generic = hit.generic || query.trim();
    setDetail({ title: generic, loading: true });
    try {
      const local = await api.drug(generic).catch(() => null);
      if (local?.drug) {
        setDetail({ title: generic, local: local.drug, label: local.label, food: local.food, source: 'DoseIQ local catalogue' });
        return;
      }
      const global = await api.globalSearch(generic);
      setDetail({ title: generic, global, source: 'RxNorm / FDA / DailyMed' });
    } catch {
      setDetail({ title: generic, failed: true });
    }
  };

  const launchWithQuery = () => {
    const q = query.trim();
    if (q) sessionStorage.setItem('doseiq.pendingSearch', q);
    onLaunch();
  };

  return (
    <div className="site-shell">
      <header className="site-nav">
        <button className="brand-lockup" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} aria-label="DoseIQ home">
          <span className="brand-mark">✚</span>
          <span><strong>DoseIQ</strong><small>Medication intelligence</small></span>
        </button>
        <nav className="desktop-links" aria-label="Main navigation">
          <a href="#medicines">Medicines</a><a href="#antibiotics">Antibiotics</a><a href="#guides">Guides</a><a href="#safety">Safety</a>
        </nav>
        <div className="landing-actions"><button className="lang-toggle landing-lang" onClick={onLanguageChange} aria-label="Change language">{lang === 'en' ? 'اردو' : 'English'}</button><button className="btn primary nav-cta" onClick={onLaunch}>{lang === 'ur' ? 'DoseIQ کھولیں' : 'Open DoseIQ'}</button></div>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <div className="eyebrow"><span>●</span> Medicine information & safety tools</div>
            <h1>Understand your medicines.<br /><span>Use them more safely.</span></h1>
            <p className="hero-text">DoseIQ brings medicine information, safety checks, prescription scanning and reminders into one simple experience.</p>
            <div className="hero-actions">
              <button className="btn primary" onClick={onLaunch}><Icon name="meds" /> Explore DoseIQ</button>
              <a className="btn ghost" href="#medicines">Browse medicines</a>
            </div>
            <p className="hero-note">Educational information only — not a replacement for a doctor or pharmacist.</p>
          </div>
          <div className="hero-panel" aria-label="DoseIQ preview">
            <div className="preview-top"><span className="dot" /><span>Today's safety overview</span><span className="preview-ok">Ready</span></div>
            <div className="preview-score"><div className="preview-ring">✓</div><div><strong>Medicine safety</strong><p>Review your medicines before you take them.</p></div></div>
            <div className="preview-row"><span>Medicine information</span><b>Available</b></div><div className="preview-row"><span>Interaction review</span><b>Available</b></div><div className="preview-row"><span>Prescription scan</span><b>Review required</b></div>
            <button className="preview-button" onClick={onLaunch}>Open the app →</button>
          </div>
        </section>

        <section className="trust-strip">
          <div><strong>{drugs.length || '—'}</strong><span>local catalogue medicines</span></div><div><strong>Global</strong><span>RxNorm + FDA + DailyMed fallback</span></div><div><strong>EN / اردو</strong><span>bilingual experience</span></div><div><strong>Safety</strong><span>interaction & allergy tools</span></div>
        </section>

        <section className="section-block" id="medicines">
          <div className="section-intro"><div><span className="eyebrow">MEDICINE LIBRARY</span><h2>Search medicines directly</h2></div><p>Search by generic or brand name. Results appear here immediately, with a global fallback when the local catalogue does not contain the medicine.</p></div>
          <div className="search-box"><Icon name="ask" /><input value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && query.trim() && openResult({ generic: query.trim() })} placeholder="Search a medicine or brand…" aria-label="Search medicines" /><button className="btn sm primary" onClick={() => query.trim() && openResult({ generic: query.trim() })}>Search</button></div>
          {query && <div className="search-results">
            {searching && <div className="search-state"><Spinner /> Searching local + global medicine sources…</div>}
            {!searching && hits.length > 0 && hits.map((d, i) => <button key={`${d.generic}-${i}`} className="search-result" onClick={() => openResult(d)}><span><strong><Lat>{d.generic}</Lat></strong><small>{d.brand || 'Medicine information'} · {d.source}</small></span><span>View →</span></button>)}
            {!searching && !hits.length && <div className="search-state">No verified match found. Check the spelling and try the exact name on the package.</div>}
          </div>}
          <div className="hero-actions" style={{ marginTop: 14 }}><button className="btn ghost" onClick={launchWithQuery}>Open full DoseIQ search →</button></div>
        </section>

        <section className="feature-grid">{FEATURES.map((f) => <article className="feature-card" key={f.title}><span className="feature-icon"><Icon name={f.icon} /></span><h3>{f.title}</h3><p>{f.text}</p><button onClick={onLaunch}>Explore <span>→</span></button></article>)}</section>

        <section className="section-block" id="antibiotics"><div className="section-intro"><div><span className="eyebrow">ANTIBIOTICS</span><h2>Start with commonly searched medicines</h2></div><p>Antibiotic information should be read alongside professional medical advice. DoseIQ is designed to help users understand, not self-prescribe.</p></div><div className="medicine-grid">{antibiotics.map((d) => <article className="medicine-card" key={d.generic} onClick={() => openResult({ generic: d.generic, brand: (d.brands || [])[0] })}><div className="medicine-icon">Rx</div><div><h3><Lat>{d.generic}</Lat></h3><p>{d.purposeEn || 'Antibiotic medicine'}</p><small>{(d.brands || []).slice(0, 3).join(' · ')}</small></div><span>→</span></article>)}</div></section>

        <section className="safety-banner" id="safety"><div><span className="eyebrow">SAFETY FIRST</span><h2>Information is useful when it is clear about its limits.</h2><p>DoseIQ can help organize medicine information and highlight selected safety signals. It does not diagnose conditions, replace a prescription, or guarantee that a medicine is safe for an individual.</p></div><button className="btn primary" onClick={onLaunch}>Run a safety check</button></section>

        <section className="section-block" id="guides"><div className="section-intro"><div><span className="eyebrow">LEARN</span><h2>Medicine guides</h2></div><p>Simple educational pages are also a foundation for useful search traffic and better user understanding.</p></div><div className="guide-grid">{GUIDES.map(([title, text], i) => <article className="guide-card" key={title}><span>0{i + 1}</span><h3>{title}</h3><p>{text}</p><button onClick={onLaunch}>Read in DoseIQ →</button></article>)}</div></section>
      </main>

      <footer className="site-footer"><div><div className="footer-brand"><span className="brand-mark">✚</span><strong>DoseIQ</strong></div><p>Medicine information and safety tools, designed for clearer decisions.</p></div><div><strong>Important</strong><p>DoseIQ is not a doctor, pharmacist or emergency service. Check medicine decisions with a qualified healthcare professional.</p></div><div><strong>Language</strong><button className="footer-link" onClick={onLaunch}>{lang === 'ur' ? 'اردو app kholen' : 'Open bilingual app'}</button></div></footer>

      {detail && <Sheet title={detail.title} onClose={() => setDetail(null)}>
        {detail.loading ? <Spinner /> : detail.failed ? <p>Medicine information could not be retrieved right now.</p> : detail.local ? <>
          <div className="card"><h2>Uses</h2><p>{lang === 'ur' ? detail.local.purposeUr : detail.local.purposeEn}</p></div>
          <div className="card" style={{ marginTop: 10 }}><h2>Brands</h2><p>{(detail.local.brands || []).join(' · ') || '—'}</p></div>
          {detail.label?.adverse_reactions && <details className="card" style={{ marginTop: 10 }}><summary><b>Side effects</b></summary><p style={{ marginTop: 8 }}>{detail.label.adverse_reactions}</p></details>}
          <button className="btn primary" style={{ marginTop: 12 }} onClick={launchWithQuery}>Open full medicine page</button>
        </> : <>
          {(detail.global?.labels || []).slice(0, 1).map((l, i) => <div className="card" key={i}><h2>{l.generic || detail.title}</h2><p>{l.brand ? `Brand: ${l.brand}` : ''}</p>{l.purpose && <p style={{ marginTop: 8 }}>{l.purpose}</p>}{l.warnings && <details style={{ marginTop: 10 }}><summary><b>Warnings</b></summary><p style={{ marginTop: 8 }}>{l.warnings}</p></details>}</div>)}
          {detail.global?.candidates?.length > 0 && <div className="card" style={{ marginTop: 10 }}><h2>Verified matches</h2>{detail.global.candidates.slice(0, 6).map((c, i) => <p key={i} style={{ marginTop: 6 }}><Lat>{c.name || c.generic}</Lat> <span className="pill">{c.source}</span></p>)}</div>}
          <p className="muted" style={{ marginTop: 10 }}>Global information can vary by country, formulation and label version. Verify the package and consult a pharmacist or doctor for personal advice.</p>
        </>}
      </Sheet>}
    </div>
  );
}
