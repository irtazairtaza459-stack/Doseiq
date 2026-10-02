# Builds printed prescription slips in the style Pakistani clinics print,
# so the OCR pipeline can be measured on the printed case as well as handwriting.
from PIL import Image, ImageDraw, ImageFont
import json, os, random

OUT = 'data/raw/printed'
os.makedirs(OUT, exist_ok=True)
random.seed(7)

def font(sz, bold=False):
    for p in ['/System/Library/Fonts/Supplemental/Arial Bold.ttf' if bold else '/System/Library/Fonts/Supplemental/Arial.ttf',
              '/System/Library/Fonts/Helvetica.ttc']:
        if os.path.exists(p):
            try: return ImageFont.truetype(p, sz)
            except Exception: pass
    return ImageFont.load_default()

SCRIPTS = [
    [("Tab. Panadol 500mg", "1+1+1 x 5 days"), ("Cap. Risek 20mg", "1+0+1 before meal"), ("Tab. Brufen 400mg", "SOS")],
    [("Tab. Augmentin 625mg", "1+0+1 x 7 days"), ("Syp. Ventolin", "5ml TDS"), ("Tab. Montiget 10mg", "0+0+1")],
    [("Cap. Azomax 500mg", "1 OD x 3 days"), ("Tab. Ponstan 500mg", "1 TDS"), ("Tab. Nexum 40mg", "1 OD")],
    [("Tab. Glucophage 500mg", "1+0+1 with meal"), ("Tab. Amaryl 2mg", "1+0+0"), ("Tab. Lipitor 20mg", "0+0+1")],
    [("Tab. Concor 5mg", "1+0+0"), ("Tab. Norvasc 5mg", "0+0+1"), ("Tab. Ascard 75mg", "0+1+0")],
    [("Tab. Flagyl 400mg", "1+1+1 x 5 days"), ("Cap. Velosef 500mg", "1+1+1"), ("Syp. Motilium", "10ml TDS")],
    [("Tab. Zyrtec 10mg", "0+0+1"), ("Tab. Deltacortril 5mg", "2+0+0 x 3 days"), ("Cap. Omez 20mg", "1+0+0")],
    [("Tab. Thyrox 50mcg", "1 OD empty stomach"), ("Tab. Calcit D", "1+0+1"), ("Cap. Sangobion", "1 OD")],
    [("Tab. Ciproxin 500mg", "1+0+1 x 7 days"), ("Tab. Buscopan 10mg", "1 TDS"), ("Sachet ORS", "PRN")],
    [("Tab. Tegral 200mg", "1+0+1"), ("Tab. Rivotril 0.5mg", "0+0+1"), ("Tab. Nexito 10mg", "1+0+0")],
]

truth = []
for i, items in enumerate(SCRIPTS):
    W, H = 780, 560
    img = Image.new('RGB', (W, H), (252, 252, 250))
    d = ImageDraw.Draw(img)
    d.text((40, 26), "SHIFA CLINIC", font=font(26, True), fill=(30, 30, 40))
    d.text((40, 60), "Dr. A. Rahman  MBBS, FCPS   |   Ph: 042-3578xxxx", font=font(14), fill=(90, 90, 100))
    d.line([(40, 88), (W - 40, 88)], fill=(170, 170, 180), width=2)
    d.text((40, 102), f"Patient: Muhammad Ali        Age: {random.randint(24,68)}        Date: 06-09-2026",
           font=font(14), fill=(60, 60, 70))
    d.text((40, 140), "Rx", font=font(30, True), fill=(30, 30, 40))
    y = 188
    for name, sig in items:
        d.text((60, y), name, font=font(19, True), fill=(20, 20, 30))
        d.text((78, y + 26), sig, font=font(15), fill=(95, 95, 105))
        y += 74
    d.line([(40, H - 78), (300, H - 78)], fill=(170, 170, 180), width=1)
    d.text((40, H - 70), "Signature", font=font(13), fill=(120, 120, 130))
    # Photos of slips are never perfectly straight or evenly lit.
    img = img.rotate(random.uniform(-1.4, 1.4), expand=False, fillcolor=(252, 252, 250))
    path = f'{OUT}/rx_{i:02d}.png'
    img.save(path)
    truth.append({'file': f'rx_{i:02d}.png', 'drugs': [n for n, _ in items]})

json.dump(truth, open(f'{OUT}/truth.json', 'w'), indent=1)
print(f'generated {len(truth)} printed prescriptions, {sum(len(t["drugs"]) for t in truth)} medicine lines')
