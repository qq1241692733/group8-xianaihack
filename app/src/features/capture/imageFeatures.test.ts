import { describe, expect, it } from 'vitest'

import { analyzePixels, dhashFromGray, hammingDistance, imageDataToGray } from './imageFeatures'

function solid(r: number, g: number, b: number, n: number): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(n * 4)
  for (let i = 0; i < n; i += 1) {
    rgba[i * 4] = r
    rgba[i * 4 + 1] = g
    rgba[i * 4 + 2] = b
    rgba[i * 4 + 3] = 255
  }
  return rgba
}

describe('analyzePixels', () => {
  it('纯白：最亮、无饱和、无冷暖', () => {
    const f = analyzePixels(solid(255, 255, 255, 16), 4, 4)
    expect(f.brightness).toBeCloseTo(1, 5)
    expect(f.warmth).toBeCloseTo(0, 5)
    expect(f.saturation).toBeCloseTo(0, 5)
  })

  it('纯黑：最暗', () => {
    expect(analyzePixels(solid(0, 0, 0, 16), 4, 4).brightness).toBeCloseTo(0, 5)
  })

  it('纯红：偏暖、满饱和', () => {
    const f = analyzePixels(solid(255, 0, 0, 16), 4, 4)
    expect(f.warmth).toBeCloseTo(1, 5)
    expect(f.saturation).toBeCloseTo(1, 5)
  })

  it('空图不崩', () => {
    expect(analyzePixels(new Uint8ClampedArray(0), 0, 0)).toEqual({
      brightness: 0,
      warmth: 0,
      saturation: 0,
    })
  })
})

describe('imageDataToGray', () => {
  it('用 luma 权重算灰度', () => {
    const gray = imageDataToGray(solid(255, 0, 0, 1), 1, 1)
    expect(gray[0]).toBe(Math.round(0.299 * 255))
  })
})

describe('dhashFromGray', () => {
  it('灰度递增 → 每对都是「左不大于右」→ 全 0', () => {
    const gray = new Uint8Array(9 * 8)
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) gray[y * 9 + x] = x
    expect(dhashFromGray(gray, 9, 8)).toBe('0'.repeat(16))
  })

  it('灰度递减 → 全 1', () => {
    const gray = new Uint8Array(9 * 8)
    for (let y = 0; y < 8; y += 1) for (let x = 0; x < 9; x += 1) gray[y * 9 + x] = 9 - x
    expect(dhashFromGray(gray, 9, 8)).toBe('f'.repeat(16))
  })
})

describe('hammingDistance', () => {
  it('完全相同是 0', () => {
    expect(hammingDistance('0123456789abcdef', '0123456789abcdef')).toBe(0)
  })

  it('全不同是 64', () => {
    expect(hammingDistance('0000000000000000', 'ffffffffffffffff')).toBe(64)
  })

  it('一位之差是 1', () => {
    expect(hammingDistance('0000000000000000', '0000000000000001')).toBe(1)
  })

  it('长度不同视为不相似', () => {
    expect(hammingDistance('00', '0000')).toBe(Number.MAX_SAFE_INTEGER)
  })
})
