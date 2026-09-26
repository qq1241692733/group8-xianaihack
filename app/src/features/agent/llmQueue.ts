/**
 * LLM 请求的串行队列（带优先级车道）。
 *
 * 为什么需要：算力端点（QiyuanHub 赛事期）的**并发上限是 1 路**，超了直接回 429
 * 「并发请求数已达上限」。而打标是「连拍几张照片 → 每条各发一个视觉请求」这种
 * 天然并发的场景，不排队必然撞上限。
 *
 * 两条车道：
 *  - **foreground**：人在等的（聊天回复、成册判定）——先跑。
 *  - **background**：可以等的（照片打标）——让路。
 * 正在跑的那一个不打断（不抢占）；优先级只决定**排队顺序**。同一车道内先来先服务。
 *
 * 注意边界：这是**页内**队列，只管住当前这个页面/WebView。同一账号在多个标签页各开
 * 一个 App 时，每个页面各有一个队列，仍可能互相撞上限。真要跨页串行得上 Web Locks
 * 或服务端排队——现在不值得，先记在这。
 */

export type Lane = 'foreground' | 'background'

export interface LlmQueue {
  /** 排一个前台任务。 */
  runForeground: <T>(task: () => Promise<T>) => Promise<T>
  /** 排一个后台任务。 */
  runBackground: <T>(task: () => Promise<T>) => Promise<T>
}

/**
 * 建一个并发上限为 limit 的队列。槽位满时排队等待：前台排前面的队，后台排后面的。
 * 任务抛错不影响队列——finally 里照常交出槽位。
 */
export function createQueue(limit = 1): LlmQueue {
  let active = 0
  const foreground: Array<() => void> = []
  const background: Array<() => void> = []

  /** 取下一个该被唤醒的等待者：前台优先。 */
  const takeNext = () => foreground.shift() ?? background.shift()

  function makeRunner(waiter: Array<() => void>) {
    return async function run<T>(task: () => Promise<T>): Promise<T> {
      if (active >= limit) {
        // 排队。被唤醒时槽位由 release 直接移交过来，active 不再自增。
        await new Promise<void>((resolve) => waiter.push(resolve))
      } else {
        active += 1
      }

      try {
        return await task()
      } finally {
        const next = takeNext()
        // 有人等就直接把槽位交出去（active 不变）；没人等才真正释放。
        if (next) next()
        else active -= 1
      }
    }
  }

  return { runForeground: makeRunner(foreground), runBackground: makeRunner(background) }
}
