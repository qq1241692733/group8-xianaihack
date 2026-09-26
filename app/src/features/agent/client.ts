import { getLlmConfig, isLlmConfigured, type LlmConfig } from './llmConfig'
import { createQueue, type Lane } from './llmQueue'

export type LlmFailure =
  | 'no-key'
  | 'unauthorized'
  | 'quota'
  | 'pending'
  | 'ip-blocked'
  | 'forbidden'
  | 'rate-limited'
  | 'timeout'
  | 'network'
  | 'bad-response'
  | 'provider-error'
  | 'bad-request'
  | 'empty-prompt'
  | 'method-not-allowed'

export type LlmResult =
  | { ok: true; text: string }
  | { ok: false; reason: LlmFailure | (string & {}); detail?: string }

/**
 * 线上 API 地址，构建时由 .env.production 的 VITE_API_BASE 注入。
 * - 开发期留空：相对路径命中 vite dev server 上的 llmProxy 中间件（server/llmProxy.ts）。
 * - 打 APK 时空相对路径会落在 WebView 的 https://localhost 上，必然失败——
 *   所以正式打包前必须设 VITE_API_BASE 指向已部署的线上服务。
 * 注意 VITE_ 前缀会被打进产物：这里只允许出现「地址」，绝不允许出现 Key。
 */
const API_BASE = (import.meta.env.VITE_API_BASE ?? '').replace(/\/+$/, '')

/**
 * 全局串行队列：端点并发上限是 1 路（见 llmQueue.ts），所有请求都从这里进出。
 * 打标与聊天共用同一个槽位——它们打的是同一个账号的同一个上限。
 * 分两条车道：人在等的走前台，照片打标走后台，后台给前台让路。
 */
const llmQueue = createQueue(1)

/** 撞上限 / 网络抖动这类值得重试的原因。其余（无 Key、额度、拒答）重试也没用。 */
const RETRYABLE = new Set(['rate-limited', 'timeout', 'network'])
const RETRY_DELAY_MS = 700

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** 直连厂商时的超时。与代理那边的 60s 对齐。 */
const DIRECT_TIMEOUT_MS = 60_000

/** 把厂商的 HTTP 状态翻译成客户端能用来降级的 reason。与 server/llmProxy.ts 同一张表。 */
function mapFailure(status: number, body: string): LlmFailure {
  if (status === 401) return 'unauthorized'
  if (status === 402) return 'quota'
  if (status === 429) return 'rate-limited'
  if (status === 403) {
    if (body.includes('application_pending')) return 'pending'
    if (body.includes('ip_not_allowed')) return 'ip-blocked'
    return 'forbidden'
  }
  return 'provider-error'
}

/** 走开发服务器上的代理（Key 只在服务端）。没有自备配置时的默认路。 */
async function postProxy(body: Record<string, unknown>): Promise<LlmResult> {
  try {
    const res = await fetch(`${API_BASE}/api/llm`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false, reason: 'bad-response' }
    return (await res.json()) as LlmResult
  } catch {
    return { ok: false, reason: 'network' }
  }
}

/**
 * 直连厂商（OpenAI 兼容），用**使用者自己在设置里填的**地址 / 密钥 / 模型。
 *
 * 这条路是为「打包之后」准备的：`/api/llm` 是 vite 开发服务器的插件，
 * 静态站与 APK 里没有它 —— 不填这个，成品里的 AI 永远回落剧本。
 *
 * 带图时**仍用同一个模型**（没有第二个模型位）—— 所以设置里那条提示写着
 * 「模型必须是多模态的」。这一点不是免责声明，是硬约束：照片打标走的就是它。
 */
async function postDirect(body: Record<string, unknown>, cfg: LlmConfig): Promise<LlmResult> {
  const prompt = String(body.prompt ?? '').trim()
  const image = typeof body.image === 'string' && body.image.trim() ? body.image.trim() : undefined
  if (!prompt) return { ok: false, reason: 'empty-prompt' }

  // 图片必须和文字并列放在 user 消息的 content 数组里（厂商要求）。
  const content = image
    ? [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url: image } },
      ]
    : prompt

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DIRECT_TIMEOUT_MS)

  try {
    const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({ model: cfg.model, messages: [{ role: 'user', content }] }),
      signal: controller.signal,
    })

    const raw = await res.text()
    if (!res.ok) return { ok: false, reason: mapFailure(res.status, raw), detail: raw.slice(0, 400) }

    const parsed = JSON.parse(raw) as { choices?: Array<{ message?: { content?: string } }> }
    const text = parsed.choices?.[0]?.message?.content
    if (!text) return { ok: false, reason: 'bad-response', detail: raw.slice(0, 400) }
    return { ok: true, text }
  } catch (error) {
    const aborted = error instanceof Error && error.name === 'AbortError'
    return { ok: false, reason: aborted ? 'timeout' : 'network' }
  } finally {
    clearTimeout(timer)
  }
}

/** 自备了配置就直连，否则走代理。两条路的失败语义完全一致。 */
async function postLlm(body: Record<string, unknown>): Promise<LlmResult> {
  const cfg = getLlmConfig()
  return isLlmConfigured(cfg) ? postDirect(body, cfg) : postProxy(body)
}

/**
 * 排进队列发一次请求。retries 用于后台、可等待的调用（打标）——重试期间占着槽位，
 * 不会再去抢并发。前台聊天不重试（宁可早点回落剧本，别让用户干等）。
 */
async function postLlmQueued(
  body: Record<string, unknown>,
  lane: Lane,
  retries = 0,
): Promise<LlmResult> {
  const run = lane === 'foreground' ? llmQueue.runForeground : llmQueue.runBackground
  return run(async () => {
    let result = await postLlm(body)
    for (let i = 0; i < retries && !result.ok && RETRYABLE.has(result.reason); i += 1) {
      await sleep(RETRY_DELAY_MS * (i + 1))
      result = await postLlm(body)
    }
    return result
  })
}

/**
 * 问后端要一句话。
 *
 * 两条路，失败语义完全一致：
 *  - **自备配置**（设置里填了地址 / 密钥 / 模型）→ 浏览器**直连厂商**。
 *    这是打包之后唯一能让 AI 是真的的路 —— 静态站与 APK 里没有代理。
 *  - 否则 → `/api/llm`：开发期是 server/llmProxy.ts，Key 只存 .env.local；
 *    线上是 VITE_API_BASE 指向的服务。
 * 没有 Key、额度用尽、IP 不在白名单、模型返回不可解析——任何一种失败都只是
 * { ok:false, reason }，调用方据此回落到 data/script.ts 的剧本。
 * 剧本兜底是一等公民：演示现场最怕的就是 AI 没找到。
 *
 * 走**前台**车道：自由输入聊天与成册判定都经这里，人在等。
 */
export function askLlm(prompt: string): Promise<LlmResult> {
  return postLlmQueued({ prompt }, 'foreground')
}

/**
 * 问后端要一段对图片的描述（视觉模型）。image 是 data URL（image/jpeg;base64,...）。
 *
 * 与 askLlm 同一条通道，多带一个 image 字段。**直连时用的是同一个模型** ——
 * 所以设置里必须填一个多模态的模型，这不是建议。失败语义完全一致：调用方据此
 * **保留本地标签**，绝不假装 LLM 看过这张图。仅在用户显式开启视觉时才会被调用。
 *
 * 走**后台**车道：打标可以等，且连拍时后面的请求会排队；撞上限或超时值得再试一次。
 */
export function askLlmVision(prompt: string, image: string): Promise<LlmResult> {
  return postLlmQueued({ prompt, image }, 'background', 2)
}
