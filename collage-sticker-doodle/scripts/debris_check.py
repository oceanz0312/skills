#!/usr/bin/env python3
"""P0-9 碎片检查：人物/道具贴纸 mask 上的漂浮碎片（支架、三脚架残段等）面积上限。
用法: python debris_check.py cut/S5_A.png [--max-any 800] [--max-below 400] [--json out.json]
退出码: 0 通过，1 FAIL。也可 `from debris_check import check`。
"""
import argparse, json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

def check(path, max_any=800, max_below=400):
    im = Image.open(path).convert("RGBA")
    a = np.asarray(im)[..., 3] > 12
    if not a.any():
        return {"pass": False, "errors": ["empty_mask"], "debris": []}
    lab, n = ndimage.label(a)
    sizes = ndimage.sum(a, lab, range(1, n + 1))
    if n == 0:
        return {"pass": False, "errors": ["empty_mask"], "debris": []}
    main = int(np.argmax(sizes)) + 1
    ys, xs = np.where(lab == main)
    y0, y1 = int(ys.min()), int(ys.max())
    foot_y = y0 + int(0.72 * (y1 - y0))  # lower ~28% of person bbox = feet/stand zone
    debris = []
    for i, sz in enumerate(sizes, 1):
        if i == main:
            continue
        area = int(sz)
        cy = int(np.mean(np.where(lab == i)[0]))
        below = cy >= foot_y
        limit = max_below if below else max_any
        if area > limit:
            debris.append({"id": i, "area": area, "cy": cy, "below_feet": below, "limit": limit})
    ok = len(debris) == 0
    return {
        "pass": ok,
        "file": path,
        "main_area": int(sizes[main - 1]),
        "components": int(n),
        "debris": debris,
        "errors": ([] if ok else [f"debris_{d['area']}px_below={d['below_feet']}" for d in debris]),
    }

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("path")
    ap.add_argument("--max-any", type=int, default=800)
    ap.add_argument("--max-below", type=int, default=400)
    ap.add_argument("--json")
    a = ap.parse_args()
    r = check(a.path, a.max_any, a.max_below)
    s = json.dumps(r, ensure_ascii=False, indent=1)
    print(s)
    if a.json:
        open(a.json, "w").write(s)
    raise SystemExit(0 if r["pass"] else 1)

if __name__ == "__main__":
    main()
