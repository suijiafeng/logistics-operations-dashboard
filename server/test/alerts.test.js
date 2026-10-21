import test from 'node:test'
import assert from 'node:assert/strict'
import { snapshot, delta, step, updateAlert, alertStats, ALERT_STATUS } from '../src/engine.js'

function firstOpenAlert() {
  for (let i = 0; i < 4000; i++) {
    step(250)
    const snap = snapshot()
    const alert = snap.events.find((e) => e.status === 'open' && e.level > 0)
    if (alert) return alert
  }
  throw new Error('仿真 1000 秒内没有产生警告级告警')
}

test('新建告警带责任网点与状态，只能向前流转或直接关闭，关闭后不可再改', () => {
  const alert = firstOpenAlert()
  assert.equal(alert.owner, alert.toId)
  assert.equal(alert.status, 'open')
  assert(alert.createdAt > 0)
  assert.deepEqual(updateAlert(alert.id, 'handling'), { error: 'invalid_transition' })
  assert.deepEqual(updateAlert(999999, 'acked'), { error: 'alert_not_found' })
  assert.deepEqual(updateAlert(alert.id, 'bogus'), { error: 'invalid_status' })
  const acked = updateAlert(alert.id, 'acked', '张三').alert
  assert.equal(acked.status, 'acked')
  assert.equal(acked.handler, '张三')
  const handling = updateAlert(alert.id, 'handling').alert
  assert.equal(handling.status, 'handling')
  const closed = updateAlert(alert.id, 'closed', '张三').alert
  assert.equal(closed.status, 'closed')
  assert.equal(closed.closedBy, '张三')
  assert(closed.closedAt >= closed.createdAt)
  assert.deepEqual(updateAlert(alert.id, 'closed'), { error: 'already_closed' })
  // 状态变化随 delta 推送：尚未推送过的新事件走 events（对象引用相同，已带最新状态），其余走 alertUpdates，二者不重复
  const d = delta()
  const pushed = [...d.events, ...d.alertUpdates].find((a) => a.id === alert.id)
  assert.equal(pushed?.status, 'closed')
  assert(d.alertUpdates.every((a) => !d.events.some((e) => e.id === a.id)))
  // 再处置另一条告警，这次它已经推送过，应出现在 alertUpdates
  const other = firstOpenAlert()
  delta()
  updateAlert(other.id, 'acked')
  const d2 = delta()
  assert(d2.alertUpdates.some((a) => a.id === other.id && a.status === 'acked'))
  const stats = alertStats()
  assert(stats.closedToday >= 1 && stats.closedManual >= 1 && stats.avgHandleMin !== null)
  assert.deepEqual(ALERT_STATUS, ['open', 'acked', 'handling', 'closed'])
})

test('待处理异常 KPI 等于未关闭告警数，提醒级告警在车辆恢复后由系统关闭', () => {
  for (let i = 0; i < 1200; i++) step(250)
  const snap = snapshot()
  const stats = snap.alertStats
  assert.equal(snap.kpi.pendingAnomalies, stats.open + stats.acked + stats.handling)
  // 提醒级事件最长 90 秒后恢复：运行 300 秒后，早期的提醒级告警都应已被系统关闭
  const early = snap.events.filter((e) => e.level === 0 && Date.now() - e.createdAt > 120_000)
  for (const e of early) assert.equal(e.status, 'closed', `提醒级告警 ${e.id} 应已自动关闭`)
  assert(early.every((e) => String(e.closedBy).startsWith('系统')))
})
