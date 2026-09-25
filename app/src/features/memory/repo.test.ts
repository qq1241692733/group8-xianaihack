import { beforeEach, describe, expect, it } from 'vitest'

import { seedIfEmpty } from '@/data/seed'

import { addEntry, clearEntries, countEntries, getBlob, listByKind, listEntries } from './repo'

beforeEach(async () => {
  await clearEntries()
})

describe('记忆层', () => {
  it('写入一条，读回来还在', async () => {
    const written = await addEntry({ kind: 'word', text: '今天突然不想工作。' })

    const all = await listEntries()
    expect(all).toHaveLength(1)
    expect(all[0]?.id).toBe(written.id)
    expect(all[0]?.text).toBe('今天突然不想工作。')
  })

  it('原音原图进 blobs 表，Entry 只留一个引用，保持轻量', async () => {
    const blob = new Blob(['假装这是一段音频'], { type: 'audio/webm' })
    const entry = await addEntry({ kind: 'sound', blob, durationMs: 3000 })

    expect(Object.keys(entry)).not.toContain('blob')
    const ref = entry.blobRef
    expect(ref).toBeDefined()
    if (!ref) throw new Error('写入带 blob 的条目后应该有 blobRef')

    const back = await getBlob(ref)
    expect(await back?.text()).toBe('假装这是一段音频')
    expect(back?.type).toBe('audio/webm')
  })

  it('按类型过滤不会混进别的类型', async () => {
    await addEntry({ kind: 'word', text: 'a' })
    await addEntry({ kind: 'sound', durationMs: 1000 })
    await addEntry({ kind: 'word', text: 'b' })

    const words = await listByKind('word')
    expect(words).toHaveLength(2)
    expect(words.every((entry) => entry.kind === 'word')).toBe(true)
  })

  it('时间流严格按时间倒序——这是它唯一能排的键', async () => {
    await addEntry({ kind: 'word', text: '早', createdAt: 1_000 })
    await addEntry({ kind: 'word', text: '晚', createdAt: 2_000 })

    expect((await listEntries()).map((entry) => entry.text)).toEqual(['晚', '早'])
  })

  it('清空之后是空的', async () => {
    await addEntry({ kind: 'word', text: 'x' })
    expect(await countEntries()).toBe(1)

    await clearEntries()
    expect(await countEntries()).toBe(0)
    expect(await listEntries()).toEqual([])
  })
})

describe('写入时提取标签', () => {
  it('一句话在写入那一刻就被切成主题与情绪', async () => {
    const entry = await addEntry({ kind: 'word', text: '今天突然不想工作。' })
    expect(entry.tags.themes).toContain('工作')
    expect(entry.tags.emotions).toContain('逃避')
  })

  it('采集时的现场线索落进 scene（原来是被丢掉的）', async () => {
    const entry = await addEntry({ kind: 'photo', sceneHint: '窗外' })
    expect(entry.tags.scene).toBe('窗外')
  })

  it('标签如实标成 rule，绝不冒充 llm', async () => {
    const entry = await addEntry({ kind: 'word', text: 'x' })
    expect(entry.tagSource).toBe('rule')
  })
})

describe('把「无用」写进 schema', () => {
  it('Entry 上不存在任何可用于「有用」的字段', async () => {
    const entry = await addEntry({ kind: 'word', text: 'x' })

    const forbidden = [
      'streak',
      'completionRate',
      'dailyGoal',
      'done',
      'completed',
      'status',
      'score',
      'progress',
      'count',
    ]
    expect(Object.keys(entry).filter((key) => forbidden.includes(key))).toEqual([])
  })

  it('写入不会产生任何计数：加两条，也只是两条', async () => {
    await addEntry({ kind: 'word', text: 'a' })
    await addEntry({ kind: 'word', text: 'b' })

    const all = await listEntries()
    expect(all).toHaveLength(2)
    for (const entry of all) {
      expect(Object.keys(entry).filter((key) => /count|total|streak/i.test(key))).toEqual([])
    }
  })
})

describe('种子数据', () => {
  it('只在空库时灌一次，重复调用不会叠加', async () => {
    await seedIfEmpty()
    const afterFirst = await countEntries()
    expect(afterFirst).toBeGreaterThan(0)

    await seedIfEmpty()
    expect(await countEntries()).toBe(afterFirst)
  })

  it('库里已经有东西时，一条都不灌', async () => {
    await addEntry({ kind: 'word', text: '我自己留的' })
    await seedIfEmpty()

    const all = await listEntries()
    expect(all).toHaveLength(1)
    expect(all[0]?.text).toBe('我自己留的')
  })

  it('并发灌种子也只灌一遍——StrictMode 下 hydrate 会跑两次', async () => {
    await seedIfEmpty()
    const baseline = await countEntries()
    expect(baseline).toBeGreaterThan(0)

    await clearEntries()
    await Promise.all([seedIfEmpty(), seedIfEmpty()])

    expect(await countEntries()).toBe(baseline)
  })
})
