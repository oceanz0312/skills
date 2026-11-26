export type BookmarkOptions = {
  cookieName: string
  headerName: string
  maxAgeSeconds: number
  crossTab: 'required' | 'single-tab-only'
}

/** 书签名由数据库命名空间决定；模块不包含任何站点或账号常量。 */
export function createBookmarkChannel(options: BookmarkOptions) {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(options.cookieName)) {
    throw new Error('cookieName 必须是有效的独立数据库命名空间')
  }
  if (!/^[A-Za-z0-9-]{1,64}$/.test(options.headerName)) {
    throw new Error('headerName 必须是有效的请求头名称')
  }
  if (
    !Number.isSafeInteger(options.maxAgeSeconds) ||
    options.maxAgeSeconds <= 0
  ) {
    throw new Error('maxAgeSeconds 必须是正整数产品策略')
  }

  function isBookmark(value: unknown): value is string {
    return (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 1024 &&
      !/[^\x21-\x7e]/.test(value) &&
      value !== 'first-primary' &&
      value !== 'first-unconstrained'
    )
  }

  function readCookie(cookie: string) {
    const pair = cookie
      .split(';')
      .map(part => part.trim())
      .find(part => part.startsWith(options.cookieName + '='))
    if (!pair) return null
    try {
      const value = decodeURIComponent(
        pair.slice(options.cookieName.length + 1)
      )
      return isBookmark(value) ? value : null
    } catch {
      return null
    }
  }

  function newer(current: string | null, incoming: string) {
    return current === null || current < incoming ? incoming : current
  }

  function assertStorageAvailable() {
    if (
      options.crossTab === 'required' &&
      (typeof navigator === 'undefined' || !navigator.locks)
    ) {
      throw new Error(
        '当前环境没有共享锁，请先选择服务器托管或明确的单标签页方案'
      )
    }
  }

  async function remember(value: unknown): Promise<boolean> {
    if (!isBookmark(value)) return true
    assertStorageAvailable()
    const merge = () => {
      const selected = newer(readCookie(document.cookie), value)
      const secure = window.location.protocol === 'https:' ? '; Secure' : ''
      document.cookie =
        options.cookieName +
        '=' +
        encodeURIComponent(selected) +
        '; Path=/; Max-Age=' +
        options.maxAgeSeconds +
        '; SameSite=Lax' +
        secure
      const stored = readCookie(document.cookie)
      return stored !== null && stored >= selected
    }
    try {
      return navigator.locks
        ? await navigator.locks.request(options.cookieName, merge)
        : merge()
    } catch {
      // 位置保存失败不改变已完成业务；调用方须显式处理一致性缺口。
      return false
    }
  }

  const fetchWithBookmark: typeof fetch = async (input, init) => {
    if (typeof window === 'undefined') {
      return init === undefined ? fetch(input) : fetch(input, init)
    }
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      window.location.href
    )
    if (url.origin !== window.location.origin) return fetch(input, init)
    // 缺共享锁时在网络操作之前拒绝，避免写入已成功后抛错而诱发重复提交。
    assertStorageAvailable()
    // 显式 init.headers 按原生 fetch 整体替换，未指定时才继承 Request。
    const headers = new Headers(
      init?.headers !== undefined
        ? init.headers
        : input instanceof Request
          ? input.headers
          : undefined
    )
    const bookmark = readCookie(document.cookie)
    if (bookmark) headers.set(options.headerName, bookmark)
    const response = await fetch(input, { ...init, headers })
    const incoming = response.headers.get(options.headerName)
    if (!(await remember(incoming))) {
      // 保留原响应；立即显示同步缺口并走既定主库重读流程，不自动重试写操作。
      window.dispatchEvent(new Event('d1-bookmark-storage-failed'))
    }
    return response
  }

  return { isBookmark, readCookie, newer, remember, fetchWithBookmark }
}
