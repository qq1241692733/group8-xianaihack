import { describe, expect, it } from 'vitest'

import { buildScript, type SayPart, type ScriptContext } from './script'

const CTX: ScriptContext = {
  hesitateCount: 4,
  mentionCount: 7,
  memory: {
    stamp: '2026.08.17 21:40',
    meta: '那天你写下',
    caption: '“今天做得很少，但我不太想怪自己。”',
    mark: '✍️',
    sceneGradient: 'g',
  },
}

const script = buildScript(CTX)

function textOf(parts: SayPart[]): string {
  return parts.map((part) => (part.kind === 'break' ? '\n' : part.text)).join('')
}

describe('分支图', () => {
  it('开场三个选项依次去 want / lost / quiet', () => {
    expect(script.opening.replies.map((reply) => reply.go)).toEqual(['want', 'lost', 'quiet'])
  })

  it('quiet 的两个二级选项回到 want，或者去 sit', () => {
    expect(script.quiet.replies.map((reply) => reply.go)).toEqual(['want', 'sit'])
  })

  it('want 与 lost 收在「开始 3 分钟」上', () => {
    expect(script.want.action).toEqual({ kind: 'startFocus' })
    expect(script.lost.action).toEqual({ kind: 'startFocus' })
  })

  it('sit 是终局：没有选项也没有按钮', () => {
    expect(script.sit.action).toBeUndefined()
    expect(script.sit.replies).toHaveLength(0)
  })
})

describe('数字来自上下文，不是字面量', () => {
  it('开场第二句用真实的 hesitateCount 包在 <b> 里', () => {
    const strong = script.opening.lines[1].parts.find((part) => part.kind === 'strong')
    expect(strong).toEqual({ kind: 'strong', text: '4' })
    expect(script.opening.lines[1].note).toBe(true)
  })

  it('want 第二句用真实的 mentionCount', () => {
    const strong = script.want.lines[1].parts.find((part) => part.kind === 'strong')
    expect(strong).toEqual({ kind: 'strong', text: '7' })
  })

  it('context 换了，台词里的数也跟着换', () => {
    const other = buildScript({ ...CTX, hesitateCount: 2, mentionCount: 3 })
    expect(textOf(other.opening.lines[1].parts)).toContain('2')
    expect(textOf(other.want.lines[1].parts)).toContain('3')
  })

  it('数不出来时不印 0', () => {
    const zero = buildScript({ ...CTX, hesitateCount: 0 })
    const line = zero.opening.lines[1]
    expect(line.parts.some((part) => part.kind === 'strong')).toBe(false)
    expect(textOf(line.parts)).not.toContain('0')
  })
})

describe('记忆卡片', () => {
  it('lost 第二句带卡片，并且提到 8 月 17 日', () => {
    expect(script.lost.lines[1].card).toBe(true)
    expect(textOf(script.lost.lines[1].parts)).toContain('8 月 17 日')
  })

  it('没检索到记忆时不提那天，也不产卡片', () => {
    const noMemory = buildScript({ ...CTX, memory: null })
    const said = noMemory.lost.lines.map((line) => textOf(line.parts)).join('')

    expect(said).not.toContain('8 月 17 日')
    expect(noMemory.lost.lines.some((line) => line.card)).toBe(false)
  })
})

describe('换行与加粗是真元素，不是 HTML 字符串', () => {
  it('开场第三句用 break 分开，不是 <br/> 文本', () => {
    const parts = script.opening.lines[2].parts
    expect(parts.some((part) => part.kind === 'break')).toBe(true)
    expect(textOf(parts)).not.toContain('<br')
    expect(textOf(parts)).not.toContain('<b>')
  })
})
