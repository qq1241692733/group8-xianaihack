import { useEffect, useRef, useState } from 'react'

import { Pane } from '@/app/Pane'
import { ArrowUpMark, PlusMark } from '@/app/icons'
import { useStore } from '@/app/store'
import { formatEra, volumeOf, type DiscoveryCard } from '@/data/discoveries'
import type { SayPart } from '@/data/script'
import type { AiMessage } from '@/features/agent/types'
import { useAiQueue } from '@/features/agent/useAiQueue'
import { useFreeText } from '@/features/agent/useFreeText'
import { useRotatingPlaceholder } from '@/features/agent/useRotatingPlaceholder'
import { captionOf } from '@/features/memory/display'
import { useBlobUrl } from '@/features/memory/useBlobUrl'
import { OrbMark } from '@/features/timefield/OrbMark'

import styles from './UnderstandScreen.module.css'

/**
 * 「理解」。
 *
 * 三段式回应：让你看见当下 → 重新看见过去 → 把材料连起来。台词与分支来自
 * data/script.ts，数字来自真实记忆的聚合（features/agent/context.ts）。然后给你一组
 * **并列的出口**，「开始做」只是其中之一——不做、喜欢、发现重复、再听一遍同样是完整的结果。
 *
 * 底下有两条入口，各管一件事：
 *  - **推荐语库**（data/prompts.ts）：点一个场景名，AI 把它在你记录里找出来的东西
 *    整理成一份档案卡。写死的，演示时确定性最高。
 *  - **输入框**：想自己说的话走这里，走 LLM（features/agent/useFreeText），
 *    失败时诚实回落到「我先把这句留着」。
 *
 * 台词里的 `<b>` / `<br/>` 在这里渲染成真元素——参考稿用 innerHTML 拼字符串
 * （index_demo.html:1069），这里不给自己留那条路，display.test.ts 已经锁死了
 * 「用户输入原样当文本」这条保证。
 *
 * 注意它**不自己启动**对话：进入 App 不等于进入「理解」。等你第一次点开这个 Tab
 * 才开始——原来那份单文件版就是在加载时把整场戏提前演完了。
 */
function Parts({ parts }: { parts: SayPart[] }) {
  return (
    <>
      {parts.map((part, index) => {
        if (part.kind === 'break') return <br key={index} />
        if (part.kind === 'strong') return <b key={index}>{part.text}</b>
        return <span key={index}>{part.text}</span>
      })}
    </>
  )
}

function Message({ message }: { message: AiMessage }) {
  if (message.kind === 'me') {
    return (
      <div className={`msgIn ${styles.msg} ${styles.msgMe}`}>
        <div className={styles.say}>{message.text}</div>
      </div>
    )
  }

  // 册回执（docs/23 §三）：对话不渲染完整卷内，给的是回执。
  // 动作由状态决定：草稿（留下/不要），已有（翻开来）。
  if (message.kind === 'volume') {
    return (
      <div className={`msgIn ${styles.msg}`}>
        <VolumeReceipt card={message.card} draft={message.draft} />
      </div>
    )
  }

  if (message.kind === 'volumes') {
    return (
      <div className={`msgIn ${styles.msg}`}>
        <VolumeRows cards={message.cards} />
      </div>
    )
  }

  return (
    <div className={`msgIn ${styles.msg}${message.line.note ? ` ${styles.msgNote}` : ''}`}>
      <div className={styles.say}>
        <Parts parts={message.line.parts} />
      </div>
    </div>
  )
}

/* ---------- 册回执（docs/23 §三）----------
 * 对话给回执，阅读在发现。材质缩影 + 册名 + 期间（起止，不报条数）；
 * 草稿多一行聚合缘由和「留下 / 不要」，已有册只有「翻开来」。 */

/** 回执里的迷你波形。固定几何——回执不是封面，认得出材质就够。 */
const MINI_WAVE = [30, 55, 40, 70, 45, 80, 38, 62, 50, 72, 42, 58, 35, 66, 48, 76]
/**
 * 册架缩影行里那一格只有 36px 宽：上面这套 16 根柱子会被挤成亚像素，
 * 结果是「一格灰方块」——声音册在行列表里等于没有材质（发现于 2026-09-27 截图验收）。
 * 抽稀到 7 根、并收窄间距，行里认得出是「声音」就够，不追求完整波形。
 */
const MINI_WAVE_COMPACT = [40, 74, 46, 82, 44, 68, 52]

function MiniWave({ compact = false }: { compact?: boolean }) {
  const bars = compact ? MINI_WAVE_COMPACT : MINI_WAVE
  return (
    <span className={styles.volThumbWave} aria-hidden="true">
      {bars.map((h, i) => (
        <i key={i} style={{ height: `${h}%` }} />
      ))}
    </span>
  )
}

function MiniPhoto({ card }: { card: DiscoveryCard }) {
  const first = card.items.find((e) => e.kind === 'photo')
  const url = useBlobUrl(first?.blobRef)
  return <span className={styles.volThumbPhoto} style={url ? undefined : { background: 'var(--fill-2)' }}>{url && <img src={url} alt="" />}</span>
}

function VolThumb({ card }: { card: DiscoveryCard }) {
  const volume = volumeOf(card)
  if (volume.lead === 'photo') return <MiniPhoto card={card} />
  if (volume.lead === 'word') return <span className={styles.volThumbQuote}>「…」</span>
  return <MiniWave compact />
}

function VolumeReceipt({ card, draft }: { card: DiscoveryCard; draft: boolean }) {
  const volume = volumeOf(card)
  const keepDiscovery = useStore((s) => s.keepDiscovery)
  const dissolveDiscovery = useStore((s) => s.dissolveDiscovery)
  const focusVolume = useStore((s) => s.focusVolume)
  const goPane = useStore((s) => s.goPane)
  const showToast = useStore((s) => s.showToast)
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) {
    return <p className={styles.volGone}>好——散了就散了，它们都还在原地。</p>
  }

  return (
    <div className={styles.volReceipt}>
      {volume.lead === 'sound' && <MiniWave />}
      {volume.lead === 'photo' && <MiniPhoto card={card} />}
      {volume.lead === 'word' && (
        <p className={styles.volQuote}>
          {captionOf(card.items.find((e) => e.kind === 'word') ?? card.items[0])}
        </p>
      )}

      <div className={styles.volName}>{card.title}</div>
      <div className={styles.volEra}>{formatEra(card)}</div>
      {draft && <p className={styles.volWhy}>{card.note}</p>}

      {draft ? (
        <>
          <div className={styles.volActions}>
            <button
              type="button"
              className="chip"
              onClick={() => {
                keepDiscovery(card.id)
                showToast('已经放到「发现」的第一册')
                goPane('discover')
              }}
            >
              留下
            </button>
            <button type="button" className="chip" onClick={() => {
              dissolveDiscovery(card.id)
              setDismissed(true)
            }}>
              不要
            </button>
          </div>
          {/* 草稿如实自报。草稿没有有效期、不催处理——走了它还在流里。 */}
          <p className={styles.volDraft}>这一册还不存在——留下它才在。</p>
        </>
      ) : (
        <div className={styles.volActions}>
          <button
            type="button"
            className="chip"
            onClick={() => {
              focusVolume(card.id)
              goPane('discover')
            }}
          >
            翻开来 →
          </button>
        </div>
      )}
    </div>
  )
}

function VolumeRows({ cards }: { cards: DiscoveryCard[] }) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const expandedCard = expanded ? cards.find((c) => c.id === expanded) : undefined

  // 点一行：原地展开成单册回执——不跳页、不丢对话上下文。
  if (expandedCard) return <VolumeReceipt card={expandedCard} draft={false} />

  return (
    <div className={styles.volRows}>
      {cards.map((card) => (
        <button key={card.id} type="button" className={styles.volRow} onClick={() => setExpanded(card.id)}>
          <VolThumb card={card} />
          <span className={styles.volRowBody}>
            <span className={styles.volRowName}>{card.title}</span>
            <span className={styles.volRowEra}>{formatEra(card)}</span>
          </span>
          <span className={styles.volRowGo}>›</span>
        </button>
      ))}
    </div>
  )
}

/**
 * 演示捷径（stage.ts 同族）：`&chat=query` / `&chat=organize`。
 * 等开场白那支队列播完，自动替用户说一句话、把册回执灌进流里——
 * 无头截图与路演都要一步到位，不给「先想一句话再打字」留机会。
 * 只在 URL 明确带 chat 时生效，正式包不受影响。
 */
function useDemoChat(): void {
  useEffect(() => {
    if (typeof window === 'undefined') return
    const mode = new URLSearchParams(window.location.search).get('chat')
    if (!mode) return
    const sentence = mode === 'organize' ? '把上山整理一下' : '我留意过哪些声音？'
    let tries = 0
    const id = window.setInterval(() => {
      tries += 1
      if (useStore.getState().aiVolumesFree(sentence) || tries > 30) window.clearInterval(id)
    }, 600)
    return () => window.clearInterval(id)
  }, [])
}

/**
 * 输入框里轮流出现的几句灰字。两版合起来用：截图里那两句 + 本来的那句。
 * 必须是模块级常量 —— useRotatingPlaceholder 靠引用稳定，不能每次渲染新建数组。
 */
const SEARCH_HINTS = [
  '说点什么，或者只是写下来…',
  '我想找⋯',
  '不必记得是哪一天。',
  '找一个你还记得的瞬间。',
] as const

/** 空态里那三条示例。点一下就等于把这句话说出去——走的是同一条本地查询。 */
const SUGGESTIONS = [
  '找找最近留下的照片',
  '有哪些关于孩子的记录？',
  '帮我整理听见的声音',
] as const

export function UnderstandScreen() {
  useAiQueue()
  useDemoChat()

  const pane = useStore((s) => s.pane)
  const messages = useStore((s) => s.aiMessages)
  const newSession = useStore((s) => s.newSession)
  const openOverlay = useStore((s) => s.openOverlay)
  const showToast = useStore((s) => s.showToast)
  const { busy, send } = useFreeText()

  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  // 新消息落下后把视口带到底部。改 DOM，不动 state。
  useEffect(() => {
    if (pane !== 'ai') return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [pane, messages.length])

  function handleSend(text?: string) {
    const body = (text ?? draft).trim()
    if (!body || busy) return
    send(body)
    setDraft('')
  }

  /** 开新的一段。当前这段不为空就先说一声它去哪儿了——不写回执，但也不让它无声消失。 */
  function handleNew() {
    if (useStore.getState().aiMessages.length > 0) showToast('上一段收进历史了')
    newSession()
  }

  const placeholder = useRotatingPlaceholder(SEARCH_HINTS)
  const empty = messages.length === 0

  return (
    <Pane id="ai" className={styles.pane}>
      <div className={styles.topRow}>
        <h2 className={`paneTitle ${styles.titleFlat}`}>理解</h2>
        <div className={styles.topActions}>
          {/* 「历史对话」需要一个词——没有一眼认得出的历史图形，那一栏就不够诚实。 */}
          <button type="button" className={styles.textBtn} onClick={() => openOverlay('history')}>
            历史对话
          </button>
          {/* 「新增对话」沿用全 App 那枚 +：与首页、发现、时间同一个动作语言。 */}
          <button type="button" className={styles.iconBtn} aria-label="新增对话" onClick={handleNew}>
            <PlusMark />
          </button>
        </div>
      </div>
      <p className="paneSub">从你留下的内容里，找回一些线索。</p>

      <div className={styles.stream}>
        {empty ? (
          /* 空态不是一个「开始对话」的按钮，而是一句招呼、一句话、三条示例。
             这一刻只有一件事要做：把你想找的说出来。 */
          <div className={styles.landing}>
            <div className={styles.ask}>
              <span className={styles.askOrb}>
                <OrbMark />
              </span>
              <span className={styles.askText}>想找回什么？</span>
            </div>

            <p className={styles.lead}>
              不必记得是哪一天。
              <br />
              说说你还记得的一点。
            </p>

            <div className={styles.suggests}>
              {SUGGESTIONS.map((sentence) => (
                <button
                  key={sentence}
                  type="button"
                  className={styles.suggestRow}
                  onClick={() => handleSend(sentence)}
                >
                  <span>{sentence}</span>
                  <span className={styles.suggestArrow}>
                    <ArrowUpMark />
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => <Message key={message.id} message={message} />)
        )}
        {/* 放在流的末尾：新消息落下时把它滚进视口，最后一条才会停在输入框上方。 */}
        <div ref={endRef} className={styles.end} />
      </div>

      <div className={styles.composer}>
        <p className={styles.scope}>本地查找 · 文字、标签与已识别内容</p>
        <div className={styles.inputRow}>
          <textarea
            className={styles.input}
            rows={1}
            placeholder={placeholder}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              // 中文输入法选词时的回车不算发送。
              if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
              event.preventDefault()
              handleSend()
            }}
          />
          <button
            type="button"
            className={styles.send}
            aria-label="说"
            onClick={() => handleSend()}
            disabled={busy || draft.trim().length === 0}
          >
            <ArrowUpMark />
          </button>
        </div>
      </div>
    </Pane>
  )
}
