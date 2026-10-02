import React, { useState, useRef } from 'react';
import { api } from '../api.js';
import { Icon, Spinner, Lat } from '../ui.jsx';

function buildTimes(first = '08:00', frequency = 1, intervalHours = null) {
  const [h, m] = first.split(':').map(Number);
  const step = intervalHours || (24 / Math.max(1, frequency));
  return Array.from({ length: Math.max(1, frequency) }, (_, i) => {
    const total = Math.round((h * 60 + m + i * step * 60) % (24 * 60));
    return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
  });
}

function inferFrequency(line = '') {
  const x = String(line).toLowerCase().replace(/\s+/g, ' ');
  if (/\bq\.?i\.?d\b|\bqid\b|4\s*(x|times)|four times/.test(x)) return 4;
  if (/\bt\.?d\.?s\b|\btds\b|3\s*(x|times)|three times/.test(x)) return 3;
  if (/\bb\.?d\.?\b|\bbid\b|2\s*(x|times)|twice|two times/.test(x)) return 2;
  if (/\b(od|qd|once daily|once a day|1\s*(x|time)|daily)\b/.test(x)) return 1;
  const m = x.match(/every\s+(\d{1,2})\s*hours?/);
  return m ? Math.max(1, Math.round(24 / Number(m[1]))) : 1;
}

/**
 * Prescriptions are photographed in poor light on cheap phones. Upscaling and
 * hard-thresholding the image lifts Tesseract's hit rate noticeably.
 */
function preprocess(img, mode = 'adaptive') {
  const scale = Math.min(3.2, Math.max(1.5, 2200 / img.naturalWidth));
  const c = document.createElement('canvas');
  c.width = Math.round(img.naturalWidth * scale);
  c.height = Math.round(img.naturalHeight * scale);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, c.width, c.height);
  if (mode === 'color') return c;

  const d = ctx.getImageData(0, 0, c.width, c.height);
  const px = d.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) {
    const lum = Math.round(px[i] * 0.299 + px[i + 1] * 0.587 + px[i + 2] * 0.114);
    px[i] = px[i + 1] = px[i + 2] = lum;
    sum += lum;
  }
  const mean = sum / (px.length / 4);
  for (let i = 0; i < px.length; i += 4) {
    const v = px[i];
    // Preserve pen strokes while suppressing yellow paper/background.
    const out = mode === 'threshold'
      ? (v < mean * 0.84 ? 0 : 255)
      : Math.max(0, Math.min(255, (v - mean) * 1.85 + 150));
    px[i] = px[i + 1] = px[i + 2] = out;
  }
  ctx.putImageData(d, 0, 0);
  return c;
}

function cropMedicineZone(canvas) {
  // Many prescriptions put the medicine list in the central/right 3/4. Keep
  // this as an additional OCR view rather than replacing the full-page pass.
  const x = Math.round(canvas.width * 0.17);
  const y = Math.round(canvas.height * 0.18);
  const w = Math.round(canvas.width * 0.79);
  const h = Math.round(canvas.height * 0.56);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c;
}


async function handwritingOcr(img, setProgress) {
  if (!window.Tesseract?.createWorker) {
    const fallback = await window.Tesseract.recognize(preprocess(img, 'adaptive'), 'eng', {
      logger: (m) => m.status === 'recognizing text' && setProgress(Math.round(m.progress * 40)),
    });
    return fallback.data?.text || '';
  }

  const worker = await window.Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') setProgress(Math.min(95, Math.round(m.progress * 20)));
    },
  });
  const jobs = [
    { mode: 'color', psm: '11', crop: false },
    { mode: 'adaptive', psm: '6', crop: false },
    { mode: 'adaptive', psm: '11', crop: true },
    { mode: 'threshold', psm: '11', crop: true },
  ];
  const texts = [];
  try {
    for (let i = 0; i < jobs.length; i += 1) {
      const job = jobs[i];
      const base = preprocess(img, job.mode);
      const canvas = job.crop ? cropMedicineZone(base) : base;
      await worker.setParameters({
        tessedit_pageseg_mode: job.psm,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      const { data } = await worker.recognize(canvas);
      if (data.text?.trim()) texts.push(data.text.trim());
      setProgress(Math.round(((i + 1) / jobs.length) * 92));
    }
  } finally {
    await worker.terminate();
  }
  return texts.join('\n');
}

export default function Scan({ t, lang, actions, notify, go }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [raw, setRaw] = useState('');
  const [items, setItems] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const run = async (file) => {
    if (!file) return;
    if (!window.Tesseract) { notify(t('common.error')); return; }
    setBusy(true); setItems(null); setPrescription(null); setRaw(''); setProgress(0);
    const url = URL.createObjectURL(file);
    setPreview(url);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url;
      });
      // Use multiple page-segmentation views plus a medicine-list crop.
      const text = await handwritingOcr(img, setProgress);
      setRaw(text);
      const lines = [...new Set(text.split(/\n|\r/).map((l) => l.trim()).filter((l) => l.length > 2))];
      if (!lines.length) { setItems([]); return; }
      const res = await api.parseScan(lines);
      setProgress(100);
      setItems(res.items);
      setPrescription({ ...(res.prescription || {}), unrecognisedLines: res.unrecognisedLines || [] });
    } catch (err) {
      console.error(err);
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const rematchEditedText = async () => {
    const lines = [...new Set(raw.split(/\n|\r/).map((line) => line.trim()).filter((line) => line.length > 2))];
    if (!lines.length || busy) return;
    setBusy(true);
    try {
      const result = await api.parseScan(lines);
      setItems(result.items || []);
      setPrescription({ ...(result.prescription || {}), unrecognisedLines: result.unrecognisedLines || [] });
    } catch (err) {
      console.error(err);
      notify(t('common.error'));
    } finally {
      setBusy(false);
    }
  };

  const addAll = () => {
    const keep = items.filter((i) => !i.dismissed);
    if (!keep.length) return;
    actions.addMany(keep.map((i) => ({
      generic: i.generic, name: i.generic, urdu: i.urdu, dose: i.dose || '',
      time: '08:00', doseTimes: buildTimes('08:00', i.frequency || 1, i.intervalHours), frequency: i.frequency || 1, intervalHours: i.intervalHours || undefined, timing: i.timing || 'any', purposeEn: i.purposeEn, purposeUr: i.purposeUr,
      days: i.days || undefined, course: !!i.days,
    })));
    notify(t('scan.found', { n: keep.length }));
    go('home');
  };

  return (
    <>
      <div className="card">
        <h2>{t('scan.title')}</h2>
        <p>{t('scan.help')}</p>
        <div className="btnRow" style={{ marginTop: 12 }}>
          <button className="btn primary" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon name="scan" /> {t('scan.choose')}
          </button>
          <button className="btn" onClick={() => cameraRef.current?.click()} disabled={busy}>
            <Icon name="camera" /> {t('scan.camera')}
          </button>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden
          onChange={(e) => run(e.target.files?.[0])} />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden
          onChange={(e) => run(e.target.files?.[0])} />
      </div>

      {preview && <img src={preview} alt="" className="scanPreview" />}

      {busy && (
        <div className="card" style={{ textAlign: 'center' }}>
          <Spinner />
          <p style={{ marginTop: 10 }}>{t('scan.reading')} {progress > 0 && `${progress}%`}</p>
        </div>
      )}

      {items && items.length === 0 && preview && !busy && (
        <div className="card handwriting-assist-card">
          <b>{lang === 'ur' ? 'دوا کا نام دستی طور پر درست کریں' : 'Correct the medicine text'}</b>
          <p className="muted" style={{ marginTop: 6 }}>
            {lang === 'ur' ? 'یہ اسکین آپ کے آلے پر چلتا ہے۔ OCR متن درست کریں، پھر مقامی دوا کیٹلاگ میں دوبارہ تلاش کریں۔' : 'Scanning stays on your device. Correct the OCR text, then search the local medicine catalogue again.'}
          </p>
        </div>
      )}

      {items && preview && (
        <div className="card">
          <label htmlFor="scan-corrected-text"><b>{lang === 'ur' ? 'OCR متن کا جائزہ' : 'Review scanned text'}</b></label>
          <textarea id="scan-corrected-text" rows="5" value={raw} onChange={(event) => setRaw(event.target.value)}
            placeholder={lang === 'ur' ? 'دوا کا نام یا نسخے کی لائن یہاں لکھیں' : 'Correct or type a medicine name or prescription line'} />
          <button className="btn" style={{ marginTop: 10 }} onClick={rematchEditedText} disabled={busy || !raw.trim()}>
            <Icon name="scan" /> {lang === 'ur' ? 'مقامی کیٹلاگ میں دوبارہ تلاش کریں' : 'Match against local catalogue'}
          </button>
        </div>
      )}

      {items && items.length > 0 && (

        <>
          <div className="sectionHead">
            <h2>{t('scan.found', { n: items.length })}</h2>
          </div>
          <p className="muted" style={{ margin: '-4px 2px 0' }}>{t('scan.reviewNote')}</p>
          <div className="card" style={{ borderColor: 'var(--moderate)' }}>
            <b>Prescription OCR review</b>
            <p className="muted" style={{ marginTop: 6 }}>Only high-confidence medicine matches are added automatically. Handwritten text that cannot be matched confidently is left for manual confirmation instead of being guessed.</p>
            {prescription?.unrecognisedLines?.length > 0 && (
              <details style={{ marginTop: 8 }}>
                <summary style={{ cursor: 'pointer' }}>Unrecognised prescription lines ({prescription.unrecognisedLines.length})</summary>
                <div className="raw" style={{ marginTop: 8 }}>
                  {prescription.unrecognisedLines.map((line, idx) => <div key={idx}>{line}</div>)}
                </div>
              </details>
            )}
          </div>
          <div className="prescription-review card">
            <div className="sectionHead" style={{ marginTop: 0 }}>
              <h2>Prescription safety review</h2>
              <span className="pill">{prescription?.summary?.antibiotics || 0} antibiotic{prescription?.summary?.antibiotics === 1 ? '' : 's'}</span>
            </div>
            <div className="rx-chip-row">
              {(prescription?.medicines || []).map((m) => (
                <span className={`rx-chip ${m.type}`} key={m.generic}><Lat>{m.generic}</Lat> · {m.type}</span>
              ))}
            </div>
            {!prescription?.spacingAlerts?.length ? (
              <div className="rx-ok">✓ No specific antibiotic–mineral spacing alert was found in the current rules.</div>
            ) : prescription.spacingAlerts.map((a, idx) => (
              <div className={`sev ${a.level === 'moderate' ? 'moderate' : a.level === 'minor' ? 'minor' : 'major'}`} key={idx}>
                <span className="badge"><Icon name="alert" /></span>
                <div>
                  <b><Lat>{a.antibiotic}</Lat> + <Lat>{a.supplement}</Lat></b>
                  <p>{lang === 'ur' ? a.messageUr : a.message}</p>
                  <small>Recommended screening gap: {a.hoursBefore}h before / {a.hoursAfter}h after</small>
                </div>
              </div>
            ))}
            <p className="muted" style={{ marginTop: 8 }}>Prescription/label instructions and pharmacist or doctor advice override this screening aid.</p>
          </div>

          {(items.filter((i) => i.generic && i.frequency && i.days && i.generic && prescription?.medicines?.find((m) => m.generic === i.generic && m.type === 'antibiotic')).length > 0) && (
            <div className="card">
              <div className="sectionHead" style={{ marginTop: 0 }}><h2>Antibiotic course schedule</h2></div>
              {items.filter((i) => i.days && prescription?.medicines?.find((m) => m.generic === i.generic && m.type === 'antibiotic')).map((i) => (
                <div className="schedule-mini-row" key={i.generic}>
                  <div><b><Lat>{i.generic}</Lat></b><span className="muted"> · {i.days} days · {i.frequency || 1} dose{(i.frequency || 1) === 1 ? '' : 's'}/day</span></div>
                  <div className="schedule-preview">{buildTimes('08:00', i.frequency || 1, i.intervalHours).map((x) => <span className="pill" key={x}>{x}</span>)}</div>
                </div>
              ))}
              <p className="muted" style={{ marginTop: 8 }}>Times are a planning aid based on the scanned frequency. If the prescription gives an exact time or interval, follow it instead.</p>
            </div>
          )}

          {items.map((i, n) => (
            <div className="card" key={n} style={{ opacity: i.dismissed ? 0.45 : 1 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2><Lat>{i.generic}</Lat> {i.dose && <span className="pill"><Lat>{i.dose}</Lat></span>}</h2>
                  <p>{lang === 'ur' ? i.purposeUr : i.purposeEn}</p>
                  <p className="raw" style={{ marginTop: 8 }}>{i.sourceLine}</p>
                </div>
                <button className="btn sm" onClick={() => setItems(items.map((x, k) => (k === n ? { ...x, dismissed: !x.dismissed } : x)))}
                  aria-label={t('scan.notMedicine')}><Icon name="trash" /></button>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                <div className="bar" style={{ flex: 1, marginTop: 0 }}>
                  <i style={{ width: `${i.confidence * 100}%`, background: i.needsReview ? 'var(--moderate)' : 'var(--good)' }} />
                </div>
                <span className="muted" style={{ fontSize: 12 }}>{Math.round(i.confidence * 100)}%</span>
              </div>
              {i.needsReview && <p className="muted" style={{ color: 'var(--moderate)', marginTop: 6 }}>{i.vision ? (lang === 'ur' ? 'AI handwriting match ہے — اصل prescription سے لازمی confirm کریں۔' : 'AI handwriting match — confirm against the original prescription before saving.') : i.rescue ? (lang === 'ur' ? 'OCR rescue match ہے — اصل prescription سے لازمی confirm کریں۔' : 'OCR rescue match — confirm against the original prescription before saving.') : t('scan.lowConf')}</p>}
            </div>
          ))}
          <button className="btn primary" onClick={addAll}><Icon name="plus" /> {t('scan.addAll')}</button>
        </>
      )}

      {items && items.length === 0 && (
        <div className="card">
          <p>{t('scan.noneFound')}</p>
          <p className="muted" style={{ marginTop: 8 }}>OCR can fail on glare, handwriting and curved packaging. Search the medicine by name in My Medicines if needed.</p>
          <button className="btn" style={{ marginTop: 10 }} onClick={() => go('meds')}><Icon name="meds" /> Add by medicine name</button>
        </div>
      )}

    </>
  );
}
