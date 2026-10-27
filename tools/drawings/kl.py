import pymupdf as f, io, sys
from PIL import Image, ImageDraw
D='/Users/ai/Documents/GitHub/doortronixusa/docs/'
def load(fn, want=None):
    doc=f.open(D+fn); p=doc[0]
    infos=p.get_image_info(xrefs=True)
    if want: infos=[i for i in infos if i['xref']==want]
    big=max(infos,key=lambda i:(i['bbox'][2]-i['bbox'][0])*(i['bbox'][3]-i['bbox'][1]))
    xref=big['xref']; bb=f.Rect(big['bbox'])
    im=Image.open(io.BytesIO(doc.extract_image(xref)['image']))
    return doc,p,xref,bb,im
def pt2px(bb,im,x,y): return ((x-bb.x0)/bb.width*im.width,(y-bb.y0)/bb.height*im.height)
if __name__=='__main__':
    fn,x0,y0,x1,y1,out=sys.argv[1],*map(float,sys.argv[2:6]),sys.argv[6]
    doc,p,xref,bb,im=load(fn)
    print(xref,bb,im.size,im.mode, len(p.get_image_info()))
    a=pt2px(bb,im,x0,y0); b=pt2px(bb,im,x1,y1)
    box=tuple(int(v) for v in (*a,*b)); print('pxbox',box)
    c=im.crop(box).convert('RGB'); s=4; c=c.resize((c.width*s,c.height*s),Image.NEAREST)
    d=ImageDraw.Draw(c)
    for gx in range(0,c.width,40): d.line([(gx,0),(gx,6)],fill='blue'); d.text((gx+1,7),str(box[0]+gx//s),fill='blue')
    for gy in range(0,c.height,40): d.line([(0,gy),(6,gy)],fill='blue'); d.text((8,gy),str(box[1]+gy//s),fill='blue')
    c.save(out)
