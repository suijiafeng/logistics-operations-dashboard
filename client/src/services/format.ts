/** 完整千分位：用于列表、排行等有弹性列宽的位置 */
export function fmtInt(n?: number | null) {
  return n == null || !Number.isFinite(n) ? '—' : Math.round(n).toLocaleString('zh-CN')
}

/** 紧凑计数：用于 KPI、指标卡等宽度固定的位置；≥100 万改用「万」，避免数字位数增长撑破卡片 */
export function fmtCompact(n?: number | null, wanThreshold = 1e6) {
  if (n == null || !Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e8) return `${(n / 1e8).toFixed(abs >= 1e9 ? 0 : 1)}亿`
  if (abs >= wanThreshold) return `${(n / 1e4).toFixed(abs >= 1e7 ? 0 : 1)}万`
  return Math.round(n).toLocaleString('zh-CN')
}
