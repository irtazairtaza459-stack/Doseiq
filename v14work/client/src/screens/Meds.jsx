import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { timingKey } from '../i18n.js';
import { Icon, Empty, Sheet, Lat, Spinner } from '../ui.jsx';

const TIMINGS = ['before_meal', 'after_meal', 'with_meal', 'empty_stomach', 'morning', 'night', 'any'];

function TimingGuide({ timing, t }) {
  const order = ['morning', 'before_meal', 'with_meal', 'after_meal', 'night'];
  const active = order.includes(timing) ? timing : 'any';
  return (
    <div className="timing-guide" aria-label="Medicine timing guide">
      {order.map((x) => (
        <div className={active === x ? 'timing-step active' : 'timing-step'} key={x}>
          <span>{x === 'morning' ? '☀️' : x === 'night' ? '🌙' : '🍽️'}</span>
          <small>{t(`common.${timingKey[x]}`)}</small>
        </div>
      ))}
      {active === 'any' && <p className="muted" style={{ margin: '8px 0 0' }}>{t('common.any')}</p>}
    </div>
  );
}

const cleanText = (v) => String(v || '').replace(/\s+/g, ' ').trim();

export default function Meds({ t, lang, state, actions, notify }) {
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState({ loading: false, local: [], global: [], failed: false });

  const list = state.meds.filter((m) =>
    !q || `${m.generic} ${m.name || ''}`.toLowerCase().includes(q.toLowerCase()));

  // Medicine search is now catalogue + global. The local catalogue is checked first,
  // while RxNorm/NLM, FDA openFDA and DailyMed provide a wider fallback.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSearch({ loading: false, local: [], global: [], failed: false });
      return undefined;
    }
    let live = true;
    setSearch((s) => ({ ...s, loading: true, failed: false }));
    const timer = setTimeout(async () => {
      try {
        const [localResult, globalResult] = await Promise.all([
          api.match(term, 8).catch(() => ({ candidates: [] })),
          api.globalSearch(term).catch(() => ({ candidates: [], labels: [], found: false })),
        ]);
        if (!live) return;
        const local = (localResult.candidates || []).filter((x) => !x.global && x.confidence >= 0.5);
        const localKeys = new Set(local.map((x) => String(x.generic || '').toLowerCase()));
        const indexed = (localResult.candidates || []).filter((x) => x.global).map((c) => ({
          kind: 'global', globalIndex: true, generic: c.generic || c.name || term, name: c.generic || c.name || term,
          brand: c.brand || '', strength: c.strength || '', dosageForm: c.dosageForm || '', rxcui: c.rxcui || '',
          source: 'DoseIQ global medicine index',
        }));
        const labels = (globalResult.labels || []).map((label) => ({
          kind: 'global',
          generic: label.generic || label.brand || term,
          brand: label.brand || '',
          name: label.generic || label.brand || term,
          manufacturer: label.manufacturer || '',
          label,
          source: 'FDA openFDA',
        }));
        const candidates = (globalResult.candidates || []).map((c) => ({
          kind: 'global',
          generic: c.name || term,
          name: c.name || term,
          source: c.source || 'RxNorm / NLM',
          rxcui: c.rxcui,
        }));
        const seenGlobal = new Set();
        const global = [...indexed, ...labels, ...candidates].filter((x) => {
          const k = `${String(x.generic || '').toLowerCase()}|${String(x.brand || '').toLowerCase()}`;
          if (seenGlobal.has(k)) return false;
          seenGlobal.add(k);
          return !localKeys.has(String(x.generic || '').toLowerCase()) || x.brand;
        }).slice(0, 10);
        setSearch({ loading: false, local, global, failed: false });
      } catch {
        if (live) setSearch({ loading: false, local: [], global: [], failed: true });
      }
    }, 320);
    return () => { live = false; clearTimeout(timer); };
  }, [q]);

  const open = async (med) => {
    setDetail({ med, loading: true });
    try {
      const [r, price] = await Promise.all([
        api.drug(med.generic),
        api.price(med.generic, { brand: med.brand, strength: med.dose }).catch(() => null),
      ]);
      setDetail({ med, ...r, price, loading: false, global: false });
    } catch { setDetail({ med, loading: false, failed: true }); }
  };

  const openGlobal = async (item) => {
    const query = item.brand || item.generic || item.name || q;
    setDetail({ med: { generic: item.generic || query, name: item.name || query }, loading: true, global: true });
    try {
      const r = await api.globalSearch(query);
      const label = item.label || r.labels?.[0] || null;
      const candidate = r.candidates?.[0] || item;
      const generic = label?.generic || candidate?.name || item.generic || query;
      const price = await api.price(generic, { brand: label?.brand }).catch(() => null);
      setDetail({
        med: { generic, name: generic, brand: label?.brand || item.brand || '' },
        global: true,
        globalResult: r,
        label,
        candidate,
        price,
        loading: false,
      });
    } catch {
      setDetail({ med: { generic: item.generic || query }, loading: false, failed: true, global: true });
    }
  };

  const hasSearch = q.trim().length >= 2;
  const hasResults = search.local.length || search.global.length;

  return (
    <>
      <div className="btnRow">
        <input placeholder={t('meds.search')} value={q} onChange={(e) => setQ(e.target.value)} />
        <button className="btn sm primary" onClick={() => setAdding(true)}><Icon name="plus" /></button>
      </div>

      {hasSearch && (
        <section className="medicine-search-panel">
          <div className="medicine-search-head">
            <div>
              <div className="eyebrow-app">{lang === 'ur' ? 'عالمی دوا سرچ' : 'GLOBAL MEDICINE SEARCH'}</div>
              <h2>{lang === 'ur' ? `نتائج: ${q}` : `Results for “${q}”`}</h2>
            </div>
            {search.loading && <Spinner />}
          </div>
          {!search.loading && search.failed && <p className="muted">{lang === 'ur' ? 'سرچ سروس عارضی طور پر دستیاب نہیں۔' : 'Search services are temporarily unavailable. Try again.'}</p>}
          {!search.loading && !search.failed && !hasResults && (
            <p className="muted">{lang === 'ur' ? 'اس نام کا کوئی نتیجہ نہیں ملا۔ پیک پر لکھا درست نام آزمائیں۔' : 'No medicine was found. Try the exact name printed on the pack.'}</p>
          )}

          {search.local.length > 0 && (
            <div className="medicine-search-group">
              <div className="medicine-search-label">{lang === 'ur' ? 'DoseIQ مقامی کیٹلاگ' : 'DoseIQ catalogue'}</div>
              {search.local.map((h) => (
                <button className="medicine-search-result" key={`local-${h.generic}`} onClick={() => h.global ? openGlobal(h) : open({ generic: h.generic, name: h.generic, brand: h.brand || h.matchedOn })}>
                  <span><strong><Lat>{h.brand || h.matchedOn || h.generic}</Lat></strong><small><Lat>{h.generic}</Lat> · {Math.round(h.confidence * 100)}% match</small></span>
                  <span>Details →</span>
                </button>
              ))}
            </div>
          )}

          {search.global.length > 0 && (
            <div className="medicine-search-group">
              <div className="medicine-search-label">{lang === 'ur' ? 'عالمی ماخذ' : 'Global sources'}</div>
              {search.global.map((h, i) => (
                <button className="medicine-search-result" key={`global-${h.generic}-${h.brand || ''}-${i}`} onClick={() => openGlobal(h)}>
                  <span>
                    <strong><Lat>{h.generic}</Lat>{h.brand ? ` · ${h.brand}` : ''}</strong>
                    <small>{h.manufacturer || h.source || 'RxNorm / NLM'}</small>
                  </span>
                  <span>Details →</span>
                </button>
              ))}
            </div>
          )}
          <p className="muted medicine-search-note">
            {lang === 'ur'
              ? 'عالمی نتائج RxNorm/NLM، FDA اور DailyMed جیسے عوامی ماخذ سے آ سکتے ہیں۔ ہر ملک کی ہر برانڈ یا مقامی دستیابی لازماً شامل نہیں ہوتی۔'
              : 'Global results can come from the DoseIQ global index, RxNorm/NLM, FDA and DailyMed. Country-specific brands and availability are not guaranteed for every medicine.'}
          </p>
        </section>
      )}

      <div className="medicine-list-heading">{lang === 'ur' ? 'آپ کی شامل کردہ دوائیں' : 'Your medicines'}</div>
      {!list.length ? <Empty icon="🗂️" title={q ? (lang === 'ur' ? 'اس سرچ سے کوئی شامل شدہ دوا نہیں ملی۔' : 'No added medicine matches this search.') : t('meds.empty')} /> : list.map((m) => (
        <div className="card" key={m.id} onClick={() => open(m)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2><Lat>{m.generic || m.name}</Lat> {m.course && <span className="pill">{t('home.course')}</span>}</h2>
              <p>{m.dose && <><Lat>{m.dose}</Lat> · </>}<Lat>{m.time}</Lat> · {t(`common.${timingKey[m.timing] || 'any'}`)}</p>
              <p style={{ marginTop: 3 }}>{lang === 'ur' ? m.purposeUr : m.purposeEn}</p>
            </div>
            <button className="btn sm" aria-label={t('meds.remove')}
              onClick={(e) => { e.stopPropagation(); actions.removeMed(m.id); notify(t('meds.remove')); }}>
              <Icon name="trash" />
            </button>
          </div>
        </div>
      ))}

      {adding && <AddSheet t={t} lang={lang} onClose={() => setAdding(false)}
        onSave={(m) => { actions.addMed(m); setAdding(false); notify(t('meds.save')); }} />}

      {detail && (
        <Sheet title={detail.med.generic || detail.med.name} onClose={() => setDetail(null)}>
          {detail.loading ? <Spinner /> : detail.failed ? <p>{t('common.error')}</p> : detail.global ? (
            <GlobalDetail detail={detail} lang={lang} t={t} />
          ) : (
            <LocalDetail detail={detail} lang={lang} t={t} />
          )}
        </Sheet>
      )}
    </>
  );
}

function LocalDetail({ detail, lang, t }) {
  return (
    <>
      <div className="card" style={{ marginBottom: 10 }}>
        <h2>{t('meds.usedFor')}</h2>
        <p style={{ color: 'var(--text)' }}>{lang === 'ur' ? detail.drug.purposeUr : detail.drug.purposeEn}</p>
        {detail.med.brand && <p style={{ marginTop: 8 }}><b>{lang === 'ur' ? 'برانڈ:' : 'Brand:'}</b> <Lat>{detail.med.brand}</Lat></p>}
        <p className="muted" style={{ marginTop: 8 }}>
          {detail.drug.brands.slice(0, 12).map((b) => <span key={b} className="pill" style={{ margin: '0 4px 4px 0' }}><Lat>{b}</Lat></span>)}
        </p>
        {detail.drug.components?.length > 0 && <p className="muted" style={{ marginTop: 6 }}><b>{lang === 'ur' ? 'Active ingredients:' : 'Active ingredients:'}</b> {detail.drug.components.join(' + ')}</p>}
      </div>
      <div className="card" style={{ marginBottom: 10 }}>
        <h2>{lang === 'ur' ? 'اس دوا کا وقت' : 'Smart timing guide'}</h2>
        <TimingGuide timing={detail.drug.timing} t={t} />
        <p className="muted" style={{ marginTop: 8 }}>{lang === 'ur' ? 'اصل نسخے پر دی گئی خوراک اور وقت کو ترجیح دیں۔' : 'Follow the prescribed strength and schedule if they differ from this general timing guide.'}</p>
      </div>
      <PharmacyCard generic={detail.drug.generic} lang={lang} />
      {detail.food?.notes?.length > 0 && <FoodCard food={detail.food} lang={lang} t={t} />}
      {detail.food?.drowsy && <DrowsyCard lang={lang} t={t} />}
      {detail.price?.cheapest && <PriceCard price={detail.price} t={t} />}
      {detail.label?.adverse_reactions && <details className="card" style={{ marginBottom: 10 }}><summary><b>{t('meds.sideEffects')}</b></summary><p style={{ marginTop: 8 }}>{detail.label.adverse_reactions}</p></details>}
      {detail.label?.pregnancy && <details className="card" style={{ marginBottom: 10 }}><summary><b>{t('meds.pregnancy')}</b></summary><p style={{ marginTop: 8 }}>{detail.label.pregnancy}</p></details>}
      {detail.label?.indications_and_usage && <details className="card"><summary><b>{t('meds.details')}</b></summary><p style={{ marginTop: 8 }}>{detail.label.indications_and_usage}</p></details>}
      {detail.label?._source && <SourceCard label={detail.label} lang={lang} />}
    </>
  );
}

function GlobalDetail({ detail, lang, t }) {
  const l = detail.label;
  const c = detail.candidate;
  const generic = l?.generic || c?.name || detail.med.generic;
  const sections = [
    ['indications', lang === 'ur' ? 'استعمال / کن حالات میں' : 'Uses / indications', l?.purpose],
    ['dosage', lang === 'ur' ? 'خوراک اور استعمال کا طریقہ' : 'Dosage & administration', l?.dosage || l?.howToUse],
    ['warnings', lang === 'ur' ? 'انتباہات اور احتیاط' : 'Warnings & precautions', l?.warnings || l?.contraindications],
    ['adverse', lang === 'ur' ? 'مضر اثرات' : 'Side effects', l?.adverse],
    ['interactions', lang === 'ur' ? 'Drug interactions' : 'Drug interactions', l?.interactions],
    ['pregnancy', lang === 'ur' ? 'حمل اور دودھ پلانا' : 'Pregnancy & breastfeeding', l?.pregnancy],
    ['overdose', lang === 'ur' ? 'زیادہ خوراک' : 'Overdose', l?.overdose],
    ['storage', lang === 'ur' ? 'محفوظ رکھنے کا طریقہ' : 'Storage', l?.storage],
  ];
  return (
    <>
      <div className="card" style={{ marginBottom: 10 }}>
        <div className="eyebrow-app">GLOBAL MEDICINE RECORD</div>
        <h2><Lat>{generic}</Lat></h2>
        {l?.brand && <p style={{ marginTop: 6 }}><b>Brand:</b> <Lat>{l.brand}</Lat></p>}
        {l?.manufacturer && <p className="muted" style={{ marginTop: 4 }}>{l.manufacturer}</p>}
        <div style={{ marginTop: 10 }}>
          {l?.route && <span className="pill" style={{ margin: '0 4px 4px 0' }}><Lat>{l.route}</Lat></span>}
          {l?.dosageForm && <span className="pill" style={{ margin: '0 4px 4px 0' }}><Lat>{l.dosageForm}</Lat></span>}
          {c?.rxcui && <span className="pill" style={{ margin: '0 4px 4px 0' }}>RxCUI {c.rxcui}</span>}
        </div>
      </div>

      {!l && <div className="sev moderate" style={{ marginBottom: 10 }}><span className="badge">INFO</span><div><p>{lang === 'ur' ? 'یہ دوا DoseIQ کے عالمی medicine index میں موجود ہے، لیکن اس نتیجے کے لیے تفصیلی FDA label دستیاب نہیں۔' : 'This medicine is in the DoseIQ global medicine index. A detailed FDA label is not available for this result.'}</p></div></div>}

      {sections.filter(([, , content]) => cleanText(content)).map(([key, title, content]) => (
        <details className="card" key={key} style={{ marginBottom: 10 }} open={key === 'indications'}>
          <summary><b>{title}</b></summary>
          <p style={{ marginTop: 8, whiteSpace: 'pre-wrap' }}>{cleanText(content).slice(0, 7000)}</p>
        </details>
      ))}

      {detail.price?.cheapest && <PriceCard price={detail.price} t={t} />}
      {detail.globalResult?.sources?.length > 0 && (
        <div className="card" style={{ marginBottom: 10 }}>
          <h2>{lang === 'ur' ? 'عالمی ماخذ' : 'Global sources'}</h2>
          {detail.globalResult.sources.map((s) => <a key={s.url} className="btn sm" style={{ margin: '8px 6px 0 0', textDecoration: 'none' }} target="_blank" rel="noreferrer" href={s.url}>{s.name}</a>)}
          <p className="muted" style={{ marginTop: 10 }}>{lang === 'ur' ? 'لیبل اور دستیابی ملک، برانڈ اور formulation کے لحاظ سے مختلف ہو سکتی ہے۔' : 'Labels and availability can vary by country, brand and formulation.'}</p>
        </div>
      )}
    </>
  );
}

function PharmacyCard({ generic, lang }) {
  return <div className="card" style={{ marginBottom: 10 }}><h2>{lang === 'ur' ? 'قریبی فارمیسی' : 'Find a nearby pharmacy'}</h2><p className="muted">{lang === 'ur' ? 'یہ لنک آپ کے علاقے میں فارمیسی تلاش کرے گا؛ دستیابی پہلے فون پر تصدیق کریں۔' : 'Search nearby pharmacies; call ahead to confirm stock and price.'}</p><a className="btn" style={{ marginTop: 8, textDecoration: 'none' }} target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${generic} pharmacy`)}`}><Icon name="meds" /> {lang === 'ur' ? 'قریبی فارمیسی تلاش کریں' : 'Search nearby pharmacies'}</a></div>;
}

function FoodCard({ food, lang, t }) {
  return <div className="card" style={{ marginBottom: 10 }}><h2>{t('meds.withFood')}</h2>{food.notes.map((n, i) => <p key={i} style={{ color: 'var(--text)', marginTop: i ? 8 : 4 }}><b><Lat>{n.item}</Lat></b><br />{lang === 'ur' ? n.ur : n.en}</p>)}</div>;
}
function DrowsyCard({ lang, t }) { return <div className="sev moderate" style={{ marginBottom: 10 }}><span className="badge">{t('meds.driving')}</span><div><p>{lang === 'ur' ? 'اس دوا سے نیند آ سکتی ہے۔ گاڑی چلانے سے گریز کریں۔' : 'This medicine can make you drowsy. Avoid driving until you know how it affects you.'}</p></div></div>; }
function PriceCard({ price, t }) { return <div className="card" style={{ marginBottom: 10 }}><h2>{t('price.title')}</h2>{price.saving ? <div className="sev good" style={{ marginTop: 8 }}><span className="badge">Rs {price.saving.rupees}</span><div><p>{t('price.save', { n: price.saving.rupees, p: price.saving.percent })}</p></div></div> : price.range ? <p style={{ color: 'var(--text)', marginTop: 4 }}>{t('price.range', { min: price.range.min, max: price.range.max })}</p> : null}<div style={{ marginTop: 10 }}>{(price.products || []).slice(0, 5).map((pr, i) => <div className="dose" key={i} style={{ marginBottom: 6 }}><div className="when" style={{ minWidth: 68 }}><Lat>Rs {pr.price}</Lat></div><div className="body"><b style={{ fontSize: 13 }}><Lat>{pr.name.slice(0, 42)}</Lat></b><span><Lat>{pr.pack}</Lat> · <Lat>{pr.maker.split(' DSL')[0].split(' DML')[0].slice(0, 26)}</Lat></span></div>{i === 0 && <span className="pill">{t('price.cheapest')}</span>}</div>)}</div><p className="muted" style={{ marginTop: 8, fontSize: 11.5 }}>{t('price.products', { n: price.count })} · {t('price.source')}</p></div>; }
function SourceCard({ label, lang }) { return <div className="card"><h2>{lang === 'ur' ? 'ماخذ' : 'Source'}</h2><p className="muted" style={{ marginTop: 6 }}>{label._source}</p>{label._sourceUrl && <a className="btn sm" style={{ marginTop: 8, textDecoration: 'none' }} target="_blank" rel="noreferrer" href={label._sourceUrl}>{lang === 'ur' ? 'اصل دستاویز کھولیں' : 'Open source document'}</a>}</div>; }

function AddSheet({ t, lang, onClose, onSave }) {
  const [name, setName] = useState('');
  const [hits, setHits] = useState([]);
  const [picked, setPicked] = useState(null);
  const [form, setForm] = useState({ dose: '', time: '08:00', timing: 'after_meal', days: '', frequency: '1' });

  useEffect(() => {
    if (picked || name.trim().length < 3) { setHits([]); return undefined; }
    let live = true;
    const id = setTimeout(() => {
      api.match(name).then((r) => live && setHits(r.candidates.filter((c) => c.confidence > 0.5))).catch(() => {});
    }, 220);
    return () => { live = false; clearTimeout(id); };
  }, [name, picked]);

  const submit = () => {
    if (!picked && !name.trim()) return;
    onSave({
      generic: picked?.generic || name.trim(), name: picked?.generic || name.trim(),
      urdu: picked?.urdu, dose: form.dose, time: form.time, timing: form.timing,
      days: form.days ? Number(form.days) : undefined, course: !!form.days, dayNo: 1, frequency: Number(form.frequency) || 1,
      purposeEn: picked?.purposeEn, purposeUr: picked?.purposeUr,
    });
  };

  return (
    <Sheet title={t('meds.add')} onClose={onClose}>
      <div className="field"><label>{t('meds.name')}</label><input autoFocus value={name} placeholder="Panadol, Augmentin…" onChange={(e) => { setName(e.target.value); setPicked(null); }} /></div>
      {hits.length > 0 && !picked && hits.map((h) => <button className="btn" key={h.generic} style={{ marginBottom: 6, justifyContent: 'flex-start' }} onClick={async () => { setPicked(h); setName(h.generic); setHits([]); try { const r = await api.drug(h.generic); setPicked({ ...h, purposeEn: r.drug.purposeEn, purposeUr: r.drug.purposeUr }); setForm((f) => ({ ...f, timing: r.drug.timing || f.timing })); } catch {} }}><Lat>{h.generic}</Lat><span className="muted" style={{ fontSize: 12 }}>· <Lat>{h.matchedOn}</Lat></span></button>)}
      <div className="btnRow"><div className="field" style={{ flex: 1 }}><label>{t('meds.dose')}</label><input value={form.dose} placeholder="500 mg" onChange={(e) => setForm({ ...form, dose: e.target.value })} /></div><div className="field" style={{ flex: 1 }}><label>{t('meds.time')}</label><input type="time" value={form.time} onChange={(e) => setForm({ ...form, time: e.target.value })} /></div></div>
      <div className="field"><label>{t('meds.meal')}</label><select value={form.timing} onChange={(e) => setForm({ ...form, timing: e.target.value })}>{TIMINGS.map((x) => <option key={x} value={x}>{t(`common.${timingKey[x]}`)}</option>)}</select></div>
      <div className="btnRow"><div className="field" style={{ flex: 1 }}><label>{lang === 'ur' ? 'دن میں کتنی بار' : 'Times per day'}</label><select value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value })}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></div><div className="field" style={{ flex: 1 }}><label>{t('meds.days')}</label><input type="number" min="1" max="30" value={form.days} placeholder="e.g. 5" onChange={(e) => setForm({ ...form, days: e.target.value })} /></div></div>
      <button className="btn primary" onClick={submit}>{t('meds.save')}</button>
    </Sheet>
  );
}
