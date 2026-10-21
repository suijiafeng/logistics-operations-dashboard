// 模拟数据引擎服务：HTTP 快照 + WebSocket 增量推送
// 仿真步进 250ms；每 1s 向所有客户端广播一条 delta（车辆位置扁平数组 + KPI + 网点统计 + 新事件）
import http from 'node:http'
import zlib from 'node:zlib'
import { WebSocketServer } from 'ws'
import { step, snapshot, delta } from './engine.js'

const PORT = process.env.PORT || 8787
const configuredMaxBuffered = Number(process.env.WS_MAX_BUFFERED_BYTES || 1_000_000)
const MAX_BUFFERED_BYTES = Number.isFinite(configuredMaxBuffered) && configuredMaxBuffered > 0
  ? configuredMaxBuffered
  : 1_000_000

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
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
