# DoseIQ 1.2 — Global Medicine Knowledge Upgrade

DoseIQ now uses a hybrid medicine knowledge architecture:

1. Local Pakistan catalogue first (fast, brand-aware, local timing/pricing rules).
2. If the medicine is not found locally, the Ask assistant falls back to:
   - NLM RxNorm / RxNav for global drug-name normalization.
   - FDA openFDA drug labeling for indications, dosage, warnings, interactions, adverse reactions, pregnancy, overdose, and other label sections.
   - NLM DailyMed for current marketed label records.
3. Every global answer is marked as global data and exposes its source links.
4. The app does not claim that absence from a source means a medicine is safe.
5. Country, formulation, strength, manufacturer and label version can change the correct answer; users are told to verify the package/clinician when needed.

## Important limitation

This is a retrieval layer, not a claim that DoseIQ contains every medicine sold in every country. FDA/ DailyMed are U.S.-centric sources and RxNorm is a U.S. normalized vocabulary. Local regulatory status and local brands should still be added for Pakistan and other countries as those sources become available.

## NLM attribution

This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not endorse or recommend this or any other product.
