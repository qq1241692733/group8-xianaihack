import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderState = 'idle' | 'recording' | 'error'

export type Recording = { blob: Blob; durationMs: number }

/**
 * 真实录音：MediaRecorder → Blob，只留在本地。
 *
 * 拿不到麦克风（拒绝授权、非安全上下文、没有设备）时如实进入 'error'，
 * 由界面降级——演示现场不能因为一个权限弹窗就卡住。
 *
 * 生命周期用 session 计数器保护：getUserMedia 是异步的，而 React 在开发模式
 * 下会把 effect 跑两遍（挂载→清理→挂载）。没有这个计数器，第一遍的音频流会在
 * 第二遍生效后继续偷偷录下去。
 */
export function useRecorder() {
  const [state, setState] = useState<RecorderState>('idle')
  const [elapsedMs, setElapsedMs] = useState(0)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startedAtRef = useRef(0)
  const tickRef = useRef<number | undefined>(undefined)
  const sessionRef = useRef(0)

  const teardown = useCallback(() => {
    window.clearInterval(tickRef.current)
    tickRef.current = undefined
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  const start = useCallback(async () => {
    const session = ++sessionRef.current

    if (!navigator.mediaDevices?.getUserMedia) {
      setState('error')
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })

      // 这一路已经被取消了（组件卸载 / 又开了一次）
      if (session !== sessionRef.current) {
        stream.getTracks().forEach((track) => track.stop())
        return
      }

      const recorder = new MediaRecorder(stream)
      streamRef.current = stream
      recorderRef.current = recorder
      chunksRef.current = []

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data)
      }
      recorder.start()

      startedAtRef.current = Date.now()
      setElapsedMs(0)
      setState('recording')
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current)
      }, 200)
    } catch {
      if (session === sessionRef.current) setState('error')
    }
  }, [])

  /** 用户按下「停」：收下这段声音。 */
  const stop = useCallback((): Promise<Recording | null> => {
    return new Promise((resolve) => {
      const recorder = recorderRef.current
      const durationMs = Date.now() - startedAtRef.current

      if (!recorder || recorder.state === 'inactive') {
        teardown()
        setState('idle')
        resolve(null)
        return
      }

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        teardown()
        setState('idle')
        resolve({ blob, durationMs })
      }
      recorder.stop()
    })
  }, [teardown])

  /** 组件卸载 / 换视图：丢掉这一段，什么也不留。 */
  const cancel = useCallback(() => {
    sessionRef.current++
    const recorder = recorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null
      recorder.stop()
    }
    teardown()
    setState('idle')
  }, [teardown])

  useEffect(() => cancel, [cancel])

  return { state, elapsedMs, start, stop, cancel }
}
