/** 主键生成。优先用 crypto.randomUUID，老浏览器回落到时间戳 + 随机串。 */
export function createId(prefix = 'e'): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') {
    return `${prefix}_${c.randomUUID()}`
  }
  const rand = Math.random().toString(36).slice(2, 10)
  return `${prefix}_${Date.now().toString(36)}_${rand}`
}
