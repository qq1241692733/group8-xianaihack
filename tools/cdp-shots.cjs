/*
 * 无头截图：CDP + 真实等待。
 *
 * 为什么不用 `--virtual-time-budget`：虚拟时间只快进 JS 定时器与 rAF，
 * 而 IndexedDB 是真实异步。用虚拟时间会截到「空库」的时间场（冷青、偏小），
 * 很容易误判成配色或尺寸 bug。
 *
 * 一个必须记住的坑：Target.attachToTarget(flatten) 拿到的 sessionId **绑定在建立它
 * 那条 WebSocket 上**。换一条连接发同一个 sessionId 会报 "Session with given id not found"。
 * 所以这里全程只用一条连接。
 */
const { spawn } = require('node:child_process')
const fs = require('node:fs')

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
const PORT = 9333
const BASE = 'http://localhost:4173'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const SHOTS = [
  { name: '01-此刻-时间场', url: `${BASE}/?stage=field&cap=1`, wait: 3600 },
  { name: '02-此刻-攒了三件', url: `${BASE}/?stage=staged&cap=1`, wait: 4200 },
  { name: '03-发现', url: `${BASE}/?stage=discover&cap=1`, wait: 3800 },
  { name: '04-理解', url: `${BASE}/?stage=understand&cap=1`, wait: 4200 },
  { name: '05-发现-展开原件', url: `${BASE}/?stage=discover&cap=1`, wait: 3000, click: 'discover' },
  {
    name: '06-此刻-长按记下',
    url: `${BASE}/?stage=staged&cap=1`,
    wait: 4200,
    // 按在「记下此刻」上不放：rAF 那条路会把进度条推满并提交。
    waitAfter: 1100,
    js: `(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '长按记下此刻')
      if (!btn) return false
      const r = btn.getBoundingClientRect()
      btn.dispatchEvent(new PointerEvent('pointerdown', {
        clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true,
      }))
      return true
    })()`,
  },
  {
    name: '07-看见-直达拍照',
    url: `${BASE}/?stage=field&cap=1`,
    wait: 3600,
    waitAfter: 1600,
    js: `(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.trim().startsWith('图片'))
      if (b) b.click()
      return !!b
    })()`,
  },
  {
    name: '08-理解-出口',
    url: `${BASE}/?stage=understand&cap=1`,
    // 等开场三句 + 选项落下（OPENING_AT 3800 + TERMINAL_GAP 520）
    wait: 5200,
    // 点第一个选项后，want 分支四句 + 并列出口（WANT_AT 5600 + 520）
    waitAfter: 8200,
    js: `(() => {
      const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('其实我还在想'))
      if (b) b.click()
      return !!b
    })()`,
  },
]

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
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
  const profile = 'D:/ai/the_time/.cdp_shot_profile'
  fs.rmSync(profile, { recursive: true, force: true })

  const chrome = spawn(CHROME, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--hide-scrollbars',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    '--window-size=1280,1040',
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

  for (const shot of SHOTS) {
    await cdp.send('Page.navigate', { url: shot.url }, sessionId)
    await sleep(shot.wait)

    if (shot.click === 'discover') {
      // 展开第一张连接的「看原件」，截到的才是「先材料后结论」的真实样子
      await cdp.send(
        'Runtime.evaluate',
        {
          expression: `(() => {
            const btns = [...document.querySelectorAll('button')].filter(b => b.textContent.trim() === '看原件')
            if (btns[0]) btns[0].click()
            return btns.length
          })()`,
          returnByValue: true,
        },
        sessionId,
      )
      await sleep(1200)
    }

    if (shot.js) {
      await cdp.send('Runtime.evaluate', { expression: shot.js, returnByValue: true }, sessionId)
      await sleep(shot.waitAfter ?? 800)
    }

    const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId)
    fs.writeFileSync(`D:/ai/the_time/_shot_${shot.name}.png`, Buffer.from(data, 'base64'))
    console.log('shot', shot.name)
  }

  cdp.ws.close()
  chrome.kill()
  try {
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 3 })
  } catch {
    /* profile 目录留给下次覆盖，不影响截图结果 */
  }
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
