import { describe, expect, it } from 'vitest'

import type { LlmResult } from './client'
import { buildDossierPrompt, candidateGroups, judgeGroup, membersOf, parseDossier } from './dossier'
import type { Entry, EntryTags } from '@/features/memory/types'

function tags(partial: Partial<EntryTags> = {}): EntryTags {
  return { scene: '', themes: [], emotions: [], people: [], places: [], clues: [], ...partial }
}

function entry(id: string, createdAt: number, over: Partial<Entry> = {}): Entry {
  const d = new Date(createdAt)
  return {
    id,
    kind: 'word',
    createdAt: d.getTime(),
    tags: tags(),
    tagSource: 'rule',
    ...over,
  }
}

const H = 3600 * 1000

describe('candidateGroups', () => {
  it('间隔超过阈值就切开，只留 ≥2 条的组', () => {
    const base = new Date('2026-09-27T10:00:00').getTime()
    const entries = [
      entry('a', base),
      entry('b', base + 1 * H),
      // 断 8 小时
      entry('c', base + 9 * H),
      entry('d', base + 9 * H + 20 * 60 * 1000),
      // 落单的一条（不成组）
      entry('e', base + 30 * H),
    ]

    const groups = candidateGroups(entries, 6 * H)
    expect(groups).toHaveLength(2)
    // 最近的组在前
    expect(groups[0]!.entries.map((x) => x.id)).toEqual(['c', 'd'])
    expect(groups[1]!.entries.map((x) => x.id)).toEqual(['a', 'b'])
    expect(groups[0]!.from).toBe(base + 9 * H)
    expect(groups[0]!.to).toBe(base + 9 * H + 20 * 60 * 1000)
  })

  it('没有够两条的组时返回空', () => {
    expect(candidateGroups([entry('a', 0), entry('b', 999 * H)], 6 * H)).toEqual([])
    expect(candidateGroups([], 6 * H)).toEqual([])
  })

  it('入参乱序也能按时间切', () => {
    const base = new Date('2026-09-27T10:00:00').getTime()
    const groups = candidateGroups([entry('b', base + H), entry('a', base)], 6 * H)
    expect(groups[0]!.entries.map((x) => x.id)).toEqual(['a', 'b'])
  })
})

describe('buildDossierPrompt', () => {
  it('写清事件优先，并授权模型说不值得', () => {
    const base = new Date('2026-09-27T10:00:00').getTime()
    const group = { entries: [entry('a', base), entry('b', base + H)], from: base, to: base + H }
    const prompt = buildDossierPrompt(group)

    expect(prompt).toContain('事件')
    expect(prompt).toContain('不值得')
    expect(prompt).toContain('JSON')
    expect(prompt).toContain('10:00')
    expect(prompt).toContain('2026.09.27')
    // 记录带序号，模型用它回填 members
    expect(prompt).toContain('[1]')
    expect(prompt).toContain('[2]')
    expect(prompt).toContain('members')
  })

  it('把描述与标签带进记录行', () => {
    const base = new Date('2026-09-27T11:20:00').getTime()
    const group = {
      entries: [
        entry('a', base, {
          kind: 'photo',
          tags: tags({ scene: '雾气中的木栈道', places: ['山上'], themes: ['出游'] }),
        }),
        entry('b', base + H, { kind: 'word', text: '累但风很舒服', tags: tags({ emotions: ['疲惫'] }) }),
      ],
      from: base,
      to: base + H,
    }
    const prompt = buildDossierPrompt(group)
    expect(prompt).toContain('雾气中的木栈道')
    expect(prompt).toContain('地点:山上')
    expect(prompt).toContain('原话：「累但风很舒服」')
    expect(prompt).toContain('情绪:疲惫')
  })
})

describe('parseDossier', () => {
  const valid = { worth: true, kind: 'event', title: '去爬山那天', note: '一句引子', members: [1, 2] }

  it('合法对象通过', () => {
    expect(parseDossier(valid)).toEqual(valid)
  })

  it('缺字段 → null（不替模型编）', () => {
    expect(parseDossier({ worth: true, kind: 'event', title: 'x' })).toBeNull()
    expect(parseDossier({ ...valid, members: undefined })).toBeNull()
  })

  it('kind 不在白名单 → null', () => {
    expect(parseDossier({ ...valid, kind: 'mood' })).toBeNull()
  })

  it('members 不是整数数组 → null', () => {
    expect(parseDossier({ ...valid, members: ['1'] })).toBeNull()
    expect(parseDossier({ ...valid, members: [1.5] })).toBeNull()
  })

  it('非对象 → null', () => {
    expect(parseDossier('nope')).toBeNull()
    expect(parseDossier(null)).toBeNull()
  })
})

describe('membersOf', () => {
  const entries = [entry('a', 0), entry('b', 1), entry('c', 2)]
  const group = { entries, from: 0, to: 2 }
  const verdict = (members: number[]) => ({
    worth: true,
    kind: 'event' as const,
    title: 'x',
    note: '',
    members,
  })

  it('把 1 起的序号翻回记录', () => {
    expect(membersOf(group, verdict([1, 3])).map((e) => e.id)).toEqual(['a', 'c'])
  })

  it('越界与重复都挡掉（边界由代码把控）', () => {
    expect(membersOf(group, verdict([2, 2, 9, 0, -1])).map((e) => e.id)).toEqual(['b'])
  })

  it('一条都没对上 → 回落到整组', () => {
    expect(membersOf(group, verdict([99])).map((e) => e.id)).toEqual(['a', 'b', 'c'])
    expect(membersOf(group, verdict([])).map((e) => e.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('judgeGroup', () => {
  const base = new Date('2026-09-27T10:00:00').getTime()
  const group = { entries: [entry('a', base), entry('b', base + H)], from: base, to: base + H }

  const askWith =
    (result: LlmResult) =>
    async (): Promise<LlmResult> =>
      result

  it('合法 JSON → 判定', async () => {
    const ask = askWith({
      ok: true,
      text: '{"worth":true,"kind":"mixed","title":"累但松快的一次爬山","note":"","members":[1,2]}',
    })
    const v = await judgeGroup(group, ask)
    expect(v?.kind).toBe('mixed')
    expect(v?.title).toBe('累但松快的一次爬山')
    expect(v?.members).toEqual([1, 2])
  })

  it('代码块包着也能抠出来', async () => {
    const ask = askWith({
      ok: true,
      text: '```json\n{"worth":false,"kind":"event","title":"","note":"","members":[]}\n```',
    })
    expect((await judgeGroup(group, ask))?.worth).toBe(false)
  })

  it('请求失败 / 不是 JSON → null', async () => {
    expect(await judgeGroup(group, askWith({ ok: false, reason: 'timeout' }))).toBeNull()
    expect(await judgeGroup(group, askWith({ ok: true, text: '这像是一次爬山。' }))).toBeNull()
  })
})
