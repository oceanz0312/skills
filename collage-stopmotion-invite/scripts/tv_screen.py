"""Detect the glass screen of a real retro-TV cutout and fit a quad (TL,TR,BR,BL) + corner radius, in image px.
usage: python tv_screen.py tv.png [--bezel 0.075] [--json out.json] [--preview p.jpg]
Method (robust on CRT glass with vignetting/reflections, where colour region-growing leaks):
 1. opaque mask -> the CRT head = rows above the neck (row-width minimum below the widest row);
 2. morphological opening removes thin parts (swivel arm, antenna, knobs);
 3. glass = head eroded by the bezel ring (bezel fraction of the head's short side);
 4. quad = extreme points of the eroded blob along the diagonals, pushed to the rounded-rect corners;
    corner_radius from blob fill ratio. Always check --preview; WARN when the head is not convex enough."""
import sys,json,argparse,numpy as np
from PIL import Image,ImageDraw
from scipy import ndimage as nd
def detect(path,bezel=0.075):
    im=np.asarray(Image.open(path).convert("RGBA"));a=im[...,3]>128;H,W=a.shape
    w=a.sum(1);top=int(np.argmax(w>0));peak=int(np.argmax(w[:int(H*0.7)]))
    neck=peak+int(np.argmin(w[peak:int(H*0.8)]));head=a.copy();head[neck:]=False
    k=max(3,int(0.06*W));head=nd.binary_opening(head,structure=np.ones((k,k)))
    lab,n=nd.label(head);head=lab==(int(np.argmax(nd.sum(head,lab,range(1,n+1))))+1);head=nd.binary_fill_holes(head)
    ys,xs=np.nonzero(head);short=min(np.ptp(xs),np.ptp(ys));e=max(1,int(bezel*short))
    glass=nd.binary_erosion(head,iterations=e);ys,xs=np.nonzero(glass)
    x0,y0,x1,y1=int(xs.min()),int(ys.min()),int(xs.max()),int(ys.max());fill=glass.sum()/((x1-x0+1)*(y1-y0+1))
    s,d=xs+ys,xs-ys;ext=[(xs[s.argmin()],ys[s.argmin()]),(xs[d.argmax()],ys[d.argmax()]),(xs[s.argmax()],ys[s.argmax()]),(xs[d.argmin()],ys[d.argmin()])]
    # per-side straight edges: use rows/cols at 25%/75% to get the (slightly perspective) quad
    def xr(y):r=np.nonzero(glass[y])[0];return r.min(),r.max()
    def yr(x):c=np.nonzero(glass[:,x])[0];return c.min(),c.max()
    ya,yb=int(y0+0.25*(y1-y0)),int(y0+0.75*(y1-y0));xa,xb=int(x0+0.25*(x1-x0)),int(x0+0.75*(x1-x0))
    (la,ra),(lb,rb)=xr(ya),xr(yb);(ta,ba),(tb,bb)=yr(xa),yr(xb)
    def line(p,q):return p,q
    import itertools
    def isect(P1,P2,P3,P4):
        (x1_,y1_),(x2_,y2_),(x3,y3),(x4,y4)=P1,P2,P3,P4;dn=(x1_-x2_)*(y3-y4)-(y1_-y2_)*(x3-x4)
        return [int((( x1_*y2_-y1_*x2_)*(x3-x4)-(x1_-x2_)*(x3*y4-y3*x4))/dn),int(((x1_*y2_-y1_*x2_)*(y3-y4)-(y1_-y2_)*(x3*y4-y3*x4))/dn)]
    Ls,Rs,Ts,Bs=((la,ya),(lb,yb)),((ra,ya),(rb,yb)),((xa,ta),(xb,tb)),((xa,ba),(xb,bb))
    quad=[isect(*Ts,*Ls),isect(*Ts,*Rs),isect(*Bs,*Rs),isect(*Bs,*Ls)]
    rad=int(min(x1-x0,y1-y0)*max(0.05,min(0.3,(1-fill)*1.6)))
    return {"quad":quad,"bbox":[x0,y0,x1-x0+1,y1-y0+1],"corner_radius":rad,"fill":round(float(fill),3),"neck_y":neck,"bezel_px":e}
if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("img");ap.add_argument("--bezel",type=float,default=0.075);ap.add_argument("--json");ap.add_argument("--preview");a=ap.parse_args()
    r=detect(a.img,a.bezel)
    if r["fill"]<0.75:print("WARN: glass blob fill",r["fill"],"- non-rectangular screen? check preview",file=sys.stderr)
    print(json.dumps(r))
    if a.json:json.dump(r,open(a.json,"w"))
    if a.preview:
        im=Image.open(a.img).convert("RGBA");bg=Image.new("RGBA",im.size,"white");bg.alpha_composite(im);d=ImageDraw.Draw(bg)
        d.polygon([tuple(p) for p in r["quad"]],outline="red",width=3);x,y,w,h=r["bbox"];d.rounded_rectangle([x,y,x+w,y+h],r["corner_radius"],outline="cyan",width=2);bg.convert("RGB").save(a.preview)
