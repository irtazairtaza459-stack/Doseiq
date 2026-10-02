# DoseIQ v14 — Handwriting OCR + severity colors

## What changed
- Tesseract now runs a multi-view OCR ensemble with page-segmentation modes 6 and 11/12, 300 DPI hinting, and a medicine-list crop.
- Added a conservative OCR-rescue layer for explicit fragments such as `GESIC`, `WIL GESIC`, and other observed OCR variants. Rescue matches are always review-required and are never silently auto-saved.
- Added an optional multimodal handwriting endpoint at `/api/scan/vision`. If `OPENAI_API_KEY` is configured, the Scan screen can send the prescription image to the server-side vision model for a second handwriting pass. Results remain confirmation-only.
- No antibiotic course duration is invented when it is not written.
- Interaction/severity cards now use stronger level-based red/orange/blue/green borders, badges, and backgrounds. Prescription timing alerts use their actual severity level instead of always rendering as red.

## Important safety behavior
Tesseract itself is designed for printed text and is not a reliable handwriting recognizer. The new local OCR pass therefore remains a suggestion layer, while the optional vision pass is explicitly review-only. citehttps://github.com/naptha/tesseract.js/blob/master/docs/faq.md

If the optional vision pass is enabled, the prescription image is sent from the DoseIQ server to the configured vision provider. Keep the API key on the server and obtain appropriate user consent before enabling this in production.
