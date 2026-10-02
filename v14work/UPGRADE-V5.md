# DoseIQ Professional v5 — APK-inspired app UI

This upgrade reshapes the in-app experience to closely follow the supplied APK screenshots while keeping DoseIQ's existing black/green visual identity.

## UI changes
- APK-inspired guest header with avatar, date, notifications, SOS and add-medicine actions.
- Six-tab bottom navigation: Home, Medicines, Scan, My Plan, Safety, Profile.
- Large welcome/today card with green accent and adherence ring.
- Quick-action grid for prescription scan, add medicine, interaction check, medicine info and health profile.
- Health & safety card and emergency banner.
- Today's medicine schedule with take/missed-dose actions.
- Medicine advice card with Ask AI and pharmacist handoff access.
- New Profile screen for language, reminders, safety, AI questions and health profile access.
- Existing Ask screen remains available from Home and pharmacist handoff remains functional.

## Existing functionality retained
- Local medicine catalogue and brand matching.
- Global medicine search/knowledge fallback.
- Prescription OCR workflow.
- Drug interaction and allergy checks.
- Kidney/liver review.
- Side-effect reporting.
- Missed-dose guidance.
- Price/availability lookup.
- Reminders and caregiver alerts.
- Urdu/English interface and voice features.

## Run
```powershell
npm install
npm run dev
```
Then open `http://localhost:5173/`.

The app is designed as a web implementation of the supplied APK's interaction pattern. The APK itself does not contain recoverable source code, so exact source-level replication is not possible; the supplied screenshots are used as the UI reference.
