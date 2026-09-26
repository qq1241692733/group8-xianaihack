import { Overlay } from '@/app/Overlay'
import { useStore, type CaptureIntent } from '@/app/store'
import type { EntryDraft } from '@/features/memory/types'

import { PhotoCapture } from './PhotoCapture'
import { SoundCapture } from './SoundCapture'
import { WordCapture } from './WordCapture'

/** 一个方向一屏。没有「先选一个」的中转页 —— 方向已经由首页那一下选过了。 */
const TITLE: Record<CaptureIntent, string> = {
  sound: '听见',
  photo: '看见',
  word: '写下',
}

/**
 * 三个「留下」的浮层。
 *
 * 声音 / 照片 / 一句话 三条路都是真的（真麦克风、真相机），只换壳。
 *
 * 采完**不落库，只攒起来**：这条东西落到首页那颗球的旁边，等长按「记下此刻」时
 * 才和别的元素一起落成一个「此刻」。所以这里只 stageDraft，落库在首页。
 * 浮层采完直接收起来：**没有「留下来了」的汇总页、没有 toast、没有对勾**。
 */
export function CaptureOverlay() {
  const open = useStore((s) => s.overlay === 'capture')
  const intent = useStore((s) => s.captureIntent)
  const target = useStore((s) => s.captureTarget)
  const stageDraft = useStore((s) => s.stageDraft)
  const composerAttach = useStore((s) => s.composerAttach)
  const openOverlay = useStore((s) => s.openOverlay)
  const closeOverlay = useStore((s) => s.closeOverlay)

  function handleDone(draft: EntryDraft) {
    // 从「记录此刻」编辑器点进来的：采到的算附件，采完回到编辑器接着写。
    if (target === 'compose') {
      composerAttach(draft)
      openOverlay('compose')
      return
    }
    stageDraft(draft)
    closeOverlay()
  }

  return (
    <Overlay id="capture" closeLabel="取消" title={TITLE[intent]}>
      {/* key 随意图重挂：换一个方向就是一次干净的开始 */}
      <Body key={`${open}:${intent}`} intent={intent} onDone={handleDone} />
    </Overlay>
  )
}

function Body({
  intent,
  onDone,
}: {
  intent: CaptureIntent
  onDone: (draft: EntryDraft) => void
}) {
  if (intent === 'photo') return <PhotoCapture onDone={onDone} />
  if (intent === 'sound') return <SoundCapture onDone={onDone} />
  return <WordCapture onDone={onDone} />
}
