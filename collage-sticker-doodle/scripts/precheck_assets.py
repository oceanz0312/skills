#!/usr/bin/env python3
"""素材预检 + 选片（v4）。在写故事板之前跑，输出给用户看的中文报告 + 选片表 + 缩略图拼图。
用法：
  python precheck_assets.py <素材目录或文件...> --mode invite-classic|free [--copy copy.json] [--duration 38]
         [--cut cut/] [--out precheck/]
  - 照片自动分类：检测到人体姿态且人物占画面足够大 → 人物照；否则 → 风景/建筑照。文件名 *_A / *_B 视为 A/B 对；
    没命名的人物照按背景相似度自动配对。音频文件（mp3/m4a/wav/aac/flac）= BGM。
  - copy.json（可选）：{"occasion","mood","names":{"a","b"},"date","place","venue","time","schedule":[...],"letter":[...],"lines":[...]}
  - --cut：已有 cutout.py 输出的 <stem>.mask.png 时，用 person_check.py 的 P0-6 完整性检查（更准）；否则只做姿态检查。
输出：<out>/report.md（直接贴给用户）、selection.json（选片 → 场景/角色）、contact_sheet.jpg（缩略图拼图）。
退出码：0 可以继续（可能有 WARN）；10 没有素材；11 素材不够；12 有必须替换的低质量照片导致不够。"""
import sys,os,json,glob,argparse
import numpy as np
from PIL import Image,ImageDraw,ImageFont,ImageFilter,ImageOps
HERE=os.path.dirname(os.path.abspath(__file__));sys.path.insert(0,HERE)
IMG=(".jpg",".jpeg",".png",".webp",".heic",".bmp");AUD=(".mp3",".m4a",".wav",".aac",".flac",".ogg")

# ---------------- 数量规范（与 references/asset_requirements.md 一致） ----------------
REQ={
 "invite-classic":{
  "person_pairs":(3,3,4),   # S5/S6/S7 各 1 对 A/B（最好多 1 对备选）
  "person_single":(2,5,7),  # S2/S4/S8/S9/S10；最少 2 张，其余复用
  "places":(3,5,7),         # S4–S8；缺的退化为纯色块
  "bgm_sec":38.43},
 "free":{
  "person_pairs":(0,2,3),
  "person_total":(2,6,10),  # 人物照总张数（A/B 对算 2 张）
  "places":(1,3,6),
  "bgm_sec":30.0},
}
FONT=None
for f in ["/workspace/collage_ref/test_v8/fonts/MaShanZheng-Regular.ttf","/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc","/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"]+glob.glob("/usr/share/fonts/**/*CJK*",recursive=True)+glob.glob(os.path.join(HERE,"..","fonts","*.ttf")):
    if os.path.exists(f): FONT=f;break
def font(sz):
    try: return ImageFont.truetype(FONT,sz)
    except Exception: return ImageFont.load_default()

def sharp(g):   # 拉普拉斯方差，缩到长边 800 再算，和分辨率无关
    from scipy import ndimage as nd
    a=np.asarray(g,dtype=float);return float(nd.laplace(a).var())
def dhash(im):
    g=np.asarray(im.convert("L").resize((9,8)),dtype=float);return (g[:,1:]>g[:,:-1]).flatten()
def small(im,n=96): return np.asarray(im.convert("L").resize((n,int(n*4/3))),dtype=float)

def pose_info(rgb):
    try:
        import person_check as pc
        ps=pc.poses(rgb)
    except Exception as e:
        return None,str(e)
    H,W=rgb.shape[:2];out=[]
    for p in ps:
        vis=[i for i in [11,12,23,24,25,26,27,28,13,14] if p[i][2]>0.5]
        if not any(i in vis for i in [11,12]): continue
        ys=[p[i][1] for i in [0,11,12,23,24,25,26,27,28] if p[i][2]>0.3];xs=[p[i][0] for i in [0,11,12,23,24,13,14,15,16,25,26,27,28] if p[i][2]>0.3]
        h=(max(ys)-min(ys))/H if ys else 0
        knees=sum(p[i][2]>0.5 and p[i][1]<H*0.995 for i in [25,26]);ank=sum(p[i][2]>0.5 and p[i][1]<H*0.995 for i in [27,28])
        hips=sum(p[i][2]>0.5 and p[i][1]<H*0.995 for i in [23,24])
        edge=[e for e,c in (("左",min(xs)<0.01*W),("右",max(xs)>0.99*W),("上",min(ys)<0.005*H)) if c] if xs else []
        sw=abs(p[11][0]-p[12][0])/W if p[11][2]>0.5 and p[12][2]>0.5 else 0
        out.append({"sw":sw,"h":h,"knees":knees,"ankles":ank,"hips":hips,"edge":edge})
    return out,None

def analyse(path,cutdir):
    r={"file":path,"name":os.path.basename(path),"issues":[],"warns":[]}
    try: im=ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    except Exception as e: r["issues"].append(f"打不开（{e}）");r["kind"]="bad";return r
    W,H=im.size;r["size"]=[W,H];r["im"]=im
    g=im.convert("L");g.thumbnail((800,800));r["sharp"]=sharp(g);r["hash"]=dhash(im);r["small"]=small(im)
    rgb=np.asarray(im if max(W,H)<=1600 else im.resize((int(W*1600/max(W,H)),int(H*1600/max(W,H)))))
    ps,err=pose_info(rgb);r["poses"]=ps or []
    if err: r["warns"].append("姿态检测不可用，按横竖幅猜类型："+err[:60])
    big=[p for p in r["poses"] if (p["h"]>=0.28 and p.get("sw",0)>=0.05) or (p.get("sw",0)>=0.15 and p["h"]>=0.15)]
    stem=os.path.splitext(r["name"])[0];low=stem.lower()
    if big: kind="person"
    elif ps is None: kind="person" if H>W else "place"
    else: kind="place"
    hasmask=bool(cutdir) and os.path.exists(os.path.join(cutdir,stem+".mask.png"))
    if any(k in low for k in ("land","scene","place","bg","风景","建筑")) and not big: kind="place"
    if hasmask or any(k in low for k in ("person","people","人物")) or stem[-2:] in ("_A","_B"): kind="person"
    import re;m=re.match(r"^(S\d+)_",stem);r["hint"]=m.group(1) if m else None
    r["kind"]=kind;r["n_people"]=len(big)
    # 质量
    if kind=="person":
        L=max(W,H)
        if L<1000: r["issues"].append(f"分辨率太低（长边 {L}px <1000）")
        elif L<1500: r["warns"].append(f"分辨率偏低（长边 {L}px，建议 ≥1500）")
        whole=[p for p in big if p["hips"]>=1 and (p["knees"]>=1 or p["ankles"]>=1) and not p["edge"]]
        for p in big:
            if p["edge"]: r["issues"].append("人物被照片"+"/".join(p["edge"])+"边裁掉（只允许底边裁）")
            elif p["hips"]==0: r["issues"].append("半身照：腰/髋以下被裁，抠出来是半截人（P0-6 不过）")
            elif p["knees"]==0 and p["ankles"]==0: r["warns"].append("只到大腿以上：只能放在贴底边的位置")
        r["whole"]=len(whole)
        mk=os.path.join(cutdir,stem+".mask.png") if cutdir else None
        if mk and os.path.exists(mk):
            try:
                import person_check as pc
                ok,rep=pc.check_cutout(path,mk,expect=max(1,len(big)))
                r["p06"]="pass" if ok else "fail"
                if not ok: r["issues"]+= ["抠图检查（P0-6）："+e for e in rep["errors"]]
            except Exception as e: r["warns"].append(f"P0-6 检查失败：{e}")
        if len(big)>1 and r["whole"]<len(big) and not r["issues"]: r["warns"].append("有人被挡住或不完整，抠图可能切成碎块")
    else:
        S=min(W,H)
        if S<720: r["issues"].append(f"分辨率太低（短边 {S}px <720）")
        elif S<1080: r["warns"].append(f"分辨率偏低（短边 {S}px，建议 ≥1080）")
        if W/H<1.3: r["warns"].append(f"不够横（宽高比 {W/H:.2f}，建议 ≥1.3 的横幅远景）")
    thr=60 if kind=="person" else 40
    if r["sharp"]<thr*0.4: r["issues"].append(f"太糊（清晰度 {r['sharp']:.0f}）")
    elif r["sharp"]<thr: r["warns"].append(f"有点糊（清晰度 {r['sharp']:.0f}）")
    # 打分：清晰度 + 分辨率 + 人物完整
    r["score"]=min(r["sharp"],600)/600+min(max(W,H),3000)/3000+(1.0 if kind=="person" and r.get("whole") else 0)-len(r["warns"])*0.15
    for k in ("issues","warns"): r[k]=list(dict.fromkeys(r[k]))
    return r

def bgsim(a,b):
    x=a["small"]-a["small"].mean();y=b["small"]-b["small"].mean();return float((x*y).mean()/(x.std()*y.std()+1e-6))

def main():
    ap=argparse.ArgumentParser();ap.add_argument("inputs",nargs="*");ap.add_argument("--mode",default="free",choices=["free","invite-classic"])
    ap.add_argument("--copy");ap.add_argument("--duration",type=float,default=38.0);ap.add_argument("--cut");ap.add_argument("--out",default="precheck")
    a=ap.parse_args();os.makedirs(a.out,exist_ok=True);mode=a.mode;R=REQ[mode]
    files=[]
    for p in a.inputs:
        files+= sorted(glob.glob(os.path.join(p,"*"))) if os.path.isdir(p) else [p]
    imgs=[f for f in files if f.lower().endswith(IMG)];auds=[f for f in files if f.lower().endswith(AUD)]
    copy=json.load(open(a.copy)) if a.copy and os.path.exists(a.copy) else {}
    L=[];title="# 素材预检报告（collage-sticker-doodle · "+("invite-classic 婚礼请柬" if mode=="invite-classic" else "自由模式")+"）\n"
    sel={"mode":mode,"status":None,"people":[],"places":[],"dropped":[],"bgm":None,"copy":{},"placeholders":[]}
    def need_list():
        if mode=="invite-classic":
            return ["**人物照 11 张**（最少 8 张）：3 组 A/B 对（同一地点、同一套衣服连拍、两人换站位，各 2 张，放 S5/S6/S7）+ 5 张双人全身照（S2/S4/S8/S9/S10；最少 2 张，其余复用）",
                    "**风景/建筑照 5 张**（最少 3 张，缺的场景用纯色块）：自然风景、城市夜景或水边、建筑街道、地标+天空、海边各 1 张，横幅远景",
                    "**BGM 1 首**：≥38.5 秒（不给就无法卡点）",
                    "**文案**：两人名字（中文+拼音）、日期、城市/地点、酒店厅名、当天流程时间（如 11:58 婚礼仪式）；可选：给亲友的一段话（≤13 行，每行 ≤14 字）、英文短句"]
        return ["**人物照 6 张**（最少 2 张）：全身或到大腿，最好有 2 组 A/B 对（同一地点连拍、换个站位/姿势）",
                "**风景/建筑/场景照 3 张**（最少 1 张）：横幅、有纵深的远景（街道、海岸、天际线）",
                "**BGM 1 首**：30–60 秒",
                "**一句话描述**：什么场合、什么情绪（例如\"同居一周年，温馨甜\"）；可选：名字、日期、地点、想写的话"]
    # ---------- 0：什么都没有 ----------
    if not imgs and not auds:
        sel["status"]="empty"
        L+= [title,"## ⛔ 还没有收到任何素材\n","请上传下面这些（照片原图，别用截图/聊天压缩图）：\n"]+[f"- {x}" for x in need_list()]
        L+= ["\n照片要求：人物全身入画、只允许脚被底边裁，背景简单、不糊，长边 ≥1500px；风景横幅、短边 ≥1080px。"]
        return finish(a,L,sel,[],10)
    rs=[analyse(f,a.cut) for f in imgs]
    # ---------- 去重 ----------
    keep=[];dups=[]
    for r in sorted([r for r in rs if r["kind"]!="bad"],key=lambda r:-r["score"]):
        d=[k for k in keep if np.sum(k["hash"]!=r["hash"])<=6 and abs(np.log((k["size"][0]/k["size"][1])/(r["size"][0]/r["size"][1])))<0.15]
        if d and not (r["name"].rsplit(".",1)[0][-2:] in ("_A","_B")): dups.append((r,d[0]))
        else: keep.append(r)
    bad=[r for r in rs if r["kind"]=="bad" or r["issues"]]
    good=[r for r in keep if not r["issues"]]
    persons=[r for r in good if r["kind"]=="person"];places=[r for r in good if r["kind"]=="place"]
    # ---------- A/B 配对 ----------
    pairs=[];used=set()
    byStem={os.path.splitext(r["name"])[0]:r for r in persons}
    for s,r in byStem.items():
        if s.endswith("_A") and s[:-2]+"_B" in byStem: pairs.append((r,byStem[s[:-2]+"_B"],"文件名")) ;used|={s,s[:-2]+"_B"}
    rest=[r for r in persons if os.path.splitext(r["name"])[0] not in used]
    cand=sorted([(bgsim(x,y),i,j) for i,x in enumerate(rest) for j,y in enumerate(rest) if i<j],reverse=True);taken=set()
    for s,i,j in cand:
        if s<0.6 or i in taken or j in taken: continue
        pairs.append((rest[i],rest[j],f"背景相似 {s:.2f}"));taken|={i,j}
    singles=[r for k,r in enumerate(rest) if k not in taken]
    pairs.sort(key=lambda p:-(p[0]["score"]+p[1]["score"]));singles.sort(key=lambda r:-r["score"]);places.sort(key=lambda r:-r["score"])
    # 文件名带 S<n>_ 的（用户/上次已经按场景命名）优先放回原场景
    def hinted(lst,slots):
        out=[None]*len(slots);rest_=[]
        for r in lst:
            h=r.get("hint")
            if h in slots and out[slots.index(h)] is None: out[slots.index(h)]=r
            else: rest_.append(r)
        for i in range(len(out)):
            if out[i] is None and rest_: out[i]=rest_.pop(0)
        return [x for x in out if x]+rest_
    if mode=="invite-classic":
        places=hinted(places,["S4","S5","S6","S7","S8"]);singles=hinted(singles,["S4","S10","S8","S9","S2"])
        pairs.sort(key=lambda p:(p[0].get("hint") or "S99"))
    # ---------- 选片 ----------
    missing=[];dropped=[]
    if mode=="invite-classic":
        mnP,rcP,_=R["person_pairs"];mnS,rcS,_=R["person_single"];mnL,rcL,_=R["places"]
        useP=pairs[:3];extraP=pairs[3:]
        # 缺单张时可以拿多余的 A/B 对里的 A 补
        pool=singles+[p[0] for p in extraP]+[p[1] for p in extraP]
        useS=pool[:5];useL=places[:5]
        for k,p in enumerate(useP):
            sel["people"]+= [{"file":p[0]["name"],"scene":f"S{5+k}","role":"person_A","pair_by":p[2]},{"file":p[1]["name"],"scene":f"S{5+k}","role":"person_B","pair_by":p[2]}]
        slotsS=["S4","S10","S8","S9","S2"]   # 最好的给 S4（第一张全身大图）和 S10（结尾正面居中）
        for k,sl in enumerate(slotsS):
            if useS:
                r=next((x for x in useS if x.get("hint")==sl),None) or useS[k%len(useS)]
                sel["people"].append({"file":r["name"],"scene":sl,"role":"person_main","reused":k>=len(useS)})
        for k,r in enumerate(useL): sel["places"].append({"file":r["name"],"scene":f"S{4+k}","role":"landscape"})
        for k in range(len(useL),5): sel["places"].append({"file":None,"scene":f"S{4+k}","role":"landscape","fallback":"纯色块 + 纸纹"})
        if len(useP)<mnP: missing.append(f"A/B 对还差 {mnP-len(useP)} 组（S5/S6/S7 各需 1 组：同一地点同一套衣服连拍 2 张、两人换站位）")
        if len(useS)<mnS: missing.append(f"双人全身照还差 {mnS-len(useS)} 张（最少 {mnS}，推荐 {rcS}）")
        if len(useL)<mnL: missing.append(f"风景/建筑照还差 {mnL-len(useL)} 张（最少 {mnL}，推荐 {rcL}）")
        dropped+= [(r,"人物照超出 5 个单人槽位，按清晰度/分辨率/完整度排在后面") for r in pool[5:]]
        dropped+= [(r,"风景照超出 5 个槽位，评分靠后") for r in places[5:]]
    else:
        mid={30:5,38:6,45:7,60:10}.get(int(a.duration)) or max(4,min(10,round(a.duration/6.3)))
        mnT,rcT,bT=R["person_total"];mnL,rcL,bL=R["places"]
        nT=sum(2 for _ in pairs)+len(singles)
        nPlace=min(len(places),mid)
        useL=places[:nPlace];useP=pairs[:max(0,min(len(pairs),mid))]
        lab=lambda i,ab: f"中间场景 {i+1}（place{'，A/B 闪' if ab else '，单张 jump'}）"
        for i,r in enumerate(useL):
            p=useP[i] if i<len(useP) else None
            sel["places"].append({"file":r["name"],"scene":lab(i,bool(p)),"role":"风景"})
            if p: sel["people"]+= [{"file":p[0]["name"],"scene":lab(i,1),"role":"person_A","pair_by":p[2]},{"file":p[1]["name"],"scene":lab(i,1),"role":"person_B","pair_by":p[2]}]
        roles=[lab(i,0) for i in range(len(useP),len(useL))]+["开场"]+[f"中间场景 {i+1}（solo/list/ransom）" for i in range(len(useL),mid)]+["结尾"]
        extra=useP[len(useL):];ri=0
        for p in extra:
            if ri<len(roles): sel["people"]+= [{"file":p[0]["name"],"scene":roles[ri],"role":"person_A"},{"file":p[1]["name"],"scene":roles[ri],"role":"person_B"}];ri+=1
        useS=singles[:max(0,len(roles)-ri)]
        for r in useS: sel["people"].append({"file":r["name"],"scene":roles[ri],"role":"person"});ri+=1
        if nT<mnT: missing.append(f"人物照还差 {mnT-nT} 张（最少 {mnT}，推荐 {rcT}，其中 2 组 A/B 对）")
        if len(places)<mnL: missing.append(f"风景/场景照还差 {mnL-len(places)} 张（最少 {mnL}，推荐 {rcL}）")
        dropped+= [(r,f"{a.duration:.0f} 秒只有 {mid} 个中间场景，每张风景最多用一次，评分靠后") for r in places[nPlace:]]
        dropped+= [(r,"人物场景已排满，评分靠后") for r in singles[len(useS):]]
        dropped+= [(x,"A/B 对多于可放人的场景，评分靠后") for p in pairs[len(useP):] for x in p[:2]]
        sel["scene_plan"]={"duration":a.duration,"middle_scenes":mid,"place_scenes":nPlace}
    # ---------- BGM ----------
    if auds:
        try:
            import subprocess;d=float(subprocess.check_output(["ffprobe","-v","error","-show_entries","format=duration","-of","csv=p=0",auds[0]]).decode().strip())
        except Exception: d=None
        sel["bgm"]={"file":os.path.basename(auds[0]),"sec":d}
        if d and d<R["bgm_sec"]: missing.append(f"BGM 只有 {d:.1f} 秒，需要 ≥{R['bgm_sec']} 秒")
    else: missing.append("没有 BGM：请上传 1 首音乐（"+("≥38.5 秒" if mode=="invite-classic" else "30–60 秒")+"）")
    # ---------- 文案 ----------
    ask=[];ph=[]
    names=copy.get("names",{})
    if mode=="invite-classic":
        for k,lab,dflt in [("a","新郎名字（中文+拼音）","林浩 / LIN HAO"),("b","新娘名字（中文+拼音）","周眠 / ZHOU MIAN")]:
            if not names.get(k): ask.append(lab);ph.append((lab,dflt))
        for k,lab,dflt in [("date","日期","2026.10.01"),("place","城市 / 地点","杭州"),("venue","酒店厅名","XX 酒店 XX 厅"),("time","流程时间","11:18 迎宾 / 11:58 仪式 / 12:18 午宴")]:
            if not copy.get(k): ask.append(lab);ph.append((lab,dflt))
        if not copy.get("letter"): ph.append(("给亲友的一段话（可选）","用 v8 默认信：亲爱的家人与挚友，我们要结婚啦……"))
        if not copy.get("lines"): ph.append(("英文短句（可选）","默认池：Love in Summer Bloom / Ever thine, Ever mine, Ever ours / See you at the wedding"))
    else:
        if not copy.get("occasion"): ask.append("场合和情绪（一句话，例如\"同居一周年，温馨甜\"）");ph.append(("场合/情绪","根据照片推断，例如 everyday vlog / cozy"))
        for k,lab in [("names","名字（可选，开场/结尾用）"),("date","日期（可选）"),("place","地点（可选）")]:
            if not copy.get(k): ph.append((lab,"不写；或由 AI 起一句和画面相关的标题"))
    sel["copy"]=copy;sel["placeholders"]=[{"field":x,"placeholder":y} for x,y in ph]
    # ---------- 状态 ----------
    lowq=[r for r in bad]
    status="ok" if not missing else ("insufficient_quality" if lowq else "insufficient")
    if ask and status=="ok" and mode=="invite-classic": status="need_copy"
    sel["status"]=status
    # ---------- 报告 ----------
    L.append(title)
    head={"ok":"## ✅ 素材够了，可以开始做（请先确认下面的选片）","need_copy":"## 🟡 照片够了，还差文案（必须补，否则成片会用占位文字）","insufficient":"## ⛔ 素材还不够","insufficient_quality":"## ⛔ 素材还不够（有几张照片质量不过关，替换后就够了）"}[status]
    if lowq and status in ("ok","need_copy"): head+=f"\n\n⚠️ 有 {len(lowq)} 张照片质量不过关，已经剔除没用（见下）；想用的话请换一张更好的。"
    L.append(head+"\n")
    L.append(f"收到 {len(imgs)} 张照片、{len(auds)} 个音频。识别为：人物照 {len([r for r in rs if r['kind']=='person'])} 张（可用 {len(persons)}，A/B 对 {len(pairs)} 组）、风景/建筑 {len([r for r in rs if r['kind']=='place'])} 张（可用 {len(places)}）。\n")
    if missing:
        L.append("### 还缺什么");L+= [f"- {m}" for m in missing];L.append("")
    if lowq:
        L.append("### 质量不过关（需要换一张）")
        for r in lowq: L.append(f"- `{r['name']}`：{'；'.join(r['issues'])}")
        L.append("")
    if dups:
        L.append("### 重复照片（只保留一张）")
        for r,k in dups: L.append(f"- `{r['name']}` 和 `{k['name']}` 几乎一样，保留 `{k['name']}`")
        L.append("")
    w=[r for r in good if r["warns"]]
    if w:
        L.append("### 能用但要注意");L+= [f"- `{r['name']}`：{'；'.join(r['warns'])}" for r in w];L.append("")
    if sel["people"] or sel["places"]:
        L.append("### 选片（哪张照片放在哪个场景）\n| 场景 | 角色 | 照片 |\n|---|---|---|")
        rows=[(x["scene"],x["role"],x["file"] or "（无，"+x.get("fallback","")+"）",x) for x in sel["places"]+sel["people"]]
        def key(t):
            s=t[0];return (0,int(s[1:].split()[0])) if s[:1]=="S" and s[1:].split()[0].isdigit() else (1,s)
        for s,ro,f,x in sorted(rows,key=key): L.append(f"| {s} | {ro} | `{f}`{'（复用）' if x.get('reused') else ''} |")
        L.append("\n缩略图拼图：`contact_sheet.jpg`（绿框 = 选用，灰框 = 没用上，红框 = 质量不过关）\n")
    if dropped:
        L.append("### 没用上的照片");L+= [f"- `{r['name']}`：{why}" for r,why in dropped];L.append("")
        sel["dropped"]=[{"file":r["name"],"why":why} for r,why in dropped]
    if ask: L.append("### 请补充文案");L+= [f"- {x}" for x in ask];L.append("")
    if ph:
        L.append("### 占位文案（⚠️ 你没给，先这样写，成片里会是这些字，请确认或改掉）");L+= [f"- {x}：「{y}」〔占位〕" for x,y in ph];L.append("")
    if status!="ok" and status!="need_copy":
        L.append("### 要补的完整清单（参考）");L+= [f"- {x}" for x in need_list()];L.append("")
    L.append("---\n**下一步**："+("回复\"确认\"就按这个选片开始渲染；想换照片或改文案直接说。" if status in("ok","need_copy") else "补齐上面的素材后我再预检一次。素材不够也可以说\"就用这些\"，我会复用照片/用纯色块顶上，但效果会打折。"))
    code={"ok":0,"need_copy":0,"insufficient":11,"insufficient_quality":12}[status]
    return finish(a,L,sel,rs,code,dups)

def finish(a,L,sel,rs,code,dups=()):
    open(os.path.join(a.out,"report.md"),"w").write("\n".join(L)+"\n")
    json.dump(sel,open(os.path.join(a.out,"selection.json"),"w"),ensure_ascii=False,indent=1)
    if rs: contact(rs,sel,os.path.join(a.out,"contact_sheet.jpg"),dups)
    print("\n".join(L));print(f"\n[precheck] status={sel['status']} exit={code} → {a.out}/report.md",file=sys.stderr)
    sys.exit(code)

def contact(rs,sel,out,dups):
    use={}
    for x in sel["people"]+sel["places"]:
        if x.get("file"): use.setdefault(x["file"],[]).append(f"{x['scene'].split('（')[0]} {x['role']}")
    tw,th=260,300;cols=min(5,max(1,len(rs)));rows=(len(rs)+cols-1)//cols
    S=Image.new("RGB",(cols*tw+20,rows*th+70),(246,243,236));d=ImageDraw.Draw(S)
    d.text((14,14),f"选片拼图 · {sel['mode']} · 状态 {sel['status']}   绿=选用  灰=未用  红=不合格",fill=(30,30,30),font=font(22))
    for k,r in enumerate(sorted(rs,key=lambda r:(r["name"]))):
        x0=10+(k%cols)*tw;y0=60+(k//cols)*th
        bad=bool(r.get("issues")) or r["kind"]=="bad";u=r["name"] in use
        col=(200,40,40) if bad else ((40,160,70) if u else (160,160,160))
        if "im" in r:
            t=r["im"].copy();t.thumbnail((tw-16,th-86));S.paste(t if (u or bad) else ImageOps.grayscale(t).convert("RGB"),(x0+8+(tw-16-t.width)//2,y0+8))
        d.rectangle([x0+3,y0+3,x0+tw-4,y0+th-4],outline=col,width=5)
        lab=("✗ "+r["issues"][0][:14]) if bad else ("；".join(use[r["name"]])[:22] if u else "未用")
        d.text((x0+10,y0+th-74),r["name"][:24],fill=(20,20,20),font=font(17));d.text((x0+10,y0+th-50),lab,fill=col,font=font(17))
        d.text((x0+10,y0+th-28),f"{r['kind']} {r.get('size',['?','?'])[0]}×{r.get('size',['?','?'])[1]}",fill=(90,90,90),font=font(14))
    S.save(out,quality=88)

if __name__=="__main__": main()
