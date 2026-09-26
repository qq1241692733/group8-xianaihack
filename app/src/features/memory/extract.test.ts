import { describe, expect, it } from 'vitest'

import { extractTags, LEXICON } from './extract'

describe('extractTags', () => {
  it('「不想工作」→ 主题 工作', () => {
    const tags = extractTags({ kind: 'word', text: '今天突然不想工作。' })
    expect(tags.themes).toContain('工作')
  })

  it('「一个人」类词进 theme 独处', () => {
    expect(extractTags({ kind: 'word', text: '又是一个人。' }).themes).toContain('独处')
  })

  it('「站了一会儿」这类停顿进 emotion 停顿', () => {
    expect(extractTags({ kind: 'word', text: '在门口站了一会儿才进去。' }).emotions).toContain('停顿')
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
      clues: [],
    })
  })

  it('同一个标签不重复', () => {
    const tags = extractTags({ kind: 'word', text: '一个人，还是一个人，我一个人。' })
    expect(tags.themes.filter((theme) => theme === '独处')).toHaveLength(1)
  })

  it('词典里不含任何评价性 / 成就性词', () => {
    const keywords = LEXICON.flat().flatMap(([words]) => words)
    const forbidden = ['完成', '坚持', '进步', '加油', '连续', '成就', '目标', '第几天']
    for (const word of forbidden) {
      expect(keywords.some((keyword) => keyword.includes(word))).toBe(false)
    }
  })
})
