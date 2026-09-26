/**
 * CDP 截图探针：导航 → （可选）点一个按钮 → 截图。
 * 与 shoot_app.mjs 的差别：多一步「点一下再截」，用来验收点开后的浮层 / 交互态。
 *
 * 用法：
 *   node tools/probe_click.mjs <out.png> <url> [按钮文案]
 * 例：
 *   CDP_PORT=9222 WAIT_MS=6000 node tools/probe_click.mjs .tmp_ui/x.png \
 *     "http://localhost:5173/?stage=staged&cap=1&theme=day"
 *
 * ⚠️ 起 chrome 与跑本脚本、以及最后杀 chrome，**必须在同一条命令里**——
 *    后台进程跨 Bash 调用会被回收（dev server 同理，5173 会变 502）。
 *    本脚本对 CDP 端口自带 40×1s 重试，起完 chrome 直接跑即可，不必手工 sleep。
 */
const [, , out, url, clickText] = process.argv
const PORT = process.env.CDP_PORT || '9222'
const WAIT_MS = Number(process.env.WAIT_MS || '5000')
import { writeFileSync } from 'node:fs'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
async function http(p) {
  for (let i = 0; i < 40; i++) {
    try {
      return await (await fetch(`http://127.0.0.1:${PORT}${p}`)).json()
    } catch {
      await sleep(1000)
    }
  }
  throw new Error('CDP not reachable on ' + PORT)
}
class CDP {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    ws.addEventListener('message', (e) => {
      const m = JSON.parse(e.data)
      if (m.id && this.pending.has(m.id)) {
        const { resolve, reject } = this.pending.get(m.id)
        this.pending.delete(m.id)
        m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result)
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
const page = (await http('/json/list')).find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
await new Promise((r) => ws.addEventListener('open', r))
const cdp = new CDP(ws)
await cdp.send('Page.enable')
await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 1000, deviceScaleFactor: 2, mobile: false })
await cdp.send('Page.navigate', { url })
await sleep(WAIT_MS)
if (clickText) {
  const js = `(() => { const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()===${JSON.stringify(clickText)}); if(b){b.click(); return true} return false })()`
  const r = await cdp.send('Runtime.evaluate', { expression: js, returnByValue: true })
  console.log('click', clickText, r.result?.value)
  await sleep(1600)
}
const { data } = await cdp.send('Page.captureScreenshot', { format: 'png' })
writeFileSync(out, Buffer.from(data, 'base64'))
console.log('shot ->', out)
ws.close()
