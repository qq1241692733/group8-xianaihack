import { describe, expect, it } from 'vitest'

import { createQueue } from './llmQueue'

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('createQueue', () => {
  it('并发上限 1 时严格串行，且同车道按先来后到', async () => {
    const q = createQueue(1)
    let active = 0
    let max = 0
    const order: number[] = []

    const tasks = [1, 2, 3].map((n) =>
      q.runBackground(async () => {
        active += 1
        max = Math.max(max, active)
        await delay(5)
        order.push(n)
        active -= 1
        return n
      }),
    )

    expect(await Promise.all(tasks)).toEqual([1, 2, 3])
    expect(max).toBe(1)
    expect(order).toEqual([1, 2, 3])
  })

  it('前台插到后台前面（正在跑的那个不打断）', async () => {
    const q = createQueue(1)
    const order: string[] = []
    let releaseFirst!: () => void

    // 第一个后台任务先占住槽位，卡在这里。
    const running = q.runBackground(async () => {
      order.push('bg-running')
      await new Promise<void>((resolve) => {
        releaseFirst = resolve
      })
    })

    // 先排后台，再排前台——前台应该先跑。
    const bg = q.runBackground(async () => {
      order.push('bg')
    })
    const fg = q.runForeground(async () => {
      order.push('fg')
    })

    releaseFirst()
    await Promise.all([running, bg, fg])

    expect(order).toEqual(['bg-running', 'fg', 'bg'])
  })

  it('上限 2 时最多两路并发', async () => {
    const q = createQueue(2)
    let active = 0
    let max = 0

    await Promise.all(
      [1, 2, 3, 4, 5].map(() =>
        q.runForeground(async () => {
          active += 1
          max = Math.max(max, active)
          await delay(5)
          active -= 1
        }),
      ),
    )

    expect(max).toBe(2)
  })

  it('任务抛错不影响队列继续（槽位照常交出）', async () => {
    const q = createQueue(1)
    const seen: string[] = []

    const boom = q.runForeground(async () => {
      seen.push('a')
      await delay(1)
      throw new Error('boom')
    })
    const after = q.runForeground(async () => {
      seen.push('b')
      return 'ok'
    })

    await expect(boom).rejects.toThrow('boom')
    await expect(after).resolves.toBe('ok')
    expect(seen).toEqual(['a', 'b'])
  })

  it('同步就抛的任务也不占死槽位', async () => {
    const q = createQueue(1)
    const boom = q.runBackground(() => {
      throw new Error('sync-boom')
    })
    await expect(boom).rejects.toThrow('sync-boom')
    await expect(q.runForeground(async () => 42)).resolves.toBe(42)
  })
})
