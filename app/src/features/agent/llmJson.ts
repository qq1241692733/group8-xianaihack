/**
 * 从模型返回里抠出 JSON。
 *
 * 我们要求「只输出 JSON」，但模型偶尔还是包一层代码块或前言。这里宽容一点：
 * 先剥代码块，再取第一个 `{` 到最后一个 `}`。抠不出或解析失败返回 null，
 * 由调用方回落到「这次没答上来」。
 */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text)
  const body = fenced ? fenced[1]! : text
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start === -1 || end === -1 || end < start) return null
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    return null
  }
}
