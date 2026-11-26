;(() => {
  // 只读解析资源URL并按来源分组；不输出路径、查询、Cookie或正文，不发网络请求。
  const navigation = performance.getEntriesByType('navigation')[0]
  const resources = performance.getEntriesByType('resource')
  const grouped = new Map()
  const fontOrigins = new Set()
  const googleFontOrigins = new Set()
  const safeOrigin = value => {
    try {
      const url = new URL(value, location.href)
      return ['http:', 'https:'].includes(url.protocol)
        ? url.origin
        : `${url.protocol}resource`
    } catch {
      return 'unknown'
    }
  }
  for (const entry of resources) {
    const origin = safeOrigin(entry.name)
    const key = `${origin}|${entry.initiatorType || 'unknown'}`
    if (!grouped.has(key)) {
      grouped.set(key, {
        origin,
        initiator: entry.initiatorType || 'unknown',
        count: 0,
        transferBytes: 0,
        decodedBytes: 0,
        zeroTransferCount: 0,
        sumDurationMs: 0,
        maxDurationMs: 0,
      })
    }
    const row = grouped.get(key)
    row.count += 1
    row.transferBytes += entry.transferSize || 0
    row.decodedBytes += entry.decodedBodySize || 0
    row.zeroTransferCount += entry.transferSize === 0 ? 1 : 0
    row.sumDurationMs += entry.duration || 0
    row.maxDurationMs = Math.max(row.maxDurationMs, entry.duration || 0)
    try {
      const url = new URL(entry.name, location.href)
      if (/\.(woff2?|ttf|otf)$/i.test(url.pathname)) fontOrigins.add(url.origin)
      if (
        ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname)
      ) {
        googleFontOrigins.add(url.origin)
      }
    } catch {
      // 无法解析的性能条目只保留unknown来源汇总。
    }
  }
  const images = [...document.images]
  const fonts = document.fonts ? [...document.fonts] : []
  return {
    utc: new Date().toISOString(),
    origin: location.origin,
    navigationMs: navigation
      ? {
          dns: navigation.domainLookupEnd - navigation.domainLookupStart,
          connectIncludingTls: navigation.connectEnd - navigation.connectStart,
          tls:
            navigation.secureConnectionStart > 0
              ? navigation.connectEnd - navigation.secureConnectionStart
              : 0,
          ttfb: navigation.responseStart - navigation.startTime,
          total: navigation.duration,
          domContentLoaded:
            navigation.domContentLoadedEventEnd - navigation.startTime,
          redirectCount: navigation.redirectCount,
          transferBytes: navigation.transferSize,
        }
      : null,
    resources: [...grouped.values()].sort(
      (a, b) => b.maxDurationMs - a.maxDurationMs
    ),
    fontResourceOrigins: [...fontOrigins],
    googleFontOrigins: [...googleFontOrigins],
    fontStatus: {
      available: Boolean(document.fonts),
      setStatus: document.fonts?.status || 'unavailable',
      count: fonts.length,
      loaded: fonts.filter(font => font.status === 'loaded').length,
      error: fonts.filter(font => font.status === 'error').length,
    },
    images: {
      total: images.length,
      loaded: images.filter(image => image.complete && image.naturalWidth > 0)
        .length,
      broken: images.filter(image => image.complete && image.naturalWidth === 0)
        .length,
      pending: images.filter(image => !image.complete).length,
    },
    dom: {
      elements: document.querySelectorAll('*').length,
      scripts: document.scripts.length,
      stylesheetLinks: document.querySelectorAll('link[rel="stylesheet"]')
        .length,
    },
    notes: [
      '事后快照不提供LCP/INP/CLS、长任务或完整trace。',
      '零传输不证明缓存命中；跨源无TAO时尤其如此。',
      '资源持续时间求和不等于首屏总耗时；pending图片不等于损坏。',
      'connectIncludingTls包含TLS，不与tls重复相加；输出origin分享前仍须审查。',
    ],
  }
})()
