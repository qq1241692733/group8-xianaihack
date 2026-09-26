import { beforeEach, describe, expect, it } from 'vitest'

import { t } from '@/data/script'
import type { AiMessage } from '@/features/agent/types'

import { useStore } from './store'

function fakeStorage() {
  const map = new Map<string, string>()
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    removeItem: (key: string) => void map.delete(key),
    clear: () => map.clear(),
    key: () => null,
    get length() {
      return map.size
    },
  } as unknown as Storage
}

const me = (text: string): AiMessage => ({ id: `me-${text}`, kind: 'me', text })
const ai = (text: string): AiMessage => ({ id: `ai-${text}`, kind: 'ai', line: { parts: [t(text)], atMs: 0 } })

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = fakeStorage()
  useStore.setState({ aiMessages: [], aiQueue: [], sessions: [], sessionId: null })
})

/**
 * 会话的归档/换载（features/agent/sessions.ts 的模型在 store 上的落地）。
 *
 * 一句话不变式：**当前这段永远不在 sessions 里**——它只有被换下时才归档。
 */
describe('对话会话', () => {
  it('新增对话：当前这段归档，画布清空', () => {
    useStore.setState({ aiMessages: [me('我留意过哪些声音？'), ai('替你找到了这些。')] })
    useStore.getState().newSession()

    const s = useStore.getState()
    expect(s.aiMessages).toEqual([])
    expect(s.sessions).toHaveLength(1)
    expect(s.sessions[0]?.title).toBe('我留意过哪些声音？')
  })

  it('空的一段不归档', () => {
    useStore.getState().newSession()
    expect(useStore.getState().sessions).toHaveLength(0)
  })

  it('待浮现的队列也一起清掉', () => {
    useStore.setState({
      aiMessages: [me('上山')],
      aiQueue: [{ kind: 'ai', line: { parts: [t('替你拢了拢。')], atMs: 0 }, gapMs: 0 }],
    })
    useStore.getState().newSession()
    expect(useStore.getState().aiQueue).toEqual([])
  })

  it('打开历史里的一段：先把当前归档，再把那段灌回来', () => {
    useStore.setState({ aiMessages: [ai('替你找到了这些。')] })
    useStore.getState().newSession()
    const archivedId = useStore.getState().sessions[0]?.id
    if (!archivedId) throw new Error('应该归档出这一段')

    useStore.setState({ aiMessages: [me('再来一段')] })
    useStore.getState().openSession(archivedId)

    const s = useStore.getState()
    expect(s.sessionId).toBe(archivedId)
    expect(s.aiMessages).toHaveLength(1)
    expect(s.aiMessages[0]?.kind).toBe('ai')
    // 换下来的那段也进了历史，没有凭空消失
    expect(s.sessions.map((x) => x.title)).toContain('再来一段')
  })

  it('删除一段历史', () => {
    useStore.setState({ aiMessages: [me('要删的')] })
    useStore.getState().newSession()
    const id = useStore.getState().sessions[0]?.id
    if (!id) throw new Error('应该归档出这一段')

    useStore.getState().removeSession(id)
    expect(useStore.getState().sessions).toHaveLength(0)
  })

  it('归档写进了 localStorage（刷新后还在）', () => {
    useStore.setState({ aiMessages: [me('留下的')] })
    useStore.getState().newSession()

    const raw = (globalThis as { localStorage?: Storage }).localStorage?.getItem('cike:sessions')
    expect(raw).toBeTruthy()
    expect(raw).toContain('留下的')
  })
})
