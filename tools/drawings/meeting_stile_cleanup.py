import sys, io, os
from PIL import Image
from kl import load, D  # boxes used: ESA img px [(990,2006,1068,2018),(990,2120,1068,2132),(1006,2027,1010,2110),(1048,2027,1052,2110)]; ISA xref 822 [(936,112,1011,124),(936,226,1011,238),(951,134,955,217),(993,134,997,217)]
def erase(im, boxes):
    px=im.load()
    for (x0,y0,x1,y1) in boxes:
        for y in range(y0,y1+1):
            for x in range(x0,x1+1):
                c=px[x,y]
                if c[0]-c[1] < 40: px[x,y]=(255,255,255)
def run(fn, boxes, apply=False, prev=None, pbox=None, want=None):
    doc,p,xref,bb,im=load(fn,want); im=im.convert('RGB'); erase(im,boxes)
    if prev:
        c=im.crop(pbox); c.resize((c.width*4,c.height*4),Image.NEAREST).save(prev)
    if apply:
        buf=io.BytesIO(); im.save(buf,'PNG'); p.replace_image(xref,stream=buf.getvalue())
        tmp=D+fn+'.tmp'; doc.save(tmp,garbage=4,deflate=True); doc.close(); os.replace(tmp,D+fn)
