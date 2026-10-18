#!/usr/bin/env python3
"""Globalping multi-region HTTP probe.

usage:
  gp_probe.py --host example.com --label baseline --path home=/ --path share=/share/abc --path static=auto [--rounds 3] [--reuse <measurement_id>] [--out ./probes]

- static=auto: picks the first /_next/static/chunks/*.js from the home page HTML (static control group).
- --reuse: reuse the exact probe set of an earlier measurement (fair before/after). The first run prints its id.
- Optional GLOBALPING_TOKEN env var raises rate limits (never hardcode it).
Writes <out>/<label>/<name>-run<i>.json (consumed by analyze.py).
"""
import argparse, json, os, re, sys, time, urllib.error, urllib.request

API = "https://api.globalping.io/v1/measurements"
LOCATIONS = ["US+Virginia", "US+California", "US+Illinois", "US+Texas", "US+Washington", "CA+Toronto", "MX",
             "BR+Sao Paulo", "AR", "CL", "CO", "PE", "GB+London", "DE+Frankfurt", "FR+Paris", "NL+Amsterdam", "SE", "ES", "PL", "IT",
             "AE", "IL", "SA", "TR", "ZA", "NG", "KE", "EG", "CN", "HK", "TW", "SG", "JP+Tokyo", "KR", "IN", "IN", "ID", "TH", "VN", "PH",
             "AU+Sydney", "NZ"]

def _req(url, body=None):
    headers = {"content-type": "application/json"}
    if os.environ.get("GLOBALPING_TOKEN"):
        headers["authorization"] = "Bearer " + os.environ["GLOBALPING_TOKEN"]
    data = json.dumps(body).encode() if body is not None else None
    return json.load(urllib.request.urlopen(urllib.request.Request(url, data=data, headers=headers)))

def run(host, path, reuse=None):
    locs = reuse if reuse else [{"magic": m, "limit": 1} for m in LOCATIONS]
    body = {"type": "http", "target": host, "inProgressUpdates": False,
            "measurementOptions": {"protocol": "HTTPS", "request": {"method": "GET", "path": path}}, "locations": locs}
    for _ in range(6):
        try:
            mid = _req(API, body)["id"]; break
        except urllib.error.HTTPError as e:
            if e.code == 429: time.sleep(60); continue
            raise
    else:
        sys.exit("rate limited")
    while True:
        d = _req(f"{API}/{mid}")
        if d["status"] != "in-progress": return mid, d
        time.sleep(2)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", required=True)
    ap.add_argument("--label", required=True)
    ap.add_argument("--path", action="append", required=True, help="name=/path (static=auto allowed)")
    ap.add_argument("--rounds", type=int, default=3)
    ap.add_argument("--reuse")
    ap.add_argument("--out", default="./probes")
    a = ap.parse_args()
    out = os.path.join(a.out, a.label); os.makedirs(out, exist_ok=True)
    paths = dict(p.split("=", 1) for p in a.path)
    for k, v in paths.items():
        if v == "auto":
            html = urllib.request.urlopen(urllib.request.Request(f"https://{a.host}/", headers={"user-agent": "Mozilla/5.0"})).read().decode()
            paths[k] = sorted(set(re.findall(r"/_next/static/chunks/[A-Za-z0-9_\-.]+\.js", html)))[0]
    json.dump(paths, open(os.path.join(out, "paths.json"), "w"), indent=1)
    reuse = a.reuse
    for i in range(1, a.rounds + 1):
        for name, p in paths.items():
            mid, d = run(a.host, p, reuse)
            reuse = reuse or mid  # lock the probe set after the first measurement
            json.dump(d, open(os.path.join(out, f"{name}-run{i}.json"), "w"), indent=1)
            print(f"{name}-run{i} id={mid} results={len(d['results'])}")
        time.sleep(5)
    print("probe set id (pass as --reuse next time):", reuse)

if __name__ == "__main__":
    main()
