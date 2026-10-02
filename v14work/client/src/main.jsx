import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import './styles.css';
import { translate, dict } from './i18n.js';
import { load, save, uid, todayKey } from './store.js';
import { Icon } from './ui.jsx';
import Home from './screens/Home.jsx';
import Scan from './screens/Scan.jsx';
import Meds from './screens/Meds.jsx';
import Safety from './screens/Safety.jsx';
import Reminders from './screens/Reminders.jsx';
import Ask from './screens/Ask.jsx';
import Profile from './screens/Profile.jsx';
import Landing from './Landing.jsx';

const TABS = [
  ['home', 'home', Home], ['meds', 'meds', Meds], ['scan', 'scan', Scan],
  ['reminders', 'bell', Reminders], ['safety', 'safety', Safety], ['ask', 'ask', Ask], ['profile', 'user', Profile],
];

function App() {
  const [state, setState] = useState(load);
  const [tab, setTab] = useState('home');
  const [toast, setToast] = useState('');
  const [siteMode, setSiteMode] = useState(true);

  useEffect(() => { save(state); }, [state]);
  useEffect(() => {
    const d = dict[state.lang] || dict.en;
    document.documentElement.lang = state.lang === 'ur' ? 'ur' : 'en';
    document.documentElement.dir = d.dir;
  }, [state.lang]);

  const t = useCallback((path, vars) => translate(state.lang, path, vars), [state.lang]);
  const notify = useCallback((msg) => {
    setToast(msg);
    window.clearTimeout(notify._id);
    notify._id = window.setTimeout(() => setToast(''), 2800);
  }, []);

  const patch = useCallback((fn) => setState((s) => ({ ...s, ...fn(s) })), []);

  const actions = useMemo(() => ({
    addMed: (med) => patch((s) => ({ meds: [...s.meds, { id: uid(), taken: {}, misses: 0, startedAt: Date.now(), ...med }] })),
    addMany: (list) => patch((s) => ({ meds: [...s.meds, ...list.map((m) => ({ id: uid(), taken: {}, misses: 0, startedAt: Date.now(), ...m }))] })),
    removeMed: (id) => patch((s) => ({ meds: s.meds.filter((m) => m.id !== id) })),
    updateMed: (id, changes) => patch((s) => ({ meds: s.meds.map((m) => (m.id === id ? { ...m, ...changes } : m)) })),
    markTaken: (id, on) => patch((s) => ({
      meds: s.meds.map((m) => (m.id === id
        ? { ...m, taken: { ...m.taken, [todayKey()]: on }, misses: on ? 0 : m.misses }
        : m)),
    })),
    recordMiss: (id) => patch((s) => ({
      meds: s.meds.map((m) => (m.id === id ? { ...m, misses: (m.misses || 0) + 1 } : m)),
    })),
    setAllergies: (allergies) => patch(() => ({ allergies })),
    setCaregiver: (caregiver) => patch(() => ({ caregiver })),
    setLang: (lang) => patch(() => ({ lang })),
    setHealth: (health) => patch(() => ({ health })),
    addReport: (report) => patch((s) => ({ reports: [{ id: uid(), at: Date.now(), ...report }, ...s.reports].slice(0, 50) })),
    clearReports: () => patch(() => ({ reports: [] })),
    // Snooze pushes the reminder forward without losing the original schedule.
    snooze: (id, minutes) => patch((s) => ({
      meds: s.meds.map((m) => (m.id === id
        ? { ...m, snoozedUntil: Date.now() + minutes * 60000 }
        : m)),
    })),
  }), [patch]);

  const Screen = TABS.find((x) => x[0] === tab)?.[2] || Home;
  const shared = { t, lang: state.lang, state, actions, notify, go: setTab };

  if (siteMode) {
    return (
      <>
        <Landing lang={state.lang} onLaunch={() => setSiteMode(false)} onLanguageChange={() => actions.setLang(state.lang === 'en' ? 'ur' : 'en')} />
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="top-user">
          <div className="avatar">GU</div>
          <div>
            <div className="hello">{state.lang === 'ur' ? 'خوش آمدید، مہمان' : 'HELLO, GUEST'}</div>
            <div className="date-line">{new Intl.DateTimeFormat(state.lang === 'ur' ? 'ur-PK' : 'en-PK', { weekday: 'long', day: 'numeric', month: 'short' }).format(new Date())}</div>
          </div>
        </div>
        <div className="header-actions">
          <button className="round-action light" onClick={() => setTab('reminders')} aria-label="Notifications"><Icon name="bell" /></button>
          <button className="lang-toggle" onClick={() => actions.setLang(state.lang === 'en' ? 'ur' : 'en')} aria-label="Change language">{state.lang === 'en' ? 'اردو' : 'English'}</button>
          <button className="round-action danger" onClick={() => setTab('safety')}>SOS</button>
          <button className="round-action green" onClick={() => setTab('meds')} aria-label="Add medicine"><Icon name="plus" /></button>
        </div>
      </header>

      <main><Screen {...shared} /></main>

      <nav className="tabs" aria-label="Sections">
        {TABS.filter(([key]) => key !== 'ask').map(([key, icon]) => (
          <button key={key} className={tab === key ? 'tab on' : 'tab'}
            onClick={() => setTab(key)} aria-current={tab === key ? 'page' : undefined}>
            <Icon name={icon} />
            {t(`nav.${key}`)}
          </button>
        ))}
      </nav>

      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

createRoot(document.getElementById('root')).render(<App />);
