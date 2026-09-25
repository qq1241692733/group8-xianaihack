import { describe, expect, it } from 'vitest'

import { parseLlmTags } from './tags.schema'

const VALID = {
  scene: '窗外的雨',
  themes: ['休息'],
  emotions: ['平静'],
  people: [],
  places: ['家'],
}

describe('parseLlmTags', () => {
  it('合法 JSON 解析成 EntryTags', () => {
    expect(parseLlmTags(VALID)).toEqual(VALID)
  })

  it('字段缺失判失败——不替模型补空数组', () => {
    const missing = {
      scene: VALID.scene,
      themes: VALID.themes,
      emotions: VALID.emotions,
      people: VALID.people,
    }
    expect(parseLlmTags(missing)).toBeNull()
  })

  it('字段类型错判失败', () => {
    expect(parseLlmTags({ ...VALID, themes: '休息' })).toBeNull()
  })

  it('多余字段被剥离', () => {
    const parsed = parseLlmTags({ ...VALID, confidence: 0.9 })
    expect(parsed).toEqual(VALID)
    expect(parsed && 'confidence' in parsed).toBe(false)
  })

  it('非对象判失败', () => {
    expect(parseLlmTags('nope')).toBeNull()
    expect(parseLlmTags(null)).toBeNull()
    expect(parseLlmTags(undefined)).toBeNull()
  })
})
