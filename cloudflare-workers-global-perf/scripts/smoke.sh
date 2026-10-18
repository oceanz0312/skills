#!/usr/bin/env bash
# Read-only production smoke template. Prints PASS/FAIL lines; exit 1 on any FAIL.
# Configure via env vars (all optional except BASE):
#   BASE=https://example.com
#   SEO_PATHS="/ /faq /about"            pages that must have a self canonical (+ show cache headers)
#   NOINDEX_PATHS="/result/abc /games"   pages that must carry meta robots noindex
#   XROBOTS_PATHS="/games"               pages that must send X-Robots-Tag: noindex
#   REDIRECTS="https://www.example.com/faq https://x.workers.dev/faq"   must answer 301
#   NOCACHE_PATHS="/api/play-limit?pk=smoke /api/sessions/none"        must never be cf-cache-status HIT
#   SITEMAP_MIN=10  SITEMAP_EXCLUDE="/games"
set -u
B=${BASE:?set BASE}; fail=0
ok(){ echo "PASS $1"; }; bad(){ echo "FAIL $1"; fail=1; }
h(){ curl -s -o /dev/null -D - "$@" | tr -d '\r'; }
for p in ${SEO_PATHS:-/}; do
  c=$(curl -s "$B$p" | grep -o '<link rel="canonical" href="[^"]*"' | head -1)
  exp="$B${p%/}"; [ "$p" = "/" ] && exp="$B"
  echo "$c" | grep -qE "href=\"$exp/?\"" && ok "canonical $p" || bad "canonical $p -> $c"
  echo "     $(h "$B$p" | grep -iE '^(x-nextjs-cache|x-opennext-cache|cf-cache-status|cache-control)' | tr '\n' ' ')"
done
for p in ${NOINDEX_PATHS:-}; do curl -sL "$B$p" | grep -qiE 'name="robots" content="[^"]*noindex' && ok "noindex $p" || bad "noindex $p"; done
for p in ${XROBOTS_PATHS:-}; do h "$B$p" | grep -qi '^x-robots-tag:.*noindex' && ok "X-Robots-Tag $p" || bad "X-Robots-Tag $p"; done
for u in ${REDIRECTS:-}; do h "$u" | grep -qi '^HTTP/[0-9.]* 301' && ok "301 $u" || bad "301 $u"; done
for p in ${NOCACHE_PATHS:-}; do r=$(h "$B$p"); echo "$r" | grep -qi '^cf-cache-status: HIT' && bad "cached $p" || ok "not cached $p ($(echo "$r" | grep -i '^cache-control' ))"; done
curl -s "$B/robots.txt" | grep -qi '^sitemap:' && ok "robots.txt has Sitemap" || echo "INFO robots.txt has no Sitemap line"
sm=$(curl -s "$B/sitemap.xml"); n=$(echo "$sm" | grep -o '<loc>' | wc -l)
[ "$n" -ge "${SITEMAP_MIN:-1}" ] && ok "sitemap $n urls" || bad "sitemap $n urls"
for x in ${SITEMAP_EXCLUDE:-}; do echo "$sm" | grep -q "<loc>[^<]*$x</loc>" && bad "sitemap contains $x" || ok "sitemap excludes $x"; done
js=$(curl -s "$B/" | grep -o '/_next/static/[^"]*\.js' | head -1)
[ -n "$js" ] && { h "$B$js" | grep -qi '^cache-control:.*immutable' && ok "static immutable $js" || bad "static not immutable $js"; }
exit $fail
