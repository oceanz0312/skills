#!/usr/bin/env python3
"""EDL → render/media 帧 + plan.json。
  python prep.py edl.json --render render/ --words "There's" "more to" discover --product "Product 1.0" \
     [--brand "Brand"] [--logo logo.png] [--font serif.ttf] [--size 1280x720]
对每个槽位：从 clip 的 in 点抽 frames 帧，铺满 + 平移让弧顶落到 0.48（arc_match 给的 shift_y），统一调色（S 曲线 + 抬黑位），
测一次弧顶 y 写进 scene.arc_y（供 P0-4 字压弧审计）。片尾槽位 clip 为空时用程序化光弧。"""
import argparse, json, os, shutil, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from common import grab, detect_arc
ap = argparse.ArgumentParser(); ap.add_argument('edl'); ap.add_argument('--render', required=True)
ap.add_argument('--words', nargs=3, default=["There's", "more to", "discover"]); ap.add_argument('--product', default='')
ap.add_argument('--brand', default=''); ap.add_argument('--logo'); ap.add_argument('--font'); ap.add_argument('--size', default='1280x720')
a = ap.parse_args(); E = json.load(open(a.edl)); fps = E['fps']; W, H = map(int, a.size.split('x')); R = os.path.abspath(a.render)
os.makedirs(f'{R}/media', exist_ok=True); scenes = []
def cp(p, name):
    if not p: return None
    d = f'{R}/media/{name}{os.path.splitext(p)[1]}'; shutil.copy(p, d); return os.path.relpath(d, R)
for s in E['slots']:
    sid = f"S{s['shot']:02d}"; st, n = s['start']/fps, s['frames']; sc = dict(id=sid, start=round(st, 4), end=round((s['start']+n)/fps, 4), nframes=n)
    if s.get('endcard'): sc['endcard'] = True
    if s.get('word_index') is not None: sc['word'] = s['word_index']
    if s.get('clip'):
        od = f'{R}/media/{sid}'; os.makedirs(od, exist_ok=True)
        sy = (s.get('crop') or {}).get('shift_y', 0); sw, sh = int(W*1.12), int(H*1.12); y = max(0, min(sh-H, int((sh-H)/2 - sy*H)))
        img = s['clip'].lower().endswith(('.jpg', '.jpeg', '.png', '.tif'))
        src = (['-loop', '1'] if img else ['-ss', str(s.get('in', 0))]) + ['-i', s['clip']]
        vf = f"scale={sw}:{sh}:force_original_aspect_ratio=increase,crop={W}:{H}:(iw-{W})/2:{y},fps={fps},curves=all='0/0.03 0.25/0.2 0.75/0.8 1/0.97'"
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *src, '-frames:v', str(n), '-vf', vf, '-q:v', '2', f'{od}/%04d.jpg'], check=True)
        sc['media'] = f'media/{sid}/%04d.jpg'
        g = grab(f'{od}/0001.jpg', 0); r = detect_arc(g) if g is not None else None
        if r: sc['arc_y'] = round(r['apex_y'], 3)
    scenes.append(sc)
plan = dict(size=[W, H], fps=fps, duration=E['total_frames']/fps, T=1/fps, t0=0, boil=dict(states=1, px=0),
            words=a.words, word_size=[.03, .035, .06], text_baseline=.40, arc_target_y=.48, ink='#F2EEE6', grain=.05,
            product=a.product, brand=a.brand, logo=cp(a.logo, 'logo'), font=cp(a.font, 'font'), scenes=scenes)
json.dump(plan, open(f'{R}/plan.json', 'w'), ensure_ascii=False, indent=1); print('写入', f'{R}/plan.json', len(scenes), '镜')
