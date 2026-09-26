import { useCallback, useEffect, useRef, useState } from 'react'

import { useStore } from '@/app/store'
import { createId } from '@/lib/id'

import { askFreeText } from './freeText'
import { isOrganizeAsk } from './volumeIntent'

/**
 * 自由输入那一路的发送。
 *
 * 放在 hook 而不是 store action：请求要能随组件卸载取消。store action 起头就回不来，
 * 组件没了它还会往记录里写字。而且 store 目前只依赖记忆层，塞进在途网络请求会把它
 * 和 features/agent 绑死。
 */
export function useFreeText(): { busy: boolean; send: (raw: string) => void } {
  const [busy, setBusy] = useState(false)
  const alive = useRef(true)
  const inFlight = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  const send = useCallback((raw: string) => {
    const text = raw.trim()
    // 用 ref 而不是 busy：两次极快的连点在重渲染之前都读到 busy=false。
    if (!text || inFlight.current) return
    inFlight.current = true

    const store = useStore.getState()

    // 本地意图路由先判（docs/23 §三）：整理 / 查询已有册是确定性的，不需要 LLM。
    // 命中时它负责整条回执（含用户那句话本身）。
    if (store.aiVolumesFree(text)) {
      inFlight.current = false
      return
    }

    // 用户这句话先落进对话流。
    store.aiAppend({ id: createId('m'), kind: 'me', text })
    setBusy(true)

    const fallback = async () => {
      const line = await askFreeText({ userText: text, entries: useStore.getState().entries })
      if (!alive.current) return
      setBusy(false)
      useStore.getState().aiAppend({ id: createId('m'), kind: 'ai', line })
    }

    // 「整理」意图、且本地没命中已有册 → 让模型判一个候选组能不能拢出新的一册
    // （两步成册，docs/23 §四）。命中就它负责回执，否则照旧走自由输入。
    const run = isOrganizeAsk(text)
      ? store.aiDossier().then((handled) => (handled ? setBusy(false) : fallback()))
      : fallback()

    void run.finally(() => {
      inFlight.current = false
    })
  }, [])

  return { busy, send }
}
