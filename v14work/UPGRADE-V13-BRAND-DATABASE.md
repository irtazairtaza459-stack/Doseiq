# DoseIQ v13 — Brand/Geneic Matching Upgrade

- Expanded the local Pakistan-focused brand index and aliases.
- Added verified prescription brands: Calcite 600, Cobolmin SL, Wilgesic/Wilgesic Forte, and Valmera aliases.
- Search now displays the matched brand as the primary result and the mapped generic underneath.
- OCR matching handles strength text and common spacing/letter variants before fuzzy matching.
- Existing global fallback (RxNorm/NLM, FDA, DailyMed) remains available for medicines not present in the local catalogue.
- Unknown/uncertain brands are not invented; they remain candidates requiring confirmation.

Coverage note: no finite static file can honestly guarantee every medicine brand in every country. The app therefore uses a layered local + global lookup model rather than claiming universal coverage.
