#!/usr/bin/env python3
"""plan.json 校验器（由 video-style-distill 模板改写：本风格不是定格网格，硬锁是逐镜帧表）。
  python validate_plan.py render/plan.json --lock assets/lock.json   REJECT → 退出码 1"""
import json, sys, argparse
ap = argparse.ArgumentParser(); ap.add_argument('plan'); ap.add_argument('--lock', required=True); a = ap.parse_args()
P = json.load(open(a.plan, encoding='utf-8')); L = json.load(open(a.lock)); R, W = [], []
for k in ('size', 'fps', 'duration', 'scenes', 'words'):
    if k not in P: R.append(f'缺字段 {k}')
if R: [print('REJECT', x) for x in R]; sys.exit(1)
fps = P['fps']; sc = P['scenes']; fr = [round((s['end']-s['start'])*fps) for s in sc]
k = sum(fr)/L['total_frames']; lo, hi = L['stretch_range']
if not lo <= k <= hi: R.append(f'整体伸缩 {k:.3f} 不在 {lo}–{hi}（换 BGM 只许线性伸缩 ±10%）')
if len(sc) != len(L['shot_frames']): R.append(f"镜头数 {len(sc)} ≠ 硬锁 {len(L['shot_frames'])}")
else:
    for i, (f, g) in enumerate(zip(fr, L['shot_frames'])):
        if abs(f - g*k) > L['tolerance_frames'] + 0.5: R.append(f"{sc[i]['id']} {f} 帧，硬锁 {g}×{k:.2f}")
prev = 0
for s in sc:
    if abs(s['start']-prev) > 1e-3: R.append(f"{s['id']} 不连续")
    prev = s['end']
    if not s.get('endcard') and not s.get('media'): W.append(f"{s['id']} 没有素材（会画灰底）")
    if s.get('arc_y') is not None and not L['arc_y_range'][0] <= s['arc_y'] <= L['arc_y_range'][1]: W.append(f"{s['id']} 弧顶 y={s['arc_y']} 偏离，检查 shift_y")
for wi, (x, y) in L['word_shots'].items():
    got = [i+1 for i, s in enumerate(sc) if s.get('word') == int(wi)]
    if got and (min(got), max(got)) != (x, y): R.append(f'词组 {wi} 在镜 {min(got)}–{max(got)}，硬锁 {x}–{y}（P0-5）')
if not sc[-1].get('endcard'): R.append('最后一镜必须是片尾 endcard（P0-6）')
if len(P['words']) != 3: R.append('文案必须是 3 个词组（P0-5）')
if not L['text_baseline_range'][0] <= P.get('text_baseline', .4) <= L['text_baseline_range'][1]: W.append('text_baseline 超出容差')
for x in R: print('REJECT', x)
for x in W: print('WARN', x)
print('OK' if not R else 'FAIL'); sys.exit(1 if R else 0)
