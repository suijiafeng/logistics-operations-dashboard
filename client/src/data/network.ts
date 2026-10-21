// 前端侧网络静态数据（与 server/src/network.js 保持一致；实时车辆/统计以服务端推送为准）
export interface Hub {
  id: string
  name: string
  lng: number
  lat: number
  level: number
  // 以下字段由服务端快照/增量合并进来
  arrivals?: number
  departures?: number
  backlog?: number
  utilization?: number
  onTime?: number
  recentOrders?: number[]
  recentLabels?: string[]
}

export const HUBS: Hub[] = [
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

export const ROUTES: [string, string][] = [
  ['gz', 'sz'], ['gz', 'dg'], ['sz', 'dg'], ['gz', 'fs'], ['gz', 'hz'],
  ['sz', 'hz'], ['gz', 'zs'], ['gz', 'zh'], ['fs', 'zs'], ['zs', 'zh'],
  ['gz', 'st'], ['st', 'jy'], ['hz', 'jy'], ['gz', 'zj'], ['gz', 'cs'],
  ['cs', 'wh'], ['gz', 'nn'], ['nn', 'km'], ['gz', 'fz'], ['fz', 'xm'],
  ['xm', 'st'], ['gz', 'hz2'], ['hz2', 'sh'], ['sh', 'nj'], ['gz', 'zz'],
  ['zz', 'bj'], ['wh', 'zz'], ['wh', 'xa'], ['xa', 'cd'], ['cd', 'cq'],
  ['cq', 'wh'], ['gz', 'sh'], ['bj', 'xa'], ['gz', 'wh'], ['sh', 'wh'],
]

export const hubById: Record<string, Hub> = Object.fromEntries(HUBS.map((h) => [h.id, h]))

// 明确的行政归属，用于仓配列表；车辆点位下钻使用 GeoJSON 精确判定。
export const GUANGDONG_HUB_IDS = new Set(['gz', 'sz', 'dg', 'fs', 'zh', 'zs', 'hz', 'st', 'jy', 'zj'])
