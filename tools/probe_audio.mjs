/**
 * 音频端点探测：确认配置的 OpenAI 兼容端点是否支持音频输入（input_audio）。
 *
 * 为什么先探测再做：内容级音频识别要先把 webm/opus 转成 wav 再送出去，工作量不小；
 * 如果端点根本不支持音频输入，这条路直接关掉，不值得写转码。
 *
 * 用法（在 app/ 下，需 .env.local 里有 LLM_API_KEY）：
 *   node ../tools/probe_audio.mjs                 # 用 LLM_VISION_MODEL / LLM_MODEL
 *   node ../tools/probe_audio.mjs gpt-4o-audio-preview   # 指定模型试
 *
 * 它只发一段 1 秒的静音 wav，问一句「这段音频里有什么」。成功返回 ok:true 即支持。
 * 这是唯一一次主动把音频送到远端——只发静音，不含任何真实录音。
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'app')

function readEnv() {
  const path = resolve(appDir, '.env.local')
  if (!existsSync(path)) return {}
  const out = {}
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)\s*=\s*(.*)$/.exec(line.trim())
    if (m) out[m[1]] = m[2].trim()
  }
  return out
}

/** 44 字节 WAV 头 + 1 秒 16kHz 单声道 16-bit 静音。 */
function silentWav(seconds = 1, rate = 16000) {
  const samples = seconds * rate
  const dataBytes = samples * 2
  const buf = Buffer.alloc(44 + dataBytes)
  buf.write('RIFF', 0)
  buf.writeUInt32LE(36 + dataBytes, 4)
  buf.write('WAVE', 8)
  buf.write('fmt ', 12)
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20) // PCM
  buf.writeUInt16LE(1, 22) // mono
  buf.writeUInt32LE(rate, 24)
  buf.writeUInt32LE(rate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36)
  buf.writeUInt32LE(dataBytes, 40)
  return buf
}

const env = readEnv()
const key = env.LLM_API_KEY
const base = (env.LLM_BASE_URL || 'https://api.qiyuanapi.cc/v1').replace(/\/+$/, '')
const model = process.argv[2] || env.LLM_VISION_MODEL || env.LLM_MODEL

if (!key) {
  console.error('✗ .env.local 里没有 LLM_API_KEY，无法探测。')
  process.exit(1)
}
if (!model) {
  console.error('✗ 没有 LLM_VISION_MODEL / LLM_MODEL 可试。')
  process.exit(1)
}

const data = silentWav().toString('base64')
console.log(`探测端点：${base}  模型：${model}`)
console.log('发送 1 秒静音 wav（不含任何真实录音）…\n')

const body = {
  model,
  messages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: '这段音频里有什么声音？一句话回答。' },
        { type: 'input_audio', input_audio: { data, format: 'wav' } },
      ],
    },
  ],
}

try {
  const res = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify(body),
  })
  const raw = await res.text()
  if (res.ok) {
    console.log('✓ 端点返回 200 —— 支持音频输入。')
    console.log('  返回片段：', raw.slice(0, 300))
    console.log('\n→ 可以继续做内容级音频识别（需 WAV 转码 + 代理音频分支）。')
  } else {
    console.log(`✗ 端点返回 ${res.status} —— 大概率不支持音频输入。`)
    console.log('  返回片段：', raw.slice(0, 400))
    console.log('\n→ 建议关闭内容级音频，声音维持本地轻量特征。')
  }
} catch (error) {
  console.error('✗ 请求失败：', error instanceof Error ? error.message : error)
}
