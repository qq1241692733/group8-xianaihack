/**
 * 用 CDP 驱动本机 Chrome 给 app/（vite dev，默认 http://localhost:5173）截图。
 *
 * 为什么不用 `chrome --headless --screenshot`：那个在 load 事件后立刻截，
 * 而 app 的数据要靠 IndexedDB 异步 hydrate——虚拟时间推不动真实 IDB IO，
 * 会永远截到「还没有长出什么」的空态。这里连上 CDP、导航后真实等 N 毫秒再截。
 *
 * 用法：
 *   node tools/shoot_app.mjs <outDir> <profileDir> <baseUrl> <spec...>
 *   spec 形如  name::querystring
 * 例：
 *   node tools/shoot_app.mjs .tmp_ui/app .tmp_ui/prof http://localhost:5173 \
 *     a-shelf::stage=discover&cap=1&theme=day
 *
 * 前置：另开一个 chrome 进程带 --remote-debugging-port=9222 --user-data-dir=<profile>
 *      （本脚本只管连，不管起浏览器；起浏览器的命令见 run 脚本/记忆）。
 */
const [, , outDir, , baseUrl, ...specs] = process.argv
const PORT = process.env.CDP_PORT || '9222'
const WAIT_MS = Number(process.env.WAIT_MS || '4000')

import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

mkdirSync(outDir, { recursive: true })

async function http(path) {
  const r = await fetch(`http://127.0.0.1:${PORT}${path}`)
  return r.json()
}

class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (e) => {
      const msg = JSON.parse(e.data)
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id)
        this.pending.delete(msg.id)
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
      }
    })
  }
  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    ws.addEventListener('open', () => resolve(new CDP(ws)))
    ws.addEventListener('error', (e) => reject(new Error('ws error ' + e.message)))
  })
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const targets = await http('/json/list')
let page = targets.find((t) => t.type === 'page')
if (!page) {
  page = await http('/json/new?about:blank')
}

for (const spec of specs) {
  const [name, query = ''] = spec.split('::')
  const url = query ? `${baseUrl}/?${query}` : baseUrl
  const t = await http('/json/list').then((l) => l.find((x) => x.type === 'page') ?? page)

  const cdp = await connect(
    process.env.CDP_WS || (await http('/json/list')).find((x) => x.type === 'page').webSocketDebuggerUrl,
  )
  await cdp.send('Page.enable')
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 900,
    height: 1000,
    deviceScaleFactor: 2,
    mobile: false,
  })
  await cdp.send('Page.navigate', { url })
  // 真实等待：让 IndexedDB hydrate + 种子写入 + React 重渲染走完。
  await sleep(WAIT_MS)
  const { data } = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  const out = join(outDir, `${name}.png`)
  writeFileSync(out, Buffer.from(data, 'base64'))
  console.log('shot', name, '->', out)
  cdp.ws.close()
  void t
}
