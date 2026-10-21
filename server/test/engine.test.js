import test from 'node:test'
import assert from 'node:assert/strict'
import { step, snapshot, delta } from '../src/engine.js'

const sumHubs = (snap, key) => snap.hubs.reduce((sum, h) => sum + h[key], 0)
const dwellCount = (snap) => { let n = 0; for (let i = 2; i < snap.vehicles.length; i += 3) if (Math.floor(snap.vehicles[i] / 100) % 10 === 1) n++; return n }

test('到站只记到车，发车在实际离站时记一次：到车增量 = 发车增量 + 装卸中车辆增量', () => {
  const before = snapshot()
  for (let i = 0; i < 400; i++) step(250)
  const after = snapshot()
  const dArrivals = sumHubs(after, 'arrivals') - sumHubs(before, 'arrivals')
  const dDepartures = sumHubs(after, 'departures') - sumHubs(before, 'departures')
  assert(dArrivals > 0, '100 秒仿真内应有车辆到站')
  // 进入装卸的车辆到站时只加到车；离站时加发车并减少装卸数，所以恒等式精确成立
  assert.equal(dArrivals, dDepartures + (dwellCount(after) - dwellCount(before)))
})

test('干线排行名称为双向「A ↔ B」，与干线抽屉口径一致', () => {
  const snap = snapshot()
  assert(snap.routeVolumes.length > 0)
  for (const route of snap.routeVolumes) assert.match(route.name, /^.+ ↔ .+$/)
})

test('切日只重置按日累计，未恢复的活动告警与事件历史保留', () => {
  for (let i = 0; i < 4000 && !snapshot().events.some((e) => e.status !== 'closed'); i++) step(250)
  const before = snapshot()
  // 只看尚未恢复的警告 / 严重级：它们不会在一步之内被系统关闭；取最新 10 条避开 60 条列表窗口的淘汰
  const active = before.events.filter((e) => e.status !== 'closed' && e.level > 0 && !e.recoveredAt).slice(0, 10)
  assert(active.length > 0, '仿真内应产生未关闭告警')
  const realNow = Date.now
  Date.now = () => realNow() + 86_400_000
  try {
    step(250)
    const after = snapshot()
    assert(sumHubs(after, 'arrivals') < sumHubs(before, 'arrivals'), '到车按日清零')
    // 今日关闭数清零后只可能加上这一步里刚关闭的个别告警
    assert(after.alertStats.closedToday <= 3 && after.alertStats.closedToday < Math.max(4, before.alertStats.closedToday))
    for (const alert of active) assert(after.events.some((e) => e.id === alert.id && e.status !== 'closed'), `告警 ${alert.id} 切日后应仍可取到`)
    assert(after.kpi.pendingAnomalies >= active.length)
    // 事件列表只保留最近 60 条，KPI 统计全部未关闭告警，因此只能是大于等于
    assert(after.kpi.pendingAnomalies >= after.events.filter((e) => e.status !== 'closed').length)
    // 持续在线页面收到的增量里不会出现「切日清空」式的整表重置：仍是正常的新事件 / 状态变更
    const d = delta()
    for (const e of [...d.events, ...d.alertUpdates]) assert(typeof e.id === 'number' && e.status)
  } finally {
    Date.now = realNow
  }
})
