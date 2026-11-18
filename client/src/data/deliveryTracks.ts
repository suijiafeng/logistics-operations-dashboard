// 配送轨迹演示样本。坐标系 GCJ-02（高德使用的火星坐标），范围在深圳、广州以及途经的东莞、佛山。
// 点是手写折线，不是 server 里那套 OSM 网点（那些是 WGS84），这里没有做坐标转换，不要混到全国图上。
// dataNote 固定为「演示数据」。界面直接展示这四个字，不从别的文案推断。
import { hubById, ROUTES } from './network'

export interface DemoTrackPoint {
  lng: number
  lat: number
  /** Unix 毫秒，固定在 2026-11-18，不随打开页面的时刻变化 */
  t: number
  role?: 'origin' | 'transfer' | 'destination'
  name?: string
}

export interface DemoWaybill {
  id: string
  no: string
  /** 列表和效率图上的短名 */
  label: string
  from: string
  to: string
  plate: string
  /** 承诺用时。和实际用时比，得到运输效率图的时效达成 */
  promisedMs: number
  /** 现有干线表 ROUTES 的下标。选中运单时全国图和干线排行高亮这一条 */
  routeIndex: number
  dataNote: '演示数据'
  crs: 'GCJ-02'
  points: DemoTrackPoint[]
}

const MIN = 60_000

function pt(lng: number, lat: number, hm: string, role?: DemoTrackPoint['role'], name?: string): DemoTrackPoint {
  const [h, m] = hm.split(':').map(Number)
  const point: DemoTrackPoint = {
    lng,
    lat,
    t: Date.parse(`2026-11-18T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00+08:00`),
  }
  if (role) point.role = role
  if (name) point.name = name
  return point
}

export const DEMO_WAYBILLS: DemoWaybill[] = [
  {
    id: 'wb-nanshan-baiyun',
    no: 'YD-20261118-01',
    label: '南山 → 白云',
    from: '深圳南山',
    to: '广州白云',
    plate: '粤B·T3816',
    promisedMs: 125 * MIN,
    routeIndex: 0,
    dataNote: '演示数据',
    crs: 'GCJ-02',
    points: [
      pt(113.9538, 22.5403, '08:00', 'origin', '深圳南山'),
      pt(113.8900, 22.5520, '08:06'),
      pt(113.8300, 22.6100, '08:14'),
      pt(113.7600, 22.7000, '08:24'),
      pt(113.6900, 22.7900, '08:34'),
      pt(113.6728, 22.8186, '08:40', 'transfer', '东莞虎门'),
      pt(113.6732, 22.8189, '08:49'),
      pt(113.6725, 22.8183, '08:58'),
      pt(113.6400, 22.9200, '09:08'),
      pt(113.5600, 23.0100, '09:18'),
      pt(113.4500, 23.0800, '09:30'),
      pt(113.3600, 23.1200, '09:40'),
      pt(113.2730, 23.1570, '09:52', 'destination', '广州白云'),
    ],
  },
  {
    id: 'wb-panyu-baoan',
    no: 'YD-20261118-02',
    label: '番禺 → 宝安',
    from: '广州番禺',
    to: '深圳宝安',
    plate: '粤B·T2204',
    promisedMs: 90 * MIN,
    routeIndex: 0,
    dataNote: '演示数据',
    crs: 'GCJ-02',
    // 09:32–09:36 只有约 4 分钟、位移十几米，低于停留阈值，用来说明不是每次减速都算停留。
    points: [
      pt(113.3840, 22.9370, '09:10', 'origin', '广州番禺'),
      pt(113.4500, 22.8600, '09:22'),
      pt(113.5300, 22.8000, '09:32'),
      pt(113.5301, 22.8001, '09:36'),
      pt(113.6200, 22.7600, '09:48'),
      pt(113.6730, 22.8180, '10:00', 'transfer', '东莞虎门'),
      pt(113.6733, 22.8183, '10:06'),
      pt(113.6727, 22.8177, '10:12'),
      pt(113.7400, 22.7200, '10:26'),
      pt(113.8200, 22.6500, '10:40'),
      pt(113.8830, 22.5550, '10:56', 'destination', '深圳宝安'),
    ],
  },
  {
    id: 'wb-tianhe-futian',
    no: 'YD-20261118-03',
    label: '天河 → 福田',
    from: '广州天河',
    to: '深圳福田',
    plate: '粤A·T1058',
    promisedMs: 150 * MIN,
    routeIndex: 3,
    dataNote: '演示数据',
    crs: 'GCJ-02',
    points: [
      pt(113.3610, 23.1245, '08:20', 'origin', '广州天河'),
      pt(113.2800, 23.1000, '08:30'),
      pt(113.2000, 23.0500, '08:40'),
      pt(113.1220, 23.0090, '08:50', 'transfer', '佛山禅城'),
      pt(113.1224, 23.0094, '08:59'),
      pt(113.1216, 23.0086, '09:08'),
      pt(113.2000, 22.9500, '09:20'),
      pt(113.3000, 22.8500, '09:34'),
      pt(113.5000, 22.7800, '09:50'),
      pt(113.7500, 22.6800, '10:09'),
      pt(113.9500, 22.5600, '10:26'),
      pt(114.0550, 22.5330, '10:36', 'destination', '深圳福田'),
    ],
  },
  {
    id: 'wb-longgang-huangpu',
    no: 'YD-20261118-04',
    label: '龙岗 → 黄埔',
    from: '深圳龙岗',
    to: '广州黄埔',
    plate: '粤B·T7741',
    promisedMs: 110 * MIN,
    routeIndex: 2,
    dataNote: '演示数据',
    crs: 'GCJ-02',
    points: [
      pt(114.2460, 22.7210, '07:40', 'origin', '深圳龙岗'),
      pt(114.1800, 22.7600, '07:52'),
      pt(114.1000, 22.8600, '08:06'),
      pt(114.0010, 22.9760, '08:20', 'transfer', '东莞常平'),
      pt(114.0014, 22.9764, '08:31'),
      pt(114.0006, 22.9756, '08:42'),
      pt(113.9000, 23.0200, '08:56'),
      pt(113.7500, 23.0400, '09:10'),
      pt(113.6000, 23.0800, '09:24'),
      pt(113.5000, 23.1000, '09:36'),
      pt(113.4590, 23.1060, '09:44', 'destination', '广州黄埔'),
    ],
  },
]

export function waybillById(id: string | null | undefined): DemoWaybill | undefined {
  if (!id) return undefined
  return DEMO_WAYBILLS.find((waybill) => waybill.id === id)
}

/** 和干线运量排行同一套网点名，选中运单时两边看到的是同一条线。 */
export function linkedRouteName(routeIndex: number): string {
  const pair = ROUTES[routeIndex]
  if (!pair) return ''
  const from = hubById[pair[0]]
  const to = hubById[pair[1]]
  if (!from || !to) return ''
  return `${from.name} → ${to.name}`
}
