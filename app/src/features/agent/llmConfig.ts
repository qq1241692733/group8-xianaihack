import { useSyncExternalStore } from 'react'

/**
 * 用户自己填的 LLM 配置。
 *
 * **为什么需要它**：`/api/llm` 是 **vite 开发服务器的插件**（server/llmProxy.ts），
 * 打包后的静态站与 APK 里根本没有这个服务端 —— 不填这个，成品里的 AI 永远是剧本兜底。
 * 填了之后浏览器**直接请求厂商**，成品里 AI 也是真的。
 * （已实测该厂商允许跨域：带 authorization 的 POST 预检通过。）
 *
 * **代价写在明处**：密钥存在**这台设备的 localStorage** 里，请求由浏览器直接发往厂商。
 * 这与「我们自己那把 Key 永不出服务端」不冲突 —— 那把 Key 仍然只在 `.env.local`，
 * 这里的只是使用者自己的 Key，存在他自己的设备上。
 *
 * **三项齐全才算配好**：少一项就发不出请求，不如老实回落到代理。
 */
export interface LlmConfig {
  baseUrl: string
  apiKey: string
  model: string
}

const KEY = 'cike:llm'
const EMPTY: LlmConfig = { baseUrl: '', apiKey: '', model: '' }

/** 懒读一次就缓存。多处调用必须看到同一份，且引用要稳定（useSyncExternalStore 要求）。 */
let snap: LlmConfig | null = null
const subs = new Set<() => void>()

function emit(): void {
  for (const fn of subs) fn()
}

function read(): LlmConfig {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return { ...EMPTY }
    const parsed = JSON.parse(raw) as Partial<LlmConfig>
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : '',
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model: typeof parsed.model === 'string' ? parsed.model : '',
    }
  } catch {
    // 隐私模式 / 存坏了：当作没配，功能不降级（仍然走代理）。
    return { ...EMPTY }
  }
}

function ensure(): LlmConfig {
  snap ??= read()
  return snap
}

export function getLlmConfig(): LlmConfig {
  return ensure()
}

/** 三项都非空才算配好。 */
export function isLlmConfigured(cfg: LlmConfig = ensure()): boolean {
  return Boolean(cfg.baseUrl.trim() && cfg.apiKey.trim() && cfg.model.trim())
}

export function saveLlmConfig(next: LlmConfig): void {
  const cleaned: LlmConfig = {
    baseUrl: next.baseUrl.trim().replace(/\/+$/, ''),
    apiKey: next.apiKey.trim(),
    model: next.model.trim(),
  }
  snap = cleaned
  try {
    // 配不全就不留痕：半套配置比没有配置更难排查。
    if (isLlmConfigured(cleaned)) window.localStorage.setItem(KEY, JSON.stringify(cleaned))
    else window.localStorage.removeItem(KEY)
  } catch {
    // 存储不可用：这次会话里仍然生效。
  }
  emit()
}

export function clearLlmConfig(): void {
  saveLlmConfig({ ...EMPTY })
}

function subscribe(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export function useLlmConfig(): LlmConfig & { set: (cfg: LlmConfig) => void; clear: () => void } {
  const s = useSyncExternalStore(subscribe, ensure, ensure)
  return { ...s, set: saveLlmConfig, clear: clearLlmConfig }
}
