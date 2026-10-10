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
                    if L<1000: R("REJECT",f"{sid}.{k} 长边 {L}<1000")
                    elif L<1500: R("WARN",f"{sid}.{k} 长边 {L}<1500")
                    arr=np.asarray(im.convert("RGB")).astype(int)
                    if ((arr.min(2)>250).mean()>0.05): R("WARN",f"{sid}.{k} 过曝（纯白 >5%）")
                if k=="landscape" and S<1080: R("WARN",f"{sid}.{k} 短边 {S}<1080")
        if sid in REQUIRED_AB:
            if not (slots.get("person_A") and slots.get("person_B")):
                R("WARN",f"{sid} 缺 A/B 姿势，将降级为单姿势（会削弱签名效果）")
            else:
                pa,pb=[os.path.join(root,slots[x]) for x in ("person_A","person_B")]
                if os.path.exists(pa) and os.path.exists(pb):
                    A=np.asarray(Image.open(pa).convert("L").resize((96,128)),float); B=np.asarray(Image.open(pb).convert("L").resize((96,128)),float)
                    edge=np.r_[A[:,:12].ravel(),A[:,-12:].ravel()]-np.r_[B[:,:12].ravel(),B[:,-12:].ravel()]
                    bgdiff=np.abs(edge).mean(); diff=np.abs(A-B).mean()
                    if bgdiff>45: R("REJECT",f"{sid} A/B 背景差异大({bgdiff:.0f})，像是不同机位")
                    elif bgdiff>25: R("WARN",f"{sid} A/B 背景差异偏大({bgdiff:.0f})")
                    if diff<3: R("WARN",f"{sid} A/B 几乎相同（diff {diff:.1f}），闪烁会看不出来")
    bgm=m.get("bgm",{}).get("file")
    if not bgm or not os.path.exists(os.path.join(root,bgm)): R("WARN","BGM 缺失（需要询问用户）")
    else:
        try:
            import librosa; y,sr=librosa.load(os.path.join(root,bgm),sr=22050); d=len(y)/sr
            if d<30: R("REJECT",f"BGM {d:.1f}s<30s")
            elif d<38.43: R("WARN",f"BGM {d:.1f}s<38.43s")
            t,_=librosa.beat.beat_track(y=y,sr=sr); bpm=float(np.atleast_1d(t)[0]); T=1800/(bpm*2)
            while T<10.5: T*=2
            while T>13.5: T/=2
            R("OK",f"BGM {d:.1f}s，BPM≈{bpm:.1f}，建议 T={T:.2f} 帧" + ("（≈12.25，直接用原网格）" if abs(T-12.25)<=0.4 else "（需整体伸缩）"))
        except ImportError: R("WARN","未安装 librosa，跳过 BGM 测速")
    if not any(l=="REJECT" for l,_ in out): out.append(("OK","没有拒绝项"))
    for l,msg in out: print(f"[{l}] {msg}")
    sys.exit(1 if any(l=="REJECT" for l,_ in out) else 0)
if __name__=="__main__": main()
