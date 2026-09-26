/*
 * 通用单页截图器（CDP + 真实等待）。
 *
 * 用法：
 *   node tools/shot-page.cjs <url> <outDir> [--name prefix] [--w 1280] [--h 1000] [--scroll 0,900,...]
 *                            [--states sel1:prefix1,sel2:prefix2] [--js "..." --after 800]
 *
 * 为什么不用 --virtual-time-budget：虚拟时间会快进 rAF，canvas 动画会截到奇怪的相位。
 * 坑：attachToTarget(flatten) 的 sessionId 绑定在建立它的那条 WebSocket 上，全程只用一条连接。
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9344
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const argv = process.argv.slice(2)
const url = argv[0]
const outDir = argv[1] || 'D:/ai/the_time/docs/shots'
const opt = {}
for (let i = 2; i < argv.length; i++) {
  const a = argv[i]
  if (a.startsWith('--')) opt[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
}
const NAME = opt.name || 'page'
const VW = Number(opt.w || 1280)
const VH = Number(opt.h || 1000)
const SCROLLS = (opt.scroll ? String(opt.scroll) : '0').split(',').map(Number)
/* 点击型状态：--click '.st[data-id=press],press' 形式，逗号分隔多条 */
const CLICKS = opt.click ? String(opt.click).split(';').map((s) => s.split('|')) : []
/* 元素裁剪：--el '.phone'（每个 scroll 之后截一次） */
const ELS = opt.el ? String(opt.el).split(';') : []

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    let id = 0
    const pending = new Map()
    ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id)
        pending.delete(msg.id)
        if (msg.error) rej(new Error(JSON.stringify(msg.error)))
        else res(msg.result)
      }
    }
    ws.onerror = reject
    ws.onopen = () =>
      resolve({
        ws,
        send(method, params, sessionId) {
          const msgId = ++id
          const payload = { id: msgId, method, params: params ?? {} }
          if (sessionId) payload.sessionId = sessionId
          ws.send(JSON.stringify(payload))
          return new Promise((res, rej) => pending.set(msgId, { resolve: res, reject: rej }))
        },
      })
  })
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  const profile = `D:/ai/the_time/.cdp_prof_${Date.now()}`

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--window-size=${VW},${VH}`,
    'about:blank',
  ])

  let version
  for (let i = 0; i < 40; i++) {
    try {
      version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json()
      break
    } catch {
      await sleep(250)
    }
  }
  if (!version) throw new Error('chrome 没起来')

  const cdp = await connect(version.webSocketDebuggerUrl)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  await cdp.send('Page.enable', {}, sessionId)
  await cdp.send('Emulation.setDeviceMetricsOverride',
    { width: VW, height: VH, deviceScaleFactor: 1, mobile: false }, sessionId)

  const ev = async (expression) => {
    const r = await cdp.send('Runtime.evaluate',
      { expression, returnByValue: true, awaitPromise: true }, sessionId)
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails))
    return r.result.value
  }
  const shot = async (file, clip) => {
    const { data } = await cdp.send('Page.captureScreenshot',
      { format: 'png', captureBeyondViewport: !!clip, ...(clip ? { clip } : {}) }, sessionId)
    fs.writeFileSync(path.join(outDir, file), Buffer.from(data, 'base64'))
    console.log('shot', file)
  }

  await cdp.send('Page.navigate', { url }, sessionId)
  await sleep(2600)

  const h = await ev('document.documentElement.scrollHeight')
  console.log('文档高度', h)
  const errors = await ev(`(() => { const e = window.__errs || []; return e.length })()`).catch(() => 0)
  if (errors) console.log('页面报错数:', errors)

  for (let i = 0; i < SCROLLS.length; i++) {
    const y = SCROLLS[i]
    await ev(`window.scrollTo(0, ${y})`)
    await sleep(700)
    await shot(`${NAME}-s${i}-y${y}.png`)
    for (const sel of ELS) {
      const box = await ev(`(() => { const n = document.querySelector(${JSON.stringify(sel)});
        if (!n) return null; const r = n.getBoundingClientRect();
        return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
      if (box) await shot(`${NAME}-el${i}.png`, { ...box, scale: 1 })
    }
  }

  for (const [clickSel, tag] of CLICKS) {
    const ok = await ev(`(() => { const n = document.querySelector(${JSON.stringify(clickSel)}); if (!n) return false; n.click(); return true })()`)
    if (!ok) { console.log('click 未命中', clickSel); continue }
    await sleep(1400)
    const box = await ev(`(() => { const n = document.querySelector('.phone'); const r = n.getBoundingClientRect();
      return { x: r.left + window.scrollX, y: r.top + window.scrollY, width: r.width, height: r.height } })()`)
    await shot(`${NAME}-${tag}.png`, { ...box, scale: 1 })
  }

  if (opt.js) {
    const ret = await ev(String(opt.js))
    console.log('js →', typeof ret === 'string' ? ret : JSON.stringify(ret))
    await sleep(Number(opt.after || 900))
    await shot(`${NAME}-js.png`)
  }

  cdp.ws.close()
  chrome.kill()
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 }) } catch {}
  process.exit(0)
}

main().catch((e) => { console.error(e); process.exit(1) })
