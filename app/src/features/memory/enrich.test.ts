import { describe, expect, it } from 'vitest'

import type { LlmResult } from '@/features/agent/client'

import { buildVisionPrompt, enrichPhotoTags, mergeLlmTags } from './enrich'
import type { EntryTags } from './types'

function tags(partial: Partial<EntryTags> = {}): EntryTags {
  return { scene: '', themes: [], emotions: [], people: [], places: [], clues: [], ...partial }
}

const askReturning =
  (result: LlmResult) =>
  async (): Promise<LlmResult> =>
    result

describe('mergeLlmTags', () => {
  it('scene 用 LLM 的（它真看过画面）', () => {
    const merged = mergeLlmTags(tags({ scene: '夜里的暖光' }), tags({ scene: '桌上的两个杯子' }))
    expect(merged.scene).toBe('桌上的两个杯子')
  })

  it('LLM 没给 scene 就保留本地那句', () => {
    const merged = mergeLlmTags(tags({ scene: '夜里的暖光' }), tags({ scene: '  ' }))
    expect(merged.scene).toBe('夜里的暖光')
  })

  it('四个数组做并集去重，本地不丢', () => {
    const merged = mergeLlmTags(
      tags({ themes: ['独处'], places: ['家'] }),
      tags({ themes: ['独处', '出游'], places: ['山上'] }),
    )
    expect(merged.themes).toEqual(['独处', '出游'])
    expect(merged.places).toEqual(['家', '山上'])
  })

  it('线索也做并集——本地与模型看到的具体东西都要留住', () => {
    const merged = mergeLlmTags(tags({ clues: ['雨伞'] }), tags({ clues: ['雨伞', '马克杯'] }))
    expect(merged.clues).toEqual(['雨伞', '马克杯'])
  })
})

describe('buildVisionPrompt', () => {
  it('含不幻觉的硬约束（不猜关系、不评价）', () => {
    const prompt = buildVisionPrompt()
    expect(prompt).toContain('不猜')
    expect(prompt).toContain('不评价')
    expect(prompt).toContain('JSON')
  })

  it('四个归类字段列出词表，且明说不要造词', () => {
    const prompt = buildVisionPrompt()
    expect(prompt).toContain('不要自己造词')
    expect(prompt).toContain('出游')
    expect(prompt).toContain('平静')
    expect(prompt).toContain('山上')
  })

  it('要线索，且明说线索不受词表限制、宁可多写', () => {
    const prompt = buildVisionPrompt()
    expect(prompt).toContain('clues')
    expect(prompt).toContain('不受任何词表限制')
    expect(prompt).toContain('宁可多写')
  })

  it('要写具体，不是「拿不准就少写」——认识只有那一次机会', () => {
    const prompt = buildVisionPrompt()
    expect(prompt).toContain('写具体')
    expect(prompt).not.toContain('拿不准就少写')
  })
})

describe('enrichPhotoTags', () => {
  const local = tags({ scene: '夜里的暖光' })

  it('合法 JSON → 解出标签', async () => {
    const ask = askReturning({
      ok: true,
      text: '{"scene":"桌上的两个杯子","themes":[],"emotions":[],"people":[],"places":[]}',
    })
    const out = await enrichPhotoTags({ dataUrl: 'data:image/jpeg;base64,x', local }, ask)
    expect(out?.scene).toBe('桌上的两个杯子')
  })

  it('包在代码块里也能抠出来', async () => {
    const ask = askReturning({
      ok: true,
      text: '```json\n{"scene":"窗外在下雨","themes":[],"emotions":[],"people":[],"places":[]}\n```',
    })
    const out = await enrichPhotoTags({ dataUrl: 'x', local }, ask)
    expect(out?.scene).toBe('窗外在下雨')
  })

  it('缺字段（模型没答全）→ null，走回落', async () => {
    const ask = askReturning({ ok: true, text: '{"scene":"只有这个字段"}' })
    expect(await enrichPhotoTags({ dataUrl: 'x', local }, ask)).toBeNull()
  })

  it('返回不是 JSON → null', async () => {
    const ask = askReturning({ ok: true, text: '我看不清这张图。' })
    expect(await enrichPhotoTags({ dataUrl: 'x', local }, ask)).toBeNull()
  })

  it('请求失败 → null（本地标签保留，不假装 LLM 看过）', async () => {
    const ask = askReturning({ ok: false, reason: 'timeout' })
    expect(await enrichPhotoTags({ dataUrl: 'x', local }, ask)).toBeNull()
  })
})
