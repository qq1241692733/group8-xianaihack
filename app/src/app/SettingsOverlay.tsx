import { useState } from 'react'

import { Overlay } from '@/app/Overlay'
import { useTheme, type ThemePref } from '@/app/theme'
import { isLlmConfigured, useLlmConfig, type LlmConfig } from '@/features/agent/llmConfig'

import styles from './SettingsOverlay.module.css'

const APPEARANCE: Array<{ id: ThemePref; label: string }> = [
  { id: 'system', label: '跟随系统' },
  { id: 'day', label: '白天' },
  { id: 'night', label: '黑夜' },
]

/**
 * 设置。两件事：**外观**，以及**模型**。
 *
 * 外观：真机上「白天 / 黑夜」本来是系统级设置，产品不必另立一套 —— 所以默认
 * 「跟随系统」，手动选择只是覆盖它，三个状态。
 *
 * 模型：自备地址 / 密钥 / 模型之后，浏览器**直连厂商**。这条路是为打包之后准备的——
 * `/api/llm` 是 vite 开发服务器的插件，静态站与 APK 里没有它；不填这里，
 * 成品里的 AI 永远是剧本。密钥只存在这台设备上（见 llmConfig.ts 的说明）。
 *
 * 它仍然不是一个「功能」：不产生记录、不改时间流，改的只是这一屏怎么发光、
 * 以及 AI 那几句话从哪来。
 */
export function SettingsOverlay() {
  const { pref, setPref } = useTheme()
  const cfg = useLlmConfig()
  const [draft, setDraft] = useState<LlmConfig>({
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    model: cfg.model,
  })
  const [justSaved, setJustSaved] = useState(false)

  const dirty =
    draft.baseUrl !== cfg.baseUrl || draft.apiKey !== cfg.apiKey || draft.model !== cfg.model
  const complete = Boolean(draft.baseUrl.trim() && draft.apiKey.trim() && draft.model.trim())
  const configured = isLlmConfigured(cfg)

  const edit = (key: keyof LlmConfig) => (event: { target: { value: string } }) => {
    setDraft((prev) => ({ ...prev, [key]: event.target.value }))
    setJustSaved(false)
  }

  return (
    <Overlay id="settings" closeLabel="关闭" title="设置">
      <div className={styles.wrap}>
        <section className={styles.group}>
        <h3 className={styles.label}>外观</h3>
        <div className={styles.row} role="group" aria-label="外观">
          {APPEARANCE.map((option) => (
            <button
              key={option.id}
              type="button"
              className={`chip${pref === option.id ? ' chipOn' : ''}`}
              aria-pressed={pref === option.id}
              onClick={() => setPref(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <p className={styles.note}>「跟随系统」是默认。选了白天或黑夜，就一直用它，直到你改回来。</p>
      </section>

      <section className={styles.group}>
        <h3 className={styles.label}>模型</h3>

        <label className={styles.field}>
          <span className={styles.fieldName}>接口地址</span>
          <input
            className={styles.input}
            value={draft.baseUrl}
            onChange={edit('baseUrl')}
            placeholder="https://api.example.com/v1"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldName}>密钥</span>
          <input
            className={styles.input}
            type="password"
            value={draft.apiKey}
            onChange={edit('apiKey')}
            placeholder="sk-…"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <label className={styles.field}>
          <span className={styles.fieldName}>模型</span>
          <input
            className={styles.input}
            value={draft.model}
            onChange={edit('model')}
            placeholder="deepseek-v4.1"
            autoComplete="off"
            spellCheck={false}
          />
        </label>

        <div className={styles.actions}>
          <button
            type="button"
            className={styles.save}
            disabled={!dirty || !complete}
            onClick={() => {
              cfg.set(draft)
              setJustSaved(true)
            }}
          >
            {justSaved && !dirty ? '已保存' : '保存'}
          </button>
          {(configured || complete) && (
            <button
              type="button"
              className={styles.clear}
              onClick={() => {
                cfg.clear()
                setDraft({ baseUrl: '', apiKey: '', model: '' })
                setJustSaved(false)
              }}
            >
              清除
            </button>
          )}
        </div>

        <p className={styles.note}>
          填了就用浏览器直连这个地址；不填则走开发服务器上的代理——打包后的 App 里没有那个
          代理，也就没有 AI。
        </p>
        <p className={styles.warn}>
          <b>这个模型必须是多模态的。</b>照片打标也用它读图，只有一个模型位。
        </p>
        <p className={styles.note}>密钥只存在这台设备上，不会上传到别处。</p>
        </section>
      </div>
    </Overlay>
  )
}
