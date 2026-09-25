import { useCallback, useEffect, useRef, useState } from 'react'

import { useStore } from '@/app/store'
import { createId } from '@/lib/id'

import { askFreeText } from './freeText'

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
    store.aiAppend({ id: createId('m'), kind: 'me', text })
    setBusy(true)

    void askFreeText({ userText: text, entries: store.entries }).then((line) => {
      inFlight.current = false
      if (!alive.current) return
      setBusy(false)
      useStore.getState().aiAppend({ id: createId('m'), kind: 'ai', line })
    })
  }, [])

  return { busy, send }
}
