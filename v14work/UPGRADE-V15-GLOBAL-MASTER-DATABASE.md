# DoseIQ v15 — Global Master Medicine Index

## What changed
- Added `data/global-medicine-index.json` as a persistent global medicine cache.
- Seeded the previously missing example `Adoxa / Adoxa Pak 2/100` with RxCUI 795712 and doxycycline monohydrate 100 mg.
- Global searches now persist verified RxNorm/FDA-derived records into the local index.
- `/api/match` checks the persistent global index before local fuzzy matching, so known global brands can be found from the DoseIQ database.
- Added `/api/global/index` and `/api/global/import` for index inspection/import.
- Added `npm run data:global -- "name"` to expand the index through the public global search layer.

## Important scope
A single authoritative database containing every medicine brand worldwide does not exist. RxNorm is a US-centric normalized terminology and DailyMed contains US labeling. DoseIQ therefore uses a layered model: local Pakistan catalogue + persistent global cache + live RxNorm/DailyMed/FDA fallback.

Do not use the global cache alone for clinical interaction decisions: global records may lack DoseIQ's local interaction metadata. Confirm the exact product, active ingredient, strength and country-specific formulation.
