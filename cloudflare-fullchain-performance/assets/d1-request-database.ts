import { AsyncLocalStorage } from 'node:async_hooks'
import { drizzle } from 'drizzle-orm/d1'

export type ReadPolicy =
  | { kind: 'primary' }
  | { kind: 'session'; constraint?: D1SessionConstraint | D1SessionBookmark }

/** 每个数据库绑定创建一个路由器，不在模块变量里保存请求会话。 */
export function createRequestDatabase<Schema extends Record<string, unknown>>(
  primary: D1Database,
  schema: Schema
) {
  const context = new AsyncLocalStorage<D1DatabaseSession | null>()
  const primaryDb = drizzle(primary, { schema })

  // 保留完整绑定类型；只让查询接口走会话，其余绑定方法保留正确的接收者。
  const routed = new Proxy(primary, {
    get(target, key) {
      const session = context.getStore()
      const queryMethod = key === 'prepare' || key === 'batch'
      const receiver = queryMethod ? (session ?? target) : target
      const value = Reflect.get(receiver, key, receiver)
      if (typeof value !== 'function') return value
      if (session && !queryMethod) {
        throw new Error('会话内仅使用 prepare/batch；管理操作在请求外执行')
      }
      return value.bind(receiver)
    },
  })
  const db = drizzle(routed, { schema })

  async function run(
    policy: ReadPolicy,
    handle: () => Promise<Response>
  ): Promise<{ response: Response; bookmark: string | null }> {
    if (policy.kind === 'primary') {
      // 主库边界显式清除继承的会话，也适用于请求内启动的权威后台操作。
      const response = await context.run(null, handle)
      return { response, bookmark: null }
    }
    const session = primary.withSession(
      policy.constraint ?? 'first-unconstrained'
    )
    const response = await context.run(session, handle)
    return { response, bookmark: session.getBookmark() }
  }

  return {
    getDb: () => db,
    getPrimaryDb: () => primaryDb,
    currentBookmark: () => context.getStore()?.getBookmark() ?? null,
    run,
  }
}
