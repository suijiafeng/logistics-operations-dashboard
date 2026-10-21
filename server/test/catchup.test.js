import test from 'node:test'
import assert from 'node:assert/strict'
import net from 'node:net'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { step, snapshot, delta, catchUp, eventCursor, updateAlert } from '../src/engine.js'

// 推进仿真直到老客户端的广播（delta）带走了至少 minCount 条新事件；每 40 步广播一次，减少序列化开销
function runUntilNewEvents(minCount) {
  const ids = new Set()
  for (let i = 1; i <= 4000 && ids.size < minCount; i++) {
    step(250)
    if (i % 40 === 0) for (const e of delta().events) ids.add(e.id)
  }
  for (const e of delta().events) ids.add(e.id)
  return ids
}

test('快照与订阅之间广播掉的事件可按游标补收，已收到的不重复，告警状态变更也补发', () => {
  runUntilNewEvents(3)
  // 新客户端拉快照：带事件游标
  const snap = snapshot()
  assert.equal(snap.eventSeq, eventCursor())
  const snapIds = new Set(snap.events.map((e) => e.id))
  // 空窗：老客户端广播并清空了待推事件，同时一条旧告警被处置
  const existing = snap.events.find((e) => e.status === 'open' && e.level > 0)
  assert(existing, '快照里应有可处置的告警')
  updateAlert(existing.id, 'acked', '值班')
  const missed = runUntilNewEvents(2)
  // 新客户端订阅时带快照游标补收
  const catchup = catchUp(snap.eventSeq, snap.ts)
  assert.equal(catchup.type, 'catchup')
  for (const id of missed) assert(catchup.events.some((e) => e.id === id), `空窗事件 ${id} 应补收`)
  for (const e of catchup.events) assert(!snapIds.has(e.id), '快照已有的事件不应重复下发')
  for (let i = 1; i < catchup.events.length; i++) assert(catchup.events[i].id > catchup.events[i - 1].id, '补收事件按旧到新')
  const update = catchup.alertUpdates.find((a) => a.id === existing.id)
  assert.equal(update?.status, 'acked')
  assert(catchup.alertUpdates.every((a) => a.id <= snap.eventSeq), '补发的变更只针对快照之前的告警')
  // 什么都没错过时补收为空且不标记截断
  const empty = catchUp(eventCursor(), Date.now() + 1)
  assert.deepEqual([empty.events.length, empty.alertUpdates.length, empty.truncated], [0, 0, false])
})

test('快照与补收都带全部未关闭告警，不受 60 条窗口限制；告警淘汰后游标过旧才标记 truncated', () => {
  runUntilNewEvents(70)
  const snap = snapshot()
  const open = snap.events.filter((e) => e.status !== 'closed').length
  assert.equal(open, snap.kpi.pendingAnomalies, '待处理数必须等于列表里未关闭告警数')
  assert(snap.events.filter((e) => e.status === 'closed').length <= 60)
  const all = catchUp(0, 0)
  assert.equal(all.truncated, false)
  assert(all.events.filter((e) => e.status !== 'closed').length >= open, '补收覆盖全部未关闭告警')
  // 两小时后已关闭告警按保留期淘汰（每 4 步清理一次），再从 0 补收就拿不回它们；最早的告警被淘汰时标记 truncated
  const closed = snap.events.filter((e) => e.status === 'closed')
  assert(closed.length > 0, '仿真内应有已关闭告警')
  const realNow = Date.now
  Date.now = () => realNow() + 2 * 3_600_000
  try {
    for (let i = 0; i < 4; i++) step(250)
    const after = catchUp(0, 0)
    for (const e of closed) assert(!after.events.some((x) => x.id === e.id), `已淘汰的告警 ${e.id} 不应再补发`)
    const oldest = Math.min(...after.events.map((e) => e.id))
    assert.equal(after.truncated, oldest > 1)
    if (!all.events.some((e) => e.id === 1 && e.status !== 'closed')) assert.equal(after.truncated, true)
  } finally {
    Date.now = realNow
  }
})

test('目标端口被占用时引擎非零退出，不留下无监听的仿真进程', async () => {
  // 与引擎同样绑全部接口（双栈 ::），只绑 127.0.0.1 在 macOS 上不会与之冲突
  const blocker = net.createServer()
  await new Promise((resolve) => blocker.listen(0, resolve))
  const port = blocker.address().port
  const entry = fileURLToPath(new URL('../src/index.js', import.meta.url))
  const child = spawn(process.execPath, [entry], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', (chunk) => { stderr += chunk })
  const code = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('引擎在端口冲突后 15 秒内没有退出')) }, 15000)
    child.on('exit', (exitCode) => { clearTimeout(timer); resolve(exitCode) })
  }).finally(() => blocker.close())
  assert.equal(code, 1)
  assert.match(stderr, /端口 \d+ 已被占用/)
})
