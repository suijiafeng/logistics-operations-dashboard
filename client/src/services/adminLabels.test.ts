import { describe, expect, it } from 'vitest'
import { adminLabelsFromTree, normalizeDistricts, parseCenter, type AdminNode } from './adminLabels'

describe('行政区标注', () => {
  it('能读经纬度对象、数组和逗号字符串', () => {
    expect(parseCenter({ lng: 113.2, lat: 23.1 })).toEqual([113.2, 23.1])
    expect(parseCenter({ getLng: () => 114, getLat: () => 22.5 })).toEqual([114, 22.5])
    expect(parseCenter([113.3, 23.2])).toEqual([113.3, 23.2])
    expect(parseCenter('113.5,23.0')).toEqual([113.5, 23])
    expect(parseCenter('不是坐标')).toBeNull()
  })

  it('广州到佛山这一带的市和区县在同一段比例尺里都会留下', () => {
    const tree = normalizeDistricts([{
      name: '广东省',
      level: 'province',
      center: [113.27, 23.13],
      districtList: [
        {
          name: '广州市',
          level: 'city',
          center: '113.26,23.13',
          districtList: [
            { name: '天河区', level: 'district', center: [113.36, 23.12], districtList: [
              { name: '石牌街道', level: 'street', center: [113.34, 23.13] },
            ] },
          ],
        },
        { name: '深圳市', level: 'city', center: [114.06, 22.54], districtList: [
          { name: '南山区', level: 'district', center: [113.93, 22.53] },
        ] },
        { name: '东莞市', level: 'city', center: [113.75, 23.02] },
        { name: '佛山市', level: 'city', center: [113.12, 23.02], districtList: [
          { name: '禅城区', level: 'district', center: [113.12, 23.01] },
        ] },
        { name: '韶关市', level: 'city', center: [113.6, 24.8], districtList: [
          { name: '武江区', level: 'district', center: [113.58, 24.8], districtList: [
            { name: '新华街道', level: 'street', center: [113.57, 24.81] },
          ] },
        ] },
      ],
    }])
    const labels = adminLabelsFromTree(tree)
    const byName = new Map(labels.map((label) => [label.name, label]))
    for (const name of ['广东省', '广州市', '深圳市', '东莞市', '佛山市', '天河区', '南山区', '禅城区', '石牌街道']) {
      expect(byName.has(name), name).toBe(true)
    }
    expect(byName.has('新华街道')).toBe(false)
    const city = byName.get('广州市')!
    const district = byName.get('天河区')!
    expect(city.zooms[0]).toBeLessThanOrEqual(10)
    expect(city.zooms[1]).toBeGreaterThanOrEqual(10)
    expect(district.zooms[0]).toBeLessThanOrEqual(10)
    expect(district.zooms[1]).toBeGreaterThanOrEqual(10)
    expect(city.rank).toBeGreaterThan(district.rank)
    expect(byName.get('韶关市')!.rank).toBeLessThan(city.rank)
  })

  it('没有中心点的节点不产生标注', () => {
    const nodes: AdminNode[] = [{ name: '无名', level: 'city', center: [Number.NaN, 1], children: [] }]
    expect(normalizeDistricts([{ name: '无名', level: 'city' }])).toEqual([])
    expect(adminLabelsFromTree(nodes)).toEqual([])
  })
})