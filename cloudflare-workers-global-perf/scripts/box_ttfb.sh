#!/usr/bin/env bash
# usage: box_ttfb.sh <url> [N=15]  -> p50/min/max TTFB of N sequential requests from this machine (quick A/B, not a global view)
U=${1:?url}; N=${2:-15}
for i in $(seq 1 "$N"); do curl -s -o /dev/null -w "%{time_starttransfer}\n" "$U"; done | sort -n |
  awk '{a[NR]=$1} END{print "p50="a[int(NR/2)+1]" min="a[1]" max="a[NR]}'
