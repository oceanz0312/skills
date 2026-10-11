#!/usr/bin/env python3
"""弧线检测 + 候选排序。
  python arc_match.py clips/ --out arcs.json [--sheet arcs.jpg]
  python arc_match.py --order arcs.json --edl edl.template.json --out edl.json
"""
import argparse, glob, json, os, subprocess, sys
import numpy as np
from common import grab, detect_arc, arc_ok

def dur(p):
    o = subprocess.run(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',p],capture_output=True,text=True).stdout
    try: return float(o)
    except ValueError: return 1.0  # 静态图

def scan(d, out, sheet):
    files = sorted(f for f in glob.glob(os.path.join(d,'*')) if f.lower().endswith(('.mp4','.mov','.mkv','.webm','.jpg','.png','.jpeg','.tif')))
    res = []
    for f in files:
        D = dur(f); best = None
        for t in np.linspace(0, max(0, D-0.3), 6 if D > 1 else 1):
            g = grab(f, t)
            if g is None: continue
            r = detect_arc(g)
            if r and (best is None or r['resid'] < best['resid']): best = dict(r, t=float(t))
        ok, why = arc_ok(best)
        col = None
        if best:
            o = subprocess.run(['ffmpeg','-v','error','-ss',str(best['t']),'-i',f,'-frames:v','1','-vf','scale=64:36','-f','rawvideo','-pix_fmt','rgb24','-'],capture_output=True).stdout
            if len(o) == 64*36*3:
                im = np.frombuffer(o, np.uint8).reshape(36, 64, 3).astype(float); yy = int(best['apex_y']*36)
                best['below_rgb'] = im[min(35, yy+3):].reshape(-1, 3).mean(0).round().tolist()
                best['above_rgb'] = im[:max(1, yy-2)].reshape(-1, 3).mean(0).round().tolist()
        res.append(dict(file=f, ok=ok, why=why, **(best or {})))
        print(('OK  ' if ok else 'BAD ') + f, why)
    json.dump(res, open(out,'w'), indent=1)
    if sheet:
        good = [r for r in res if 'apex_y' in r]
        lst = '\n'.join(f"file '{os.path.abspath(r['file'])}'" for r in good)
        print(f'{len([r for r in res if r["ok"]])}/{len(res)} 合格；拼图请用 qa_check.py --sheet 在成片上生成')

def order(arcs, edl, out):
    A = [a for a in json.load(open(arcs)) if a.get('ok')]
    E = json.load(open(edl)); slots = [s for s in E['slots'] if not s.get('endcard')]
    if len(A) < len(slots): sys.exit(f'合格素材 {len(A)} < 槽位 {len(slots)}：请补素材（P0-1）')
    # 贪心：弧顶 y 尽量一致（会再平移到 0.48），且相邻镜头"颜色必须明显不同"（P0 相邻色差：弧下主色 RGB 距离 ≥90 或上方明暗反转），
    # 否则硬切读不出来、scdet 也测不到切点。同等条件下优先拉开题材（manifest category，可选）。
    def sig(x): return np.array(x.get('below_rgb', [0,0,0]) + x.get('above_rgb', [0,0,0]))
    used, last = set(), None
    for s in slots:
        best = None
        for i, a in enumerate(A):
            if i in used: continue
            cost = abs(a['apex_y'] - 0.48)
            if last is not None:
                dv = np.linalg.norm(sig(a)[:3] - sig(last)[:3]); dt = abs(np.mean(sig(a)[3:]) - np.mean(sig(last)[3:]))
                if dv < 90 and dt < 80: cost += 10        # 违反相邻色差，最后才用
                cost -= min(dv, 250) / 2500
            if best is None or cost < best[0]: best = (cost, i)
        i = best[1]; used.add(i); a = A[i]; last = a
        if best[0] >= 10: print('WARN', s['shot'], '找不到颜色差够大的素材，补素材')
        s['clip'] = a['file']; s['in'] = a['t']
        s['crop'] = {'shift_y': round(0.48 - a['apex_y'], 3)}   # prep 会平移让弧顶落在 48%
    json.dump(E, open(out,'w'), indent=1); print('写入', out)

ap = argparse.ArgumentParser(); ap.add_argument('dir', nargs='?'); ap.add_argument('--out', required=True)
ap.add_argument('--sheet'); ap.add_argument('--order'); ap.add_argument('--edl')
a = ap.parse_args()
order(a.order, a.edl, a.out) if a.order else scan(a.dir, a.out, a.sheet)
