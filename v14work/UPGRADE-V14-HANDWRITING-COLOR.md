# DoseIQ v14 — Handwriting OCR + severity colors

## What changed
- Tesseract now runs OCR over an orientation-preserving, size-limited image with several enhancement views (original color, contrast, local-lighting adaptive threshold, Otsu threshold and sharpening), page-segmentation modes 6/11/12, and a broad overlapping prescription crop.
- Added a conservative OCR-rescue layer for explicit fragments such as `GESIC`, `WIL GESIC`, and other observed OCR variants. Rescue matches are always review-required and are never silently auto-saved.
- Added a built-in local medicine catalogue search for corrected or manually entered OCR text. No AI model installation, API key, or paid credit is needed.
- No antibiotic course duration is invented when it is not written.
- Interaction/severity cards now use stronger level-based red/orange/blue/green borders, badges, and backgrounds. Prescription timing alerts use their actual severity level instead of always rendering as red.

## Important safety behavior
Tesseract itself is designed primarily for printed text and is not a reliable handwriting recognizer. The enhanced local OCR pass remains a suggestion layer; the new image-enhancement ensemble has not yet been re-evaluated on the labelled handwriting set. citehttps://github.com/naptha/tesseract.js/blob/master/docs/faq.md

Offline OCR was correct on only 3 of 50 scoreable handwritten examples in the earlier evaluation. Catalogue matches are possible names, not a confirmation of the prescription. Confirm every medicine and instruction against the original or with a pharmacist.
