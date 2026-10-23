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

function prepareOcrImage(img) {
  const longestSide = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = Math.min(2.5, 2400 / longestSide);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare prescription image.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function preprocess(source, mode = 'adaptive') {
  if (mode === 'color') return source;

  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Could not prepare prescription image.');
  ctx.drawImage(source, 0, 0);

  const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const pixels = image.data;
  const width = canvas.width;
  const height = canvas.height;
  const count = width * height;
  const gray = new Uint8Array(count);
  const histogram = mode === 'threshold' ? new Uint32Array(256) : null;
  let total = 0;

  for (let pixel = 0, offset = 0; pixel < count; pixel += 1, offset += 4) {
    const value = Math.round(pixels[offset] * 0.299 + pixels[offset + 1] * 0.587 + pixels[offset + 2] * 0.114);
    gray[pixel] = value;
    total += value;
    if (histogram) histogram[value] += 1;
  }

  let threshold = total / count;
  if (histogram) {
    let backgroundWeight = 0;
    let backgroundSum = 0;
    let bestVariance = -1;
    for (let value = 0; value < histogram.length; value += 1) {
      backgroundWeight += histogram[value];
      if (!backgroundWeight) continue;
      const foregroundWeight = count - backgroundWeight;
      if (!foregroundWeight) break;
      backgroundSum += value * histogram[value];
      const backgroundMean = backgroundSum / backgroundWeight;
      const foregroundMean = (total - backgroundSum) / foregroundWeight;
      const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
      if (variance > bestVariance) {
        bestVariance = variance;
        threshold = value;
      }
    }
  }

  let integral;
  const stride = width + 1;
  if (mode === 'adaptive') {
    integral = new Uint32Array(stride * (height + 1));
    for (let y = 1; y <= height; y += 1) {
      let rowSum = 0;
      const row = (y - 1) * width;
      const current = y * stride;
      const previous = (y - 1) * stride;
      for (let x = 1; x <= width; x += 1) {
        rowSum += gray[row + x - 1];
        integral[current + x] = integral[previous + x] + rowSum;
      }
    }
  }

  for (let y = 0, offset = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1, offset += 4) {
      const index = y * width + x;
      const value = gray[index];
      let output;
      if (mode === 'threshold') {
        output = value < threshold ? 0 : 255;
      } else if (mode === 'adaptive') {
        const left = Math.max(0, x - 24);
        const top = Math.max(0, y - 24);
        const right = Math.min(width, x + 25);
        const bottom = Math.min(height, y + 25);
        const area = (right - left) * (bottom - top);
        const sum = integral[bottom * stride + right] - integral[top * stride + right]
          - integral[bottom * stride + left] + integral[top * stride + left];
        output = value < sum / area - 9 ? 0 : 255;
      } else if (mode === 'sharpen') {
        const left = gray[y * width + Math.max(0, x - 1)];
        const right = gray[y * width + Math.min(width - 1, x + 1)];
        const above = gray[Math.max(0, y - 1) * width + x];
        const below = gray[Math.min(height - 1, y + 1) * width + x];
        output = Math.max(0, Math.min(255, Math.round(value * 1.5 - (left + right + above + below) * 0.125)));
      } else {
        output = Math.max(0, Math.min(255, Math.round((value - 128) * 1.55 + 145)));
      }
      pixels[offset] = pixels[offset + 1] = pixels[offset + 2] = output;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

function cropMedicineZone(canvas) {
  // Keep a broad overlapping crop as an additional OCR view; layouts vary.
  const x = Math.round(canvas.width * 0.04);
  const y = Math.round(canvas.height * 0.08);
  const w = Math.round(canvas.width * 0.92);
  const h = Math.round(canvas.height * 0.82);
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.drawImage(canvas, x, y, w, h, 0, 0, w, h);
  return c;
}


async function handwritingOcr(img, setProgress) {
  const source = prepareOcrImage(img);

  if (!window.Tesseract?.createWorker) {
    const fallback = await window.Tesseract.recognize(preprocess(source, 'adaptive'), 'eng', {
      logger: (m) => m.status === 'recognizing text' && setProgress(Math.round(m.progress * 40)),
    });
    return fallback.data?.text || '';
  }

  const jobs = [
    { mode: 'color', psm: '11', crop: false },
    { mode: 'contrast', psm: '6', crop: false },
    { mode: 'adaptive', psm: '6', crop: false },
    { mode: 'adaptive', psm: '11', crop: true },
    { mode: 'adaptive', psm: '12', crop: true },
    { mode: 'threshold', psm: '6', crop: true },
    { mode: 'sharpen', psm: '11', crop: true },
  ];
  let activeJob = 0;
  const worker = await window.Tesseract.createWorker('eng', 1, {
    logger: (m) => {
      if (m.status === 'recognizing text') {
        setProgress(Math.min(95, Math.round(((activeJob + m.progress) / jobs.length) * 92)));
      }
    },
  });
  const observations = new Map();

  try {
    for (let i = 0; i < jobs.length; i += 1) {
      activeJob = i;
      const job = jobs[i];
      const base = preprocess(source, job.mode);
      const canvas = job.crop ? cropMedicineZone(base) : base;
      await worker.setParameters({
        tessedit_pageseg_mode: job.psm,
        preserve_interword_spaces: '1',
        user_defined_dpi: '300',
      });
      const { data } = await worker.recognize(canvas);
      const confidence = Number.isFinite(data.confidence) ? data.confidence : 0;
      for (const line of (data.text || '').split(/\r?\n/).map((value) => value.trim()).filter((value) => value.length > 2)) {
        const key = line.toLowerCase().replace(/[^a-z0-9]+/g, '');
        if (!key) continue;
        const current = observations.get(key);
        if (current) {
          current.votes += 1;
          if (confidence > current.confidence) {
            current.confidence = confidence;
            current.text = line;
          }
        } else {
          observations.set(key, { text: line, votes: 1, confidence, order: observations.size });
        }
      }
      setProgress(Math.round(((i + 1) / jobs.length) * 92));
    }
  } finally {
    await worker.terminate();
  }
  return [...observations.values()]
    .sort((a, b) => b.votes - a.votes || b.confidence - a.confidence || a.order - b.order)
    .map(({ text }) => text)
    .join('\n');
}

export default function Scan({ t, lang, actions, notify, go }) {
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [preview, setPreview] = useState(null);
  const [raw, setRaw] = useState('');
  const [items, setItems] = useState(null);
  const [prescription, setPrescription] = useState(null);
  const [manualQuery, setManualQuery] = useState('');
  const [manualSearch, setManualSearch] = useState({ loading: false, results: [], error: '', searched: false });
  const [selectedMatch, setSelectedMatch] = useState(null);
  const fileRef = useRef(null);
  const cameraRef = useRef(null);

  const run = async (file) => {
    if (!file) return;
    if (!window.Tesseract) { notify(t('common.error')); return; }
    setBusy(true); setItems(null); setPrescription(null); setRaw(''); setProgress(0);
    setManualQuery('');
    setManualSearch({ loading: false, results: [], error: '', searched: false });
    setSelectedMatch(null);
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

  const searchLocalMedicine = async (event) => {
    event.preventDefault();
    const term = manualQuery.trim();
    if (term.length < 2 || manualSearch.loading) return;

    setManualSearch({ loading: true, results: [], error: '', searched: true });
    setSelectedMatch(null);
    try {
      const result = await api.match(term, 20);
      setManualSearch({
        loading: false,
        results: (result.candidates || [])
          .filter((candidate) => !candidate.global && candidate.confidence >= 0.5)
          .slice(0, 5),
        error: '',
        searched: true,
      });
    } catch (err) {
      console.error(err);
      setManualSearch({
        loading: false,
        results: [],
        error: lang === 'ur' ? 'مقامی دوا کی فہرست دستیاب نہیں۔ دوبارہ کوشش کریں۔' : 'The local medicine catalogue could not be reached. Please try again.',
        searched: true,
      });
    }
  };

  const selectLocalMedicine = async (candidate) => {
    setSelectedMatch({ loading: true, candidate, drug: null });
    try {
      const result = await api.drug(candidate.generic);
      setSelectedMatch({ loading: false, candidate, drug: result.drug });
    } catch (err) {
      console.error(err);
      setSelectedMatch({ loading: false, candidate, drug: null, error: true });
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
        <p className="muted" style={{ marginTop: 6 }}>
          {lang === 'ur'
            ? 'بہتر اسکین کے لیے پورا نسخہ فریم میں رکھیں، کیمرہ سیدھا رکھیں، روشنی اچھی ہو اور تصویر دھندلی یا چمک والی نہ ہو۔'
            : 'For a clearer scan, keep the whole prescription in frame, hold the camera straight, use even light, and avoid blur or glare.'}
        </p>
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
          <b>{lang === 'ur' ? 'اس تصویر سے دوا کا نام یقینی طور پر نہیں پڑھا جا سکا' : 'The medicine name could not be read reliably from this image'}</b>
          <p className="muted" style={{ marginTop: 6 }}>
            {lang === 'ur'
              ? 'دوا کے نام والی سطر صرف OCR متن کے بجائے نیچے مقامی فہرست میں تلاش کریں، یا زیادہ قریب سے صاف اور روشن تصویر لیں۔'
              : 'Handwriting can be misread by offline OCR. Type the medicine name as best you can in the local catalogue search below, or retake a clear, well-lit photo of just the prescription.'}
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

      {items && items.length === 0 && preview && !busy && (
        <div className="card">
          <h2>{lang === 'ur' ? 'دوا کا نام خود تلاش کریں' : 'Look up the medicine name'}</h2>
          <p className="muted" style={{ marginTop: 6 }}>{lang === 'ur'
            ? 'نسخے پر لکھا نام جتنا سمجھ آئے ٹائپ کریں۔ یہ تلاش اسی دوا کی مقامی فہرست میں ہوگی۔'
            : 'Type the medicine or brand name as best you can. This searches the built-in medicine catalogue only.'}</p>
          <form onSubmit={searchLocalMedicine}>
            <input
              value={manualQuery}
              onChange={(event) => {
                setManualQuery(event.target.value);
                setManualSearch({ loading: false, results: [], error: '', searched: false });
                setSelectedMatch(null);
              }}
              placeholder={lang === 'ur' ? 'مثلاً دوا یا برانڈ کا نام' : 'Medicine or brand name'}
              aria-label={lang === 'ur' ? 'دوا کا نام' : 'Medicine name'}
              minLength={2}
            />
            <button className="btn primary" style={{ marginTop: 10 }} type="submit"
              disabled={manualQuery.trim().length < 2 || manualSearch.loading}>
              {manualSearch.loading ? (lang === 'ur' ? 'تلاش ہو رہی ہے…' : 'Searching…') : (lang === 'ur' ? 'دوا تلاش کریں' : 'Search medicines')}
            </button>
          </form>
          {manualSearch.error && <p role="alert" className="muted" style={{ marginTop: 10 }}>{manualSearch.error}</p>}
          {!manualSearch.loading && manualSearch.results.length > 0 && (
            <div style={{ marginTop: 12 }}>
              <p className="muted">{lang === 'ur' ? 'ممکنہ نام — اصل نسخے سے ضرور ملائیں:' : 'Possible catalogue matches — verify the name against the original:'}</p>
              {manualSearch.results.map((candidate) => (
                <button key={candidate.generic} className="medicine-search-result" style={{ width: '100%', marginTop: 8 }}
                  onClick={() => selectLocalMedicine(candidate)}>
                  <span><strong><Lat>{candidate.brand || candidate.matchedOn || candidate.generic}</Lat></strong>
                    <small><Lat>{candidate.generic}</Lat> · {Math.round(candidate.confidence * 100)}% text match</small></span>
                  <span>{lang === 'ur' ? 'تفصیل' : 'Details'}</span>
                </button>
              ))}
            </div>
          )}
          {!manualSearch.loading && manualSearch.searched && manualSearch.results.length === 0 && !manualSearch.error && (
            <p className="muted" style={{ marginTop: 10 }}>{lang === 'ur'
              ? 'مقامی فہرست میں مماثل دوا نہیں ملی۔ نام کی دوسری املا آزمائیں یا فارماسسٹ سے پوچھیں۔'
              : 'No close match in the local catalogue. Try another spelling or ask a pharmacist to read the prescription.'}</p>
          )}
          {selectedMatch && (
            <div className="card" style={{ marginTop: 12 }}>
              {selectedMatch.loading ? <Spinner /> : selectedMatch.error ? (
                <p role="alert" className="muted">{t('common.error')}</p>
              ) : selectedMatch.drug ? (
                <>
                  <h2><Lat>{selectedMatch.drug.generic}</Lat></h2>
                  <p style={{ marginTop: 6 }}>{lang === 'ur' ? selectedMatch.drug.purposeUr : selectedMatch.drug.purposeEn}</p>
                  {selectedMatch.candidate.brand && <p className="muted" style={{ marginTop: 6 }}>{lang === 'ur' ? 'ممکنہ برانڈ:' : 'Possible brand:'} <Lat>{selectedMatch.candidate.brand}</Lat></p>}
                  <p className="muted" style={{ marginTop: 8 }}>{lang === 'ur'
                    ? 'یہ صرف نام کی مقامی فہرست سے مماثلت ہے، نسخے کی تصدیق نہیں۔ خوراک اور اوقات اصل نسخے یا فارماسسٹ سے معلوم کریں۔'
                    : 'This is a name match from the local catalogue, not confirmation of the prescription. Get the dose and schedule from the original or a pharmacist.'}</p>
                </>
              ) : null}
            </div>
          )}
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
