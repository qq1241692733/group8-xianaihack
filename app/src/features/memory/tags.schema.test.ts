import { describe, expect, it } from 'vitest'

import { parseLlmTags } from './tags.schema'

const VALID = {
  scene: '窗外的雨',
  themes: ['休息'],
  emotions: ['平静'],
  people: [],
  places: ['家'],
  clues: [],
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

  it('词表外的标签从维度里剔掉——本地判据比不中它们', () => {
    const parsed = parseLlmTags({
      ...VALID,
      themes: ['休息', '自然风光', '排队'],
      places: ['家', '山间栈道'],
    })
    expect(parsed?.themes).toEqual(['休息'])
    expect(parsed?.places).toEqual(['家'])
  })

  it('但剔掉的词**不丢**，捞进线索——它们才是长跨度合集的抓手', () => {
    const parsed = parseLlmTags({
      ...VALID,
      themes: ['休息', '自然风光', '排队'],
      places: ['家', '山间栈道'],
    })
    expect(parsed?.clues).toEqual(['自然风光', '排队', '山间栈道'])
  })

  it('模型自己给的线索排在前面，捞回来的跟在后面', () => {
    const parsed = parseLlmTags({
      ...VALID,
      clues: ['马克杯', '茶渍'],
      themes: ['休息', '自然风光'],
    })
    expect(parsed?.clues).toEqual(['马克杯', '茶渍', '自然风光'])
  })

  it('clues 可以缺——「没有额外线索」不是「没答上来」', () => {
    const withoutClues = {
      scene: VALID.scene,
      themes: VALID.themes,
      emotions: VALID.emotions,
      people: VALID.people,
      places: VALID.places,
    }
    const parsed = parseLlmTags(withoutClues)
    expect(parsed).not.toBeNull()
    expect(parsed?.clues).toEqual([])
  })

  it('线索被清洗：去空白、去重、丢过长的', () => {
    const parsed = parseLlmTags({
      ...VALID,
      clues: ['  缆车  ', '缆车', '', '这一条实在是太长了根本不能算作一条线索', '台阶'],
    })
    expect(parsed?.clues).toEqual(['缆车', '台阶'])
  })

  it('scene 是自由描述，不设限', () => {
    const scene = '蓝天白云下的盘山公路，路旁有木质凉亭'
    expect(parseLlmTags({ ...VALID, scene })?.scene).toBe(scene)
  })
})
