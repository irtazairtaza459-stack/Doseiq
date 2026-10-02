import React, { useState, useRef, useEffect } from 'react';
import { api } from '../api.js';
import { Icon, Spinner } from '../ui.jsx';

const EXAMPLES = {
  en: ['Panadol kab leni hai?', 'Can I take Doxycycline with milk?', 'Xanax and driving?'],
  ur: ['پیناڈول کب لینی ہے؟', 'کیا ڈوکسی سائیکلین دودھ کے ساتھ لے سکتے ہیں؟', 'زیناکس اور ڈرائیونگ؟'],
};

export default function Ask({ t, lang, notify }) {
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [pharmacist, setPharmacist] = useState(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef(null);
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs, busy]);

  const speak = (answer, answerUr) => {
    if (!window.speechSynthesis) return;
    const say = lang === 'ur' ? answerUr : answer;
    const u = new SpeechSynthesisUtterance(say);
    u.lang = lang === 'ur' ? 'ur-PK' : 'en-GB';
    u.rate = 0.95;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  };

  const send = async (question) => {
    const q = (question ?? text).trim();
    if (!q || busy) return;
    setText('');
    setMsgs((m) => [...m, { who: 'you', text: q }]);
    setBusy(true);
    try {
      const r = await api.ask(q);
      const shown = lang === 'ur' ? r.answerUr : r.answer;
      setMsgs((m) => [...m, { who: 'bot', text: shown, en: r.answer, ur: r.answerUr, drug: r.drug, global: r.global, sources: r.sources }]);
    } catch {
      setMsgs((m) => [...m, { who: 'bot', text: t('common.error') }]);
    } finally { setBusy(false); }
  };

  // Web Speech recognition ships in Chrome; other browsers simply keep the text box.
  const listen = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { notify(lang === 'ur' ? 'یہ براؤزر آواز سپورٹ نہیں کرتا' : 'This browser does not support voice input'); return; }
    if (listening) { recRef.current?.stop(); return; }
    const rec = new SR();
    rec.lang = lang === 'ur' ? 'ur-PK' : 'en-PK';
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (e) => { const said = e.results[0][0].transcript; setText(said); send(said); };
    rec.onerror = () => notify(t('common.error'));
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setListening(true);
    rec.start();
  };

  const requestPharmacist = async () => {
    const lastQuestion = [...msgs].reverse().find((m) => m.who === 'you')?.text || '';
    try {
      const r = await api.pharmacistRequest(lastQuestion, [...new Set(msgs.filter((m) => m.drug).map((m) => m.drug))]);
      setPharmacist(r);
    } catch {
      notify(t('common.error'));
    }
  };

  return (
    <>
      <div className="card">
        <h2>{t('ask.title')}</h2>
        <div className="sev good" style={{ marginTop: 10, marginBottom: 10 }}>
          <span className="badge">GLOBAL</span>
          <div>
            <p><b>{lang === 'ur' ? 'عالمی دوا معلومات' : 'Global medicine knowledge'}</b></p>
            <p className="muted">{lang === 'ur' ? 'اگر دوا مقامی ڈیٹا میں نہ ہو تو DoseIQ عالمی دوا کے ماخذ سے معلومات تلاش کرے گا۔' : 'If a medicine is not in the local catalogue, DoseIQ can retrieve public global medicine data.'}</p>
          </div>
        </div>
        <p>{t('ask.examples')}:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {EXAMPLES[lang === 'ur' ? 'ur' : 'en'].map((x) => (
            <button className="btn sm" key={x} onClick={() => send(x)}>{x}</button>
          ))}
        </div>
      </div>

      <div className="chat">
        {msgs.map((m, i) => (
          <div className={`msg ${m.who}`} key={i} dir="auto">
            {m.who === 'bot' && m.en ? (lang === 'ur' ? m.ur : m.en) : m.text}
            {m.who === 'bot' && m.drug && (
              <button className="btn sm" style={{ marginTop: 8 }} onClick={() => speak(m.en, m.ur)}>
                <Icon name="speaker" /> {t('ask.listen')}
              </button>
            )}
            {m.who === 'bot' && m.global && m.sources?.length > 0 && (
              <div className="muted" style={{ marginTop: 8, fontSize: 11 }}>
                {lang === 'ur' ? 'ماخذ: ' : 'Sources: '}
                {m.sources.map((s, si) => <a key={si} href={s.url} target="_blank" rel="noreferrer" style={{ marginRight: 8 }}>{s.name}</a>)}
              </div>
            )}
          </div>
        ))}
        {busy && <div className="msg bot"><Spinner /></div>}
        <div ref={endRef} />
      </div>

      {msgs.some((m) => m.who === 'bot') && (
        <div className="card" style={{ marginTop: 10 }}>
          <h2>{lang === 'ur' ? 'فارماسسٹ سے رابطہ' : 'Human pharmacist handoff'}</h2>
          <p>{lang === 'ur' ? 'AI جواب کو انسانی فارماسسٹ کے جائزے کے لیے بھیجا جا سکتا ہے، اگر اس deployment میں رابطہ configured ہو۔' : 'Send the question for human pharmacist review when a pharmacist contact is configured for this deployment.'}</p>
          <button className="btn" style={{ marginTop: 8 }} onClick={requestPharmacist}>{lang === 'ur' ? 'فارماسسٹ سے پوچھیں' : 'Request pharmacist review'}</button>
          {pharmacist && !pharmacist.configured && <p className="muted" style={{ marginTop: 8 }}>{lang === 'ur' ? 'اس وقت human pharmacist contact configured نہیں ہے۔' : 'Human pharmacist support is not configured yet.'}</p>}
          {pharmacist?.configured && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
              {pharmacist.email && <a className="btn sm" href={`mailto:${pharmacist.email}`}>{pharmacist.email}</a>}
              {pharmacist.whatsapp && <a className="btn sm" target="_blank" rel="noreferrer" href={`https://wa.me/${String(pharmacist.whatsapp).replace(/\D/g, '')}`}>WhatsApp</a>}
            </div>
          )}
        </div>
      )}

      <div className="chatBar">
        <button className={listening ? 'mic live' : 'mic'} onClick={listen}
          aria-label={listening ? t('ask.listening') : t('ask.speak')}>
          <Icon name="mic" />
        </button>
        <input value={text} placeholder={t('ask.placeholder')} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()} />
        <button className="btn sm primary" onClick={() => send()} disabled={busy}>{t('ask.send')}</button>
      </div>
      <p className="muted" style={{ fontSize: 12, textAlign: 'center' }}>{t('ask.disclaimer')}</p>
    </>
  );
}
