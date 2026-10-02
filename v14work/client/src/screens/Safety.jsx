import React, { useState, useEffect } from 'react';
import { api } from '../api.js';
import { Icon, Spinner, Empty, Sheet, Lat } from '../ui.jsx';

const ALLERGY_GROUPS = ['penicillin', 'cephalosporin', 'sulfonamide', 'nsaid', 'macrolide', 'quinolone', 'tetracycline', 'opioid'];

export default function Safety({ t, lang, state, actions, notify, go }) {
  const [result, setResult] = useState(null);
  const [organ, setOrgan] = useState(null);
  const [organSheet, setOrganSheet] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState(false);
  const [emergency, setEmergency] = useState(null);
  const [prescription, setPrescription] = useState(null);

  const generics = state.meds.map((m) => m.generic).filter(Boolean);

  const run = async () => {
    if (!generics.length) return;
    setBusy(true);
    try {
      const [review, rx] = await Promise.all([api.review(generics, state.allergies), api.prescription(generics)]);
      setResult(review);
      setPrescription(rx);
    }
    catch { notify(t('common.error')); }
    finally { setBusy(false); }
  };

  useEffect(() => { run(); /* refresh when the medicine list or allergies change */ }, [state.meds, state.allergies]);

  const runOrgan = async () => {
    if (!generics.length) return;
    try { setOrgan(await api.organ(generics, state.health)); }
    catch { notify(t('common.error')); }
  };
  useEffect(() => { runOrgan(); }, [state.meds, state.health]);

  const openEmergency = async (med) => {
    try {
      const r = await api.drug(med.generic);
      setEmergency({ drug: r.drug, label: r.label });
    } catch { notify(t('common.error')); }
  };

  return (
    <>
      <div className="btnRow">
        <button className="btn primary" onClick={run} disabled={busy || !generics.length}>
          <Icon name="safety" /> {t('safety.run')}
        </button>
        <button className="btn" onClick={() => setProfile(true)}>{t('safety.allergyProfile')}</button>
      </div>

      {state.allergies.length > 0 && (
        <p className="muted" style={{ margin: '-4px 2px' }}>
          {t('safety.allergyProfile')}: {state.allergies.map((a) => <span key={a} className="pill" style={{ margin: '0 4px' }}>{a}</span>)}
        </p>
      )}

      {busy && <div className="card" style={{ textAlign: 'center' }}><Spinner /></div>}

      {!generics.length && (
        <div className="card safety-empty">
          <Empty icon="🛡️" title={t('meds.empty')} />
          <p className="muted" style={{ textAlign: 'center', marginTop: 8 }}>
            {lang === 'ur'
              ? 'Safety check chalane ke liye pehle apni medicines add karein ya prescription scan karein.'
              : 'Add your medicines or scan a prescription first to run the safety check.'}
          </p>
          <div className="btnRow" style={{ justifyContent: 'center', marginTop: 12 }}>
            <button className="btn primary" onClick={() => go?.('scan')}>
              <Icon name="scan" /> {lang === 'ur' ? 'Prescription Scan' : 'Scan Prescription'}
            </button>
            <button className="btn" onClick={() => go?.('meds')}>
              <Icon name="meds" /> {lang === 'ur' ? 'Medicine Add Karein' : 'Add Medicine'}
            </button>
          </div>
        </div>
      )}

      {result && !busy && prescription && (
        <div className="card prescription-review">
          <div className="sectionHead" style={{ marginTop: 0 }}>
            <h2>Prescription timing & interaction screen</h2>
            <span className="pill">{prescription.summary?.spacingAlerts || 0} timing alert{prescription.summary?.spacingAlerts === 1 ? '' : 's'}</span>
          </div>
          <div className="rx-chip-row">
            {(prescription.medicines || []).map((m) => <span className={`rx-chip ${m.type}`} key={m.generic}><Lat>{m.generic}</Lat> · {m.type}</span>)}
          </div>
          {(prescription.spacingAlerts || []).map((a, n) => (
            <div className={`sev ${a.level === 'moderate' ? 'moderate' : a.level === 'minor' ? 'minor' : 'major'}`} key={n}>
              <span className="badge"><Icon name="alert" /></span>
              <div><b><Lat>{a.antibiotic}</Lat> + <Lat>{a.supplement}</Lat></b>
                <p>{lang === 'ur' ? a.messageUr : a.message}</p>
                <small>Screening gap: {a.hoursBefore}h before / {a.hoursAfter}h after</small>
              </div>
            </div>
          ))}
          {!prescription.spacingAlerts?.length && <div className="rx-ok">✓ No specific antibiotic–mineral spacing alert found in the current rules.</div>}
          <p className="muted" style={{ marginTop: 8 }}>Prescription/label instructions and pharmacist or doctor advice override this screening aid.</p>
        </div>
      )}

      {result && !busy && (
        <>
          <div className={`sev ${result.risk === 'high' ? 'major' : result.risk === 'medium' ? 'moderate' : 'good'}`}>
            <span className="badge">{t('safety.risk')}</span>
            <div style={{ flex: 1 }}>
              <b>{t(`safety.${result.risk}`)}</b>
              {result.escalate && <p>{result.escalate}</p>}
            </div>
          </div>

          <div className="sectionHead">
            <h2>{t('safety.interactions')}</h2>
            <span className="count">{result.interactions.interactions.length}</span>
          </div>
          {!result.interactions.interactions.length
            ? <div className="card"><p>{t('safety.none')}</p><p className="muted" style={{ marginTop: 6 }}>No known interaction was found in the checked interaction dataset. This does not prove that every possible interaction is absent.</p></div>
            : result.interactions.interactions.map((i, n) => (
              <div className={`sev ${i.severity}`} key={n}>
                <span className="badge">{t(`safety.${i.severity}`)}</span>
                <div>
                  <b><Lat>{i.a}</Lat> + <Lat>{i.b}</Lat></b>
                  <p>{lang === 'ur' ? i.adviceUr : i.advice}</p>
                </div>
              </div>
            ))}

          {result.interactions.duplicates.length > 0 && (
            <>
              <div className="sectionHead"><h2>{t('safety.duplicates')}</h2></div>
              {result.interactions.duplicates.map((d, n) => (
                <div className="sev moderate" key={n}>
                  <span className="badge"><Lat>{d.group}</Lat></span>
                  <div><p>{d.drugs.map((x) => <Lat key={x}>{x} </Lat>)}</p></div>
                </div>
              ))}
            </>
          )}

          {result.allergy.alerts.length > 0 && (
            <>
              <div className="sectionHead"><h2>{t('safety.allergies')}</h2></div>
              {result.allergy.alerts.map((a, n) => (
                <div className={`sev ${a.severity === 'direct' ? 'major' : 'moderate'}`} key={n}>
                  <span className="badge"><Icon name="alert" /></span>
                  <div><b><Lat>{a.drug}</Lat></b><p>{lang === 'ur' ? a.messageUr : a.message}</p></div>
                </div>
              ))}
            </>
          )}

          {result.food.length > 0 && (
            <>
              <div className="sectionHead"><h2>{t('safety.food')}</h2></div>
              {result.food.map((f) => f.notes.map((n, k) => (
                <div className="sev minor" key={f.drug + k}>
                  <span className="badge"><Lat>{n.item}</Lat></span>
                  <div><b><Lat>{f.drug}</Lat></b><p>{lang === 'ur' ? n.ur : n.en}</p></div>
                </div>
              )))}
            </>
          )}

          {result.interactions.unchecked.length > 0 && (
            <p className="muted" style={{ margin: '2px' }}>
              {t('safety.unchecked', { list: result.interactions.unchecked.join(', ') })}
            </p>
          )}
        </>
      )}

      <div className="sectionHead">
        <h2>{t('organ.title')}</h2>
        <button className="btn sm" style={{ marginInlineStart: 'auto' }} onClick={() => setOrganSheet(true)}>
          {t('organ.run')}
        </button>
      </div>
      {!organ || organ.incomplete ? (
        <div className="card"><p>{t('organ.noData')}</p></div>
      ) : (
        <>
          {organ.kidney && (
            <div className={`sev ${organ.kidney.crcl < 30 ? 'major' : organ.kidney.crcl < 60 ? 'moderate' : 'good'}`}>
              <span className="badge"><Lat>{organ.kidney.crcl} mL/min</Lat></span>
              <div><b>{t('organ.result')}</b><p>{t(`organ.stage.${organ.kidney.stage}`)}</p></div>
            </div>
          )}
          {!organ.flags.length ? (
            <div className="card"><p>{t('organ.ok')}</p></div>
          ) : organ.flags.map((f, n) => (
            <div className={`sev ${f.level === 'avoid' ? 'major' : 'moderate'}`} key={n}>
              <span className="badge">{t(`organ.${f.level}`)}</span>
              <div><b><Lat>{f.drug}</Lat></b><p>{lang === 'ur' ? f.messageUr : f.message}</p></div>
            </div>
          ))}
        </>
      )}

      <div className="sectionHead">
        <h2>{t('report.title')}</h2>
        <button className="btn sm" style={{ marginInlineStart: 'auto' }} onClick={() => setReportSheet(true)}>
          {t('report.send')}
        </button>
      </div>
      {state.reports.length > 0 && state.reports.slice(0, 3).map((r) => (
        <div className={`sev ${r.severity === 'emergency' ? 'major' : r.severity === 'known' ? 'moderate' : 'minor'}`} key={r.id}>
          <span className="badge">{t(`report.${r.severity === 'emergency' ? 'emergency' : r.severity}`)}</span>
          <div><b><Lat>{r.drug}</Lat> — {r.symptom}</b><p>{lang === 'ur' ? r.adviceUr : r.advice}</p></div>
        </div>
      ))}

      <div className="sectionHead"><h2>{t('safety.emergency')}</h2></div>
      {state.meds.length > 0 && (
        <div className="card">
          <p style={{ marginBottom: 10 }}>{t('safety.tookExtra')}</p>
          {state.meds.map((m) => (
            <button className="btn danger" key={m.id} style={{ marginBottom: 6 }} onClick={() => openEmergency(m)}>
              <Icon name="alert" /> <Lat>{m.generic}</Lat>
            </button>
          ))}
        </div>
      )}

      {profile && (
        <Sheet title={t('safety.allergyProfile')} onClose={() => setProfile(false)}>
          {ALLERGY_GROUPS.map((g) => {
            const on = state.allergies.includes(g);
            return (
              <button className="btn" key={g} style={{ marginBottom: 6, justifyContent: 'space-between' }}
                onClick={() => actions.setAllergies(on ? state.allergies.filter((x) => x !== g) : [...state.allergies, g])}>
                <Lat>{g}</Lat>
                <span className={on ? 'tick on' : 'tick'} style={{ width: 24, height: 24 }}>{on && <Icon name="check" />}</span>
              </button>
            );
          })}
          <button className="btn primary" onClick={() => setProfile(false)}>{t('meds.save')}</button>
        </Sheet>
      )}

      {organSheet && (
        <OrganSheet t={t} state={state} actions={actions}
          onClose={() => setOrganSheet(false)} notify={notify} />
      )}

      {reportSheet && (
        <ReportSheet t={t} lang={lang} state={state} actions={actions}
          onClose={() => setReportSheet(false)} notify={notify} />
      )}

      {emergency && (
        <Sheet title={`${t('safety.emergency')} — ${emergency.drug.generic}`} onClose={() => setEmergency(null)}>
          <div className="sev major" style={{ marginBottom: 10 }}>
            <span className="badge"><Icon name="alert" /></span>
            <div><b>{t('safety.emergencyHelp')}</b>
              <p>{lang === 'ur'
                ? 'اگلی خوراک نہ لیں۔ نیچے دی گئی علامات دیکھیں اور ضرورت پر فوراً مدد لیں۔'
                : 'Do not take another dose. Watch for the symptoms below and get help immediately if they appear.'}</p>
            </div>
          </div>
          {emergency.label?.overdosage && (
            <div className="card" style={{ marginBottom: 10 }}>
              <h2>{lang === 'ur' ? 'زیادہ خوراک کی علامات' : 'Signs of taking too much'}</h2>
              <p style={{ color: 'var(--text)', marginTop: 6 }}>{emergency.label.overdosage}</p>
            </div>
          )}
          <a className="btn danger" href="tel:1122" style={{ marginBottom: 8, textDecoration: 'none' }}>
            <Icon name="alert" /> {t('safety.callHelp')} — <Lat>1122</Lat>
          </a>
          {state.caregiver?.phone && (
            <a className="btn" href={`tel:${state.caregiver.phone}`} style={{ textDecoration: 'none' }}>
              {state.caregiver.name || t('reminders.caregiver')}
            </a>
          )}
        </Sheet>
      )}
    </>
  );
}


function OrganSheet({ t, state, actions, onClose, notify }) {
  const [h, setH] = useState(state.health);
  return (
    <Sheet title={t('organ.title')} onClose={onClose}>
      <p className="muted" style={{ marginBottom: 12 }}>{t('organ.fromLab')}</p>
      <div className="btnRow">
        <div className="field" style={{ flex: 1 }}>
          <label>{t('organ.age')}</label>
          <input type="number" inputMode="numeric" value={h.age}
            onChange={(e) => setH({ ...h, age: e.target.value })} />
        </div>
        <div className="field" style={{ flex: 1 }}>
          <label>{t('organ.weight')}</label>
          <input type="number" inputMode="decimal" value={h.weightKg}
            onChange={(e) => setH({ ...h, weightKg: e.target.value })} />
        </div>
      </div>
      <div className="field">
        <label>{t('organ.creatinine')}</label>
        <input type="number" step="0.1" inputMode="decimal" value={h.creatinine}
          onChange={(e) => setH({ ...h, creatinine: e.target.value })} />
      </div>
      <div className="field">
        <label>{t('organ.sex')}</label>
        <select value={h.sex} onChange={(e) => setH({ ...h, sex: e.target.value })}>
          <option value="male">{t('organ.male')}</option>
          <option value="female">{t('organ.female')}</option>
        </select>
      </div>
      <button className="btn" style={{ marginBottom: 10, justifyContent: 'space-between' }}
        onClick={() => setH({ ...h, liverDisease: !h.liverDisease })}>
        {t('organ.liver')}
        <span className={h.liverDisease ? 'tick on' : 'tick'} style={{ width: 24, height: 24 }}>
          {h.liverDisease && <Icon name="check" />}
        </span>
      </button>
      <button className="btn primary" onClick={() => { actions.setHealth(h); notify(t('meds.save')); onClose(); }}>
        {t('organ.run')}
      </button>
    </Sheet>
  );
}

function ReportSheet({ t, lang, state, actions, onClose, notify }) {
  const [drug, setDrug] = useState(state.meds[0]?.generic || '');
  const [symptom, setSymptom] = useState('');
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!drug || !symptom.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.sideEffect(drug, symptom.trim());
      setResult(r);
      actions.addReport(r);
    } catch { notify(t('common.error')); }
    finally { setBusy(false); }
  };

  return (
    <Sheet title={t('report.title')} onClose={onClose}>
      <div className="field">
        <label>{t('report.which')}</label>
        <select value={drug} onChange={(e) => { setDrug(e.target.value); setResult(null); }}>
          {state.meds.map((m) => <option key={m.id} value={m.generic}>{m.generic}</option>)}
        </select>
      </div>
      <div className="field">
        <label>{t('report.what')}</label>
        <input autoFocus value={symptom} placeholder={t('report.placeholder')}
          onChange={(e) => { setSymptom(e.target.value); setResult(null); }}
          onKeyDown={(e) => e.key === 'Enter' && submit()} />
      </div>
      <button className="btn primary" onClick={submit} disabled={busy || !symptom.trim()}>
        {busy ? t('common.loading') : t('report.send')}
      </button>

      {result && (
        <div className={`sev ${result.severity === 'emergency' ? 'major' : result.severity === 'known' ? 'moderate' : 'minor'}`}
          style={{ marginTop: 12 }}>
          <span className="badge">
            {t(`report.${result.severity === 'emergency' ? 'emergency' : result.severity}`)}
          </span>
          <div><p>{lang === 'ur' ? result.adviceUr : result.advice}</p></div>
        </div>
      )}
      {result?.action === 'emergency' && (
        <a className="btn danger" href="tel:1122" style={{ marginTop: 10, textDecoration: 'none' }}>
          <Icon name="alert" /> {t('safety.callHelp')} — <Lat>1122</Lat>
        </a>
      )}

      {state.reports.length > 0 && (
        <>
          <div className="sectionHead" style={{ marginTop: 16 }}>
            <h2>{t('report.history')}</h2>
            <button className="btn sm" style={{ marginInlineStart: 'auto' }}
              onClick={() => actions.clearReports()}>{t('report.clear')}</button>
          </div>
          {state.reports.slice(0, 6).map((r) => (
            <p className="muted" key={r.id} style={{ fontSize: 12.5, margin: '4px 2px' }}>
              <Lat>{new Date(r.at).toLocaleDateString()}</Lat> · <Lat>{r.drug}</Lat> — {r.symptom}
            </p>
          ))}
        </>
      )}
    </Sheet>
  );
}
