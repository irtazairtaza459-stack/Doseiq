import React, { useMemo, useState, useEffect } from 'react';
import { api } from '../api.js';
import { timingKey } from '../i18n.js';
import { Icon, Empty, Lat, Sheet } from '../ui.jsx';
import { todayKey, courseDay } from '../store.js';

export default function Home({ t, lang, state, actions, notify, go }) {
  const { meds } = state;
  const today = todayKey();
  const [missed, setMissed] = useState(null);
  const [snapshot, setSnapshot] = useState(null);

  const takenCount = meds.filter((m) => m.taken?.[today]).length;
  const adherence = meds.length ? Math.round((takenCount / meds.length) * 100) : 0;
  const sorted = useMemo(() => [...meds].sort((a, b) => (a.time || '').localeCompare(b.time || '')), [meds]);
  const next = sorted.find((m) => !m.taken?.[today]);
  const course = meds.find((m) => m.course && m.days);
  const day = course ? courseDay(course) : null;

  useEffect(() => {
    let live = true;
    const generics = meds.map((m) => m.generic).filter(Boolean);
    if (!generics.length) { setSnapshot(null); return undefined; }
    api.review(generics, state.allergies).then((r) => live && setSnapshot(r)).catch(() => live && setSnapshot(null));
    return () => { live = false; };
  }, [meds, state.allergies]);

  const openMissed = async (med) => {
    try {
      actions.recordMiss(med.id);
      const g = await api.missedDose(med.generic, (med.misses || 0) + 1);
      setMissed({ med, guidance: g });
    } catch { notify(t('common.error')); }
  };

  const dateText = new Intl.DateTimeFormat(lang === 'ur' ? 'ur-PK' : 'en-PK', {
    weekday: 'long', day: 'numeric', month: 'short',
  }).format(new Date());

  const quick = [
    ['scan', 'scan', lang === 'ur' ? 'نسخہ اسکین کریں' : 'Scan prescription', () => go('scan')],
    ['plus', 'plus', lang === 'ur' ? 'دوا شامل کریں' : 'Add medicine', () => go('meds')],
    ['safety', 'safety', lang === 'ur' ? 'تعامل چیک کریں' : 'Check interaction', () => go('safety')],
    ['meds', 'meds', lang === 'ur' ? 'دوا کی معلومات' : 'Medicine info', () => go('meds')],
    ['heart', 'heart', lang === 'ur' ? 'صحت کی معلومات' : 'Health profile', () => go('safety')],
  ];

  return (
    <>
      <section className="app-welcome">
        <div className="guest-block">
          <div className="avatar">GU</div>
          <div>
            <div className="hello">{lang === 'ur' ? 'خوش آمدید، مہمان' : 'HELLO, GUEST'}</div>
            <div className="date-line">{dateText}</div>
          </div>
        </div>
        <div className="header-actions">
          <button className="round-action light" onClick={() => go('reminders')} aria-label="Notifications"><Icon name="bell" /></button>
          <button className="round-action danger" onClick={() => go('safety')}>SOS</button>
          <button className="round-action green" onClick={() => go('meds')} aria-label="Add medicine"><Icon name="plus" /></button>
        </div>
      </section>

      {!meds.length ? (
        <section className="welcome-card card-accent">
          <div className="eyebrow-app">{lang === 'ur' ? 'DOSEIQ میں خوش آمدید' : 'WELCOME TO DOSEIQ'}</div>
          <h1>{lang === 'ur' ? 'آج کا پلان بنائیں' : "Let's set up today's plan"}</h1>
          <p>{lang === 'ur' ? 'آپ کی دوائیں اسی فون پر محفوظ رہتی ہیں۔ ایک منٹ سے بھی کم میں شروع کریں۔' : 'Your medicines stay on this phone. Start in under a minute.'}</p>
          <button className="btn primary hero-btn" onClick={() => go('meds')}><Icon name="plus" /> {lang === 'ur' ? 'دوا شامل کریں' : 'Add medicine'}</button>
          <button className="btn secondary-btn" onClick={() => go('scan')}><Icon name="scan" /> {lang === 'ur' ? 'نسخہ اسکین کریں' : 'Scan prescription'}</button>
          <button className="btn secondary-btn" onClick={() => go('reminders')}><Icon name="bell" /> {lang === 'ur' ? 'یاد دہانی مقرر کریں' : 'Set reminders'}</button>
        </section>
      ) : (
        <>
          <section className="today-card card-accent">
            <div className="today-copy">
              <div className="eyebrow-app">{lang === 'ur' ? 'آج کی دوا' : 'TODAY\'S MEDICATION'}</div>
              <h1>{next ? <><Lat>{next.generic || next.name}</Lat></> : (lang === 'ur' ? 'تمام خوراکیں مکمل' : 'All doses complete')}</h1>
              <p>{next ? `${next.dose || ''}${next.time ? ` · ${next.time}` : ''}` : `${takenCount}/${meds.length} ${lang === 'ur' ? 'خوراکیں لی گئیں' : 'doses taken'}`}</p>
            </div>
            <div className="progress-ring" style={{ '--p': adherence }}><span>{adherence}%</span></div>
          </section>

          {course && (
            <section className="course-card card">
              <div className="course-head"><div><div className="eyebrow-app">{lang === 'ur' ? 'اینٹی بائیوٹک کورس' : 'ANTIBIOTIC COURSE'}</div><h2><Lat>{course.generic}</Lat></h2></div><span className="pill">{t('home.dayOf', { a: day, b: course.days })}</span></div>
              <div className="bar"><i style={{ width: `${Math.min(100, (day / course.days) * 100)}%` }} /></div>
              <p>{day >= course.days ? (lang === 'ur' ? 'کورس مکمل ہو گیا۔' : 'Course complete.') : (lang === 'ur' ? 'نسخے کے مطابق کورس مکمل کریں۔' : 'Finish the course as prescribed.')}</p>
            </section>
          )}
        </>
      )}

      <section>
        <div className="home-section-title">{lang === 'ur' ? 'فوری اقدامات' : 'Quick actions'}</div>
        <div className="quick-grid">
          {quick.map(([icon, key, label, fn]) => <button className="quick-action" key={key} onClick={fn}><span><Icon name={icon} /></span>{label}</button>)}
        </div>
      </section>

      {meds.length > 0 && (
        <section className="health-track card-accent">
          <div>
            <div className="eyebrow-app">{lang === 'ur' ? 'حفاظت اور صحت' : 'HEALTH & SAFETY'}</div>
            <h2>{snapshot?.risk === 'high' ? (lang === 'ur' ? 'توجہ درکار ہے' : 'Attention needed') : (lang === 'ur' ? 'آپ کی دوا کا جائزہ' : 'Your medicine check')}</h2>
            <p>{snapshot ? (snapshot.risk === 'low' ? (lang === 'ur' ? 'ابھی کوئی بڑا مسئلہ نہیں ملا۔' : 'No major issue found right now.') : (lang === 'ur' ? 'سیفٹی چیک کھولیں اور تفصیل دیکھیں۔' : 'Open the safety check to review the details.')) : (lang === 'ur' ? 'اپنی دواؤں کی حفاظت چیک کریں۔' : 'Review your medicines for safety.')}</p>
          </div>
          <button className="text-action" onClick={() => go('safety')}>{lang === 'ur' ? 'چیک کریں →' : 'Check now →'}</button>
        </section>
      )}

      {meds.length > 0 && (
        <section>
          <div className="home-section-title">{lang === 'ur' ? 'آج کا شیڈول' : "Today's schedule"}</div>
          {sorted.slice(0, 3).map((m) => {
            const done = !!m.taken?.[today];
            return <div className={done ? 'dose compact done' : 'dose compact'} key={m.id}>
              <div className="when"><Lat>{m.time || '--:--'}</Lat><small>{t(`common.${timingKey[m.timing] || 'any'}`)}</small></div>
              <div className="body"><b><Lat>{m.generic || m.name}</Lat></b><span>{m.dose ? <Lat>{m.dose}</Lat> : ''}</span></div>
              {!done && <button className="btn sm" onClick={() => openMissed(m)}><Icon name="alert" /></button>}
              <button className={done ? 'tick on' : 'tick'} onClick={() => actions.markTaken(m.id, !done)}>{done && <Icon name="check" />}</button>
            </div>;
          })}
        </section>
      )}

      <section className="advice-card card">
        <div><div className="eyebrow-app">{lang === 'ur' ? 'دوا کا مشورہ' : 'MEDICINE ADVICE'}</div><h2>{lang === 'ur' ? 'اپنی دوا کے بارے میں سوال ہے؟' : 'Have a question about your medicine?'}</h2><p>{lang === 'ur' ? 'وقت، کھانے یا رہ جانے والی خوراک کے بارے میں پوچھیں۔' : 'Ask about timing, food, or missed doses.'}</p></div>
        <div className="btnRow"><button className="btn primary" onClick={() => go('ask')}><Icon name="ask" /> {lang === 'ur' ? 'AI سے پوچھیں' : 'Ask AI'}</button><button className="btn" onClick={() => go('ask')}>{lang === 'ur' ? 'فارماسسٹ سے پوچھیں' : 'Ask pharmacist'}</button></div>
      </section>

      <button className="sos-banner" onClick={() => go('safety')}><Icon name="alert" /> SOS · {lang === 'ur' ? 'ایمرجنسی موڈ' : 'Emergency mode'}</button>

      {missed && <Sheet title={t('reminders.missedTitle')} onClose={() => setMissed(null)}><div className="card"><h2><Lat>{missed.guidance.drug}</Lat></h2><p style={{ color: 'var(--text)', marginTop: 6 }}>{lang === 'ur' ? missed.guidance.guidanceUr : missed.guidance.guidance}</p></div><button className="btn primary" onClick={() => setMissed(null)}>{t('common.close')}</button></Sheet>}
    </>
  );
}
