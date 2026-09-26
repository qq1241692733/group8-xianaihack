import { describe, expect, it } from 'vitest'

import { LEXICON } from './extract'
import { splitKnown, VOCAB, type VocabDim } from './vocabulary'

describe('受控词表', () => {
  it('规则词典产出的标签必须落在词表里（否则本地判据比不中）', () => {
    const rulesByWord: Array<[readonly (readonly [readonly string[], string])[], VocabDim]> = [
      [LEXICON[0]!, 'themes'],
      [LEXICON[1]!, 'emotions'],
      [LEXICON[3]!, 'people'],
      [LEXICON[2]!, 'places'],
    ]

    for (const [rules, dim] of rulesByWord) {
      const allowed = new Set(VOCAB[dim])
      for (const [, tag] of rules) {
        expect(allowed.has(tag), `${dim} 里的「${tag}」不在词表`).toBe(true)
      }
    }
  })

  it('判据用到的主题/地点都在词表里', () => {
    // DISCOVERY_DEFS 认的是 '独处'、'出游'、'家'——它们必须真的在词表里。
    expect(VOCAB.themes).toContain('独处')
    expect(VOCAB.themes).toContain('出游')
    expect(VOCAB.places).toContain('家')
    expect(VOCAB.places).toContain('山上')
    expect(VOCAB.people).toContain('孩子')
  })
})

describe('splitKnown', () => {
  it('表内的进 kept，表外的进 dropped —— 不是丢掉，是换个地方留', () => {
    expect(splitKnown('themes', ['独处', '自然风光', '出游'])).toEqual({
      kept: ['独处', '出游'],
      dropped: ['自然风光'],
    })
  })

  it('两边都去重且保持顺序', () => {
    expect(splitKnown('emotions', ['平静', '平静', '轻松', '宁静'])).toEqual({
      kept: ['平静', '轻松'],
      dropped: ['宁静'],
    })
  })

  it('全都不认识：kept 空，dropped 全收 —— 一个都不许丢', () => {
    expect(splitKnown('places', ['火星', '月球'])).toEqual({ kept: [], dropped: ['火星', '月球'] })
  })
})
