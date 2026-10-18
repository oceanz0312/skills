#!/usr/bin/env python3
"""usage: analyze.py <probe_dir> [<baseline_dir>]
Region tables of TTFB p50/p90 (and total p50) per page name found as <name>-run*.json; with a baseline, a before/after table."""
import collections, json, os, sys

REG = {**{c: "北美" for c in "US CA MX".split()}, **{c: "南美" for c in "BR AR CL CO PE".split()},
       **{c: "欧洲" for c in "GB DE FR NL SE ES PL IT".split()}, **{c: "中东" for c in "AE IL SA TR".split()},
       **{c: "非洲" for c in "ZA NG KE EG".split()}, **{c: "东亚" for c in "CN HK TW JP KR".split()},
       **{c: "东南亚/南亚" for c in "SG IN ID TH VN PH".split()}, **{c: "大洋洲" for c in "AU NZ".split()}}
ORDER = ["北美", "南美", "欧洲", "中东", "非洲", "东亚", "东南亚/南亚", "大洋洲", "其他", "全球"]

def pct(v, q):
    v = sorted(x for x in v if x is not None)
    if not v: return None
    k = (len(v) - 1) * q; f = int(k); c = min(f + 1, len(v) - 1)
    return round(v[f] + (v[c] - v[f]) * (k - f))

def load(d, name):
    rows = []
    if not d or not os.path.isdir(d): return rows
    for f in sorted(os.listdir(d)):
        if f.startswith(name + "-run") and f.endswith(".json"):
            for r in json.load(open(os.path.join(d, f)))["results"]:
                t = r["result"].get("timings") or {}; h = r["result"].get("headers") or {}
                rows.append(dict(reg=REG.get(r["probe"]["country"], "其他"), ttfb=t.get("firstByte"), total=t.get("total"),
                                 code=r["result"].get("statusCode"),
                                 cache=h.get("x-opennext-cache") or h.get("x-nextjs-cache") or h.get("cf-cache-status")))
    return rows

def stats(rows):
    g = collections.defaultdict(list)
    for r in rows: g[r["reg"]].append(r); g["全球"].append(r)
    return {k: (pct([r["ttfb"] for r in v], .5), pct([r["ttfb"] for r in v], .9), pct([r["total"] for r in v], .5)) for k, v in g.items()}

def main():
    d = sys.argv[1]; b = sys.argv[2] if len(sys.argv) > 2 else None
    names = sorted({f.split("-run")[0] for f in os.listdir(d) if "-run" in f and f.endswith(".json")})
    for name in names:
        a = load(d, name); sa = stats(a); sb = stats(load(b, name)) if b else {}
        print(f"\n### {name}  (n={len(a)}, status={dict(collections.Counter(r['code'] for r in a))}, cache={dict(collections.Counter(r['cache'] for r in a))})\n")
        if b:
            print("| 区域 | 基线 TTFB p50/p90 | 现在 TTFB p50/p90 | 变化 p50 |\n|---|---|---|---|")
            for k in ORDER:
                if k in sa:
                    x = sb.get(k, (None, None, None)); y = sa[k]
                    ch = f"{round((y[0] - x[0]) / x[0] * 100)}%" if x[0] and y[0] is not None else ""
                    print(f"| {k} | {x[0]} / {x[1]} | {y[0]} / {y[1]} | {ch} |")
        else:
            print("| 区域 | TTFB p50/p90 | total p50 |\n|---|---|---|")
            for k in ORDER:
                if k in sa: print(f"| {k} | {sa[k][0]} / {sa[k][1]} | {sa[k][2]} |")

if __name__ == "__main__":
    main()
