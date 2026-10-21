// 前端侧网络静态数据（与 server/src/network.js 保持一致；实时车辆/统计以服务端推送为准）
export interface Hub {
  id: string
  name: string
  lng: number
  lat: number
  level: number
  /** 所在物流园区 / 公路港名称（OpenStreetMap 公开 POI） */
  site: string
  /** 所属省级行政区 adcode（与 china.json 一致），用于省级下钻过滤与定位 */
  province: string
  // 以下字段由服务端快照/增量合并进来
  arrivals?: number
  departures?: number
  backlog?: number
  utilization?: number
  onTime?: number
  recentOrders?: number[]
  recentLabels?: string[]
  /** 进出线路今日单量：对端网点 id → 单量 */
  routeOrders?: Record<string, number>
}

export const HUBS: Hub[] = [
  { id: 'gz', name: '广州', site: '林安物流园', lng: 113.3530182, lat: 23.2688636, level: 1, province: '440000' },
  { id: 'sz', name: '深圳', site: '乾龙物流园', lng: 114.1293849, lat: 22.6828757, level: 1, province: '440000' },
  { id: 'dg', name: '东莞', site: '龙地常平物流园', lng: 114.0471362, lat: 22.9763072, level: 1, province: '440000' },
  { id: 'fs', name: '佛山', site: '松岗龙地物流园', lng: 113.0622515, lat: 23.1606358, level: 2, province: '440000' },
  { id: 'zh', name: '珠海', site: '高栏港物流区', lng: 113.2244519, lat: 21.9332199, level: 2, province: '440000' },
  { id: 'zs', name: '中山', site: '丰树中山现代物流园', lng: 113.3705329, lat: 22.7005954, level: 2, province: '440000' },
  { id: 'hz', name: '惠州', site: '宇培惠州物流园', lng: 114.2000692, lat: 23.1531062, level: 2, province: '440000' },
  { id: 'st', name: '汕头', site: '柯士达国际物流园', lng: 116.7668996, lat: 23.2417315, level: 2, province: '440000' },
  { id: 'jy', name: '揭阳', site: '利鸿基物流码头', lng: 116.4832400, lat: 23.4702991, level: 3, province: '440000' },
  { id: 'zj', name: '湛江', site: '湛江商贸物流城', lng: 110.2860533, lat: 21.2194314, level: 2, province: '440000' },
  { id: 'bj', name: '北京', site: '祥龙物流园', lng: 116.5658528, lat: 39.7586447, level: 1, province: '110000' },
  { id: 'sh', name: '上海', site: '普洛斯西北物流园', lng: 121.3348439, lat: 31.2804644, level: 1, province: '310000' },
  { id: 'wh', name: '武汉', site: '安博蔡甸物流园', lng: 113.9722298, lat: 30.4694621, level: 1, province: '420000' },
  { id: 'cs', name: '长沙', site: '普洛斯长沙空港物流园', lng: 113.1830953, lat: 28.2001357, level: 2, province: '430000' },
  { id: 'cd', name: '成都', site: '宝湾国际物流中心', lng: 104.1853283, lat: 30.5339679, level: 1, province: '510000' },
  { id: 'cq', name: '重庆', site: '丰树两江物流园', lng: 106.7890507, lat: 29.7339277, level: 2, province: '500000' },
  { id: 'xa', name: '西安', site: '正广通物流园', lng: 108.8575191, lat: 34.3544050, level: 2, province: '610000' },
  { id: 'zz', name: '郑州', site: '普洛斯郑州空港物流园', lng: 113.8162227, lat: 34.5010436, level: 2, province: '410000' },
  { id: 'hz2', name: '杭州', site: '传化公路港', lng: 120.5737738, lat: 30.2389966, level: 2, province: '330000' },
  { id: 'nj', name: '南京', site: '普洛斯龙潭物流园', lng: 119.0806921, lat: 32.2119328, level: 2, province: '320000' },
  { id: 'fz', name: '福州', site: '盛丰物流园', lng: 119.3645155, lat: 26.0583806, level: 2, province: '350000' },
  { id: 'xm', name: '厦门', site: '万翔物流园', lng: 118.1229325, lat: 24.5550172, level: 2, province: '350000' },
  { id: 'nn', name: '南宁', site: '中新南宁国际物流园', lng: 108.3739414, lat: 22.7070346, level: 2, province: '450000' },
  { id: 'km', name: '昆明', site: '万纬昆明浩源物流园', lng: 102.9947798, lat: 25.1371521, level: 3, province: '530000' },
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

export const GUANGDONG = '440000'
// 行政归属按 province 字段；车辆点位下钻使用省界 GeoJSON 精确判定。
export const GUANGDONG_HUB_IDS = new Set(HUBS.filter((h) => h.province === GUANGDONG).map((h) => h.id))
export function hubsInProvince(adcode: string): Hub[] { return HUBS.filter((h) => h.province === adcode) }
