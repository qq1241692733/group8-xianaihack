import { describe, expect, it } from 'vitest'

import { parseExif, parseExifDateTime, readExifFromBlob } from './exif'

/**
 * 手工拼一个最小 JPEG：SOI + APP1("Exif\0\0" + TIFF)。
 * 不依赖真实图片文件——解析器要能被字节级验证。
 *
 * TIFF（小端 II）布局：
 *   IFD0 @8  ：orientation / ExifIFD 指针 / GPS IFD 指针
 *   ExifIFD @50：DateTimeOriginal
 *   GPS IFD @88：lat/lon ref + rational
 */
function buildTiff(): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(190)
  const dv = new DataView(buf.buffer)
  const le = true

  buf[0] = 0x49
  buf[1] = 0x49 // II
  dv.setUint16(2, 0x002a, le)
  dv.setUint32(4, 8, le)

  // IFD0 @8
  dv.setUint16(8, 3, le)
  dv.setUint16(10, 0x0112, le)
  dv.setUint16(12, 3, le)
  dv.setUint32(14, 1, le)
  dv.setUint16(18, 1, le) // Orientation = 1（内联）

  dv.setUint16(22, 0x8769, le)
  dv.setUint16(24, 4, le)
  dv.setUint32(26, 1, le)
  dv.setUint32(30, 50, le) // ExifIFD @50

  dv.setUint16(34, 0x8825, le)
  dv.setUint16(36, 4, le)
  dv.setUint32(38, 1, le)
  dv.setUint32(42, 88, le) // GPS IFD @88
  dv.setUint32(46, 0, le)

  // ExifIFD @50
  dv.setUint16(50, 1, le)
  dv.setUint16(52, 0x9003, le)
  dv.setUint16(54, 2, le)
  dv.setUint32(56, 20, le)
  dv.setUint32(60, 68, le) // 字符串 @68
  dv.setUint32(64, 0, le)
  const dt = '2026:09:27 10:41:00'
  for (let i = 0; i < dt.length; i += 1) buf[68 + i] = dt.charCodeAt(i)
  buf[68 + dt.length] = 0

  // GPS IFD @88
  dv.setUint16(88, 4, le)
  dv.setUint16(90, 0x0001, le)
  dv.setUint16(92, 2, le)
  dv.setUint32(94, 2, le)
  buf[98] = 0x4e // 'N'（内联）
  buf[99] = 0

  dv.setUint16(102, 0x0002, le)
  dv.setUint16(104, 5, le)
  dv.setUint32(106, 3, le)
  dv.setUint32(110, 142, le)

  dv.setUint16(114, 0x0003, le)
  dv.setUint16(116, 2, le)
  dv.setUint32(118, 2, le)
  buf[122] = 0x45 // 'E'（内联）
  buf[123] = 0

  dv.setUint16(126, 0x0004, le)
  dv.setUint16(128, 5, le)
  dv.setUint32(130, 3, le)
  dv.setUint32(134, 166, le)
  dv.setUint32(138, 0, le)

  // lat 39°54'0" @142
  dv.setUint32(142, 39, le)
  dv.setUint32(146, 1, le)
  dv.setUint32(150, 54, le)
  dv.setUint32(154, 1, le)
  dv.setUint32(158, 0, le)
  dv.setUint32(162, 1, le)

  // lon 116°24'0" @166
  dv.setUint32(166, 116, le)
  dv.setUint32(170, 1, le)
  dv.setUint32(174, 24, le)
  dv.setUint32(178, 1, le)
  dv.setUint32(182, 0, le)
  dv.setUint32(186, 1, le)

  return buf
}

function wrapJpeg(tiff: Uint8Array): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + tiff.length)
  let p = 0
  out[p++] = 0xff
  out[p++] = 0xd8 // SOI
  out[p++] = 0xff
  out[p++] = 0xe1 // APP1
  const len = 2 + 6 + tiff.length
  out[p++] = (len >> 8) & 0xff
  out[p++] = len & 0xff
  for (const b of [0x45, 0x78, 0x69, 0x66, 0x00, 0x00]) out[p++] = b // "Exif\0\0"
  out.set(tiff, p)
  return out
}

describe('parseExif', () => {
  it('从小端 JPEG 里解出拍摄时间、方向、GPS', () => {
    const data = parseExif(wrapJpeg(buildTiff()))
    expect(data).not.toBeNull()
    expect(data?.orientation).toBe(1)
    expect(data?.takenAt).toBe(new Date(2026, 8, 27, 10, 41, 0).getTime())
    expect(data?.gps?.lat).toBeCloseTo(39.9, 6)
    expect(data?.gps?.lon).toBeCloseTo(116.4, 6)
  })

  it('大端（MM）字节序也能解', () => {
    const buf = new Uint8Array(26)
    const dv = new DataView(buf.buffer)
    const be = false
    buf[0] = 0x4d
    buf[1] = 0x4d // MM
    dv.setUint16(2, 0x002a, be)
    dv.setUint32(4, 8, be)
    dv.setUint16(8, 1, be)
    dv.setUint16(10, 0x0112, be)
    dv.setUint16(12, 3, be)
    dv.setUint32(14, 1, be)
    dv.setUint16(18, 3, be) // Orientation = 3（内联，大端）
    dv.setUint32(22, 0, be)

    const data = parseExif(wrapJpeg(buf))
    expect(data?.orientation).toBe(3)
    expect(data?.takenAt).toBeUndefined()
  })

  it('非 JPEG 返回 null，不抛错', () => {
    expect(parseExif(new Uint8Array([0x89, 0x50, 0x4e, 0x47]))).toBeNull()
  })

  it('截断的字节返回 null', () => {
    const full = wrapJpeg(buildTiff())
    expect(parseExif(full.slice(0, 20))).toBeNull()
  })

  it('没有 APP1 的 JPEG 返回 null', () => {
    expect(parseExif(new Uint8Array([0xff, 0xd8, 0xff, 0xda, 0x00, 0x02]))).toBeNull()
  })
})

describe('parseExifDateTime', () => {
  it('解析 EXIF 时间字符串', () => {
    expect(parseExifDateTime('2026:09:27 10:41:00')).toBe(new Date(2026, 8, 27, 10, 41, 0).getTime())
  })

  it('格式不符返回 undefined', () => {
    expect(parseExifDateTime('')).toBeUndefined()
    expect(parseExifDateTime('0000:00:00 00:00:00')).toBeUndefined()
  })
})

describe('readExifFromBlob', () => {
  it('从 Blob 里读 EXIF', async () => {
    const blob = new Blob([wrapJpeg(buildTiff())], { type: 'image/jpeg' })
    const data = await readExifFromBlob(blob)
    expect(data?.orientation).toBe(1)
    expect(data?.gps?.lat).toBeCloseTo(39.9, 6)
  })
})
