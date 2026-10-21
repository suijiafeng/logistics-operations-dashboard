/** Tooltip 始终以原始时间桶为准，只显示一条今日数据；有昨日数据时附上昨日同一小时作参考。 */
export function formatTrendTooltip(params: unknown, trend: (number | null)[], currentHour: number, yesterday: number[] = []) {
  const first = Array.isArray(params) ? params[0] : params
  if (!first || typeof first !== 'object' || !('dataIndex' in first)) return ''
  const hour = first.dataIndex
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) return ''
  const value = trend[hour]
  const label = `${String(hour).padStart(2, '0')}:00`
  const prev = yesterday[hour]
  const ref = typeof prev === 'number' ? `<br/>昨日该小时：${prev.toLocaleString('zh-CN')} 单` : ''
  if (hour > currentHour || value == null) return `${label} · 暂无数据${ref}`
  return `${label} · ${hour === currentHour ? '当前小时累计' : '已完成小时'}<br/>运单量：${value.toLocaleString('zh-CN')} 单${ref}`
}
