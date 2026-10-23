import test from 'node:test';
import assert from 'node:assert/strict';
import { checkInteractions, estimateKidney, missedDoseGuidance, organReview } from './engine.js';

test('uses a reported CrCl instead of calculating from serum creatinine', () => {
  assert.deepEqual(
    estimateKidney({ crcl: '42.4', age: 40, weightKg: 70, creatinine: 0.8, sex: 'male' }),
    { crcl: 42, stage: 'moderate', formula: 'Reported CrCl' },
  );
});

test('estimates adult CrCl only when all valid inputs are present', () => {
  assert.deepEqual(
    estimateKidney({ age: 65, weightKg: 60, creatinine: 1.2, sex: 'female' }),
    { crcl: 44, stage: 'moderate', formula: 'Cockcroft-Gault' },
  );
  assert.equal(estimateKidney({ age: 16, weightKg: 60, creatinine: 1, sex: 'male' }), null);
  assert.equal(estimateKidney({ age: 40, weightKg: 70, creatinine: 1, sex: 'unknown' }), null);
  assert.equal(estimateKidney({ crcl: '301' }), null);
});

test('flags amikacin for clinician review when CrCl is reduced', () => {
  const result = organReview(['Amikacin'], { kidney: { crcl: 45, stage: 'moderate' } });
  assert.equal(result.flags[0].drug, 'Amikacin');
  assert.equal(result.flags[0].level, 'adjust');
  assert.match(result.flags[0].message, /cannot calculate an amikacin dose/);
  assert.match(result.flags[0].sourceUrl, /dailymed\.nlm\.nih\.gov/);
});

test('does not give generic missed-dose dosing instructions for amikacin', () => {
  const result = missedDoseGuidance('Amikacin');
  assert.match(result.guidance, /Contact them for advice/);
  assert.doesNotMatch(result.guidance, /take it as soon as you remember/i);
  assert.equal(result.neverDouble, true);
});

test('shows amikacin monitoring guidance even without a low CrCl result', () => {
  const normal = organReview(['Amikacin'], { kidney: { crcl: 100, stage: 'normal' } });
  const missing = organReview(['Amikacin']);
  assert.equal(normal.flags[0].level, 'caution');
  assert.equal(missing.flags[0].level, 'caution');
  assert.equal(missing.incomplete !== null, true);
});

test('reports medicines without kidney rules as unchecked, not clear', () => {
  const result = organReview(['Aspirin'], { kidney: { crcl: 100, stage: 'normal' } });
  assert.deepEqual(result.unchecked, ['Aspirin']);
  assert.equal(result.checkable, 0);
});

test('marks interaction results incomplete when a medicine is not in the local catalogue', () => {
  const result = checkInteractions(['Amikacin', 'Unknown medicine']);
  assert.equal(result.coverage, 'partial');
  assert.deepEqual(result.unchecked, ['Unknown medicine']);
  assert.equal(result.summary.totalPairs, 1);
  assert.equal(result.summary.checkedPairs, 0);
});

test('checks Amikacin interaction pairs in the local DDInter dataset', () => {
  const result = checkInteractions(['Amikacin', 'Furosemide']);
  assert.equal(result.coverage, 'complete');
  assert.equal(result.summary.checkedPairs, 1);
  assert.equal(result.interactions.length, 1);
  assert.equal(result.interactions[0].severity, 'major');
  assert.doesNotMatch(result.interactions[0].advice, /stop taking/i);
});
