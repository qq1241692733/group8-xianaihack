import { beforeEach, describe, expect, it } from 'vitest'

import { seedIfEmpty } from '@/data/seed'

import { addEntry, addMoment, clearEntries, countEntries, getBlob, listByKind, listEntries, updateEntryTags } from './repo'

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
    const entry = await addEntry({ kind: 'word', text: '今天又加班，在楼下站了一会儿才上去。' })
    expect(entry.tags.themes).toContain('工作')
    expect(entry.tags.emotions).toContain('停顿')
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

describe('采集侧元数据（EXIF / 视觉 / 哈希）', () => {
  it('相册来的照片用 EXIF 拍摄时间落进时间流，而不是上传的此刻', async () => {
    const takenAt = new Date('2023-06-01T10:00:00').getTime()
    const entry = await addEntry({
      kind: 'photo',
      createdAt: Date.now(),
      exif: { takenAt, gps: { lat: 39.9, lon: 116.4 } },
    })
    expect(entry.createdAt).toBe(takenAt)
    expect(entry.meta?.exif?.gps).toEqual({ lat: 39.9, lon: 116.4 })
  })

  it('元数据落进 meta，且不污染标签', async () => {
    const entry = await addEntry({
      kind: 'photo',
      visual: { brightness: 0.6, warmth: 0.2, saturation: 0.3 },
      imageHash: 'abcdef0123456789',
      source: 'camera',
    })
    expect(entry.meta?.hash).toBe('abcdef0123456789')
    expect(entry.meta?.source).toBe('camera')
    expect(entry.tags.themes).toEqual([])
  })

  it('没有任何采集信号时不写空的 meta', async () => {
    const entry = await addEntry({ kind: 'word', text: 'x' })
    expect(entry.meta).toBeUndefined()
  })

  it('updateEntryTags 回写标签与来源，不动别的字段', async () => {
    const entry = await addEntry({ kind: 'photo', imageHash: 'ffff' })
    const updated = await updateEntryTags(
      entry.id,
      { scene: '桌上的两个杯子', themes: [], emotions: [], people: [], places: [], clues: [] },
      'llm',
    )
    expect(updated?.tagSource).toBe('llm')
    expect(updated?.tags.scene).toBe('桌上的两个杯子')
    expect(updated?.meta?.hash).toBe('ffff')

    const back = (await listEntries())[0]
    expect(back?.tagSource).toBe('llm')
    expect(back?.tags.scene).toBe('桌上的两个杯子')
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

describe('记下此刻：一次落下的几条是一件事', () => {
  it('整组共享同一个 momentId', async () => {
    const entries = await addMoment([
      { kind: 'photo', imageHash: 'aa' },
      { kind: 'word', text: '风很舒服' },
      { kind: 'sound', durationMs: 3000 },
    ])

    expect(entries).toHaveLength(3)
    const ids = new Set(entries.map((entry) => entry.momentId))
    expect(ids.size).toBe(1)
    expect([...ids][0]).toMatch(/^mo_/)
  })

  it('每条各带各的东西：文字还在，blob 回读得到', async () => {
    const blob = new Blob(['一段声音'], { type: 'audio/webm' })
    const entries = await addMoment([
      { kind: 'photo', imageHash: 'bb' },
      { kind: 'word', text: '一句' },
      { kind: 'sound', blob, durationMs: 2000 },
    ])

    expect(entries.find((e) => e.kind === 'word')?.text).toBe('一句')

    const sound = entries.find((e) => e.kind === 'sound')
    const ref = sound?.blobRef
    if (!ref) throw new Error('带 blob 的那条应该有 blobRef')
    expect(await (await getBlob(ref))?.text()).toBe('一段声音')

    expect(entries.find((e) => e.kind === 'photo')?.blobRef).toBeUndefined()
  })

  it('整组都进了库', async () => {
    await addMoment([
      { kind: 'word', text: 'a' },
      { kind: 'word', text: 'b' },
    ])
    expect(await countEntries()).toBe(2)
  })

  it('单独留下的一条没有 momentId', async () => {
    const entry = await addEntry({ kind: 'word', text: 'x' })
    expect(entry.momentId).toBeUndefined()
  })

  it('每一组是独立的：两次落下拿到两个不同的 momentId', async () => {
    const first = await addMoment([{ kind: 'word', text: 'a' }])
    const second = await addMoment([{ kind: 'word', text: 'b' }])
    expect(first[0]?.momentId).not.toBe(second[0]?.momentId)
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
