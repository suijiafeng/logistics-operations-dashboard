// 验收截图：用本机 Chrome 无头模式通过 DevTools 协议对运行中的大屏截图，并采样 HUD 帧率。
//   node scripts/screenshot.mjs --url http://localhost:4173 --out docs
// 之前用 --screenshot 配合 virtual-time-budget 会因 WebSocket 持续推送而无法收敛，这里改为显式等待后截图。
// 需要 Node 22+（全局 WebSocket）与 macOS 上的 Google Chrome。
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : []).filter(Boolean))
const BASE = args.url || 'http://localhost:4173'
const OUT = args.out || 'docs'
const CHROME = args.chrome || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const PORT = 9333
const SETTLE_MS = Number(args.settle || 12000)
// --only a,b 只拍指定名称
const ONLY = args.only ? new Set(args.only.split(',')) : null

const SHOTS = [
  { name: 'screenshot-main', width: 1920, height: 1080, setup: '' },
  { name: 'screenshot-guangdong', width: 1920, height: 1080, setup: "window.__dashboard.setView('440000')" },
  { name: 'screenshot-hub-detail', width: 1920, height: 1080, setup: "window.__dashboard.setView('440000'); window.__dashboard.selectHub('sz')" },
  { name: 'screenshot-vehicle-playback', width: 1920, height: 1080, setup: "window.__dashboard.selectVehicle('粤A·10021'); setTimeout(() => document.querySelector('.timeline .opener')?.click(), 2500)" },
  { name: 'screenshot-cold-chain', width: 1920, height: 1080, setup: "const v = window.__dashboard.vehicles; for (let i = 0; i < 12000; i++) if (Math.floor(v[i*3+2] / 1000) === 1) { window.__dashboard.selectVehicle('粤A·' + (10000 + i)); break } setTimeout(() => document.querySelectorAll('.tabs button')[2]?.click(), 1500)" },
  { name: 'screenshot-1440x900', width: 1440, height: 900, setup: '' },
  { name: 'screenshot-1366x768', width: 1366, height: 768, setup: '' },
]

const profile = mkdtempSync(join(tmpdir(), 'viz-shot-'))
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--window-size=1920,1080', 'about:blank',
], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function browserWs() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://localhost:${PORT}/json/version`)
      return (await res.json()).webSocketDebuggerUrl
    } catch { await sleep(200) }
  }
  throw new Error('Chrome 未在 10 秒内开放调试端口')
}

class Cdp {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map(); ws.onmessage = (e) => this.onMessage(JSON.parse(e.data)) }
  onMessage(msg) {
    if (msg.id && this.pending.has(msg.id)) {
      const { resolve, reject } = this.pending.get(msg.id)
      this.pending.delete(msg.id)
      msg.error ? reject(new Error(`${msg.error.message}`)) : resolve(msg.result)
    }
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id
    this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }))
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true })
  const ws = new WebSocket(await browserWs())
  await new Promise((r) => { ws.onopen = r })
  const cdp = new Cdp(ws)
  const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })
  const s = (method, params) => cdp.send(method, params, sessionId)
  await s('Page.enable')
  await s('Runtime.enable')
  const results = []
  for (const shot of SHOTS) {
    if (ONLY && !ONLY.has(shot.name)) continue
    await s('Emulation.setDeviceMetricsOverride', { width: shot.width, height: shot.height, deviceScaleFactor: 1, mobile: false })
    await s('Page.navigate', { url: `${BASE}/?debug=1&hud=${shot.name === 'screenshot-main' ? 1 : 0}` })
    await sleep(SETTLE_MS)
    // 无头首个页面偶见图表画布为空：等数据到达后补发一次 resize 让 ECharts 按真实尺寸重建，再等渲染
    for (let i = 0; i < 20; i++) {
      const { result } = await s('Runtime.evaluate', { expression: 'window.__dashboard?.renderedVehicles > 0', returnByValue: true })
      if (result.value) break
      await sleep(500)
    }
    await s('Runtime.evaluate', { expression: 'window.dispatchEvent(new Event("resize"))' })
    await sleep(2500)
    if (shot.setup) { await s('Runtime.evaluate', { expression: shot.setup }); await sleep(4000) }
    // 帧率采样：全国与广东视图各连采 5 次，每次间隔 2 秒
    const fps = []
    if (shot.name === 'screenshot-main' || shot.name === 'screenshot-guangdong') {
      for (let i = 0; i < 5; i++) {
        const { result } = await s('Runtime.evaluate', { expression: 'JSON.stringify({ fps: window.__dashboard.fps, frameMs: window.__dashboard.frameMs, rendered: window.__dashboard.renderedVehicles, deltaKB: window.__dashboard.lastDeltaKB, latency: window.__dashboard.latencyMs, quality: window.__dashboard.quality })', returnByValue: true })
        fps.push(JSON.parse(result.value))
        await sleep(2000)
      }
    }
    const { result } = await s('Runtime.evaluate', { expression: 'JSON.stringify({ scrollW: document.documentElement.scrollWidth, scrollH: document.documentElement.scrollHeight, innerW: innerWidth, innerH: innerHeight, view: window.__dashboard.view, status: window.__dashboard.dataStatus })', returnByValue: true })
    const info = JSON.parse(result.value)
    const { data } = await s('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
    const file = join(OUT, `${shot.name}.png`)
    writeFileSync(file, Buffer.from(data, 'base64'))
    results.push({ shot: shot.name, size: `${shot.width}x${shot.height}`, ...info, fps })
    console.log(`${file}  ${shot.width}x${shot.height}  页面 ${info.scrollW}x${info.scrollH}  视图 ${info.view}  数据 ${info.status}${fps.length ? `  FPS ${fps.map((f) => f.fps).join('/')}` : ''}`)
  }
  writeFileSync(join(OUT, 'screenshot-report.json'), JSON.stringify(results, null, 2))
  ws.close()
}

main().catch((error) => { console.error(error); process.exitCode = 1 }).finally(async () => {
  // 等 Chrome 退出后再清理临时配置目录，否则目录还在被写入
  const exited = new Promise((r) => chrome.once('exit', r))
  chrome.kill()
  await Promise.race([exited, sleep(5000)])
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
})
