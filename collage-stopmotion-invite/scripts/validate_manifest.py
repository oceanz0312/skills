#!/usr/bin/env python3
"""校验 manifest.json 与素材。用法: python validate_manifest.py manifest.json [--root DIR]
输出 REJECT / WARN / OK，有 REJECT 时退出码为 1。依赖: pillow, numpy（可选 librosa 测 BGM）。"""
import json, sys, os, argparse
from PIL import Image
import numpy as np

LIMITS = {  # slot: (每行最多字符, 最多行数)
 "title_en":(20,1),"names_line":(24,1),"headline":(16,2),"letter_zh":(14,13),
 "quote_en":(30,3),"schedule_title":(8,1),"date":(18,1),"venue":(18,1),"hall":(18,1),"closing_en":(24,1)}
REQUIRED_AB = ["S5","S6","S7"]

def _mask(path,root,sid,key):
    """优先用 cutout.py 生成的 cut/<sid>_<A|B>.mask.png；没有就现场跑 rembg。"""
    cand=os.path.join(root,"cut",f"{sid}_{key}.mask.png")
    if os.path.exists(cand): return Image.open(cand).convert("L")
    try:
        from rembg import remove,new_session
        return remove(Image.open(path).convert("RGB"),session=new_session("u2net_human_seg"),only_mask=True)
    except Exception: return None

def pose_spread(mask_img):
    """情侣是否"挤成一团"。返回 (spread=宽/高, 人物连通域数, 最大内部空隙占宽比)。"""
    from scipy import ndimage
    m=np.asarray(mask_img)>127
    if m.sum()==0: return 0,0,0
    ys,xs=np.where(m); h=ys.max()-ys.min()+1; w=xs.max()-xs.min()+1
    n=ndimage.label(m)[1]
    col=m[:,xs.min():xs.max()+1].sum(0)>0.02*h; gap=0;run=0
    for c in col: run=0 if c else run+1; gap=max(gap,run)
    return w/h,n,gap/w

def spread_check(sid,k,mask_img):
    sp,n,gap=pose_spread(mask_img); info=f"spread={sp:.2f} 连通域={n} 空隙={gap:.0%}"
    if sp<0.45 and n<=1 and gap<0.03: return ("REJECT",f"{sid}.{k} 两人紧贴成一团（{info}）；换一张两人拉开距离的：牵手拉远、一前一后、走开回头、伸手够对方")
    if sp<0.6 and gap<0.05: return ("WARN",f"{sid}.{k} 姿势偏紧（{info}），建议换更舒展的姿势")
    if sp>1.15: return ("WARN",f"{sid}.{k} 太宽（{info}），按宽度限制后人物会低于 50% 画面高")
    return ("OK",f"{sid}.{k} 姿势舒展度 OK（{info}）")

def ab_check(pa,pb,root,sid,slots,size=(96,128)):
    """A/B 同机位 + 姿势差异检查。
    bg_sim：两张图在"两人都不在的背景区域"上的灰度相关系数（先各自去均值/方差，抗曝光差异），≥0.45 才算同机位同场景；
    iou：两张人物 mask 的 IoU；pose_diff：人物区域内的平均灰度差。
    规则：bg_sim<0.25 → REJECT（不同场景）；<0.45 → WARN。iou>0.88 或 pose_diff<10 → REJECT（姿势几乎一样，闪不出来）；iou<0.15 → WARN（人跳得太远）。"""
    A=np.asarray(Image.open(pa).convert("L").resize(size),float); B=np.asarray(Image.open(pb).convert("L").resize(size),float)
    ma=_mask(pa,root,sid,"A"); mb=_mask(pb,root,sid,"B")
    if ma is None or mb is None: return ("WARN",f"{sid} 无法生成 mask，跳过 A/B 检查")
    ma=np.asarray(ma.resize(size))>127; mb=np.asarray(mb.resize(size))>127
    bg=~(ma|mb)
    if bg.mean()<0.08: bg_sim=1.0
    else:
        a=A[bg];b=B[bg]; a=(a-a.mean())/(a.std()+1e-6); b=(b-b.mean())/(b.std()+1e-6); bg_sim=float((a*b).mean())
    iou=float((ma&mb).sum()/max(1,(ma|mb).sum())); pd=float(np.abs(A-B)[ma|mb].mean())
    info=f"bg_sim={bg_sim:.2f} iou={iou:.2f} pose_diff={pd:.1f}"
    if bg_sim<0.25: return ("REJECT",f"{sid} A/B 背景不像同一机位（{info}）")
    if iou>0.88 or pd<10: return ("REJECT",f"{sid} A/B 姿势差异不明显，闪烁看不出来（{info}）")
    if bg_sim<0.45: return ("WARN",f"{sid} A/B 背景相似度偏低（{info}）")
    if iou<0.15: return ("WARN",f"{sid} A/B 人物位置相差太远（{info}）")
    return ("OK",f"{sid} A/B 通过（{info}）")

def landscape_check(sid,p):
    """approved #5: prefer wide/deep shots with perspective (skyline / long street / coastline); warn for close-up fragments."""
    from scipy import ndimage as nd
    im=Image.open(p).convert("L"); w,h=im.size; a=np.asarray(im.resize((256,int(256*h/w)))).astype(float)/255
    rows=nd.uniform_filter1d(a.mean(1),5); g=np.abs(np.diff(rows)); lo,hi=int(len(g)*0.15),int(len(g)*0.75); hz=lo+int(np.argmax(g[lo:hi])); hstr=float(g[lo:hi].max())
    big=np.asarray(im.resize((512,int(512*h/w)))).astype(float)/255;G=np.hypot(nd.sobel(big,0),nd.sobel(big,1));E=G>0.25
    dens=float(E.mean());band=[float(E[i*len(E)//3:(i+1)*len(E)//3].mean()) for i in range(3)];sky=band[0]<0.6*band[2]
    msgs=[];asp=w/h
    if asp<1.3: msgs.append(f"画幅 {asp:.2f}<1.3（偏窄，难以看出纵深）")
    if hstr<0.02 and not sky: msgs.append("无明显地平线/天际线且无天空/远景带")
    if dens<0.06: msgs.append(f"细节密度 {dens:.3f}<0.06（疑似放大的近景局部/虚焦）")
    depth=dens
    info=f"{sid}.landscape 画幅 {asp:.2f}，地平线≈{hz/len(g):.2f}H（强度 {hstr:.3f}，阈值 0.02），细节密度 {depth:.3f}，天空/远景带={'有' if sky else '无'}"
    return ("WARN",info+"；"+"；".join(msgs)+"——请换远景/街道纵深/海岸线") if msgs else ("OK",info)
FONT_FILES={"Long Cang":"LongCang-Regular.ttf","LXGW WenKai":"LXGWWenKai-Regular.ttf","Ma Shan Zheng":"MaShanZheng.ttf","Reenie Beanie":"ReenieBeanie.ttf","Nothing You Could Do":"NothingYouCouldDo.ttf","Homemade Apple":"HomemadeApple.ttf","Caveat":"Caveat.ttf","Dancing Script":"DancingScript.ttf","Kalam":"Kalam.ttf"}
def glyph_check(m,root,R):
    """approved #2: handwritten fonts only; every character must exist in the font that will draw it (fontTools cmap)."""
    try: from fontTools.ttLib import TTFont
    except ImportError: R("WARN","未安装 fontTools，跳过字形检查"); return
    fd=os.path.join(root,"fonts"); txt=json.dumps(m["scenes"],ensure_ascii=False)+json.dumps(m.get("names",{}),ensure_ascii=False)
    lat={c for c in txt if ord(c)<128 and c.strip()}; cjk={c for c in txt if ord(c)>=128 and c.strip()}
    for fam,fn in FONT_FILES.items():
        p=os.path.join(fd,fn)
        if not os.path.exists(p): R("WARN",f"字体缺失 {fn}"); continue
        cm=TTFont(p,fontNumber=0).getBestCmap(); need=(cjk|set("0123456789:.&")) if fam in("Long Cang","LXGW WenKai","Ma Shan Zheng") else lat
        miss=sorted(c for c in need if ord(c) not in cm and c not in '"{}[],\\')
        if fam=="Ma Shan Zheng": miss=[]  # only titles use it; checked at render time (assertGlyphs)
        R("REJECT" if miss and fam in ("LXGW WenKai","Long Cang","Ma Shan Zheng") else ("WARN" if miss else "OK"),f"字形 {fam}: "+("缺 "+"".join(miss[:30]) if miss else "全覆盖"))
def person_complete(sid,k,p,root,key,expect):
    """v7 P0-6 (source side): pose keypoints + mask connectivity + edge cut. Uses cut/<Sx_key>.check.json written by
    cutout.py if present, else runs person_check on the saved mask."""
    stem=os.path.join(root,"cut",f"{sid}_{key}");cj=stem+".check.json";mk=stem+".mask.png"
    try:
        if os.path.exists(cj):
            j=json.load(open(cj));ok=j["pass"];errs=j["report"].get("errors",[]);warns=j["report"].get("warnings",[]) or []
        elif os.path.exists(mk):
            import sys as _s;_s.path.insert(0,os.path.dirname(os.path.abspath(__file__)));import person_check as pc
            ok,r=pc.check_cutout(p,mk,expect);errs,warns=r["errors"],r.get("warnings",[])
        else: return ("WARN",f"{sid}.{k} 还没有抠图 mask，未做人物完整性检查（先跑 cutout.py）")
    except ImportError: return ("WARN",f"{sid}.{k} 未安装 mediapipe，跳过人物完整性检查")
    if not ok: return ("REJECT",f"{sid}.{k} 人物不完整: {'; '.join(errs)} —— cutout.py 已试过所有模型仍失败时必须换素材")
    if warns: return ("WARN",f"{sid}.{k} {'; '.join(warns)}")
    return ("OK",f"{sid}.{k} 人物完整性通过")

def main():
    ap=argparse.ArgumentParser(); ap.add_argument("manifest"); ap.add_argument("--root",default=None); a=ap.parse_args()
    root=a.root or os.path.dirname(os.path.abspath(a.manifest)); m=json.load(open(a.manifest))
    out=[]; R=lambda lv,msg: out.append((lv,msg))
    names=m.get("names",{})
    for k in ("groom","bride"):
        v=names.get(k,"")
        if not v or v.startswith("{"): R("REJECT",f"names.{k} 未填写")
    sc={s["id"]:s.get("slots",{}) for s in m.get("scenes",[])}
    for i in range(1,11):
        if f"S{i}" not in sc: R("REJECT",f"缺少场景 S{i}")
    for sid,slots in sc.items():
        for k,v in slots.items():
            if isinstance(v,str) and v.startswith("builtin:"): continue
            if k in LIMITS and isinstance(v,str):
                w,n=LIMITS[k]; lines=v.split("\n")
                if len(lines)>n: R("WARN" if len(lines)<=n*1.5 else "REJECT",f"{sid}.{k} 行数 {len(lines)}>{n}")
                for ln in lines:
                    if len(ln)>w: R("WARN" if len(ln)<=w*1.5 else "REJECT",f"{sid}.{k} 行长 {len(ln)}>{w}: {ln[:20]}")
                if "{" in v: R("WARN",f"{sid}.{k} 仍有占位符: {v[:30]}")
            if isinstance(v,str) and v.lower().endswith((".jpg",".jpeg",".png",".webp")):
                p=os.path.join(root,v)
                if not os.path.exists(p): R("REJECT" if k.startswith("person") and sid in REQUIRED_AB else "WARN",f"{sid}.{k} 文件不存在: {v}"); continue
                im=Image.open(p); L=max(im.size); S=min(im.size)
                if k.startswith("person"):
                    key=k.split("_")[-1] if k in ("person_A","person_B") else "person"
                    mk=_mask(p,root,sid,key)
                    if mk is not None: R(*spread_check(sid,k,mk))
                    R(*person_complete(sid,k,p,root,key,slots.get("people_count",2)))
                    if L<1000: R("REJECT",f"{sid}.{k} 长边 {L}<1000")
                    elif L<1500: R("WARN",f"{sid}.{k} 长边 {L}<1500")
                    arr=np.asarray(im.convert("RGB")).astype(int)
                    if ((arr.min(2)>250).mean()>0.05): R("WARN",f"{sid}.{k} 过曝（纯白 >5%）")
                if k=="landscape" and S<1080: R("WARN",f"{sid}.{k} 短边 {S}<1080")
                if k=="landscape":
                    R(*landscape_check(sid,p))
                    asp=im.size[0]/im.size[1];cw=min(1,(1160/1630)/asp);sub=slots.get("landscape_subject")
                    if sub and sub["w"]>cw*0.92: R("WARN",f"{sid}.landscape_subject 宽 {sub['w']:.2f} > 竖版满版裁切可容纳的 {cw*0.92:.2f}：主体会被裁掉，请把框收紧到主建筑")
                    if sub and sub["v"]<0.03: R("WARN",f"{sid}.landscape_subject 顶部贴着原图上沿：只有 skyline / torn 遮罩能完整保留它")
                    if im.size[1]*1.0<1630*0.8: R("WARN",f"{sid}.landscape 高 {im.size[1]}px，满版（约 1630px 高）会放大 >1.25 倍")
                    if "landscape_subject" not in slots: R("WARN",f"{sid} 未给 landscape_subject（建筑主体框，源图归一化 u,v,w,h）——将用默认框；P0-3 遮挡检查依赖它")
        if sid in REQUIRED_AB:
            if not (slots.get("person_A") and slots.get("person_B")):
                R("WARN",f"{sid} 缺 A/B 姿势，将降级为单姿势（会削弱签名效果）")
            else:
                pa,pb=[os.path.join(root,slots[x]) for x in ("person_A","person_B")]
                if os.path.exists(pa) and os.path.exists(pb):
                    r=ab_check(pa,pb,root,sid,slots)
                    lv,msg=r; R(lv,msg)
    # P0 static checks: negative space (≤1 real-object prop per scene) + TV screen detection
    for sid,slots in sc.items():
        props=[k for k in slots if k.startswith("prop_") and not k.endswith("_screen")]
        if len(props)>1: R("WARN",f"{sid} 有 {len(props)} 个道具，v5 每场最多 1 个（留白规则），只用第一个: {props[0]}")
        if "prop_tv" in slots and not slots.get("prop_tv_screen"): R("WARN","S1 未给 prop_tv_screen：先跑 scripts/tv_screen.py 检测玻璃屏四边形")
    # v9 defaults (each overridable in style; overrides must be listed as deviations in the delivery report)
    st=m.get("style",{})
    if not st.get("dropTV") and "prop_tv" not in sc.get("S1",{}): R("WARN","v9 默认 S1 电视开场：S1 缺 prop_tv（只有 style.dropTV=true 且用户明确要求才可去掉）")
    nl=sum(1 for s_ in sc.values() if s_.get("landscape"))
    if nl!=5 and not st.get("landscapeCount"): R("WARN",f"v9 默认恰好 5 个风景场景（S4–S8），当前 {nl}；多于 5 个地点按时间顺序选 5 个并在交付报告列出舍弃项；改数量需用户明确要求 style.landscapeCount")
    for sid_ in ("S2","S3","S9","S10"):
        if sc.get(sid_,{}).get("landscape"): R("WARN",f"v9 {sid_} 是非风景场景，应使用纯色撕纸底，不放风景照（style.nonLandscapeBg 可覆盖）")
    if st.get("personGrade","none")!="none": R("WARN",f"style.personGrade={st['personGrade']}：人物会被调色，P0-8 原色检查将跳过（需用户明确要求）")
    if st.get("personLock") and not os.path.exists(os.path.join(root,st["personLock"])): R("REJECT",f"style.personLock 文件不存在: {st['personLock']}")
    for sid_,slots in sc.items():
        u=slots.get("prop_user")
        if u:
            f=u if isinstance(u,str) else u.get("file","")
            if not os.path.exists(os.path.join(root,f)): R("REJECT",f"{sid_}.prop_user 文件不存在: {f}")
            elif Image.open(os.path.join(root,f)).mode!="RGBA": R("REJECT",f"{sid_}.prop_user 必须是透明 PNG（先跑 scripts/extract_sticker.py）")
            w=1 if isinstance(u,str) else u.get("width",0.24)
            if not isinstance(u,str) and not 0.15<=w<=0.3: R("WARN",f"{sid_}.prop_user width {w} 超出 0.15–0.30W")
    glyph_check(m,root,R)
    bgm=m.get("bgm",{}).get("file")
    if not bgm or not os.path.exists(os.path.join(root,bgm)): R("WARN","BGM 缺失（需要询问用户）")
    else:
        try:
            import librosa; y,sr=librosa.load(os.path.join(root,bgm),sr=22050); d=len(y)/sr
            if d<30: R("REJECT",f"BGM {d:.1f}s<30s")
            elif d<38.43: R("WARN",f"BGM {d:.1f}s<38.43s")
            Tover=m.get("bgm",{}).get("T")
            if Tover:
                R("OK",f"BGM {d:.1f}s，使用 manifest 指定 T={Tover}（跳过 librosa 测速；测速对原片音轨会误报 172 BPM）"); raise StopIteration
            t,_=librosa.beat.beat_track(y=y,sr=sr); bpm=float(np.atleast_1d(t)[0]); T=1800/(bpm*2)
            while T<10.5: T*=2
            while T>13.5: T/=2
            R("OK",f"BGM {d:.1f}s，BPM≈{bpm:.1f}，建议 T={T:.2f} 帧" + ("（≈12.25，直接用原网格）" if abs(T-12.25)<=0.4 else "（需整体伸缩）"))
        except StopIteration: pass
        except ImportError: R("WARN","未安装 librosa，跳过 BGM 测速")
    if not any(l=="REJECT" for l,_ in out): out.append(("OK","没有拒绝项"))
    for l,msg in out: print(f"[{l}] {msg}")
    sys.exit(1 if any(l=="REJECT" for l,_ in out) else 0)
if __name__=="__main__": main()
