import test from 'node:test'
import assert from 'node:assert/strict'
import { initFleetExtras, stepColdChain, stepSafety, coldStats, safetyStats, recordTemps, vehicleTemps, SAFETY_TYPES } from '../src/fleet.js'

function fleet(n) {
  const vehicles = Array.from({ length: n }, (_, i) => ({ plate: `粤A·${10000 + i}`, status: 0, routeIdx: i % 35, speedKmh: 80 }))
  initFleetExtras(vehicles)
  return vehicles
}

test('冷链车辆约 12%，温度在范围内游走，制冷故障持续越界 30 秒后触发超温告警并在恢复时收口', () => {
  const vehicles = fleet(4000)
  const cold = vehicles.filter((v) => v.kind === 1)
  assert(cold.length > 300 && cold.length < 700, `冷链占比异常：${cold.length}`)
  for (const v of cold) assert(v.temp >= v.tempLo - 1 && v.temp <= v.tempHi + 1)
  const alerts = [], recovered = []
  const hooks = { alert: (v, preset) => { alerts.push({ plate: v.plate, ...preset }); return alerts.length }, recover: (id) => recovered.push(id), alertOf: () => null }
  // 强制一台车制冷故障：向高温漂移
  const v = cold[0]
  const now = Date.now()
  v.tempFaultUntil = now + 10 * 60_000
  v.tempDrift = 0.3
  for (let s = 1; s <= 120; s++) stepColdChain([v], 1, now + s * 1000, hooks)
  assert(v.temp > v.tempHi + 1, '故障期间温度应越界')
  assert.equal(alerts.length, 1)
  assert.equal(alerts[0].type, '超温')
  assert.equal(alerts[0].level, 1)
  assert(coldStats([v]).overCount === 1 && coldStats([v]).over[0].alert)
  // 故障结束，温度回拉到范围内后告警恢复
  v.tempFaultUntil = 0
  v.tempDrift = 0
  v.temp = v.tempTarget
  stepColdChain([v], 1, now + 200_000, hooks)
  assert.deepEqual(recovered, [1])
  assert.equal(coldStats([v]).overCount, 0)
  recordTemps([v], now)
  const series = vehicleTemps(v)
  assert.equal(series.samples.length, 1)
  assert(series.lo < series.hi)
  assert.equal(vehicleTemps(vehicles.find((x) => x.kind === 0)), null)
})

test('安全事件按概率产生并扣分，疲劳驾驶进告警，排行按评分升序', () => {
  const vehicles = fleet(3000)
  const alerts = []
  const hooks = { alert: (v, preset) => { alerts.push(preset); return alerts.length }, recover: () => {}, alertOf: () => null }
  const now = Date.now()
  // 模拟 2 小时在途
  for (let s = 0; s < 7200; s += 10) stepSafety(vehicles, 10, now + s * 1000, hooks)
  const stats = safetyStats(vehicles)
  assert(stats.today.speeding > 0 && stats.today.braking > 0, '两小时内应产生超速与急刹')
  assert(stats.flagged > 0 && stats.avgScore < 100 && stats.avgScore > 90)
  for (let i = 1; i < stats.worst.length; i++) assert(stats.worst[i].score >= stats.worst[i - 1].score)
  for (const d of stats.worst) assert.equal(d.score, Math.max(0, 100 - d.speeding * 2 - d.braking - d.fatigue * 5))
  assert(stats.recent.every((e) => Object.values(SAFETY_TYPES).includes(e.label)))
  assert(alerts.every((a) => a.type === '疲劳驾驶' && a.level === 1))
  assert.equal(alerts.length, stats.today.fatigue)
})
