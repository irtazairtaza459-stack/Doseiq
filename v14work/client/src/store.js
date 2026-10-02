// Local persistence. Everything stays on the patient's own device.
const KEY = 'doseiq.v1';

const empty = {
  meds: [], allergies: [], caregiver: { name: '', phone: '' }, lang: 'en', log: {},
  health: { age: '', weightKg: '', creatinine: '', sex: 'male', liverDisease: false },
  reports: [],
};

export function load() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...empty, ...JSON.parse(raw) } : { ...empty };
  } catch { return { ...empty }; }
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode */ }
}

export const todayKey = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 10);

/** Which day of the course a medicine is on, counting the start date as day 1. */
export function courseDay(med) {
  if (!med?.days) return null;
  const start = med.startedAt || Date.now();
  const days = Math.floor((Date.now() - start) / 86400000) + 1;
  return Math.min(Math.max(days, 1), med.days);
}
