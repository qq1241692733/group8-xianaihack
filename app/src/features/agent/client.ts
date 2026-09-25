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
 * 问后端要一句话。
 *
 * 开发期由 server/llmProxy.ts 代理，API Key 只存在 .env.local，绝不进客户端代码。
 * 没有 Key、额度用尽、IP 不在白名单、模型返回不可解析——任何一种失败都只是
 * { ok:false, reason }，调用方据此回落到 data/script.ts 的剧本。
 * 剧本兜底是一等公民：演示现场最怕的就是 AI 没找到。
 */
export async function askLlm(prompt: string): Promise<LlmResult> {
  try {
    const res = await fetch('/api/llm', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt }),
    })
    if (!res.ok) return { ok: false, reason: 'bad-response' }
    return (await res.json()) as LlmResult
  } catch {
    return { ok: false, reason: 'network' }
  }
}
