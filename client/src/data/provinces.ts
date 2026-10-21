// 省级行政区清单：直接取自已打包的全国 GeoJSON（阿里 DataV），adcode 与 public/geo/provinces/{adcode}.json 一一对应
import chinaGeo from '../assets/geo/china.json'

export interface Province { adcode: string; name: string; center: [number, number] }

type Feature = { properties: { adcode?: string | number; name?: string; center?: number[] } }
export const PROVINCES: Province[] = (chinaGeo as unknown as { features: Feature[] }).features
  .filter((f) => f.properties.name && !String(f.properties.adcode).includes('JD'))
  .map((f) => ({ adcode: String(f.properties.adcode), name: f.properties.name!, center: [f.properties.center?.[0] ?? 0, f.properties.center?.[1] ?? 0] }))

const byName = new Map(PROVINCES.map((p) => [p.name, p]))
const byCode = new Map(PROVINCES.map((p) => [p.adcode, p]))

export function provinceByName(name: string) { return byName.get(name) }
export function provinceName(adcode: string) { return byCode.get(adcode)?.name ?? '' }
/** 去掉「省 / 市 / 自治区 / 特别行政区」等后缀的短名，用于面包屑与图例 */
export function provinceShortName(adcode: string) {
  return provinceName(adcode).replace(/(壮族|回族|维吾尔)?自治区$|特别行政区$|省$|市$/, '')
}
export function isProvince(adcode: string) { return byCode.has(adcode) }
