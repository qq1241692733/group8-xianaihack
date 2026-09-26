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
  /* 真实音量：AnalyserNode 从同一条流上分出来。「听见」那一屏的圆环由它驱动，
   * 而不是一段假装在起伏的正弦 —— 屏幕上的东西必须是真发生的。 */
  const audioCtxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)

  const teardown = useCallback(() => {
    window.clearInterval(tickRef.current)
    tickRef.current = undefined
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    recorderRef.current = null
    analyserRef.current = null
    void audioCtxRef.current?.close().catch(() => undefined)
    audioCtxRef.current = null
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

      // 音量分析：拿不到 WebAudio 就退化成一段静态的圆环，录音本身不受影响。
      try {
        const Ctx =
          window.AudioContext ??
          (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (Ctx) {
          const ctx = new Ctx()
          const analyser = ctx.createAnalyser()
          analyser.fftSize = 256
          analyser.smoothingTimeConstant = 0.72
          ctx.createMediaStreamSource(stream).connect(analyser)
          audioCtxRef.current = ctx
          analyserRef.current = analyser
        }
      } catch {
        audioCtxRef.current = null
        analyserRef.current = null
      }

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

  /**
   * 把当前频谱填进 `out`（长度需 ≥ analyser.frequencyBinCount）。
   * 没有分析器（WebAudio 不可用 / 还没开始录）时返回 false，由界面降级。
   */
  const readLevels = useCallback((out: Uint8Array<ArrayBuffer>): boolean => {
    const analyser = analyserRef.current
    if (!analyser || out.length < analyser.frequencyBinCount) return false
    analyser.getByteFrequencyData(out)
    return true
  }, [])

  useEffect(() => cancel, [cancel])

  return { state, elapsedMs, start, stop, cancel, readLevels }
}
