import { describe, expect, it } from 'vitest'

import { buildScript, type ScriptContext, type NodeId } from '@/data/script'

import { enqueueNode } from './queue'

const CTX: ScriptContext = {
  hesitateCount: 4,
  mentionCount: 7,
  memory: { stamp: '2026.08.17 21:40', meta: '那天你写下', caption: '“x”', mark: '✍️', sceneGradient: 'g' },
}

const script = buildScript(CTX)

function gaps(nodeId: NodeId, leadMs = 0): number[] {
  return enqueueNode(script[nodeId], CTX, leadMs).map((item) => item.gapMs)
}

function kinds(nodeId: NodeId): string[] {
  return enqueueNode(script[nodeId], CTX).map((item) => item.kind)
}

/**
 * 节奏逐值对齐参考稿 index_demo.html 的 setTimeout 链。
 * 参考稿把节奏藏在 `return delay + 1200` 里，读不出来也测不了；这里能断言。
 */
describe('enqueueNode 的节奏', () => {
  it('开场', () => {
    expect(gaps('opening')).toEqual([200, 1700, 1900, 520])
  })

  it('want', () => {
    expect(gaps('want')).toEqual([600, 1500, 1800, 1700, 520])
  })

  it('lost —— 记忆卡片插在第二句之后，占 520', () => {
    expect(gaps('lost')).toEqual([600, 1700, 520, 2180, 2100, 1700, 520])
  })

  it('quiet', () => {
    expect(gaps('quiet')).toEqual([700, 1700, 520])
  })

  it('sit —— 终局，没有选项也没有按钮', () => {
    expect(gaps('sit')).toEqual([600, 1600, 2000])
  })

  it('leadMs 只加在第一项上（点击选项后的 700ms 属于分支切换）', () => {
    expect(gaps('want', 700)).toEqual([1300, 1500, 1800, 1700, 520])
  })
})

describe('enqueueNode 落下的东西', () => {
  it('开场末尾是选项', () => {
    expect(kinds('opening')).toEqual(['ai', 'ai', 'ai', 'replies'])
  })

  it('want 末尾是「开始 3 分钟」按钮', () => {
    expect(kinds('want')).toEqual(['ai', 'ai', 'ai', 'ai', 'action'])
  })

  it('lost 有卡片，末尾也是按钮', () => {
    expect(kinds('lost')).toEqual(['ai', 'ai', 'card', 'ai', 'ai', 'ai', 'action'])
  })

  it('sit 只有台词', () => {
    expect(kinds('sit')).toEqual(['ai', 'ai', 'ai'])
  })

  it('没有检索到记忆时不产卡片', () => {
    const noMemory: ScriptContext = { ...CTX, memory: null }
    const node = buildScript(noMemory).lost
    expect(enqueueNode(node, noMemory).map((item) => item.kind)).not.toContain('card')
  })
})
