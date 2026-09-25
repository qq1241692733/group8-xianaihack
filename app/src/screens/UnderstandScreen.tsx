import { useEffect, useRef, useState } from 'react'

import { Pane } from '@/app/Pane'
import { useStore } from '@/app/store'
import type { MemoryCardData, SayPart } from '@/data/script'
import type { AiMessage } from '@/features/agent/types'
import { useAiDialogue } from '@/features/agent/useAiDialogue'
import { useFreeText } from '@/features/agent/useFreeText'

import styles from './UnderstandScreen.module.css'

/**
 * 「理解」。
 *
 * 三段式回应：让你看见当下 → 重新看见过去 → 理解自己。台词与分支来自 data/script.ts，
 * 数字来自真实记忆的聚合（features/agent/context.ts），自由输入走 LLM 并在失败时诚实回落。
 *
 * 台词里的 `<b>` / `<br/>` 在这里渲染成真元素。参考稿用 innerHTML 拼字符串
 * （index_demo.html:1069），这里不给自己留那条路——display.test.ts 已经锁死了
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

function MemoryCard({ card }: { card: MemoryCardData }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardWave}>
        <span>{card.mark}</span>
        <span>{card.stamp}</span>
      </div>
      <div className={styles.cardImg} style={{ backgroundImage: card.sceneGradient }} />
      <div className={styles.cardBody}>
        <div className={styles.cardMeta}>{card.meta}</div>
        <div className={styles.cardText}>{card.caption}</div>
      </div>
    </div>
  )
}

function Message({ message }: { message: AiMessage }) {
  const openOverlay = useStore((s) => s.openOverlay)

  if (message.kind === 'me') {
    return (
      <div className={`msgIn ${styles.msg} ${styles.msgMe}`}>
        <div className={styles.say}>{message.text}</div>
      </div>
    )
  }

  if (message.kind === 'card') {
    return (
      <div className={`msgIn ${styles.msg}`}>
        <MemoryCard card={message.card} />
      </div>
    )
  }

  if (message.kind === 'action') {
    return (
      <div className={`msgIn ${styles.msg}`}>
        <button type="button" className="btnStart" onClick={() => openOverlay('nothing')}>
          开始 3 分钟
        </button>
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

export function UnderstandScreen() {
  useAiDialogue()

  const pane = useStore((s) => s.pane)
  const messages = useStore((s) => s.aiMessages)
  const replies = useStore((s) => s.aiReplies)
  const chooseReply = useStore((s) => s.aiChooseReply)
  const { busy, send } = useFreeText()

  const [draft, setDraft] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  // 新消息落下后把视口带到底部。改 DOM，不动 state。
  useEffect(() => {
    if (pane !== 'ai') return
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [pane, messages.length])

  function handleSend() {
    const text = draft.trim()
    if (!text || busy) return
    send(text)
    setDraft('')
  }

  return (
    <Pane id="ai">
      <div className={styles.head}>
        <div className={`breathing ${styles.orb}`} />
        <div>
          <div className={`eyebrow ${styles.eyebrowFlat}`}>此刻 · 理解</div>
          <div className={styles.title}>它正在慢慢认识你</div>
        </div>
      </div>

      <div className={styles.stream}>
        {messages.map((message) => (
          <Message key={message.id} message={message} />
        ))}

        {replies.length > 0 && (
          <div className={`msgIn ${styles.replies}`}>
            {replies.map((reply) => (
              <button
                key={reply.id}
                type="button"
                className={`reply${reply.quiet ? ' replyQuiet' : ''}`}
                onClick={() => chooseReply(reply)}
              >
                {reply.label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className={styles.composer}>
        <textarea
          className={styles.input}
          rows={1}
          placeholder="说点什么，或者只是写下来…"
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
          onClick={handleSend}
          disabled={busy || draft.trim().length === 0}
        >
          说
        </button>
      </div>

      <div ref={endRef} />
    </Pane>
  )
}
