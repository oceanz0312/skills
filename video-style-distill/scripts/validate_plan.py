#!/usr/bin/env python3
"""plan.json 校验器模板（蒸馏出的 skill 复制后按自己的 schema 和 P0 改）。用法: python validate_plan.py plan.json [--lock lock.json]
REJECT → 退出码 1。lock.json 写硬锁（节奏、结构签名），plan 违反即 REJECT；默认值只 WARN。"""
import json,sys,argparse
def main():
    ap=argparse.ArgumentParser();ap.add_argument("plan");ap.add_argument("--lock");a=ap.parse_args()
    P=json.load(open(a.plan,encoding="utf-8"));L=json.load(open(a.lock)) if a.lock else {};R=[];W=[]
    for k in ("size","fps","duration","T","scenes"):
        if k not in P:R.append(f"缺字段 {k}")
    if R:print("\n".join("REJECT "+x for x in R));sys.exit(1)
    T=P["T"];lo,hi=L.get("T_range",[0.2,1.2])
    if not lo<=T<=hi:R.append(f"T={T} 不在硬锁范围 {lo}–{hi}")
    prev=0
    for s in P["scenes"]:
        if abs(s["start"]-prev)>1e-6:R.append(f"{s['id']} start={s['start']} 和上一场结尾 {prev} 不连续")
        n=(s["end"]-s["start"])/T
        if abs(n-round(n))>0.05 and s is not P["scenes"][-1]:R.append(f"{s['id']} 长度 {n:.2f}T 不是整拍（硬锁：所有切点在网格上）")
        if L.get("scene_len_T") and round(n) not in L["scene_len_T"] and s is not P["scenes"][-1]:W.append(f"{s['id']} {round(n)}T 不在推荐 {L['scene_len_T']}")
        prev=s["end"]
    ab=[s["id"] for s in P["scenes"] if s.get("ab")]
    if L.get("ab_max_scenes") is not None and len(ab)>L["ab_max_scenes"]:R.append(f"A/B 场景 {len(ab)} 个 > 上限 {L['ab_max_scenes']}（签名：只在高潮用）")
    if abs(prev-P["duration"])>T:W.append(f"场景总长 {prev} 和 duration {P['duration']} 差超过 1T")
    for x in R:print("REJECT",x)
    for x in W:print("WARN",x)
    print("OK" if not R else "FAIL");sys.exit(1 if R else 0)
if __name__=="__main__":main()
