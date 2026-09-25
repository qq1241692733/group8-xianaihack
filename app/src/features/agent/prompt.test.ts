import { describe, expect, it } from 'vitest'

import { FALLBACK_LISTEN } from '@/data/script'
import { createEmptyTags, type Entry } from '@/features/memory/types'

import { askFreeText } from './freeText'
import { buildFreeTextPrompt, lineFromText, sanitizeReply, VOICE_RULES } from './prompt'

function make(patch: Partial<Entry>): Entry {
  return { id: 't', kind: 'word', createdAt: 0, tags: createEmptyTags(), tagSource: 'rule', ...patch }
}

const ENTRIES = [
  make({
    text: '我又在逃避了。',
    tags: { ...createEmptyTags(), themes: ['项目'], emotions: ['逃避'] },
  }),
]

describe('buildFreeTextPrompt', () => {
  const prompt = buildFreeTextPrompt({ userText: '我不知道要不要继续。', entries: ENTRIES })

  it('带上语气规则', () => {
    expect(prompt).toContain(VOICE_RULES)
  })

  it('带上用户原话', () => {
    expect(prompt).toContain('我不知道要不要继续。')
  })

  it('带上记忆摘要的计数与最近几条', () => {
    expect(prompt).toContain('项目 1')
    expect(prompt).toContain('逃避 1')
    expect(prompt).toContain('我又在逃避了。')
  })

  it('库里为空时不崩，并如实说还没有', () => {
    expect(buildFreeTextPrompt({ userText: 'x', entries: [] })).toContain('（还没有）')
  })

  it('规则里明确禁止评价与鼓励', () => {
    expect(VOICE_RULES).toContain('不评价')
    expect(VOICE_RULES).toContain('加油')
  })
})

describe('sanitizeReply', () => {
  it('去掉包裹的引号', () => {
    expect(sanitizeReply('「嗯。」')).toBe('嗯。')
    expect(sanitizeReply('"好"')).toBe('好')
  })

  it('折平空白与换行', () => {
    expect(sanitizeReply('  嗯。\n\n  我在这里。 ')).toBe('嗯。 我在这里。')
  })

  it('限长', () => {
    expect(sanitizeReply('啊'.repeat(200)).length).toBeLessThanOrEqual(61)
  })
})

describe('askFreeText', () => {
  it('失败时回落到同一句中性话——不假装答过', async () => {
    const result = await askFreeText({ userText: 'x', entries: [] }, async () => ({
      ok: false,
      reason: 'no-key',
    }))
    expect(result).toBe(FALLBACK_LISTEN)
  })

  it('成功时用清洗后的话', async () => {
    const result = await askFreeText({ userText: 'x', entries: [] }, async () => ({
      ok: true,
      text: '「嗯。」',
    }))
    expect(result).toEqual(lineFromText('嗯。'))
  })

  it('答空也回落', async () => {
    const result = await askFreeText({ userText: 'x', entries: [] }, async () => ({
      ok: true,
      text: '   ',
    }))
    expect(result).toBe(FALLBACK_LISTEN)
  })
})
