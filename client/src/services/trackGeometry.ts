// 配送轨迹的纯计算：里程、停留、回放位置。不依赖高德、Vue 或 DOM，方便单测。
//
// 里程用 Haversine（平均地球半径），沿采样折线累加，不是路网距离。
// 回放按运单时间插值，而不是按折线弧长：停留段时间在走、位置几乎不动，进度条拖到停留区间时车会停住。
// 线段内部是经纬度线性插值。演示折线每段只有几公里到二十多公里，和大地线相比偏差在米级，够用来摆车辆标记。

export interface LngLat {
  lng: number
  lat: number
}

export interface TrackPoint extends LngLat {
  /** Unix 毫秒 */
  t: number
}

export interface StayOptions {
  /** 同一锚点附近持续至少这么久才算停留，默认 10 分钟 */
  minDurationMs?: number
  /** 相对停留锚点（进入该段的第一个点）的半径，默认 150 米 */
  radiusMeters?: number
}

export interface Stay {
  startIndex: number
  endIndex: number
  lng: number
  lat: number
  startT: number
  endT: number
  durationMs: number
}

export interface PlaybackSample {
  lng: number
  lat: number
  t: number
  /** 播放头所在线段的起点下标；单点轨迹为 0 */
  segmentIndex: number
  /** 钳制后的进度，0–1，按起止时间线性对应 */
  progress: number
  /** 当前线段的直线速度；停留段接近 0 */
  speedKmh: number
  /** 度。正北为 0，顺时针。线段短于 8 米时沿用上一段有效朝向 */
  bearing: number
}

export interface SpeedSample {
  /** 线段终点时刻 */
  t: number
  speedKmh: number
}

export interface TrackMetrics {
  distanceMeters: number
  elapsedMs: number
  stayMs: number
  movingMs: number
  /** 里程 / 实际用时，含停留。用来看这趟运单快不快 */
  avgSpeedKmh: number
  /** 里程 /（实际用时 − 停留）。停留被扣掉，避免把装卸时间算进行驶速度 */
  movingSpeedKmh: number
  stays: Stay[]
}

export interface PlanePoint {
  x: number
  y: number
}

export interface PlanePadding {
  top: number
  right: number
  bottom: number
  left: number
}

/** 平均地球半径（米）。和常见 6371 km 取整相比，纬度 1° 约为 111.195 km。 */
const EARTH_RADIUS_M = 6_371_008.8
const MIN_BEARING_METERS = 8

export const STAY_MIN_MS = 10 * 60 * 1000
export const STAY_RADIUS_METERS = 150

function toRad(deg: number) {
  return deg * Math.PI / 180
}

/** 两点球面距离（米）。同一点为 0；非有限坐标得到 NaN。 */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)))
}

/** 折线里程（米）。点未按时间排序时仍按数组顺序累加，调用方需保证轨迹顺序。 */
export function trackDistanceMeters(points: TrackPoint[]): number {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    const meters = haversineMeters(points[i - 1]!, points[i]!)
    if (Number.isFinite(meters)) total += meters
  }
  return total
}

/**
 * 停留：从每个尚未消费的点出发，尽量向后吃掉「距离该锚点不超过半径」的点。
 * 这一段的持续时间达到阈值才记一次，然后从段尾继续，避免同一处停靠被拆成很多段。
 * 缓慢爬行会不断超出锚点半径，因此不会被记成停留；这是故意的，阈值内的短暂停（例如 4 分钟）也不记。
 * 要求点列按时间非递减。锚点取进入该段的第一个点，而不是质心，方便和采样点对齐。
 */
export function detectStays(points: TrackPoint[], options?: StayOptions): Stay[] {
  const minDurationMs = options?.minDurationMs ?? STAY_MIN_MS
  const radiusMeters = options?.radiusMeters ?? STAY_RADIUS_METERS
  const stays: Stay[] = []
  let i = 0
  while (i < points.length) {
    let j = i
    while (j + 1 < points.length && haversineMeters(points[i]!, points[j + 1]!) <= radiusMeters) j += 1
    const durationMs = points[j]!.t - points[i]!.t
    if (j > i && durationMs >= minDurationMs) {
      const anchor = points[i]!
      stays.push({
        startIndex: i,
        endIndex: j,
        lng: anchor.lng,
        lat: anchor.lat,
        startT: anchor.t,
        endT: points[j]!.t,
        durationMs,
      })
      i = j
    } else {
      i += 1
    }
  }
  return stays
}

/** 正北 0°、顺时针。用于车辆标记朝向，不是导航航向修正。 */
export function bearingDegrees(a: LngLat, b: LngLat): number {
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const dLng = toRad(b.lng - a.lng)
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360
}

function clampProgress(progress: number) {
  if (!Number.isFinite(progress)) return 0
  if (progress < 0) return 0
  if (progress > 1) return 1
  return progress
}

function segmentBearing(points: TrackPoint[], index: number): number {
  for (let i = index; i >= 0; i--) {
    const next = points[i + 1]
    const curr = points[i]
    if (!next || !curr) continue
    if (haversineMeters(curr, next) >= MIN_BEARING_METERS) return bearingDegrees(curr, next)
  }
  return 0
}

/**
 * 进度 0–1 映射到首尾时间，再在包含该时刻的线段上做经纬度线性插值。
 * 进度 1 落在最后一个点。空轨迹返回 null。
 */
export function interpolateByProgress(points: TrackPoint[], progress: number): PlaybackSample | null {
  if (points.length === 0) return null
  const p = clampProgress(progress)
  const first = points[0]!
  if (points.length === 1 || p === 0) {
    return { lng: first.lng, lat: first.lat, t: first.t, segmentIndex: 0, progress: p, speedKmh: 0, bearing: segmentBearing(points, 0) }
  }
  const last = points[points.length - 1]!
  if (p === 1) {
    const index = points.length - 2
    return {
      lng: last.lng,
      lat: last.lat,
      t: last.t,
      segmentIndex: index,
      progress: 1,
      speedKmh: segmentSpeed(points[index]!, last),
      bearing: segmentBearing(points, index),
    }
  }
  const span = last.t - first.t
  const t = span <= 0 ? first.t : first.t + p * span
  let index = 0
  for (let i = 0; i < points.length - 1; i++) {
    index = i
    if (points[i + 1]!.t >= t) break
  }
  const a = points[index]!
  const b = points[index + 1] ?? a
  const dt = b.t - a.t
  const u = dt > 0 ? Math.min(1, Math.max(0, (t - a.t) / dt)) : 0
  return {
    lng: a.lng + (b.lng - a.lng) * u,
    lat: a.lat + (b.lat - a.lat) * u,
    t,
    segmentIndex: index,
    progress: p,
    speedKmh: segmentSpeed(a, b),
    bearing: segmentBearing(points, index),
  }
}

function segmentSpeed(a: TrackPoint, b: TrackPoint): number {
  const dt = b.t - a.t
  if (!(dt > 0)) return 0
  const meters = haversineMeters(a, b)
  if (!Number.isFinite(meters)) return 0
  return (meters / 1000) / (dt / 3_600_000)
}

/** 已行驶折线：播放头之前的采样点，再加上当前插值点。进度为 0 或 1 时不重复端点。 */
export function traveledPath(points: TrackPoint[], progress: number): TrackPoint[] {
  const sample = interpolateByProgress(points, progress)
  if (!sample) return []
  if (points.length === 1) return [{ lng: sample.lng, lat: sample.lat, t: sample.t }]
  const path: TrackPoint[] = []
  const endIndex = sample.progress === 1 ? points.length - 1 : sample.segmentIndex
  for (let i = 0; i <= endIndex; i++) path.push(points[i]!)
  if (sample.progress === 1) return path
  const prev = path[path.length - 1]
  const tip = { lng: sample.lng, lat: sample.lat, t: sample.t }
  // 停留段位置几乎重合，但仍要把播放头的时刻收进折线，否则回放停在原地时路径时间是旧的
  if (!prev || prev.t !== tip.t || haversineMeters(prev, tip) > 0.5) path.push(tip)
  return path
}

/** 每一段的终点时刻和该段直线速度，给速度曲线用。 */
export function speedSamples(points: TrackPoint[]): SpeedSample[] {
  const samples: SpeedSample[] = []
  for (let i = 1; i < points.length; i++) {
    samples.push({ t: points[i]!.t, speedKmh: segmentSpeed(points[i - 1]!, points[i]!) })
  }
  return samples
}

export function analyzeTrack(points: TrackPoint[], options?: StayOptions): TrackMetrics {
  const distanceMeters = trackDistanceMeters(points)
  const elapsedMs = points.length >= 2 ? points[points.length - 1]!.t - points[0]!.t : 0
  const stays = detectStays(points, options)
  const stayMs = stays.reduce((sum, stay) => sum + stay.durationMs, 0)
  const movingMs = Math.max(0, elapsedMs - stayMs)
  const hours = elapsedMs / 3_600_000
  const movingHours = movingMs / 3_600_000
  return {
    distanceMeters,
    elapsedMs,
    stayMs,
    movingMs,
    avgSpeedKmh: hours > 0 ? (distanceMeters / 1000) / hours : 0,
    movingSpeedKmh: movingHours > 0 ? (distanceMeters / 1000) / movingHours : 0,
    stays,
  }
}

/** 承诺用时 / 实际用时，单位 %。大于 100 表示早于承诺；用时为 0 时返回 0，避免除零。 */
export function efficiencyPercent(elapsedMs: number, promisedMs: number): number {
  if (!(elapsedMs > 0) || !(promisedMs > 0)) return 0
  return (promisedMs / elapsedMs) * 100
}

function asPadding(padding: number | PlanePadding): PlanePadding {
  if (typeof padding === 'number') return { top: padding, right: padding, bottom: padding, left: padding }
  return padding
}

/**
 * 把轨迹投到局部平面：北向上，经度按参考纬度的 cos 缩放，避免在北纬 23° 把东西向拉长。
 * 视野包住全部采样点并留白。单点或零跨度时放在画布中心。这是离线预览用的，不是高德的墨卡托。
 */
export function projectToPlane(
  points: LngLat[],
  width: number,
  height: number,
  padding: number | PlanePadding = 0,
): (point: LngLat) => PlanePoint {
  const pad = asPadding(padding)
  if (points.length === 0 || !(width > 0) || !(height > 0)) {
    return () => ({ x: width / 2, y: height / 2 })
  }
  let minLng = Infinity
  let maxLng = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const point of points) {
    if (point.lng < minLng) minLng = point.lng
    if (point.lng > maxLng) maxLng = point.lng
    if (point.lat < minLat) minLat = point.lat
    if (point.lat > maxLat) maxLat = point.lat
  }
  const midLat = (minLat + maxLat) / 2
  const cos = Math.cos(toRad(midLat)) || 1
  const spanX = (maxLng - minLng) * cos
  const spanY = maxLat - minLat
  if (spanX < 1e-9 && spanY < 1e-9) return () => ({ x: width / 2, y: height / 2 })
  const innerW = Math.max(1, width - pad.left - pad.right)
  const innerH = Math.max(1, height - pad.top - pad.bottom)
  const scale = Math.min(innerW / Math.max(spanX, 1e-9), innerH / Math.max(spanY, 1e-9))
  const usedW = spanX * scale
  const usedH = spanY * scale
  const originX = pad.left + (innerW - usedW) / 2
  const originY = pad.top + (innerH - usedH) / 2
  return (point) => ({
    x: originX + (point.lng - minLng) * cos * scale,
    y: originY + (maxLat - point.lat) * scale,
  })
}
