#!/usr/bin/env python3
"""人物完整性检查（v7，P0-6）。两种用法：
  1) 抠图级：python person_check.py cutout <photo.jpg> <mask.png> [--expect 2] [--json out.json]
     对原照片跑多人姿态（MediaPipe PoseLandmarker，num_poses=4），每个落在 mask 上的人：照片里可见、在画内的
     肩/髋/肘/膝/踝关键点必须都在 mask 里（mask 外扩 2.5%）。缺躯干（肩或髋）或缺 ≥2 个肢体关节 → REJECT。
     同时查 mask 连通性（主块之外 ≥1.5% 主块面积的碎块 → REJECT 漂浮碎片）和边缘裁切（mask 贴住原图上/左/右边
     超过该边 4% → REJECT；只允许底边）。被 mask 收进来的完整人数 < --expect → WARN（可能是姿态漏检，必须在拼图里人工确认）。
  2) 成片级：python person_check.py frame <frame.png> <person_alpha.png> [--expect 2]
     person_alpha 是同一帧只画人物贴纸的 alpha 层（run.py --person-layers 输出）。对成片帧在人物包围盒里跑姿态，
     检查：每个人肩+髋可见（髋在画外下方允许），关键点落在贴纸 alpha 内，完整的人数 ≥ expect；贴纸碎块；
     贴纸碰到画面上/左/右边。
退出码：0 通过，1 REJECT。依赖 mediapipe（模型 pose_landmarker_full.task，--model 或环境变量 POSE_MODEL）。"""
import sys,os,json,argparse,numpy as np
from PIL import Image
from scipy import ndimage as nd
MODEL=os.environ.get("POSE_MODEL","/workspace/models/pose_landmarker_full.task")
NAMES={0:"nose",11:"L肩",12:"R肩",13:"L肘",14:"R肘",15:"L腕",16:"R腕",23:"L髋",24:"R髋",25:"L膝",26:"R膝",27:"L踝",28:"R踝"}
TORSO=[11,12,23,24];LIMB=[13,14,25,26,27,28];HEAD=[0,2,5,7,8]
_det=None
def detector(model=MODEL):
    global _det
    if _det is None:
        import mediapipe as mp; from mediapipe.tasks.python import vision, BaseOptions
        _det=vision.PoseLandmarker.create_from_options(vision.PoseLandmarkerOptions(base_options=BaseOptions(model_asset_path=model),num_poses=4,min_pose_detection_confidence=0.35,min_pose_presence_confidence=0.35))
    return _det
def _poses1(rgb):
    import mediapipe as mp
    r=detector().detect(mp.Image(image_format=mp.ImageFormat.SRGB,data=np.ascontiguousarray(rgb)))
    H,W=rgb.shape[:2];return [[(l.x*W,l.y*H,l.visibility) for l in p] for p in r.pose_landmarks]
def poses(rgb):
    """recall boost for couples / old sepia photos: full image + autocontrast + left/right 62% crops; merge duplicates."""
    from PIL import ImageOps
    H,W=rgb.shape[:2];ac=np.asarray(ImageOps.autocontrast(Image.fromarray(rgb),cutoff=1));out=[]
    views=[(rgb,0,0),(ac,0,0)]
    for src in (rgb,ac):
        cw=int(W*0.62);views+= [(src[:,:cw],0,0),(src[:,W-cw:],W-cw,0)]
        ch=int(H*0.62);views+= [(src[:ch],0,0),(src[H-ch:],0,H-ch)] if H>W*1.2 else []
    for img,ox,oy in views:
        for p in _poses1(img):
            p=[(x+ox,y+oy,v) for x,y,v in p];c=np.mean([p[i][:2] for i in [11,12,23,24]],0);q=sum(p[i][2] for i in TORSO+LIMB)
            dup=[k for k,o in enumerate(out) if np.hypot(*(np.mean([o[i][:2] for i in [11,12,23,24]],0)-c))<0.15*max(H,W)]
            if dup:
                k=dup[0]
                if q>sum(out[k][i][2] for i in TORSO+LIMB): out[k]=p
            else: out.append(p)
    return out
def comps(m):
    lab,n=nd.label(m);
    if n==0:return 0,[]
    sz=nd.sum(m,lab,range(1,n+1));main=sz.max();return n,[float(s/main) for s in sz if s<main and s/main>=0.015]
def edge_touch(m,edges=("top","left","right")):
    out={}
    for e in edges:
        line={"top":m[0],"left":m[:,0],"right":m[:,-1],"bottom":m[-1]}[e];out[e]=float(line.mean())
    return out
def judge(rgb,m,expect,frame_mode=False,frameH=None,offset=(0,0)):
    """m: bool mask same size as rgb. returns (ok, report)"""
    H,W=m.shape;pad=int(0.025*max(H,W));md=nd.binary_dilation(m,iterations=max(1,pad))
    if frame_mode:   # sticker alone on neutral grey: background can no longer "complete" a missing body
        g=np.full_like(rgb,128);g[m]=rgb[m];ps=poses(g)
    else: ps=poses(rgb)
    people=[];errs=[]
    for k,p in enumerate(ps):
        vis=[i for i in TORSO+LIMB+HEAD if p[i][2]>0.5 and 0<=p[i][0]<W and 0<=p[i][1]<H]
        inm=[i for i in vis if md[int(p[i][1]),int(p[i][0])]]
        head_in=any(md[int(p[i][1]),int(p[i][0])] for i in HEAD if p[i][2]>0.3 and 0<=p[i][0]<W and 0<=p[i][1]<H)
        if frame_mode:
            if not head_in: continue                                          # frame mode: any head drawn on the sticker = a person that must be whole
        elif not vis or len(inm)/len(vis)<0.25: continue                      # bystander outside the sticker
        miss=[i for i in vis if i not in inm and i not in HEAD]
        tmiss=[i for i in miss if i in TORSO];lmiss=[i for i in miss if i in LIMB]
        rec={"pose":k,"visible":len(vis),"in_mask":len(inm),"missing":[NAMES[i] for i in miss]}
        if frame_mode:   # on the rendered frame: torso must actually be drawn (visible); hips may be below the frame
            nos=[i for i in [11,12] if p[i][2]<=0.5];hips_below=all(p[i][1]+offset[1]>=frameH-2 for i in [23,24])
            if len(nos)==2: tmiss+=nos; rec["missing"].append("双肩不可见")
            if all(p[i][2]<=0.5 for i in [23,24]) and not hips_below: tmiss+=[23]; rec["missing"].append("双髋不可见")
        rec["complete"]=not tmiss and len(lmiss)<2
        if tmiss: errs.append(f"人物{k} 缺躯干: {','.join(NAMES.get(i,str(i)) for i in tmiss)}")
        elif len(lmiss)>=2: errs.append(f"人物{k} 缺肢体: {','.join(NAMES[i] for i in lmiss)}")
        people.append(rec)
    n_ok=sum(r["complete"] for r in people);warns=[]
    if n_ok<expect: warns.append(f"完整人物 {n_ok}<{expect}（检测到 {len(people)} 个落在贴纸上的人；可能是漏检，必须在人物检查拼图里人工确认）")
    # fragments = mask components that contain no keypoint of any included person
    lab,n=nd.label(m);sz=nd.sum(m,lab,range(1,n+1)) if n else [];main=max(sz) if n else 1;own=set()
    for k,p in enumerate(ps):
        if k not in [r["pose"] for r in people]:continue
        for i in TORSO+LIMB+HEAD:
            x,y=int(p[i][0]),int(p[i][1])
            if 0<=x<W and 0<=y<H:
                l=lab[min(H-1,y),min(W-1,x)]
                if l==0:
                    yy,xx=max(0,y-pad),max(0,x-pad);w_=lab[yy:y+pad,xx:x+pad];l=int(np.bincount(w_[w_>0]).argmax()) if (w_>0).any() else 0
                if l: own.add(int(l))
    frag=[float(sz[i]/main) for i in range(n) if (i+1) not in own and sz[i]/main>=0.015]
    if frag: errs.append(f"漂浮碎片 {len(frag)} 块（不含任何人物关键点；{', '.join(f'{x:.1%}' for x in frag[:4])} 主块面积）")
    # edge cut: mask touches top/left/right AND an included person's body runs off that edge (landmarks extrapolated outside / within 2%)
    et=edge_touch(m);cut=[]
    for e,v in et.items():
        if v<=0.01:continue
        for r in people:
            p=ps[r["pose"]];pts=[p[i] for i in TORSO+LIMB+[0]]
            near={"left":any(x<0.02*W for x,y,_ in pts),"right":any(x>0.98*W for x,y,_ in pts),"top":any(y<0.02*H for x,y,_ in pts)}[e]
            if near: cut.append(e);break
    if cut: errs.append("人物被裁切于 "+"/".join(sorted(set(cut)))+" 边（只允许底边）")
    n=len(sz) if n else 0
    return (not errs),{"people":people,"complete":n_ok,"expect":expect,"components":n,"fragments":frag,"edge_touch":{k:round(v,3) for k,v in et.items()},"errors":errs,"warnings":warns}
def check_cutout(photo,mask,expect=2):
    rgb=np.asarray(Image.open(photo).convert("RGB"));m=np.asarray(Image.open(mask).convert("L").resize(rgb.shape[1::-1]))>127
    return judge(rgb,m,expect)
_SRC={}
def source_people(photo,mask):
    """keypoints (source-photo coords) of every person the cutout includes + mask bbox; cached per asset"""
    k=(photo,mask)
    if k not in _SRC:
        rgb=np.asarray(Image.open(photo).convert("RGB"));m=np.asarray(Image.open(mask).convert("L").resize(rgb.shape[1::-1]))>127
        ok,r=judge(rgb,m,2);ps=poses(rgb);ys,xs=np.nonzero(m)
        off=None;sp=mask.replace(".mask.png",".png")
        if os.path.exists(sp):   # exact source->sticker offset: register mask bbox against the sticker's non-white body pixels
            st=np.asarray(Image.open(sp).convert("RGBA")).astype(int);body=(st[...,3]==255)&(np.abs(st[...,:3]-[247,245,242]).sum(2)>12)
            by,bx=np.nonzero(body);me=nd.binary_erosion(m,iterations=1);my,mx=np.nonzero(me)
            if len(bx) and len(mx): off=[int(bx.min()-mx.min()),int(by.min()-my.min())]
        _SRC[k]={"ok":ok,"errors":r["errors"],"people":[ps[p["pose"]] for p in r["people"]],"bbox":[int(xs.min()),int(ys.min()),int(xs.max())+1,int(ys.max())+1],"offset":off,"size":[m.shape[1],m.shape[0]]}
    return _SRC[k]
def check_frame(frame,alpha,expect=2,photo=None,mask=None,xf=None,sticker_size=None):
    """P0-6 on the rendered frame. Primary (fails the render): every body keypoint of every person the cutout includes is
    mapped through the exact sticker transform used for this frame and must land on drawn sticker pixels (or below the bottom
    edge); keypoints off the left/right/top edge = person cut there. Plus: drawn sticker must not touch left/right/top, no
    floating fragments. Secondary (warning only): pose re-detected on the sticker layer alone."""
    rgb=np.asarray(Image.open(frame).convert("RGB"));a=np.asarray(Image.open(alpha).convert("RGBA"))[...,3]>40
    H,W=a.shape;errs=[];warns=[];rep={}
    ys,xs=np.nonzero(a)
    if len(xs)==0:return False,{"errors":["帧里没有人物贴纸"],"warnings":[]}
    fe={"top":float(a[0].mean()),"left":float(a[:,0].mean()),"right":float(a[:,-1].mean())}
    if any(v>0 for v in fe.values()): errs.append("贴纸碰到画面 "+"/".join(k for k,v in fe.items() if v>0)+" 边")
    lab,n=nd.label(a);sz=nd.sum(a,lab,range(1,n+1));frag=[float(x/max(sz)) for x in sz if x<max(sz) and x/max(sz)>=0.005]
    if frag: errs.append(f"贴纸碎块 {len(frag)}")
    mapped=[]
    if photo and xf and sticker_size:
        S=source_people(photo,mask);x0,y0,x1,y1=S["bbox"];SW,SH=sticker_size;sc=xf["w"]/SW;th=xf["rot"]*np.pi/180;c,s_=np.cos(th),np.sin(th)
        md=nd.binary_dilation(a,iterations=max(3,int(round(0.025*max(SW,SH)*sc))))   # same 2.5% tolerance as the cutout check, in frame pixels
        for k,p in enumerate(S["people"]):
            miss=[];off=[];pts=[];outside=[];PW,PH=S["size"]
            for i in TORSO+LIMB+[0]:
                if p[i][2]<0.5: continue
                if not(0<=p[i][0]<PW and 0<=p[i][1]<PH): outside.append(i); continue   # extrapolated beyond the source photo: not checkable
                if S["offset"]: sx,sy=p[i][0]+S["offset"][0],p[i][1]+S["offset"][1]
                else: sx=p[i][0]-x0+(SW-(x1-x0))/2; sy=p[i][1]-y0+(SH-(y1-y0))/2
                lx,ly=sx*sc-xf["w"]/2, sy*sc-xf["h"]; X=xf["x"]+lx*c-ly*s_; Y=xf["y"]+lx*s_+ly*c; pts.append((round(X),round(Y),i))
                if Y>=H: continue
                if X<0 or X>=W or Y<0: off.append(i); continue
                if not md[int(Y),int(X)]: miss.append(i)
            t=[i for i in miss if i in TORSO];l=[i for i in miss if i in LIMB]
            if t: errs.append(f"人物{k} 成片缺躯干: "+",".join(NAMES[i] for i in t))
            elif len(l)>=2: errs.append(f"人物{k} 成片缺肢体: "+",".join(NAMES[i] for i in l))
            if off: errs.append(f"人物{k} 被画面左/右/上边裁切: "+",".join(NAMES[i] for i in off))
            if outside: warns.append(f"人物{k} 有关键点在源照片外（{','.join(NAMES[i] for i in outside)}）：照片边缘裁切或姿态外推，拼图目检")
            mapped.append({"person":k,"missing":[NAMES[i] for i in miss],"off_frame":[NAMES[i] for i in off],"pts":pts})
        if len(S["people"])<expect: warns.append(f"源图只确认到 {len(S['people'])} 个完整人物 <{expect}（可能漏检，看拼图）")
        if not S["ok"]: errs.append("源抠图未通过: "+"; ".join(S["errors"]))
    else: warns.append("未提供源图/变换，仅做几何检查")
    # secondary: pose on the sticker alone (grey bg) - warnings only
    y0_,y1_,x0_,x1_=max(0,ys.min()-30),min(H,ys.max()+30),max(0,xs.min()-30),min(W,xs.max()+30)
    _,r2=judge(rgb[y0_:y1_,x0_:x1_],a[y0_:y1_,x0_:x1_],expect,frame_mode=True,frameH=H,offset=(x0_,y0_))
    warns+=["[姿态复检] "+e for e in r2["errors"] if "裁切" not in e and "碎片" not in e]
    rep.update(errors=errs,warnings=warns,frame_edge=fe,mapped=mapped,complete=len(mapped)-sum(1 for m_ in mapped if m_["missing"] or m_["off_frame"]))
    return (not errs),rep
if __name__=="__main__":
    ap=argparse.ArgumentParser();ap.add_argument("mode",choices=["cutout","frame"]);ap.add_argument("img");ap.add_argument("mask");ap.add_argument("--expect",type=int,default=2);ap.add_argument("--json");a=ap.parse_args()
    ok,r=(check_cutout if a.mode=="cutout" else check_frame)(a.img,a.mask,a.expect)  # CLI frame mode = geometry + secondary pose only
    print(("[OK] " if ok else "[REJECT] ")+(json.dumps(r,ensure_ascii=False)));a.json and json.dump(r,open(a.json,"w"),ensure_ascii=False,indent=1);sys.exit(0 if ok else 1)

def contact_sheet(samples,out,tw=180,th=320):
    """per-scene rows: each sampled frame with the person layer outlined; green = pass, red = fail, amber = warning"""
    from PIL import ImageDraw,ImageFont
    rows={};[rows.setdefault(s["scene"],[]).append(s) for s in samples];n=max(len(v) for v in rows.values())
    sheet=Image.new("RGB",(110+n*(tw+6),len(rows)*(th+40)),(30,30,30));d=ImageDraw.Draw(sheet)
    try: font=ImageFont.truetype("/workspace/collage_ref/test_v5/fonts/LXGWWenKai-Regular.ttf",15)
    except Exception: font=None
    for r_,(sid,ss) in enumerate(rows.items()):
        y=r_*(th+40);d.text((8,y+th//2),sid,fill="white",font=font)
        for c,s in enumerate(ss):
            fr=Image.open(s["frame"]).convert("RGB");a=Image.open(s["layer"]).convert("RGBA").split()[3]
            edge=nd.binary_dilation(np.asarray(a)>40,iterations=4)^(np.asarray(a)>40);fa=np.asarray(fr).copy()
            col=(40,220,90) if s["ok"] and not s["warnings"] else ((255,190,40) if s["ok"] else (255,50,50));fa[edge]=col
            for m_ in s.get("mapped",[]):
                for X,Y,i in m_["pts"]:
                    if 0<=X<fa.shape[1] and 0<=Y<fa.shape[0]: fa[max(0,Y-7):Y+7,max(0,X-7):X+7]=(255,50,50) if NAMES[i] in m_["missing"] else (60,170,255)
            im=Image.fromarray(fa).resize((tw,th));x=110+c*(tw+6);sheet.paste(im,(x,y+4))
            d.rectangle([x-2,y+2,x+tw+1,y+th+5],outline=col,width=3)
            d.text((x,y+th+8),f'{s["tag"]} f{s["f"]} '+("OK" if s["ok"] else "FAIL")+(" (warn)" if s["warnings"] else ""),fill=col,font=font)
            if s["errors"]: d.text((x,y+th+24),s["errors"][0][:22],fill=col,font=font)
            dd=ImageDraw.Draw(im) if False else None
    sheet.save(out,quality=88);return out
