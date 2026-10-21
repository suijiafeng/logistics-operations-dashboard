import test from 'node:test'
import assert from 'node:assert/strict'
import { step, recordHistoryFrame, historyIndex, historyFrame, vehicleTrail, HISTORY_INTERVAL, HISTORY_FRAMES, VEHICLE_COUNT } from '../src/engine.js'

test('历史帧按时间记录、可按最近时间取帧、尾迹跨帧取同一车辆', () => {
  const base = Date.now() - 5 * HISTORY_INTERVAL
  for (let k = 0; k < 5; k++) { for (let i = 0; i < 8; i++) step(250); recordHistoryFrame(base + k * HISTORY_INTERVAL) }
  const index = historyIndex()
  assert.equal(index.interval, HISTORY_INTERVAL)
  assert(index.frames.length >= 5)
  for (let i = 1; i < index.frames.length; i++) assert(index.frames[i] > index.frames[i - 1])
  const frame = historyFrame(base + 2 * HISTORY_INTERVAL + 1200)
  assert.equal(frame.ts, base + 2 * HISTORY_INTERVAL)
  assert.equal(frame.vehicles.length, VEHICLE_COUNT * 3)
  assert.equal(frame.vehicles[0], Math.round(frame.vehicles[0] * 1e5) / 1e5)
  assert(frame.kpi.enRoute > 0)
  assert.equal(historyFrame(base - 10 * HISTORY_INTERVAL), null)
  const trail = vehicleTrail('粤A·10007')
  assert.equal(trail.plate, '粤A·10007')
  assert(trail.points.length >= 5)
  for (const [ts, lng, lat, status] of trail.points) {
    assert(ts >= base && Number.isFinite(lng) && Number.isFinite(lat) && status >= 0 && status <= 2)
  }
  // 尾迹坐标与对应帧里该车的坐标一致
  const last = trail.points[trail.points.length - 1]
  const f = historyFrame(last[0])
  assert.equal(f.vehicles[7 * 3], last[1])
  assert.equal(vehicleTrail('不存在'), null)
})

test('环形缓冲不超过 1 小时帧数', () => {
  const now = Date.now()
  for (let k = 0; k < HISTORY_FRAMES + 20; k++) recordHistoryFrame(now + k * HISTORY_INTERVAL)
  assert.equal(historyIndex().frames.length, HISTORY_FRAMES)
})
