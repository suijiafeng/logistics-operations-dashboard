import test from 'node:test'
import assert from 'node:assert/strict'
import { readMetrics, readModes, readHubHistory } from '../src/metrics.js'
import { snapshot } from '../src/engine.js'

const midnight = Date.parse('2026-10-21T00:00:00+08:00')

test('全天累计与分时、线路总和一致；线路单调且未来为空', () => {
  let previous = readMetrics(midnight)
  for (let minute = 1; minute < 1440; minute++) {
    const current = readMetrics(midnight + minute * 60_000)
    assert.equal(current.routes.reduce((a, b) => a + b, 0), current.ordersToday)
    assert.equal(current.trend.reduce((a, b) => a + (b ?? 0), 0), current.ordersToday)
    current.routes.forEach((value, index) => assert(value >= previous.routes[index]))
    current.trend.forEach((value, hour) => hour > current.hour ? assert.equal(value, null) : assert(value <= current.targets[hour]))
    previous = current
  }
  assert.equal(readMetrics(midnight + 86_400_000).ordersToday, 0)
})

test('占比长期围绕基准、整数合计 100，不发生随机游走', () => {
  const base = [46, 27, 15, 12]
  for (let minute = 0; minute < 1440; minute++) {
    const modes = readModes(midnight + minute * 60_000)
    assert.equal(modes.reduce((sum, mode) => sum + mode.value, 0), 100)
    modes.forEach((mode, index) => assert(Math.abs(mode.value - base[index]) <= 3))
  }
})

test('读取快照不会修改累计和排行；跨日网点历史为 12 个非负桶', () => {
  const first = snapshot(), second = snapshot()
  assert.deepEqual(first.routeVolumes, second.routeVolumes)
  assert.equal(first.kpi.ordersToday, second.kpi.ordersToday)
  const history = readHubHistory(midnight + 120_000)
  for (const hub of Object.values(history)) {
    assert.equal(hub.recentOrders.length, 12)
    assert.equal(hub.recentLabels.length, 12)
    assert(hub.recentOrders.every(value => Number.isInteger(value) && value >= 0))
  }
})
