// 模拟数据引擎服务：HTTP 快照 + WebSocket 增量推送
// 仿真步进 250ms；每 1s 向所有客户端广播一条 delta（车辆位置扁平数组 + KPI + 网点统计 + 新事件）
import http from 'node:http'
import { WebSocketServer } from 'ws'
import { step, snapshot, delta } from './engine.js'

const PORT = process.env.PORT || 8787

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.url === '/snapshot') {
    const body = JSON.stringify(snapshot())
    res.setHeader('Content-Type', 'application/json')
    res.end(body)
    console.log(`[snapshot] ${(body.length / 1024).toFixed(1)} KB`)
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

const wss = new WebSocketServer({ server })
wss.on('connection', (ws) => {
  console.log('[ws] client connected, total =', wss.clients.size)
  ws.send(JSON.stringify({ type: 'hello', ts: Date.now() }))
  ws.on('close', () => console.log('[ws] client disconnected, total =', wss.clients.size))
})

// 仿真步进
setInterval(() => step(250), 250)

// 1 秒聚合广播
let lastBytes = 0
setInterval(() => {
  if (wss.clients.size === 0) return
  const body = JSON.stringify(delta())
  lastBytes = body.length
  for (const ws of wss.clients) {
    if (ws.readyState === ws.OPEN) ws.send(body)
  }
}, 1000)
setInterval(() => {
  if (lastBytes) console.log(`[delta] ${(lastBytes / 1024).toFixed(1)} KB/s → ${wss.clients.size} clients`)
}, 15000)

server.listen(PORT, () => {
  console.log(`模拟数据引擎已启动: http://localhost:${PORT}（快照 /snapshot，WS 同端口）`)
})
