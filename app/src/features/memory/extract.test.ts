import { describe, expect, it } from 'vitest'

import { extractTags, LEXICON } from './extract'

describe('extractTags', () => {
  it('「不想工作」→ 主题 工作 + 情绪 逃避', () => {
    const tags = extractTags({ kind: 'word', text: '今天突然不想工作。' })
    expect(tags.themes).toContain('工作')
    expect(tags.emotions).toContain('逃避')
  })

  it('项目类词进 theme 项目', () => {
    const tags = extractTags({ kind: 'word', text: '方案还是没动，文档也没写。' })
    expect(tags.themes).toContain('项目')
  })

  it('sceneHint 落到 scene', () => {
    expect(extractTags({ kind: 'photo', sceneHint: '窗外' }).scene).toBe('窗外')
  })

  it('没有 sceneHint 时退回地点名词，不编句子', () => {
    expect(extractTags({ kind: 'word', text: '在家躺着。' }).scene).toBe('家')
  })

  it('什么都匹配不到时是空标签，不抛错', () => {
    expect(extractTags({ kind: 'word', text: 'zzz' })).toEqual({
      scene: '',
      themes: [],
      emotions: [],
      people: [],
      places: [],
    })
  })

  it('同一个标签不重复', () => {
    const tags = extractTags({ kind: 'word', text: '项目方案文档，全是项目。' })
    expect(tags.themes.filter((theme) => theme === '项目')).toHaveLength(1)
  })

  it('词典里不含任何评价性 / 成就性词', () => {
    const keywords = LEXICON.flat().flatMap(([words]) => words)
    const forbidden = ['完成', '坚持', '进步', '加油', '连续', '成就', '目标', '第几天']
    for (const word of forbidden) {
      expect(keywords.some((keyword) => keyword.includes(word))).toBe(false)
    }
  })
})
