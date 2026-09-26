import { describe, expect, it } from 'vitest'

import { parseComposerTags } from './store'

describe('parseComposerTags', () => {
  it('逗号、顿号、空格都算分隔，去重且保序', () => {
    expect(parseComposerTags('树, 白猫、落叶  树')).toEqual(['树', '白猫', '落叶'])
  })

  it('全空给空数组', () => {
    expect(parseComposerTags('   ')).toEqual([])
    expect(parseComposerTags(',,、')).toEqual([])
  })
})
