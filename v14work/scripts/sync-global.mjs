// Expand DoseIQ's persistent global index from medicine names/brands supplied on the command line.
// Example: npm run data:global -- "Adoxa" "Augmentin" "doxycycline 100 mg"
const base = process.env.DOSEIQ_BASE_URL || 'http://localhost:3000';
const terms = process.argv.slice(2).filter(Boolean);
if (!terms.length) {
  console.log('Usage: npm run data:global -- "medicine name" "brand name"');
  process.exit(0);
}
for (const term of terms) {
  const url = `${base}/api/global/search?q=${encodeURIComponent(term)}`;
  const r = await fetch(url);
  const data = await r.json();
  console.log(`${term}: ${data.found ? 'found' : 'not found'} (${(data.candidates || []).length} candidates)`);
}
