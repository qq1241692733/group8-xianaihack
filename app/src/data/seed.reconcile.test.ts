import { beforeEach, describe, expect, it } from 'vitest'

import { countByTheme, countSince, entryNearestDate } from '@/features/memory/aggregate'
import { clearEntries, listEntries } from '@/features/memory/repo'

import { HESITATE_WINDOW_MS, MEMORY_TARGET, MEMORY_TOLERANCE_MS } from './script'
import { seedIfEmpty } from './seed'

/**
 * 对账回归测试。
 *
 * 剧本开场说的「过去 7 天有 4 次」「你已经提到这件事 7 次了」不再是字面量，
 * 而是从种子真实数出来的。这个文件的作用就是：谁动了种子的标签或时间，这里先红，
 * 而不是等演示现场说出一个假数字。
 */
describe('种子与剧本的数字对账', () => {
  beforeEach(async () => {
    await clearEntries()
  })

  it('「你已经提到这件事 7 次了」是真的 7', async () => {
    await seedIfEmpty()
    expect(countByTheme(await listEntries(), '独处')).toBe(7)
  })

  it('「过去 7 天有 4 次停下来待了一会儿」是真的 4', async () => {
    await seedIfEmpty()
    const entries = await listEntries()
    const anchor = Date.now()

    const hesitate = countSince(entries, anchor - HESITATE_WINDOW_MS, (entry) =>
      entry.tags.emotions.includes('停顿'),
    )
    expect(hesitate).toBe(4)
  })

  it('7 天窗口外的那一条不计入窗口，但计入总数', async () => {
    await seedIfEmpty()
    const entries = await listEntries()
    const anchor = Date.now()

    const aloneAllTime = countByTheme(entries, '独处')
    const aloneInWindow = countSince(entries, anchor - HESITATE_WINDOW_MS, (entry) =>
      entry.tags.themes.includes('独处'),
    )

    // 第 13 行（9 天前）在窗口外：所以「一共 7 次」与窗口内的 6 能同时成立。
    expect(aloneAllTime).toBe(7)
    expect(aloneInWindow).toBe(6)
  })

  it('8 月 17 日那条能被精确日期检索到', async () => {
    await seedIfEmpty()
    const found = entryNearestDate(await listEntries(), MEMORY_TARGET, MEMORY_TOLERANCE_MS)

    expect(found).toBeDefined()
    expect(found?.text).toBe('今天做得很少，但我不太想怪自己。')
  })
})
