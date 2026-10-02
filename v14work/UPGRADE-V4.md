# DoseIQ Professional v4

This upgrade keeps the existing DoseIQ backend/features and improves the public first page.

## Changes
- Home medicine search now searches the local catalogue and global fallback (RxNorm/NLM, FDA openFDA and DailyMed) while the user stays on the same page.
- Search results open an inline medicine information sheet instead of forcing navigation.
- Vite now accepts Cloudflare Quick Tunnel subdomains via `.trycloudflare.com`, so a new temporary tunnel hostname does not require editing `vite.config.js` each time.
- Existing OCR, interaction, allergy, organ-safety, price, reminders, missed-dose, pharmacist handoff and bilingual/voice features are preserved.
- Added clearer search loading/empty states and mobile-friendly result controls.

## Run
From the folder containing `package.json`:

```powershell
npm install
npm run dev
```

For a temporary public link:

```powershell
cd C:\Users\USER\Downloads
.\cloudflared-windows-amd64.exe tunnel --url http://localhost:5173
```

The generated `trycloudflare.com` URL can be opened on another network while both terminals remain running.
