import React, { useState, useEffect, useRef } from 'react';
import { timingKey } from '../i18n.js';
import { Icon, Empty, Lat } from '../ui.jsx';
import { todayKey } from '../store.js';

export default function Reminders({ t, lang, state, actions, notify }) {
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const [caregiver, setCaregiver] = useState(state.caregiver || { name: '', phone: '' });
  const fired = useRef(new Set());
  const today = todayKey();

  const ask = async () => {
    if (typeof Notification === 'undefined') return;
    const p = await Notification.requestPermission();
    setPerm(p);
    if (p === 'granted') {
      new Notification(t('appName'), { body: t('reminders.enabled'), icon: '/icon.png' });
    }
  };

  // Fire a notification when a dose time passes and the dose has not been ticked off.
  useEffect(() => {
    if (perm !== 'granted') return;
    const tick = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      for (const m of state.meds) {
        if (!m.time || m.taken?.[today]) continue;
        const snoozed = m.snoozedUntil && m.snoozedUntil > Date.now();
        if (snoozed) continue;
        // Either the scheduled minute has arrived, or a snooze has just run out.
        const dueNow = m.time === hhmm;
        const snoozeDue = m.snoozedUntil && m.snoozedUntil <= Date.now() && m.snoozedUntil > Date.now() - 60000;
        const key = `${m.id}:${today}:${dueNow ? m.time : m.snoozedUntil}`;
        if ((!dueNow && !snoozeDue) || fired.current.has(key)) continue;
        fired.current.add(key);
        new Notification(`${t('home.take')} — ${m.generic}`, {
          body: `${m.dose || ''} · ${t(`common.${timingKey[m.timing] || 'any'}`)}`,
          tag: key, requireInteraction: true,
        });
      }
    };
    const id = setInterval(tick, 20000);
    tick();
    return () => clearInterval(id);
  }, [perm, state.meds, today, t]);

  const sorted = [...state.meds].sort((a, b) => (a.time || '').localeCompare(b.time || ''));
  const atRisk = state.meds.filter((m) => (m.misses || 0) >= 2);

  // Pakistani numbers are usually written 03xx…; WhatsApp needs the 92 country code.
  const waNumber = (raw) => {
    const digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('92')) return digits;
    if (digits.startsWith('0')) return `92${digits.slice(1)}`;
    return digits;
  };
  const alertText = encodeURIComponent(
    `${t('appName')}: ${state.meds[0] ? '' : ''}${atRisk.map((m) => `${m.generic} — ${m.misses} missed doses`).join('; ')}. `
    + `Please check on ${state.caregiver?.name ? 'them' : 'the patient'}.`,
  );

  return (
    <>
      <div className="card">
        <h2>{t('reminders.title')}</h2>
        {perm === 'granted' ? (
          <p style={{ color: 'var(--good)' }}>✓ {t('reminders.enabled')}</p>
        ) : perm === 'denied' ? (
          <p style={{ color: 'var(--moderate)' }}>{t('reminders.blocked')}</p>
        ) : (
          <button className="btn primary" style={{ marginTop: 10 }} onClick={ask}>
            <Icon name="bell" /> {t('reminders.enable')}
          </button>
        )}
      </div>

      {atRisk.length > 0 && (
        <div className="sev major">
          <span className="badge"><Icon name="alert" /></span>
          <div>
            <b>{t('reminders.caregiver')}</b>
            {atRisk.map((m) => (
              <p key={m.id}><Lat>{m.generic}</Lat> — {m.misses} {lang === 'ur' ? 'خوراکیں رہ گئیں' : 'doses missed in a row'}</p>
            ))}
          </div>
        </div>
      )}

      <div className="sectionHead"><h2>{t('reminders.schedule')}</h2></div>
      {!sorted.length ? <Empty icon="⏰" title={t('meds.empty')} /> : sorted.map((m) => {
        const done = !!m.taken?.[today];
        return (
          <div className={done ? 'dose done' : 'dose'} key={m.id}>
            <div className="when"><Lat>{m.time || '--:--'}</Lat><small>{t(`common.${timingKey[m.timing] || 'any'}`)}</small></div>
            <div className="body">
              <b><Lat>{m.generic || m.name}</Lat></b>
              <span>
                {m.dose && <Lat>{m.dose}</Lat>}
                {m.snoozedUntil > Date.now() && (
                  <> · {t('home.snoozedUntil', { t: new Date(m.snoozedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) })}</>
                )}
              </span>
            </div>
            <button className="btn sm" onClick={() => {
              actions.snooze(m.id, 10);
              const at = new Date(Date.now() + 10 * 60000)
                .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
              notify(t('home.snoozed', { t: at }));
            }}>{t('home.snooze')}</button>
            <button className={done ? 'tick on' : 'tick'} onClick={() => actions.markTaken(m.id, !done)}
              aria-label={done ? t('home.taken') : t('home.take')}>{done && <Icon name="check" />}</button>
          </div>
        );
      })}

      <div className="sectionHead"><h2>{t('reminders.caregiver')}</h2></div>
      <div className="card">
        <p style={{ marginBottom: 10 }}>{t('reminders.caregiverHelp')}</p>
        <div className="field">
          <label>{t('reminders.caregiverName')}</label>
          <input value={caregiver.name} onChange={(e) => setCaregiver({ ...caregiver, name: e.target.value })} />
        </div>
        <div className="field">
          <label>{t('reminders.caregiverPhone')}</label>
          <input type="tel" inputMode="tel" value={caregiver.phone}
            onChange={(e) => setCaregiver({ ...caregiver, phone: e.target.value })} />
        </div>
        <button className="btn" onClick={() => { actions.setCaregiver(caregiver); notify(t('meds.save')); }}>
          {t('meds.save')}
        </button>
        {atRisk.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {caregiver.phone ? (
              <>
                <a className="btn danger" style={{ marginBottom: 6, textDecoration: 'none' }}
                  href={`https://wa.me/${waNumber(caregiver.phone)}?text=${alertText}`}
                  target="_blank" rel="noreferrer">{t('reminders.alertNow')}</a>
                <a className="btn" style={{ textDecoration: 'none' }}
                  href={`sms:${caregiver.phone}?&body=${alertText}`}>{t('reminders.alertSms')}</a>
              </>
            ) : <p className="muted">{t('reminders.noCaregiver')}</p>}
          </div>
        )}
      </div>
    </>
  );
}
