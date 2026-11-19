import { describe, expect, it } from 'vitest'
import { DEMO_WAYBILLS, linkedRouteName } from '../data/deliveryTracks'
import { ROUTES } from '../data/network'
import { trackMarkers } from './trackMarkers'
import {
  STAY_MIN_MS,
  STAY_RADIUS_METERS,
  analyzeTrack,
  bearingDegrees,
  detectStays,
  efficiencyPercent,
  haversineMeters,
  interpolateByProgress,
  projectToPlane,
  speedSamples,
  trackDistanceMeters,
  traveledPath,
  type TrackPoint,
} from './trackGeometry'

const LAT_METERS = 6_371_008.8 * Math.PI / 180

describe('Haversine 里程', () => {
  it('同一点距离为 0', () => {
    expect(haversineMeters({ lng: 114.06, lat: 22.55 }, { lng: 114.06, lat: 22.55 })).toBe(0)
  })

  it('赤道上纬度差 1° 约 111.195 km，且与方向无关', () => {
    const north = haversineMeters({ lng: 0, lat: 0 }, { lng: 0, lat: 1 })
    const south = haversineMeters({ lng: 0, lat: 1 }, { lng: 0, lat: 0 })
    expect(north).toBeCloseTo(LAT_METERS, 2)
    expect(south).toBeCloseTo(north, 6)
  })

  it('折线里程等于各段之和', () => {
    const points: TrackPoint[] = [
      { lng: 113, lat: 23, t: 0 },
      { lng: 113, lat: 23.1, t: 1 },
      { lng: 113.1, lat: 23.1, t: 2 },
    ]
    const expected = haversineMeters(points[0]!, points[1]!) + haversineMeters(points[1]!, points[2]!)
    expect(trackDistanceMeters(points)).toBeCloseTo(expected, 6)
    expect(trackDistanceMeters([])).toBe(0)
  })
})

describe('停留检测', () => {
  const anchor = { lng: 114, lat: 22.7 }

  it('刚好达到 10 分钟记为停留，少 1 毫秒不记', () => {
    expect(detectStays([{ ...anchor, t: 0 }, { ...anchor, t: STAY_MIN_MS }])).toHaveLength(1)
    expect(detectStays([{ ...anchor, t: 0 }, { ...anchor, t: STAY_MIN_MS - 1 }])).toHaveLength(0)
  })

  it('半径内的抖动算同一处停留，半径外的点切断这段', () => {
    const insideLat = anchor.lat + (STAY_RADIUS_METERS - 1) / LAT_METERS
    const outsideLat = anchor.lat + (STAY_RADIUS_METERS + 30) / LAT_METERS
    const inside = detectStays([{ ...anchor, t: 0 }, { lng: anchor.lng, lat: insideLat, t: STAY_MIN_MS }])
    expect(inside).toHaveLength(1)
    expect(inside[0]).toMatchObject({ startIndex: 0, endIndex: 1, durationMs: STAY_MIN_MS })
    expect(detectStays([{ ...anchor, t: 0 }, { lng: anchor.lng, lat: outsideLat, t: STAY_MIN_MS }])).toHaveLength(0)
  })

  it('持续向北爬行不会因为总时长很长就被当成停留', () => {
    const points: TrackPoint[] = []
    for (let i = 0; i <= 10; i++) {
      points.push({ lng: 114, lat: 22.7 + (i * 200) / LAT_METERS, t: i * 2 * 60_000 })
    }
    expect(detectStays(points)).toHaveLength(0)
  })

  it('空轨迹没有停留', () => {
    expect(detectStays([])).toEqual([])
  })
})

describe('回放插值', () => {
  const leg: TrackPoint[] = [
    { lng: 113, lat: 23, t: 0 },
    { lng: 114, lat: 23, t: 3_600_000 },
  ]

  it('进度 0、1 和中点落在时间与经纬度的对应位置', () => {
    const start = interpolateByProgress(leg, 0)
    const mid = interpolateByProgress(leg, 0.5)
    const end = interpolateByProgress(leg, 1)
    expect(start).toMatchObject({ lng: 113, lat: 23, t: 0, progress: 0 })
    expect(mid).toMatchObject({ lng: 113.5, lat: 23, t: 1_800_000, segmentIndex: 0, progress: 0.5 })
    expect(end).toMatchObject({ lng: 114, lat: 23, t: 3_600_000, progress: 1 })
    expect(mid?.speedKmh).toBeCloseTo(haversineMeters(leg[0]!, leg[1]!) / 1000, 5)
    // 同纬度上跨 1° 经度的大圆初始方位不是精确的 90°：大圆会略偏向极点，恒向线才是正东
    expect(bearingDegrees(leg[0]!, leg[1]!)).toBeCloseTo(90, 0)
    expect(bearingDegrees({ lng: 113, lat: 23 }, { lng: 113, lat: 24 })).toBeCloseTo(0, 4)
    expect(mid?.bearing).toBeCloseTo(bearingDegrees(leg[0]!, leg[1]!), 5)
  })

  it('越界和 NaN 进度钳到端点，空轨迹返回 null', () => {
    expect(interpolateByProgress(leg, -0.2)?.progress).toBe(0)
    expect(interpolateByProgress(leg, 3)?.lng).toBe(114)
    expect(interpolateByProgress(leg, Number.NaN)?.progress).toBe(0)
    expect(interpolateByProgress([], 0.4)).toBeNull()
  })

  it('停留段时间在走，位置不动；已行驶折线包含插值端点', () => {
    const points: TrackPoint[] = [
      { lng: 113.67, lat: 22.82, t: 0 },
      { lng: 113.67, lat: 22.82, t: 10_000 },
      { lng: 113.67, lat: 22.82, t: 20_000 },
      { lng: 113.8, lat: 22.9, t: 40_000 },
    ]
    const held = interpolateByProgress(points, 10_000 / 40_000)
    expect(held?.lng).toBeCloseTo(113.67, 6)
    expect(held?.lat).toBeCloseTo(22.82, 6)
    expect(held?.speedKmh).toBeCloseTo(0, 5)
    const path = traveledPath(points, 0.5)
    expect(path.length).toBeGreaterThan(1)
    expect(path[0]).toMatchObject({ lng: 113.67, lat: 22.82 })
    expect(path[path.length - 1]?.t).toBe(20_000)
    expect(traveledPath(points, 0)).toHaveLength(1)
    expect(traveledPath(points, 1)).toHaveLength(points.length)
  })
})

describe('局部平面投影', () => {
  it('北向上，经度按纬度余弦缩短，点落在留白之内', () => {
    const points = [{ lng: 113, lat: 23 }, { lng: 114, lat: 24 }]
    const project = projectToPlane(points, 1000, 1000, 0)
    const sw = project(points[0]!)
    const ne = project(points[1]!)
    const dx = ne.x - sw.x
    const dy = sw.y - ne.y
    expect(ne.y).toBeLessThan(sw.y)
    expect(ne.x).toBeGreaterThan(sw.x)
    expect(dx / dy).toBeCloseTo(Math.cos(23.5 * Math.PI / 180), 2)
    expect(dx / dy).toBeLessThan(0.95)

    const padded = projectToPlane(points, 200, 100, 10)
    const a = padded(points[0]!)
    const b = padded(points[1]!)
    for (const point of [a, b]) {
      expect(point.x).toBeGreaterThanOrEqual(10)
      expect(point.x).toBeLessThanOrEqual(190)
      expect(point.y).toBeGreaterThanOrEqual(10)
      expect(point.y).toBeLessThanOrEqual(90)
    }
  })

  it('单点放在中心', () => {
    const project = projectToPlane([{ lng: 1, lat: 2 }], 100, 80, 0)
    expect(project({ lng: 1, lat: 2 })).toEqual({ x: 50, y: 40 })
  })
})

describe('演示轨迹样本', () => {
  it('每条都标明演示数据和 GCJ-02，并且落在深圳广州一带', () => {
    expect(DEMO_WAYBILLS.length).toBeGreaterThanOrEqual(3)
    for (const waybill of DEMO_WAYBILLS) {
      expect(waybill.dataNote).toBe('演示数据')
      expect(waybill.crs).toBe('GCJ-02')
      expect(waybill.routeIndex).toBeGreaterThanOrEqual(0)
      expect(waybill.routeIndex).toBeLessThan(ROUTES.length)
      expect(linkedRouteName(waybill.routeIndex).length).toBeGreaterThan(0)
      expect(waybill.points[0]?.role).toBe('origin')
      expect(waybill.points[waybill.points.length - 1]?.role).toBe('destination')
      expect(waybill.points.some((point) => point.role === 'transfer')).toBe(true)
      for (let i = 0; i < waybill.points.length; i++) {
        if (i > 0) expect(waybill.points[i]!.t).toBeGreaterThan(waybill.points[i - 1]!.t)
        expect(waybill.points[i]!.lng).toBeGreaterThan(112.9)
        expect(waybill.points[i]!.lng).toBeLessThan(114.6)
        expect(waybill.points[i]!.lat).toBeGreaterThan(22.4)
        expect(waybill.points[i]!.lat).toBeLessThan(23.4)
      }
      const metrics = analyzeTrack(waybill.points)
      expect(metrics.distanceMeters).toBeGreaterThan(50_000)
      expect(metrics.distanceMeters).toBeLessThan(180_000)
      expect(metrics.avgSpeedKmh).toBeGreaterThan(20)
      expect(metrics.avgSpeedKmh).toBeLessThan(110)
      expect(metrics.stays).toHaveLength(1)
      expect(metrics.stays[0]!.durationMs).toBeGreaterThanOrEqual(STAY_MIN_MS)
      for (const sample of speedSamples(waybill.points)) expect(sample.speedKmh).toBeLessThan(120)
    }
  })

  it('既有早于承诺的运单，也有晚点的；短暂停不计入停留', () => {
    const scores = DEMO_WAYBILLS.map((waybill) => efficiencyPercent(analyzeTrack(waybill.points).elapsedMs, waybill.promisedMs))
    expect(scores.some((score) => score >= 100)).toBe(true)
    expect(scores.some((score) => score < 100)).toBe(true)
    expect(efficiencyPercent(0, 60_000)).toBe(0)
    expect(efficiencyPercent(60_000, 0)).toBe(0)

    const slow = DEMO_WAYBILLS.find((waybill) => waybill.id === 'wb-panyu-baoan')
    expect(slow).toBeTruthy()
    let shortHover = false
    for (let i = 1; i < slow!.points.length; i++) {
      const dt = slow!.points[i]!.t - slow!.points[i - 1]!.t
      const meters = haversineMeters(slow!.points[i - 1]!, slow!.points[i]!)
      if (dt >= 60_000 && dt < STAY_MIN_MS && meters < 50) shortHover = true
    }
    expect(shortHover).toBe(true)
    const stays = detectStays(slow!.points)
    expect(stays).toHaveLength(1)
    expect(stays[0]!.durationMs).toBeGreaterThanOrEqual(STAY_MIN_MS)
    const markers = trackMarkers(slow!.points, stays)
    expect(markers.some((marker) => marker.kind === 'transfer' && marker.text.includes('停留'))).toBe(true)
    expect(markers.some((marker) => marker.kind === 'origin' && marker.text.startsWith('起点'))).toBe(true)
  })
})
