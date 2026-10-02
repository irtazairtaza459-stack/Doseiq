
### Prescription scanning
Prescription images are processed in the browser with Tesseract.js; no AI API key or paid vision service is required. Printed text is usually easier to recognize than handwriting. Review and correct the OCR text, match it against the local medicine catalogue, and confirm every medicine, dose, and instruction against the original prescription before saving.

# DoseIQ — Medication safety for Pakistan

Scan a prescription, check it is safe to take, and understand it in Urdu or English.

Built for the Alibaba Cloud AI Hackathon Pakistan 2026.

---

## The problem

In Pakistan most patients leave a clinic with a handwritten slip, a bag of
strips, and no reliable way to answer four questions:

1. What is this medicine actually for?
2. Is it safe with the other things I already take?
3. When do I take it — before food, after food, with milk?
4. I missed a dose. Do I take two now?

Question 4 is where people get hurt. The usual advice app behaviour — repeat the
alarm — quietly encourages double dosing, which is dangerous for sulfonylureas,
anticoagulants and blood-pressure medicines.

## What this does

| | Feature | How it works |
|---|---|---|
| 1 | **Prescription scan** | Tesseract.js reads the photo in the browser; a fuzzy matcher resolves Pakistani brand names to generics |
| 2 | **Interaction checker** | 234,981 severity-graded pairs from DDInter 2.0 |
| 3 | **Timing guide** | Per-drug before/after/with food, empty stomach, morning/night |
| 4 | **Antibiotic course tracker** | Day count with a finish-the-course warning |
| 5 | **Voice assistant** | Web Speech API, `ur-PK` and `en-PK`, speaks answers aloud |
| 6 | **Reminders + snooze** | Notification API; snooze reschedules the alert and re-fires |
| 7 | **Drug info cards** | openFDA labels — uses, side effects, pregnancy, driving |
| 8 | **Price & alternatives** | 9,043 products scraped from DRAP's public pricing index, cheapest same-ingredient option first |
| 9 | **Side-effect reporter** | Symptom triage: emergency red flags, known effects, or ask a pharmacist. Understands Roman Urdu |
| 10 | **Emergency mode** | Real FDA overdose text per drug, one-tap 1122 and caregiver |
| 11 | **Ask a question** | Retrieval over the catalogue — answers in Urdu and English |
| 12 | **Kidney & liver check** | Cockcroft-Gault creatinine clearance against 23 renal and 10 hepatic dose rules |
| 13 | **Allergy alerts** | Direct plus documented cross-reactivity (penicillin ↔ cephalosporin, NSAIDs, sulfas) |
| 14 | **Smart missed-dose** | 16 medicine-specific rules. Never advises doubling |
| 15 | **Escalation** | 2 misses → caregiver alert sent over WhatsApp or SMS, 3 → pharmacist review |

Not built: live pharmacy stock, real pharmacist staffing, payments. Those are
business problems, not code.

## Measured accuracy — not estimated

The scan pipeline was evaluated against real samples and the numbers are served
live at `/api/about`.

**Printed prescription slips** (10 slips, 29 medicines)

```
correctly found:  29/29  (100%)
false positives:   0
```

**Handwritten** (86 real samples from 30 doctors in Nawabshah, Pakistan)

```
correctly found:   3/50  (6%)
```

That 6% is honest and it is the known limitation: Tesseract is trained on printed
text and cannot read cursive. Two things follow from it, and both are built in:

- Every scanned line must be confirmed by the patient before it is saved, with the
  confidence score shown and alternative candidates offered.
- Typing a brand name works well — `Panadal` → Paracetamol at 0.87 confidence — so
  manual entry is a first-class path, not a fallback.

Five OCR configurations were tested against the handwriting set. None worked:

| Method | Accuracy |
|---|---|
| Tesseract 5, default segmentation | 6% |
| Tesseract 5, PSM 7 (single line) | 10% |
| Tesseract 5, PSM 8 (single word) | 5% |
| Tesseract 5, PSM 13 (raw line) | 5% |
| **TrOCR base handwritten** (Xenova, q8) | **0%** |

TrOCR is trained on IAM handwriting — neat English prose — so on a drug name it
produces fluent nonsense (`Montelukast` came back as "1953 American film director").
It scored worse than Tesseract and was removed from the dependencies. Closing this
gap needs a model fine-tuned on this dataset, or a vision-language model API.

## Safety design

Two decisions worth calling out.

**Absent data is reported as absent.** Nimesulide, domperidone and gliclazide are
everywhere in Pakistan and in neither FDA nor DDInter, because neither is US-approved.
Rather than show "no interactions found" — which reads as *safe* — those drugs are
flagged as having limited data, and their clinical text was written by hand.

**Symptoms are triaged before they are explained.** A reported symptom is checked
against emergency red flags first (swelling, breathing trouble, bleeding, jaundice)
and only then against the drug's label. On a blood thinner, "bruising" escalates on
its own, because easy bruising is an early bleeding sign rather than a nuisance.
Patient words are bridged to clinical ones — `sleepy` → somnolence, `dast` →
diarrhoea, `khujli` → pruritus — so a real side effect is not reported as unknown.

**Short brand names are matched exactly, never fuzzily.** During evaluation the
patient name `Ali` fuzzy-matched the brand `Alp` and produced Alprazolam on the
review screen. Terms of four characters or fewer now require an exact match, and
prescription header lines are filtered out before matching. False positives on the
printed set went from 9 to 0.

Clinical outputs trace to a source. No LLM invents a severity, a dose or a
contraindication.

## Running it

```bash
npm install
npm run build
npm start           # http://localhost:3000
```

No API keys. No account. Nothing to configure.

Rebuilding the datasets from source (only needed if you change the catalogue):

```bash
npm run data:raw      # downloads DDInter + the Kaggle prescription set (~29 MB)
npm run data          # compiles interactions, labels and the symptom index
npm run data:prices   # re-scrapes DRAP pricing (1,069 pages, ~3 min)
npm run samples       # regenerates printed test slips
npm run eval          # re-measures OCR accuracy
```

## Architecture

```
photo ──► Tesseract.js (browser) ──► text lines
                                        │
                                        ▼
                            header/footer filter
                                        │
                                        ▼
                         fuzzy match to 194 PK brands
                                        │
                                        ▼
   ┌────────────────────────────────────┼────────────────────────────┐
   ▼                                    ▼                            ▼
DDInter 2.0                     allergy cross-reactivity      missed-dose rules
234,981 pairs                   groups                        16 drug classes
   │                                    │                            │
   └────────────────────────────────────┼────────────────────────────┘
                                        ▼
                          risk verdict + Urdu/English advice
```

The client is React served as static files by the same Node process, so there is
one service to deploy. The 3.9 MB interaction index stays on the server; phones
download 58 KB of gzipped app.

**Stack:** Node 20, Express, React 18, Vite, Tesseract.js, Web Speech API.
Patient data never leaves the device — medicines, allergies and the caregiver
number live in `localStorage`.

## Data sources

| Source | Used for |
|---|---|
| [DDInter 2.0](https://ddinter2.scbdd.com/) | 234,981 interaction pairs across 2,529 drugs |
| [openFDA](https://open.fda.gov/) | Label text for 65 of 68 drugs |
| [RxNorm / RxNav](https://rxnav.nlm.nih.gov/) | Drug name normalisation |
| [Kaggle — Pakistani doctor handwriting](https://www.kaggle.com/datasets/mrdude20/doctor-handwriting-recognition-dataset) | OCR evaluation set |
| [DRAP Drug Pricing Index](https://e.dra.gov.pk/public/price) | 9,043 Pakistani products with retail prices |
| Pakistani brand catalogue | Written for this project: 68 drugs, 194 brands, Urdu text, renal/hepatic and missed-dose rules |

DRAP's pricing index links only 8 of its 14 drug-class files; the other six — which
include anti-infectives, cardiovascular and CNS drugs — exist at predictable URLs and
are fetched too. The same is true of DDInter.

NIH's drug interaction API was discontinued and returns 404; DDInter replaces it.

## Disclaimer

DoseIQ is a prototype built for a hackathon. It is not a medical device, it is not
clinically validated, and it must not be used to start, stop or change any
medication. Always confirm with a qualified pharmacist or doctor.

## DoseIQ Professional v1.1
This release expands the prototype into a safety-focused medication information experience with:
- multi-pass prescription/package OCR with explicit review and confidence handling;
- brand + generic matching with OCR alias normalization;
- local medicine price comparison and nearby pharmacy search;
- smart timing guidance;
- antibiotic course tracking and medicine-specific missed-dose rules;
- allergy/cross-reactivity, drug interaction, renal/hepatic and side-effect checks;
- emergency extra-dose flow and caregiver escalation support;
- Urdu/English voice input and spoken answers;
- optional human-pharmacist handoff through deployment environment variables.

### Human pharmacist configuration
Set `PHARMACIST_EMAIL` and/or `PHARMACIST_WHATSAPP` in the server environment. The UI clearly distinguishes the retrieval-based DoseIQ assistant from human pharmacist support.

### Medical safety
OCR results are suggestions and must be confirmed against the package/prescription. Interaction data marked as unchecked is not treated as proof of safety. DoseIQ is educational software and does not replace a licensed clinician or pharmacist.
