// 物流网络静态数据：网点（分拨中心）与干线线路
// 坐标为城市级经纬度（演示用），与前端 client/src/data/network.ts 保持一致，服务端为仿真源头。

export const HUBS = [
  { id: 'gz', name: '广州', lng: 113.264, lat: 23.129, level: 1 },
  { id: 'sz', name: '深圳', lng: 114.058, lat: 22.546, level: 1 },
  { id: 'dg', name: '东莞', lng: 113.746, lat: 23.021, level: 1 },
  { id: 'fs', name: '佛山', lng: 113.122, lat: 23.029, level: 2 },
  { id: 'zh', name: '珠海', lng: 113.577, lat: 22.271, level: 2 },
  { id: 'zs', name: '中山', lng: 113.393, lat: 22.516, level: 2 },
  { id: 'hz', name: '惠州', lng: 114.416, lat: 23.111, level: 2 },
  { id: 'st', name: '汕头', lng: 116.708, lat: 23.354, level: 2 },
  { id: 'jy', name: '揭阳', lng: 116.373, lat: 23.55, level: 3 },
  { id: 'zj', name: '湛江', lng: 110.365, lat: 21.271, level: 2 },
  { id: 'bj', name: '北京', lng: 116.408, lat: 39.905, level: 1 },
  { id: 'sh', name: '上海', lng: 121.474, lat: 31.23, level: 1 },
  { id: 'wh', name: '武汉', lng: 114.305, lat: 30.593, level: 1 },
  { id: 'cs', name: '长沙', lng: 112.939, lat: 28.228, level: 2 },
  { id: 'cd', name: '成都', lng: 104.066, lat: 30.573, level: 1 },
  { id: 'cq', name: '重庆', lng: 106.551, lat: 29.564, level: 2 },
  { id: 'xa', name: '西安', lng: 108.94, lat: 34.341, level: 2 },
  { id: 'zz', name: '郑州', lng: 113.626, lat: 34.747, level: 2 },
  { id: 'hz2', name: '杭州', lng: 120.212, lat: 30.246, level: 2 },
  { id: 'nj', name: '南京', lng: 118.797, lat: 32.061, level: 2 },
  { id: 'fz', name: '福州', lng: 119.297, lat: 26.078, level: 2 },
  { id: 'xm', name: '厦门', lng: 118.09, lat: 24.479, level: 2 },
  { id: 'nn', name: '南宁', lng: 108.367, lat: 22.818, level: 2 },
  { id: 'km', name: '昆明', lng: 102.71, lat: 25.044, level: 3 },
]

// 干线：[起点 hub id, 终点 hub id, 权重（车辆分布权重，珠三角更高）]
export const ROUTES = [
  ['gz', 'sz', 10], ['gz', 'dg', 10], ['sz', 'dg', 9], ['gz', 'fs', 8],
  ['gz', 'hz', 7], ['sz', 'hz', 7], ['gz', 'zs', 6], ['gz', 'zh', 6],
  ['fs', 'zs', 5], ['zs', 'zh', 4], ['gz', 'st', 6], ['st', 'jy', 4],
  ['hz', 'jy', 4], ['gz', 'zj', 4], ['gz', 'cs', 6], ['cs', 'wh', 5],
  ['gz', 'nn', 4], ['nn', 'km', 3], ['gz', 'fz', 4], ['fz', 'xm', 4],
  ['xm', 'st', 4], ['gz', 'hz2', 5], ['hz2', 'sh', 6], ['sh', 'nj', 5],
  ['gz', 'zz', 4], ['zz', 'bj', 5], ['wh', 'zz', 4], ['wh', 'xa', 3],
  ['xa', 'cd', 3], ['cd', 'cq', 4], ['cq', 'wh', 3], ['gz', 'sh', 5],
  ['bj', 'xa', 3], ['gz', 'wh', 5], ['sh', 'wh', 3],
]

export const hubById = Object.fromEntries(HUBS.map((h) => [h.id, h]))

// 每条干线的弧线弯曲度（贝塞尔控制点偏移系数，正负交替避免重叠）
export const routeBend = ROUTES.map((_, i) => (i % 2 === 0 ? 1 : -1) * (0.08 + (i % 5) * 0.02))

/** 在干线上按进度 t 取经纬度（二次贝塞尔，弯曲方向与前端连线绘制保持一致的近似） */
export function pointOnRoute(routeIdx, t) {
  const [aId, bId] = ROUTES[routeIdx]
  const a = hubById[aId]
  const b = hubById[bId]
  const bend = routeBend[routeIdx]
  const mx = (a.lng + b.lng) / 2
  const my = (a.lat + b.lat) / 2
  const dx = b.lng - a.lng
  const dy = b.lat - a.lat
  // 垂直偏移控制点
  const cx = mx - dy * bend
  const cy = my + dx * bend
  const u = 1 - t
  return [
    u * u * a.lng + 2 * u * t * cx + t * t * b.lng,
    u * u * a.lat + 2 * u * t * cy + t * t * b.lat,
  ]
}

export function routeLengthDeg(routeIdx) {
  const [aId, bId] = ROUTES[routeIdx]
  const a = hubById[aId]
  const b = hubById[bId]
  return Math.hypot(b.lng - a.lng, b.lat - a.lat)
}
