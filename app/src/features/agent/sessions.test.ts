import { beforeEach, describe, expect, it } from 'vitest'

import { t } from '@/data/script'

import type { AiMessage } from './types'
import {
  MAX_SESSIONS,
  loadSessions,
  saveSessions,
  sessionTitle,
  sortSessions,
  toSession,
} from './sessions'

/** node 测试环境没有 DOM，装一个够用的假 localStorage。 */
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

beforeEach(() => {
  ;(globalThis as { localStorage?: Storage }).localStorage = fakeStorage()
})

const me = (text: string): AiMessage => ({ id: 'm', kind: 'me', text })
const ai = (text: string): AiMessage => ({ id: 'a', kind: 'ai', line: { parts: [t(text)], atMs: 0 } })

describe('会话标题', () => {
  it('取第一句你说的话', () => {
    expect(sessionTitle([me('我留意过哪些声音？'), ai('替你找到了这些。')])).toBe('我留意过哪些声音？')
  })

  it('太长就截断', () => {
    const long = '一二三四五六七八九十一二三四五六七八九十二三'
    expect(sessionTitle([me(long)])).toBe('一二三四五六七八九十一二三四五六七八…')
  })

  it('你没说话时退到它说的第一句', () => {
    expect(sessionTitle([ai('替你找到了这些。')])).toBe('替你找到了这些。')
  })

  it('一句都没有时给一句诚实的话', () => {
    expect(sessionTitle([])).toBe('没有出声的一段')
  })
})

describe('落地与读取', () => {
  it('存进去，读回来还在', () => {
    const session = toSession([me('找找树')])
    saveSessions([session])

    const back = loadSessions()
    expect(back).toHaveLength(1)
    expect(back[0]?.title).toBe('找找树')
    expect(back[0]?.messages).toHaveLength(1)
  })

  it('超过上限丢最旧的（列表已按最近更新排好）', () => {
    const many = Array.from({ length: MAX_SESSIONS + 5 }, (_, i) =>
      toSession([me(`第 ${i} 段`)]),
    )
    saveSessions(many)
    const back = loadSessions()
    expect(back).toHaveLength(MAX_SESSIONS)
    expect(back[0]?.title).toBe('第 0 段')
  })

  it('坏 JSON 不炸，返回空', () => {
    ;(globalThis as { localStorage?: Storage }).localStorage!.setItem('cike:sessions', '{ 不是数组')
    expect(loadSessions()).toEqual([])
  })

  it('没有 id / messages 的条目被丢掉', () => {
    ;(globalThis as { localStorage?: Storage }).localStorage!.setItem(
      'cike:sessions',
      JSON.stringify([{ id: 'ok', messages: [] }, { messages: [] }, { id: 'no-messages' }, null]),
    )
    expect(loadSessions().map((s) => s.id)).toEqual(['ok'])
  })

  it('存储不可用时不抛', () => {
    ;(globalThis as { localStorage?: Storage }).localStorage = undefined
    expect(() => saveSessions([toSession([me('x')])])).not.toThrow()
    expect(loadSessions()).toEqual([])
  })
})

describe('排序', () => {
  it('最近更新的一段在最前', () => {
    const a = { ...toSession([me('早')]), updatedAt: 100 }
    const b = { ...toSession([me('晚')]), updatedAt: 300 }
    const c = { ...toSession([me('中')]), updatedAt: 200 }
    expect(sortSessions([a, b, c]).map((s) => s.title)).toEqual(['晚', '中', '早'])
  })
})
