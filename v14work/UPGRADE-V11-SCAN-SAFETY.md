# DoseIQ v11 — Safer Prescription OCR Matching

- Fixed a major prescription-scan issue where noisy handwritten OCR lines could be fuzzily matched to unrelated medicine names.
- Prescription scanning now uses a conservative 0.78 confidence threshold before a medicine is auto-selected.
- Unrecognised OCR lines are surfaced for manual confirmation instead of being guessed.
- Safety/prescription review remains downstream of confirmed medicine candidates.
- This does not make browser Tesseract a reliable handwriting reader; true handwritten-prescription recognition requires a handwriting-capable OCR service/model.
