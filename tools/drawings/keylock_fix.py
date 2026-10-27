"""Bi-part ESA/ISA drawing touch-ups on the scanned horizontal section.

- Removes the red dash-dot cylinder centerline from the meeting stile.
- ISA: mirrors the keylock stile's top key cylinder onto its bottom face.

Coordinates are pixels in the embedded section image. Run with the repo's
docs/ PDFs; pass --apply to write, otherwise previews go to tools/drawings/out/.

    python3 tools/drawings/keylock_fix.py [--apply]
"""
import io
import os
import sys

import pymupdf as fitz
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DOCS = os.path.join(ROOT, 'docs')
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

JOBS = [
    {
        'file': 'BIPART SLIDE ESA P-SX-SX-P.pdf',
        'pick': lambda bb: True,
        'red_band': (1025, 1034, 1980, 2140),
        'preview': (960, 1990, 1300, 2145),
    },
    {
        'file': 'BIPART SLIDE ISA P-SX-SX-P.pdf',
        'pick': lambda bb: abs(bb[0] - 38) < 1,
        'red_band': (971, 978, 100, 245),
        # top cylinder rows/cols and the mirror axis (126 <-> 225)
        'mirror_cyl': {'x0': 1076, 'x1': 1152, 'y0': 116, 'y1': 125, 'axis': 351},
        'preview': (880, 100, 1200, 245),
    },
]


def is_tinted(c):
    return max(c) - min(c) > 3


def dark(c):
    return sum(c) < 600


def remove_red(im, band):
    x0, x1, y0, y1 = band
    px = im.load()
    for y in range(y0, y1 + 1):
        left, right = px[x0 - 1, y], px[x1 + 1, y]
        fill = left if (dark(left) and dark(right)) else (255, 255, 255)
        for x in range(x0, x1 + 1):
            if is_tinted(px[x, y]):
                px[x, y] = fill


def mirror_cylinder(im, m):
    px = im.load()
    for y in range(m['y0'], m['y1'] + 1):
        ty = m['axis'] - y
        for x in range(m['x0'], m['x1'] + 1):
            c = px[x, y]
            if dark(c):
                px[x, ty] = c


def section_image(doc, pick):
    page = doc[0]
    for info in page.get_image_info(xrefs=True):
        if pick(info['bbox']):
            xref = info['xref']
            im = Image.open(io.BytesIO(doc.extract_image(xref)['image'])).convert('RGB')
            return page, xref, im
    raise SystemExit('section image not found')


def main(apply):
    os.makedirs(OUT, exist_ok=True)
    for job in JOBS:
        path = os.path.join(DOCS, job['file'])
        doc = fitz.open(path)
        page, xref, im = section_image(doc, job['pick'])
        remove_red(im, job['red_band'])
        if 'mirror_cyl' in job:
            mirror_cylinder(im, job['mirror_cyl'])
        crop = im.crop(job['preview'])
        crop = crop.resize((crop.width * 3, crop.height * 3), Image.NEAREST)
        crop.save(os.path.join(OUT, job['file'].replace(' ', '_').replace('.pdf', '_preview.png')))
        if apply:
            buf = io.BytesIO()
            im.save(buf, 'PNG')
            page.replace_image(xref, stream=buf.getvalue())
            tmp = path + '.tmp'
            doc.save(tmp, garbage=4, deflate=True)
            doc.close()
            os.replace(tmp, path)
        print(job['file'], 'applied' if apply else 'preview')


if __name__ == '__main__':
    main('--apply' in sys.argv)
