import test from 'node:test';
import assert from 'node:assert/strict';

process.env.VERCEL = '1';
const { default: app } = await import('./index.js');

test('answers natural-language doxycycline milk questions from the local medicine data', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Can I take Doxycycline with milk?' }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.drug, 'Doxycycline');
  assert.match(result.answer, /not markedly affected by food or milk/i);
  assert.match(result.sources[0].url, /dailymed\.nlm\.nih\.gov/);
});

test('checks all named medicines in natural-language interaction questions', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();

  const response = await fetch(`http://127.0.0.1:${port}/api/ask`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ question: 'Can I take Warfarin + Aspirin with milk?' }),
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.drug, 'Warfarin, Aspirin');
  assert.equal(result.severity, 'major');
  assert.match(result.answer, /potentially serious interaction/i);
  assert.match(result.answer, /Milk does not remove or prevent/i);
});
