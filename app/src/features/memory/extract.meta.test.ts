import { describe, expect, it } from 'vitest'

import { deriveLocalTags, extractTags, sceneFromFeatures } from './extract'

describe('用户自己写的线索', () => {
  it('「记录此刻」里那行标签进 tags.clues —— 与 LLM 认出的同一个字段', () => {
    const tags = deriveLocalTags({ kind: 'word', text: '今天路过那棵树。', clues: ['树', '白猫'] })
    expect(tags.clues).toEqual(['树', '白猫'])
  })

  it('去空白、去重', () => {
    const tags = deriveLocalTags({ kind: 'word', text: 'x', clues: [' 树 ', '', '树'] })
    expect(tags.clues).toEqual(['树'])
  })

  it('没写标签时就是空数组', () => {
    expect(deriveLocalTags({ kind: 'word', text: 'x' }).clues).toEqual([])
  })
})

describe('sceneFromFeatures', () => {
  it('时段 + 色温 + 明暗拼成一句中性的画面描述', () => {
    // 夜里（23 点）+ 偏暖 + 亮 → 夜里的暖光
    expect(sceneFromFeatures({ brightness: 0.6, warmth: 0.2, saturation: 0.3 }, 23)).toBe('夜里的暖光')
    // 清晨（7 点）+ 偏冷 → 清晨的冷光
    expect(sceneFromFeatures({ brightness: 0.6, warmth: -0.2, saturation: 0.3 }, 7)).toBe('清晨的冷光')
    // 白天（12 点）+ 中性 + 暗 → 白天的暗光
    expect(sceneFromFeatures({ brightness: 0.2, warmth: 0, saturation: 0.3 }, 12)).toBe('白天的暗光')
  })

  it('只产出 scene，绝不借着像素猜心情', () => {
    // 这是纪律测试：从亮度推不出「平静」，推了就是撒谎。
    const scene = sceneFromFeatures({ brightness: 0.5, warmth: 0, saturation: 0.3 }, 12)
    for (const word of ['平静', '焦虑', '疲惫', '轻松', '独处', '工作']) {
      expect(scene).not.toContain(word)
    }
  })
})

describe('deriveLocalTags', () => {
  it('没有视觉特征时，结果与规则层完全一致', () => {
    const draft = { kind: 'word' as const, text: '今天又加班。' }
    expect(deriveLocalTags(draft)).toEqual(extractTags(draft))
  })

  it('照片带视觉特征时，用重出来的 scene 覆盖采集时的通用线索', () => {
    // 相机路径的 sceneHint 是常量「窗外」，不比重出来的准。
    const tags = deriveLocalTags({
      kind: 'photo',
      sceneHint: '窗外',
      visual: { brightness: 0.6, warmth: 0.2, saturation: 0.3 },
      createdAt: new Date('2026-09-27T23:30:00').getTime(),
    })
    expect(tags.scene).toBe('夜里的暖光')
  })

  it('视觉特征只动 scene，不产生任何主题/情绪标签', () => {
    const tags = deriveLocalTags({
      kind: 'photo',
      visual: { brightness: 0.1, warmth: 0, saturation: 0.2 },
    })
    expect(tags.themes).toEqual([])
    expect(tags.emotions).toEqual([])
    expect(tags.people).toEqual([])
    expect(tags.places).toEqual([])
  })
})
