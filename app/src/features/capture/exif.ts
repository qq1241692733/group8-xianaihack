/**
 * 手写的最小 EXIF 解析器。零依赖，只处理 JPEG。
 *
 * 为什么手写而不是加一个库：这个项目只取三样东西——拍摄时间、方向、GPS 坐标。
 * 为一个 30KB 的依赖引入一堆用不到的能力，不值；而且依赖版本在这个项目里是钉死的。
 * 相册上传的 File 保留 EXIF，相册成为照片带真实信号的唯一来路（相机路径走
 * canvas.toBlob，EXIF 在这一步就没了——见 useCamera）。
 *
 * 纪律：越界、类型不符、任何异常一律返回 null，**永不抛错**。解析不出 EXIF 不是错误，
 * 只是这张照片没有时间/坐标可用，写入层回落到上传时刻。
 */

export interface ExifData {
  /** DateTimeOriginal → 毫秒。进时间流时优先于上传时间。 */
  takenAt?: number
  /** 1..8。 */
  orientation?: number
  gps?: { lat: number; lon: number }
}

/* ---------- TIFF tag ---------- */
const TAG_ORIENTATION = 0x0112
const TAG_EXIF_IFD = 0x8769
const TAG_GPS_IFD = 0x8825
const TAG_DATETIME_ORIGINAL = 0x9003
const TAG_GPS_LAT_REF = 0x0001
const TAG_GPS_LAT = 0x0002
const TAG_GPS_LON_REF = 0x0003
const TAG_GPS_LON = 0x0004

/* ---------- TIFF 字段类型 ---------- */
const TYPE_ASCII = 2
const TYPE_SHORT = 3
const TYPE_LONG = 4
const TYPE_RATIONAL = 5

function typeSize(type: number): number {
  switch (type) {
    case 1: // BYTE
    case TYPE_ASCII:
    case 7: // UNDEFINED
      return 1
    case TYPE_SHORT:
      return 2
    case TYPE_LONG:
    case 9: // SLONG
      return 4
    case TYPE_RATIONAL:
    case 10: // SRATIONAL
      return 8
    default:
      return 0
  }
}

interface IfdEntry {
  tag: number
  type: number
  count: number
  /** 条目在字节流里的绝对起点（12 字节：tag2/type2/count4/value4）。 */
  entryAbs: number
}

function readIfd(
  view: DataView,
  tiffStart: number,
  ifdRel: number,
  little: boolean,
): IfdEntry[] | null {
  const abs = tiffStart + ifdRel
  if (abs + 2 > view.byteLength) return null

  const n = view.getUint16(abs, little)
  if (abs + 2 + n * 12 > view.byteLength) return null

  const out: IfdEntry[] = []
  for (let i = 0; i < n; i += 1) {
    const entryAbs = abs + 2 + i * 12
    out.push({
      tag: view.getUint16(entryAbs, little),
      type: view.getUint16(entryAbs + 2, little),
      count: view.getUint32(entryAbs + 4, little),
      entryAbs,
    })
  }
  return out
}

/** 取条目的值所在区间：值 ≤ 4 字节时内联在条目里，否则是相对 TIFF 起点的偏移。 */
function valueOffset(view: DataView, tiffStart: number, entry: IfdEntry, little: boolean): number | null {
  const size = typeSize(entry.type) * entry.count
  if (size <= 0) return null
  if (size <= 4) return entry.entryAbs + 8
  const off = view.getUint32(entry.entryAbs + 8, little)
  const abs = tiffStart + off
  return abs + size > view.byteLength ? null : abs
}

function readAscii(view: DataView, abs: number, count: number): string {
  let s = ''
  for (let i = 0; i < count; i += 1) {
    const c = view.getUint8(abs + i)
    if (c === 0) break
    s += String.fromCharCode(c)
  }
  return s
}

function readRational(view: DataView, abs: number, little: boolean): number {
  const num = view.getUint32(abs, little)
  const den = view.getUint32(abs + 4, little)
  return den === 0 ? 0 : num / den
}

function seekIfd(entries: IfdEntry[], tag: number): IfdEntry | undefined {
  return entries.find((entry) => entry.tag === tag)
}

function parseTiff(bytes: Uint8Array, tiffStart: number): ExifData | null {
  if (tiffStart + 8 > bytes.length) return null

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  const b0 = bytes[tiffStart]
  const b1 = bytes[tiffStart + 1]
  let little: boolean
  if (b0 === 0x49 && b1 === 0x49) little = true
  else if (b0 === 0x4d && b1 === 0x4d) little = false
  else return null

  if (view.getUint16(tiffStart + 2, little) !== 0x002a) return null

  const ifd0 = readIfd(view, tiffStart, view.getUint32(tiffStart + 4, little), little)
  if (!ifd0) return null

  const out: ExifData = {}

  const orientation = seekIfd(ifd0, TAG_ORIENTATION)
  if (orientation && orientation.type === TYPE_SHORT) {
    const abs = valueOffset(view, tiffStart, orientation, little)
    if (abs !== null) out.orientation = view.getUint16(abs, little)
  }

  // 拍摄时间
  const exifPtr = seekIfd(ifd0, TAG_EXIF_IFD)
  if (exifPtr && exifPtr.type === TYPE_LONG) {
    const sub = readIfd(view, tiffStart, view.getUint32(exifPtr.entryAbs + 8, little), little)
    const dt = sub ? seekIfd(sub, TAG_DATETIME_ORIGINAL) : undefined
    if (dt && dt.type === TYPE_ASCII) {
      const abs = valueOffset(view, tiffStart, dt, little)
      if (abs !== null) {
        const takenAt = parseExifDateTime(readAscii(view, abs, dt.count))
        if (takenAt !== undefined) out.takenAt = takenAt
      }
    }
  }

  // GPS
  const gpsPtr = seekIfd(ifd0, TAG_GPS_IFD)
  if (gpsPtr && gpsPtr.type === TYPE_LONG) {
    const gps = readIfd(view, tiffStart, view.getUint32(gpsPtr.entryAbs + 8, little), little)
    const coords = gps ? readGps(view, tiffStart, gps, little) : null
    if (coords) out.gps = coords
  }

  return out
}

function readGps(
  view: DataView,
  tiffStart: number,
  gps: IfdEntry[],
  little: boolean,
): { lat: number; lon: number } | null {
  const latRef = seekIfd(gps, TAG_GPS_LAT_REF)
  const lat = seekIfd(gps, TAG_GPS_LAT)
  const lonRef = seekIfd(gps, TAG_GPS_LON_REF)
  const lon = seekIfd(gps, TAG_GPS_LON)
  if (!lat || !lon || lat.type !== TYPE_RATIONAL || lon.type !== TYPE_RATIONAL) return null
  if (lat.count < 3 || lon.count < 3) return null

  const latAbs = valueOffset(view, tiffStart, lat, little)
  const lonAbs = valueOffset(view, tiffStart, lon, little)
  if (latAbs === null || lonAbs === null) return null

  const toDeg = (abs: number) =>
    readRational(view, abs, little) +
    readRational(view, abs + 8, little) / 60 +
    readRational(view, abs + 16, little) / 3600

  let latDeg = toDeg(latAbs)
  let lonDeg = toDeg(lonAbs)

  // Ref 是 ASCII 两字节（含终止符）。
  const latRefAbs = latRef ? valueOffset(view, tiffStart, latRef, little) : null
  const lonRefAbs = lonRef ? valueOffset(view, tiffStart, lonRef, little) : null
  if (latRefAbs !== null && view.getUint8(latRefAbs) === 0x53 /* 'S' */) latDeg = -latDeg
  if (lonRefAbs !== null && view.getUint8(lonRefAbs) === 0x57 /* 'W' */) lonDeg = -lonDeg

  return { lat: latDeg, lon: lonDeg }
}

/** "2026:09:27 10:41:00" → 毫秒（按本地时区，EXIF 不带时区）。解析不出返回 undefined。 */
export function parseExifDateTime(s: string): number | undefined {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim())
  if (!m) return undefined
  const [, ys, mos, ds, hs, mis, secs] = m
  const y = Number(ys)
  const mo = Number(mos)
  const d = Number(ds)
  const h = Number(hs)
  const mi = Number(mis)
  const sec = Number(secs)
  // EXIF 的"空值"常写成 0000:00:00 —— JS 会把越界字段归一化，必须自己挡。
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || sec > 59) return undefined
  const date = new Date(y, mo - 1, d, h, mi, sec)
  return Number.isNaN(date.getTime()) ? undefined : date.getTime()
}

/**
 * 从 JPEG 字节里解 EXIF。只处理 JPEG（SOI FF D8 → 扫到 APP1 → TIFF）。
 * 非 JPEG、无 APP1、任何越界 → null。
 */
export function parseExif(bytes: Uint8Array): ExifData | null {
  try {
    if (bytes.length < 4) return null
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null

    let p = 2
    while (p + 4 <= bytes.length) {
      if (bytes[p] !== 0xff) {
        // 不在 marker 上就往下找一个 FF（容错）
        p += 1
        continue
      }
      const marker = bytes[p + 1]
      if (marker === 0xff) {
        p += 1
        continue
      }
      // SOS / EOI 之后是压缩数据，停止扫段
      if (marker === 0xda || marker === 0xd9) break
      // 无长度字段的独立 marker
      if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
        p += 2
        continue
      }

      const len = (bytes[p + 2] << 8) | bytes[p + 3]
      if (len < 2) break

      // APP1 + "Exif\0\0" → TIFF 从 p + 10 开始
      if (
        marker === 0xe1 &&
        p + 10 <= bytes.length &&
        bytes[p + 4] === 0x45 &&
        bytes[p + 5] === 0x78 &&
        bytes[p + 6] === 0x69 &&
        bytes[p + 7] === 0x66 &&
        bytes[p + 8] === 0x00 &&
        bytes[p + 9] === 0x00
      ) {
        return parseTiff(bytes, p + 10)
      }

      p += 2 + len
    }
    return null
  } catch {
    return null
  }
}

/** 只读前 128KB——EXIF 总在最前面。File 也是 Blob，相册路径直接可用。 */
export async function readExifFromBlob(blob: Blob): Promise<ExifData | null> {
  try {
    const head = await blob.slice(0, 128 * 1024).arrayBuffer()
    return parseExif(new Uint8Array(head))
  } catch {
    return null
  }
}
