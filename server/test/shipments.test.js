import test from 'node:test'
import assert from 'node:assert/strict'
import { stepShipments, shipmentStats, liveShipments, STAGES } from '../src/shipments.js'
import { readMetrics } from '../src/metrics.js'
import { ROUTES, hubById } from '../src/network.js'

test('实体数量与确定性运单累计一致，状态机只向前且漏斗单调，签收后释放实体', () => {
  // 固定在白天，避免 40 分钟窗口跨过北京时间零点触发跨日重置
  const start = Date.parse('2026-10-21T10:00:00+08:00')
  stepShipments(start)
  const before = shipmentStats()
  const createdBefore = before.funnel[0]
  // 推进 40 仿真分钟（每步 250ms 的仿真时间，这里直接按时间戳步进）
  let prev = before.funnel
  let lastLive = 0
  for (let minute = 1; minute <= 40; minute++) {
    const now = start + minute * 60_000
    stepShipments(now)
    const stats = shipmentStats()
    stats.funnel.forEach((v, i) => assert(v >= prev[i], `漏斗第 ${i} 段单调`))
    for (let i = 1; i < 5; i++) assert(stats.funnel[i] <= stats.funnel[i - 1], '后段累计不超过前段')
    assert.equal(stats.inStage.reduce((a, b) => a + b, 0) + stats.signedToday, stats.funnel[0], '在制 + 已签收 = 揽收累计')
    prev = stats.funnel
    lastLive = stats.live
  }
  const after = shipmentStats()
  const metricsDelta = readMetrics(start + 40 * 60_000).ordersToday - readMetrics(start).ordersToday
  // 40 分钟内新创建实体数 = 这段时间的确定性运单增量（每步每线路最多补 500 的上限在 1 分钟粒度下足够）
  assert.equal(after.funnel[0] - createdBefore, metricsDelta)
  assert(after.signedToday > 0, '40 分钟内应有运单走完五段')
  assert(lastLive > 0 && lastLive < 80_000)
  for (const s of liveShipments()) {
    assert(s.stage >= 0 && s.stage < 4)
    assert(ROUTES[s.routeIdx] && hubById[s.fromId] && hubById[s.toId] && s.fromId !== s.toId)
  }
  assert.deepEqual(STAGES, ['揽收', '分拣', '干线', '派送', '签收'])
  assert.equal(after.punctuality.reduce((sum, p) => sum + p.value, 0), 100)
  assert(after.od.length > 0 && after.od.every((f) => /^\d{6}$/.test(f.from) && /^\d{6}$/.test(f.to) && f.value > 0))
  assert(after.od.every((f, i) => i === 0 || f.value <= after.od[i - 1].value), 'OD 按流量降序')
  assert(after.od.every((f) => f.from !== f.to), '桑基图只含省际流向')
  assert(after.odIntra > 0 && after.odIntra + after.od.reduce((s, f) => s + f.value, 0) <= after.odTotal)
})
