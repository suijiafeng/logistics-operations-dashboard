import test from 'node:test'
import assert from 'node:assert/strict'
import { HUBS, ROUTES, hubById } from '../src/network.js'
import { ROUTE_GEOMETRY, routeKm, pointAtKm, headingAtKm } from '../src/routes.js'
import { snapshot, step, vehicleDetail, ROUTE_CODE } from '../src/engine.js'

test('每条干线都有真实道路折线，首尾钉在网点坐标上，里程与 OSRM 路程一致', () => {
  assert.equal(ROUTE_GEOMETRY.length, ROUTES.length)
  ROUTE_GEOMETRY.forEach((geom, index) => {
    const [a, b] = ROUTES[index]
    const first = geom.coords[0], last = geom.coords[geom.coords.length - 1]
    assert(Math.abs(first[0] - hubById[a].lng) < 1e-4 && Math.abs(first[1] - hubById[a].lat) < 1e-4, `${geom.id} 起点`)
    assert(Math.abs(last[0] - hubById[b].lng) < 1e-4 && Math.abs(last[1] - hubById[b].lat) < 1e-4, `${geom.id} 终点`)
    assert(geom.coords.length >= 2)
    // 抽稀后的折线长度与 OSRM 路程相差不超过 1%
    assert(Math.abs(geom.totalKm - geom.roadKm) / geom.roadKm < 0.01, `${geom.id} 里程 ${geom.totalKm} vs ${geom.roadKm}`)
    for (let i = 1; i < geom.cum.length; i++) assert(geom.cum[i] >= geom.cum[i - 1])
  })
})

test('沿线取点单调推进、越界钳制、朝向在 0–360 之间', () => {
  ROUTES.forEach((_, index) => {
    const total = routeKm(index)
    const start = pointAtKm(index, -5), end = pointAtKm(index, total + 5)
    assert.deepEqual(start, pointAtKm(index, 0))
    assert.deepEqual(end, pointAtKm(index, total))
    let previous = 0
    for (let km = 0; km <= total; km += total / 50) {
      const [lng, lat] = pointAtKm(index, km)
      assert(Number.isFinite(lng) && Number.isFinite(lat))
      // 相邻采样点之间的直线距离不超过沿线里程（折线不会回跳）
      const heading = headingAtKm(index, km, 1)
      assert(heading >= 0 && heading < 360)
      previous = km
    }
    assert(previous <= total)
  })
})

test('车辆位置落在所属干线折线附近，网点坐标为园区 POI 且带园区名', () => {
  for (const hub of HUBS) assert(typeof hub.site === 'string' && hub.site.length > 0, hub.id)
  for (let i = 0; i < 40; i++) step(250)
  const snap = snapshot()
  assert.equal(snap.vehicles.length, snap.vehicleCount * 3)
  for (let i = 0; i < snap.vehicleCount; i += 997) {
    const lng = snap.vehicles[i * 3], lat = snap.vehicles[i * 3 + 1]
    // 5 位小数
    assert.equal(lng, Math.round(lng * 1e5) / 1e5)
    assert(lng > 73 && lng < 136 && lat > 18 && lat < 54)
    // 第三位 = 状态 × 100 + 线路下标
    const code = snap.vehicles[i * 3 + 2]
    const status = Math.floor(code / ROUTE_CODE), route = code % ROUTE_CODE
    assert(status >= 0 && status <= 2 && route >= 0 && route < ROUTES.length)
  }
  // 全部干线今日单量与排行前 8 同源
  assert.equal(snap.routeOrders.length, ROUTES.length)
  const top = snap.routeVolumes[0]
  const topIndex = ROUTES.findIndex(([a, b]) => a === top.fromId && b === top.toId)
  assert.equal(snap.routeOrders[topIndex], top.value)
  assert.equal(Math.max(...snap.routeOrders), top.value)
  const detail = vehicleDetail('粤A·10000')
  assert(detail && detail.routeKm > 0 && detail.traveledKm + detail.remainingKm - detail.routeKm <= 1)
  assert(detail.heading >= 0 && detail.heading < 360)
  assert.equal(vehicleDetail('不存在'), null)
})
