import type { IncomingMessage, ServerResponse } from 'node:http'

import type { Plugin } from 'vite'

type Env = Record<string, string | undefined>

/**
 * 开发期 LLM 代理。存在的唯一理由：让 API Key 留在 .env.local 里，
 * 绝不出现在客户端代码或打包产物中。
 *
 * 厂商是 OpenAI 兼容协议（当前接的是 QiyuanHub / 奇元），所以一个客户端通吃
 * DeepSeek / Kimi / 通义 / GLM —— 换厂商只改 .env.local 的 LLM_BASE_URL 与 LLM_MODEL。
 *
 * 可选地支持图片：请求体多带一个 `image`（data URL），就把它和文字一起放进 user 消息的
 * content 数组。deepseek-v4.1 本身原生多模态，带图时默认仍用它；LLM_VISION_MODEL 是
 * 「换一个专门的多模态模型」的可选覆盖。图片走的是剥掉 EXIF 的缩图，见 imageFeatures.ts。
 *
 * 失败时一律回 HTTP 200 + { ok:false, reason }：代理本身没坏，只是模型没答上来，
 * 客户端据此静默回落到 data/script.ts 的剧本。演示现场不能因为 AI 掉线就停摆。
 */

const DEFAULT_BASE_URL = 'https://api.qiyuanapi.cc/v1'
const DEFAULT_MODEL = 'deepseek-v4.1'
const UPSTREAM_TIMEOUT_MS = 60_000
/** data URL 形式的图片上限，挡住误传的大图（正常客户端会缩到 512px）。 */
const MAX_IMAGE_CHARS = 8_000_000

type LlmRequestBody = { prompt?: string; image?: string }

function send(res: ServerResponse, status: number, payload: unknown): void {
  res.statusCode = status
  res.end(JSON.stringify(payload))
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}

/** 把厂商的 HTTP 状态翻译成客户端能用来降级的 reason。 */
function mapFailure(status: number, body: string): string {
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

export function llmProxy(env: Env): Plugin {
  return {
    name: 'cike:llm-proxy',
    configureServer(server) {
      server.middlewares.use('/api/llm', (req, res) => {
        void (async () => {
          res.setHeader('content-type', 'application/json; charset=utf-8')

          if (req.method !== 'POST') {
            send(res, 405, { ok: false, reason: 'method-not-allowed' })
            return
          }

          const apiKey = env.LLM_API_KEY?.trim()
          if (!apiKey) {
            send(res, 200, { ok: false, reason: 'no-key' })
            return
          }

          const baseUrl = (env.LLM_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, '')
          const model = env.LLM_MODEL?.trim() || DEFAULT_MODEL
          // deepseek-v4.1 本身原生多模态，所以带图时默认仍用它；LLM_VISION_MODEL
          // 只是「换一个专门的多模态模型」的可选覆盖（比如接别的厂商的 vl 模型）。
          const visionModel = env.LLM_VISION_MODEL?.trim() || model

          let prompt: string
          let image: string | undefined
          try {
            const body = JSON.parse(await readBody(req)) as LlmRequestBody
            prompt = (body.prompt ?? '').trim()
            image = typeof body.image === 'string' && body.image.trim() ? body.image.trim() : undefined
          } catch {
            send(res, 400, { ok: false, reason: 'bad-request' })
            return
          }

          if (!prompt) {
            send(res, 400, { ok: false, reason: 'empty-prompt' })
            return
          }

          if (image && image.length > MAX_IMAGE_CHARS) {
            send(res, 200, { ok: false, reason: 'image-too-large' })
            return
          }

          // 图片必须放在 user 消息的 content 数组里，和文字并列（厂商要求）。
          const content = image
            ? [
                { type: 'text', text: prompt },
                { type: 'image_url', image_url: { url: image } },
              ]
            : prompt

          const controller = new AbortController()
          const timer = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS)

          try {
            const upstream = await fetch(`${baseUrl}/chat/completions`, {
              method: 'POST',
              headers: {
                'content-type': 'application/json',
                authorization: `Bearer ${apiKey}`,
              },
              body: JSON.stringify({
                model: image ? visionModel : model,
                messages: [{ role: 'user', content }],
              }),
              signal: controller.signal,
            })

            const raw = await upstream.text()

            if (!upstream.ok) {
              send(res, 200, {
                ok: false,
                reason: mapFailure(upstream.status, raw),
                detail: raw.slice(0, 400),
              })
              return
            }

            const parsed = JSON.parse(raw) as {
              choices?: Array<{ message?: { content?: string } }>
            }
            const text = parsed.choices?.[0]?.message?.content

            if (!text) {
              send(res, 200, { ok: false, reason: 'bad-response', detail: raw.slice(0, 400) })
              return
            }

            send(res, 200, { ok: true, text })
          } catch (error) {
            const aborted = error instanceof Error && error.name === 'AbortError'
            send(res, 200, { ok: false, reason: aborted ? 'timeout' : 'network' })
          } finally {
            clearTimeout(timer)
          }
        })()
      })
    },
  }
}
