import { useCallback, useEffect, useRef, useState } from 'react'

export type CameraState = 'idle' | 'live' | 'denied' | 'unavailable'

/**
 * 真实取景。拿不到相机时进入 'denied' / 'unavailable'，
 * 界面回落到 scene.ts 画的「窗外」——降级是设计的一部分，不是兜底补丁。
 *
 * 「有没有 getUserMedia」在渲染期就能判定，所以不放进 effect 里再 setState 一遍；
 * effect 只负责真正去取流。
 */
export function useCamera(active: boolean) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<CameraState>('idle')

  const supported = typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia)

  useEffect(() => {
    if (!active || !supported) return

    let cancelled = false
    let stream: MediaStream | null = null

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' },
        })
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream
          await videoRef.current.play()
        }
        setState('live')
      } catch {
        if (!cancelled) setState('denied')
      }
    })()

    return () => {
      cancelled = true
      stream?.getTracks().forEach((track) => track.stop())
    }
  }, [active, supported])

  /** 从当前取景里抽一帧。没有画面时返回 null。 */
  const capture = useCallback(async (): Promise<Blob | null> => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return null

    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight

    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85))
  }, [])

  const effective: CameraState = !active ? 'idle' : supported ? state : 'unavailable'

  return { videoRef, state: effective, capture }
}
