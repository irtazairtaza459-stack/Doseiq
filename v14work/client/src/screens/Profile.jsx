import React from 'react';
import { Icon } from '../ui.jsx';

export default function Profile({ t, lang, state, actions, notify, go }) {
  const health = state.health || {};
  return (
    <>
      <div className="profile-hero card">
        <div className="avatar">GU</div>
        <div>
          <div className="eyebrow-app">DOSEIQ PROFILE</div>
          <h2>{lang === 'ur' ? 'میرا پروفائل' : 'My profile'}</h2>
          <p>{lang === 'ur' ? 'آپ کی دوا اور حفاظتی ترجیحات اسی ڈیوائس پر محفوظ رہتی ہیں۔' : 'Your medicine and safety preferences stay on this device.'}</p>
        </div>
      </div>

      <div className="sectionHead"><h2>{lang === 'ur' ? 'فوری سیٹنگز' : 'Quick settings'}</h2></div>
      <div className="profile-list card">
        <button onClick={() => actions.setLang(lang === 'en' ? 'ur' : 'en')}>
          <span><Icon name="globe" /><b>{lang === 'ur' ? 'زبان' : 'Language'}</b></span>
          <small>{lang === 'ur' ? 'اردو' : 'English'}</small>
        </button>
        <button onClick={() => go('reminders')}>
          <span><Icon name="bell" /><b>{lang === 'ur' ? 'یاد دہانیاں' : 'Reminders'}</b></span>
          <small>{state.meds.length} {lang === 'ur' ? 'دوائیں' : 'medicines'}</small>
        </button>
        <button onClick={() => go('safety')}>
          <span><Icon name="safety" /><b>{lang === 'ur' ? 'الرجی اور حفاظت' : 'Allergy & safety'}</b></span>
          <small>{state.allergies.length} {lang === 'ur' ? 'الرجی' : 'allergies'}</small>
        </button>
        <button onClick={() => go('ask')}>
          <span><Icon name="ask" /><b>{lang === 'ur' ? 'AI سے سوال' : 'Ask AI'}</b></span>
          <small>{lang === 'ur' ? 'دواؤں کے بارے میں پوچھیں' : 'Medicine questions'}</small>
        </button>
      </div>

      <div className="sectionHead"><h2>{lang === 'ur' ? 'صحت کی معلومات' : 'Health profile'}</h2></div>
      <div className="card health-summary">
        <div><span>Age</span><b>{health.age || '—'}</b></div>
        <div><span>Weight</span><b>{health.weightKg ? `${health.weightKg} kg` : '—'}</b></div>
        <div><span>Kidney</span><b>{health.creatinine ? 'Added' : 'Not added'}</b></div>
      </div>
      <button className="btn primary" onClick={() => go('safety')}>
        <Icon name="safety" /> {lang === 'ur' ? 'گردے اور جگر کی جانچ کھولیں' : 'Open kidney & liver check'}
      </button>

      <div className="sectionHead"><h2>{lang === 'ur' ? 'DoseIQ' : 'DoseIQ'}</h2></div>
      <div className="card profile-note">
        <b>{lang === 'ur' ? 'اہم' : 'Important'}</b>
        <p>{lang === 'ur'
          ? 'DoseIQ عام طبی معلومات اور حفاظتی چیکس فراہم کرتا ہے۔ نسخے کی اصل ہدایت کو ہمیشہ ترجیح دیں۔'
          : 'DoseIQ provides medicine information and safety checks. Always follow the instructions on your prescription.'}</p>
      </div>
    </>
  );
}
