/** DOM 与 Canvas 共用的设计变量；在应用挂载前安装对应 CSS 自定义属性。 */
// 深蓝身份色：海军蓝底、单一蓝强调色用于焦点、主系列和关键数字。
// 红 / 琥珀 / 绿只用于真实告警与恢复，不拿来做装饰。
export const COLORS = {
  canvas: '#050B18', panel: '#0A1A33', header: '#0A1A33', elevated: '#102848',
  track: '#16345C', border: 'rgba(120, 168, 255, 0.22)', hover: 'rgba(47, 128, 255, 0.10)',
  selected: 'rgba(47, 128, 255, 0.16)',
  text: '#E8F1FC', heading: '#F4F8FF', secondary: '#B7C9E2', tertiary: '#8AA4C4',
  accent: '#2F80FF', accentText: '#7AABFF', accentValue: '#C5DBFF', onAccent: '#F7FBFF',
  success: '#6FBF90', warning: '#E6B325', danger: '#E5484D', dangerText: '#F5A8A4',
  // 图表色阶：同一蓝色相，按明度区分
  barWeak: '#14345C', bar: '#1E5BB8', barStrong: '#2F80FF', barLight: '#8EBAFF',
  vehicle: '#8EBAFF', dwell: '#3D6FA8', muted: '#1E4E8C', route: '#245A96',
  cold: '#5EB8C9',
  infoBg: '#102848', warningBg: '#3A3014', dangerBg: '#3F1D1D',
  mapArea: '#071428', mapBorder: 'rgba(126, 176, 240, 0.32)', mapProvince: '#0E2C56', mapHover: '#143866',
  overlay: 'rgba(5, 11, 24, 0.94)', hud: 'rgba(5, 14, 32, 0.92)',
  legend: 'rgba(5, 14, 32, 0.92)', accentArea: 'rgba(47, 128, 255, 0.16)',
  gridLine: 'rgba(120, 168, 255, 0.14)',
} as const

export const FONT = {
  family: '"Noto Sans CJK SC", "Noto Sans SC", "Source Han Sans SC", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif',
  number: '"Inter", "DIN Alternate", "Roboto", "Helvetica Neue", "Noto Sans SC", sans-serif',
  small: 12, body: 14, title: 16, compactPage: 20, page: 22, kpi: 28,
} as const

export const SPACE = { '1': 4, '2': 8, '3': 12, '4': 16, '6': 24, '8': 32 } as const
export const CONTROL_SIZE = 32
export const EVENT_ROW_HEIGHT = 80
export const HIGH_UTILIZATION = 88

export function installDesignTokens() {
  const root = document.documentElement.style
  for (const [key, value] of Object.entries(COLORS)) root.setProperty(`--color-${key}`, value)
  for (const [key, value] of Object.entries(SPACE)) root.setProperty(`--space-${key}`, `${value}px`)
  for (const [key, value] of Object.entries(FONT)) {
    root.setProperty(`--font-${key}`, typeof value === 'number' ? `${value}px` : value)
  }
  root.setProperty('--radius-panel', '8px')
  root.setProperty('--radius-control', '6px')
  root.setProperty('--radius-tile', '6px')
  root.setProperty('--control-size', `${CONTROL_SIZE}px`)
  root.setProperty('--event-row-height', `${EVENT_ROW_HEIGHT}px`)
  root.setProperty('--shadow-panel', '0 1px 2px rgba(0, 0, 0, 0.45)')
}
