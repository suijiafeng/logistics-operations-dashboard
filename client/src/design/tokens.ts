/** DOM 与 Canvas 共用的设计变量；在应用挂载前安装对应 CSS 自定义属性。 */
// 精密深色：中性锌灰分层，单一强调色（国际橙）只用于焦点、主操作和当前锚点。
// 红 / 琥珀只用于真实告警与需要关注的状态，不拿来做装饰。
export const COLORS = {
  canvas: '#09090B', panel: '#18181B', header: '#18181B', elevated: '#27272A',
  track: '#27272A', border: 'rgba(255, 255, 255, 0.08)', hover: 'rgba(255, 255, 255, 0.05)',
  selected: 'rgba(255, 79, 0, 0.12)',
  text: '#FAFAFA', heading: '#FAFAFA', secondary: '#A1A1AA', tertiary: '#71717A',
  accent: '#FF4F00', accentText: '#FF8A4C', accentValue: '#FFC2A1', onAccent: '#18181B',
  success: '#6FBF90', warning: '#E6B325', danger: '#E5484D', dangerText: '#F5A8A4',
  // 数据色阶：同一中性明度阶梯，不另开色相
  barWeak: '#3F3F46', bar: '#71717A', barStrong: '#A1A1AA', barLight: '#D4D4D8',
  vehicle: '#D4D4D8', dwell: '#A8A29E', muted: '#52525B', route: '#5C5C66',
  cold: '#8FA39A',
  infoBg: '#27272A', warningBg: '#3A3014', dangerBg: '#3F1D1D',
  mapArea: '#141416', mapBorder: 'rgba(255, 255, 255, 0.12)', mapProvince: '#1F1F23', mapHover: '#2A2A2E',
  overlay: 'rgba(9, 9, 11, 0.94)', hud: 'rgba(9, 9, 11, 0.92)',
  legend: 'rgba(9, 9, 11, 0.92)', accentArea: 'rgba(255, 79, 0, 0.12)',
  gridLine: 'rgba(255, 255, 255, 0.08)',
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
