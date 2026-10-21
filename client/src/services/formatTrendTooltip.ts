/** 连接虚线复用了上一小时的点；Tooltip 始终以原始时间桶为准，只显示一条数据。 */
export function formatTrendTooltip(params: unknown, trend: (number | null)[], currentHour: number) {
  const first = Array.isArray(params) ? params[0] : params
  if (!first || typeof first !== 'object' || !('dataIndex' in first)) return ''
  const hour = first.dataIndex
  if (typeof hour !== 'number' || !Number.isInteger(hour) || hour < 0 || hour > 23) return ''
  const value = trend[hour]
  const label = `${String(hour).padStart(2, '0')}:00`
  if (hour > currentHour || value == null) return `${label} · 暂无数据`
  return `${label} · ${hour === currentHour ? '当前小时累计' : '已完成小时'}<br/>运单量：${value.toLocaleString('zh-CN')} 单`
}
