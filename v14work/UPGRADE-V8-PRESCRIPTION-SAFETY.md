# DoseIQ v8 — Prescription Safety Workflow

## Added
- Prescription scan now returns a structured prescription safety review.
- Medicines are classified as antibiotic, supplement, or medicine.
- Narrow antibiotic–mineral spacing rules cover ciprofloxacin, doxycycline and levofloxacin with calcium/iron/zinc where applicable.
- Zinc Sulfate was added to the local medicine catalogue for supplement recognition.
- OCR parsing extracts dose, course duration when explicitly written, frequency and `every N hours` interval.
- Antibiotic schedule preview is shown after scanning when frequency and course duration were actually detected.
- Safety screen now runs the general interaction/allergy/food review together with the prescription timing screen.
- Interaction results distinguish checked data from medicines that are not covered; “no known interaction” is not presented as proof that every interaction is absent.
- Manual medicine entry now stores times-per-day and course length.
- The app no longer invents a default 5-day antibiotic course when the prescription does not state a duration.

## Safety behavior
The app is a screening and planning aid. Prescription/label instructions and doctor/pharmacist advice override generic timing rules. It does not change dose or prescribe treatment.

## Evidence used for spacing rules
- FDA ciprofloxacin labeling: mineral cations/iron/zinc and calcium can reduce absorption; product-specific spacing depends on formulation.
- NHS ciprofloxacin guidance: calcium, iron and zinc supplements should be separated from ciprofloxacin tablets/liquid.
- NHS doxycycline guidance: iron/zinc and antacids/supplements can interact.
- NHS Specialist Pharmacy Service: multivalent cations including calcium, iron, magnesium and zinc can reduce fluoroquinolone absorption.
