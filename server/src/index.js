// 模拟数据引擎服务：HTTP 快照 + WebSocket 增量推送
// 仿真步进 250ms；每 1s 向所有客户端广播一条 delta（车辆位置扁平数组 + KPI + 网点统计 + 新事件）
import http from 'node:http'
import zlib from 'node:zlib'
import { WebSocketServer } from 'ws'
import { step, snapshot, delta, vehicleDetail, updateAlert, ALERT_STATUS, recordHistoryFrame, historyIndex, historyFrame, vehicleTrail, HISTORY_INTERVAL } from './engine.js'

const PORT = process.env.PORT || 8787
const configuredMaxBuffered = Number(process.env.WS_MAX_BUFFERED_BYTES || 1_000_000)
const MAX_BUFFERED_BYTES = Number.isFinite(configuredMaxBuffered) && configuredMaxBuffered > 0
  ? configuredMaxBuffered
  : 1_000_000

function readJson(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let body = ''
    req.on('data', (chunk) => { body += chunk; if (body.length > limit) { reject(new Error('body_too_large')); req.destroy() } })
    req.on('end', () => { try { resolve(body ? JSON.parse(body) : {}) } catch (error) { reject(error) } })
    req.on('error', reject)
  })
}

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.statusCode = 204; res.end(); return }
  // 告警处置：POST /alerts/:id/status  { status: 'acked' | 'handling' | 'closed', by?: string }；变更随下一包 delta 广播给所有大屏
  const alertMatch = req.method === 'POST' && req.url?.match(/^\/alerts\/(\d+)\/status$/)
  if (alertMatch) {
    readJson(req).then((body) => {
      res.setHeader('Content-Type', 'application/json')
      const status = typeof body.status === 'string' ? body.status : ''
      const by = typeof body.by === 'string' && body.by.trim() ? body.by.trim().slice(0, 32) : '大屏值班'
      if (!ALERT_STATUS.includes(status)) { res.statusCode = 400; res.end(JSON.stringify({ error: 'invalid_status' })); return }
      const result = updateAlert(alertMatch[1], status, by)
      if (result.error) { res.statusCode = result.error === 'alert_not_found' ? 404 : 409; res.end(JSON.stringify(result)); return }
      res.end(JSON.stringify({ alert: result.alert, ts: Date.now() }))
    }).catch(() => {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'invalid_body' }))
    })
    return
  }
  if (req.url === '/snapshot') {
    try {
      const body = JSON.stringify(snapshot())
      res.setHeader('Content-Type', 'application/json')
      res.setHeader('Vary', 'Accept-Encoding')
      // 快照约 230KB，车辆坐标数组重复度高，gzip 后约为三分之一
      if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
        const zipped = zlib.gzipSync(body, { level: 1 })
        res.setHeader('Content-Encoding', 'gzip')
        res.end(zipped)
        console.log(`[snapshot] ${(body.length / 1024).toFixed(1)} KB → gzip ${(zipped.length / 1024).toFixed(1)} KB`)
      } else {
        res.end(body)
        console.log(`[snapshot] ${(body.length / 1024).toFixed(1)} KB`)
      }
    } catch (error) {
      console.error('[snapshot] generate failed', error)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'snapshot_unavailable' }))
    }
    return
  }
  // 历史回放：/history 帧列表；/history/:ts 某一帧全量位置（gzip）；尾迹见 /vehicles/:plate/trail
  if (req.url === '/history') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(historyIndex()))
    return
  }
  const frameMatch = req.url?.match(/^\/history\/(\d+)$/)
  if (frameMatch) {
    const frame = historyFrame(Number(frameMatch[1]))
    res.setHeader('Content-Type', 'application/json')
    if (!frame) { res.statusCode = 404; res.end(JSON.stringify({ error: 'frame_not_found' })); return }
    const body = JSON.stringify(frame)
    if (/\bgzip\b/.test(String(req.headers['accept-encoding'] || ''))) {
      res.setHeader('Content-Encoding', 'gzip')
      res.end(zlib.gzipSync(body, { level: 1 }))
    } else res.end(body)
    return
  }
  // 单车详情按需查询：/vehicles/粤A·10000（URL 编码），不进 1Hz 增量包；/vehicles/:plate/trail 为最近 1 小时尾迹
  if (req.url?.startsWith('/vehicles/')) {
    const [path, query] = req.url.slice('/vehicles/'.length).split('?')
    const [rawPlate, sub] = path.split('/')
    let plate = ''
    try { plate = decodeURIComponent(rawPlate ?? '') } catch { plate = '' }
    res.setHeader('Content-Type', 'application/json')
    if (sub === 'trail') {
      const minutes = Math.min(60, Math.max(1, Number(new URLSearchParams(query).get('minutes')) || 60))
      const trail = plate ? vehicleTrail(plate, minutes * 60_000) : null
      if (!trail) { res.statusCode = 404; res.end(JSON.stringify({ error: 'vehicle_not_found' })); return }
      res.end(JSON.stringify(trail))
      return
    }
    const detail = plate ? vehicleDetail(plate) : null
    if (!detail) { res.statusCode = 404; res.end(JSON.stringify({ error: 'vehicle_not_found' })); return }
    res.end(JSON.stringify({ ...detail, ts: Date.now() }))
    return
  }
  if (req.url === '/health') {
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ ok: true }))
    return
  }
  res.statusCode = 404
  res.end('not found')
})

// 消息压缩（permessage-deflate，浏览器原生支持）：每秒增量包约 227KB → 约 85KB。
// 按连接分别压缩，最快档每个连接每秒约多花 3–4ms CPU；小于 1KB 的消息不压缩
const wss = new WebSocketServer({ server, perMessageDeflate: { zlibDeflateOptions: { level: 1 }, threshold: 1024 } })
wss.on('connection', (ws) => {
  console.log('[ws] client connected, total =', wss.clients.size)
  ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }))
  ws.on('close', () => console.log('[ws] client disconnected, total =', wss.clients.size))
  ws.on('error', (error) => console.error('[ws] client error', error.message))
})
wss.on('error', (error) => console.error('[ws] server error', error))

// 仿真步进
setInterval(() => step(250), 250)
// 历史帧：启动即记第一帧，之后每 10 秒一帧，环形保留 1 小时
recordHistoryFrame()
setInterval(() => recordHistoryFrame(), HISTORY_INTERVAL)

// 1 秒聚合广播
let lastBytes = 0
let skippedSlowClients = 0
setInterval(() => {
  if (wss.clients.size === 0) return
  const body = JSON.stringify(delta())
  lastBytes = body.length
  for (const ws of wss.clients) {
    if (ws.readyState !== ws.OPEN) continue
    if (ws.bufferedAmount > MAX_BUFFERED_BYTES) {
      skippedSlowClients++
      continue
    }
    ws.send(body, (error) => {
      if (error) console.error('[ws] send failed', error.message)
    })
  }
}, 1000)
setInterval(() => {
  if (lastBytes) {
    const skipped = skippedSlowClients ? `, skipped slow clients ${skippedSlowClients}` : ''
    console.log(`[delta] ${(lastBytes / 1024).toFixed(1)} KB/s → ${wss.clients.size} clients${skipped}`)
    skippedSlowClients = 0
  }
}, 15000)

server.on('error', (error) => {
  console.error('[http] server error', error)
})

server.listen(PORT, () => {
  console.log(`模拟数据引擎已启动: http://localhost:${PORT}（快照 /snapshot，WS 同端口）`)
})
