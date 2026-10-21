// 传输量实测：快照原始 / gzip 大小，增量包解压后大小与线路实际字节数（permessage-deflate 压缩后）。
//   node scripts/measure.mjs --engine http://localhost:8787 --seconds 10
import http from 'node:http'
import wsLib from '../server/node_modules/ws/index.js'
const { WebSocket } = wsLib

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => a.startsWith('--') ? [a.slice(2), all[i + 1]] : []).filter(Boolean))
const ENGINE = args.engine || 'http://localhost:8787'
const SECONDS = Number(args.seconds || 10)

function get(path, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(`${ENGINE}${path}`, { headers }, (res) => {
      let bytes = 0
      res.on('data', (c) => { bytes += c.length })
      res.on('end', () => resolve({ status: res.statusCode, bytes, encoding: res.headers['content-encoding'] }))
    }).on('error', reject)
  })
}

const raw = await get('/snapshot')
const gz = await get('/snapshot', { 'accept-encoding': 'gzip' })
console.log(`快照：原始 ${(raw.bytes / 1024).toFixed(1)} KB，gzip ${(gz.bytes / 1024).toFixed(1)} KB`)
const frames = await get('/history')
console.log(`历史帧列表：${frames.bytes} B`)

const ws = new WebSocket(`${ENGINE.replace(/^http/, 'ws')}/`, { perMessageDeflate: true })
let count = 0, rawTotal = 0, first = 0, latencies = []
await new Promise((resolve, reject) => {
  ws.on('open', () => { first = ws._socket.bytesRead })
  ws.on('error', reject)
  ws.on('message', (data) => {
    const text = data.toString()
    const msg = JSON.parse(text)
    if (msg.type !== 'delta') return
    count++
    rawTotal += Buffer.byteLength(text)
    latencies.push(Date.now() - msg.ts)
    if (count >= SECONDS) resolve()
  })
})
const wire = ws._socket.bytesRead - first
ws.close()
console.log(`增量包 × ${count}：解压后平均 ${(rawTotal / count / 1024).toFixed(1)} KB/包，线路实际 ${(wire / count / 1024).toFixed(1)} KB/包（含帧头），推送延迟 ${Math.min(...latencies)}–${Math.max(...latencies)} ms`)
