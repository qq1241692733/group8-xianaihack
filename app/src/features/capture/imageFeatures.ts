import type { VisualFeatures } from '@/features/memory/types'

/**
 * 本地视觉特征：亮度 / 色温 / 饱和度 + 感知哈希（dHash）。
 *
 * 全部在设备上算，不上传。给照片一个**从像素里量出来的**信号，喂给
 * deriveLocalTags 当 scene 基线——即便没有视觉 LLM，照片也不再是所有标签都一样。
 *
 * 分两层：纯函数（analyzePixels / imageDataToGray / dhashFromGray / hammingDistance）
 * 不碰 canvas、可在 node 里测；浏览器包装（analyzeImage / toVisionDataUrl）才用 canvas。
 */

/** 近似重复的判定阈值：汉明距离 ≤ 6（共 64 位）视为同一帧。 */
export const NEAR_DUP_DISTANCE = 6

/**
 * RGBA 像素 → 三个客观量。不猜内容，只量光。
 *  - brightness：平均 luma / 255
 *  - warmth：平均 (R−B)/255，>0 偏暖
 *  - saturation：平均 (max−min)/max
 */
export function analyzePixels(rgba: Uint8ClampedArray, w: number, h: number): VisualFeatures {
  const n = w * h
  if (n <= 0) return { brightness: 0, warmth: 0, saturation: 0 }

  let luma = 0
  let warmth = 0
  let sat = 0

  for (let i = 0; i < n; i += 1) {
    const r = rgba[i * 4] ?? 0
    const g = rgba[i * 4 + 1] ?? 0
    const b = rgba[i * 4 + 2] ?? 0
    luma += 0.299 * r + 0.587 * g + 0.114 * b
    warmth += r - b
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    if (max > 0) sat += (max - min) / max
  }

  return {
    brightness: luma / n / 255,
    warmth: warmth / n / 255,
    saturation: sat / n,
  }
}

/** RGBA → 灰度（luma），用于 dHash。 */
export function imageDataToGray(rgba: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const out = new Uint8Array(w * h)
  for (let i = 0; i < w * h; i += 1) {
    const r = rgba[i * 4] ?? 0
    const g = rgba[i * 4 + 1] ?? 0
    const b = rgba[i * 4 + 2] ?? 0
    out[i] = (0.299 * r + 0.587 * g + 0.114 * b) | 0
  }
  return out
}

/**
 * dHash：灰度图逐行比较相邻像素（左 > 右 → 1），共 (w−1)×h 位。
 * 传 w=9, h=8 → 64 位 → 16 个十六进制字符。
 */
export function dhashFromGray(gray: Uint8Array, w: number, h: number): string {
  let bits = ''
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w - 1; x += 1) {
      bits += gray[y * w + x]! > gray[y * w + x + 1]! ? '1' : '0'
    }
  }
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

/** 两个十六进制 dHash 的汉明距离。长度不同视为不相似。 */
export function hammingDistance(a: string, b: string): number {
  if (a.length !== b.length || a.length === 0) return Number.MAX_SAFE_INTEGER
  let d = 0
  for (let i = 0; i < a.length; i += 1) {
    let x = (parseInt(a[i]!, 16) ^ parseInt(b[i]!, 16)) & 0xf
    while (x) {
      d += x & 1
      x >>= 1
    }
  }
  return d
}

/* ---------- 浏览器侧（canvas） ---------- */

function sampleCanvas(source: ImageBitmap, w: number, h: number): ImageData {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('拿不到 2d context')
  ctx.drawImage(source, 0, 0, w, h)
  return ctx.getImageData(0, 0, w, h)
}

/** 从图片算视觉特征与 dHash。相机路径给 Blob、相册给 File，都是 Blob，通吃。 */
export async function analyzeImage(blob: Blob): Promise<{ visual: VisualFeatures; hash: string }> {
  const bitmap = await createImageBitmap(blob)
  try {
    const color = sampleCanvas(bitmap, 32, 32)
    const gray = sampleCanvas(bitmap, 9, 8)
    return {
      visual: analyzePixels(color.data, 32, 32),
      hash: dhashFromGray(imageDataToGray(gray.data, 9, 8), 9, 8),
    }
  } finally {
    bitmap.close()
  }
}

/**
 * 缩到 maxEdge 的 JPEG data URL，供视觉 LLM 使用。
 *
 * 副作用是正面的：canvas 重编码会**剥掉 EXIF/GPS**——出设备的图不含坐标。
 */
export async function toVisionDataUrl(blob: Blob, maxEdge = 512, quality = 0.7): Promise<string> {
  const bitmap = await createImageBitmap(blob)
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height))
    const w = Math.max(1, Math.round(bitmap.width * scale))
    const h = Math.max(1, Math.round(bitmap.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('拿不到 2d context')
    ctx.drawImage(bitmap, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', quality)
  } finally {
    bitmap.close()
  }
}
