#!/usr/bin/env bash
# Re-downloads the source datasets. Only needed to rebuild data/build/ from scratch.
set -euo pipefail
mkdir -p data/raw/rx
echo "→ DDInter 2.0 interaction data (14 ATC classes)"
for c in A B C D G H J L M N P R S V; do
  curl -sL --max-time 90 -o "data/raw/ddi_$c.csv" \
    "https://ddinter2.scbdd.com/static/media/download/ddinter_downloads_code_$c.csv"
  printf "  %s  %s rows\n" "$c" "$(($(wc -l < "data/raw/ddi_$c.csv")))"
done
echo "→ Pakistani handwritten prescription set (Kaggle, open)"
curl -sL --max-time 180 -o /tmp/pak_rx.zip \
  "https://www.kaggle.com/api/v1/datasets/download/mrdude20/doctor-handwriting-recognition-dataset"
unzip -oq /tmp/pak_rx.zip -d /tmp/pak_rx
cp /tmp/pak_rx/doctor_handwriting_labels.csv data/raw/rx/
cp -r /tmp/pak_rx/img/img data/raw/rx/images
echo "→ done. Now run: npm run data"
