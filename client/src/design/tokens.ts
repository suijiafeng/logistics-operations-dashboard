/** DOM 与 Canvas 共用的设计变量；在应用挂载前安装对应 CSS 自定义属性。 */
// 配色原则：常态信息一律用同一蓝色色阶；红色只表示需要处理，琥珀只表示需要关注，橙色只表示当前焦点。
export const COLORS = {
  canvas: '#040a15', panel: '#08132a', header: '#08132a', elevated: '#0e1d38',
  track: '#132845', border: '#1e3b63', hover: '#10213f', selected: '#12274a',
  text: '#e8f1fc', heading: '#e8f1fc', secondary: '#9cb6d6', tertiary: '#6886aa',
  accent: '#ff8a3d', accentText: '#ffb066', accentValue: '#ffd9ae', onAccent: '#131313',
  success: '#34c77b', warning: '#e8b13c', danger: '#f0524d', dangerText: '#ff9d97',
  // 数据色阶（同一色相，按明度区分层级）
  barWeak: '#163459', bar: '#1f4c80', barStrong: '#2c6cb4', barLight: '#5ba6ee',
  vehicle: '#4aa8f0', muted: '#1f4c80', route: '#1d4675',
  infoBg: '#0e1d38', warningBg: '#4a3a17', dangerBg: '#57201d',
  mapArea: '#0b1a33', mapBorder: '#1c3a62', mapProvince: '#12305a', mapHover: '#1a3f72',
  overlay: 'rgba(10, 24, 48, 0.94)', hud: 'rgba(6, 14, 30, 0.92)',
  legend: 'rgba(10, 24, 48, 0.94)', accentArea: 'rgba(255, 138, 61, 0.14)',
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
  root.setProperty('--radius-control', '4px')
  root.setProperty('--radius-tile', '6px')
  root.setProperty('--control-size', `${CONTROL_SIZE}px`)
  root.setProperty('--event-row-height', `${EVENT_ROW_HEIGHT}px`)
  root.setProperty('--shadow-panel', '0 8px 24px rgba(0, 0, 0, 0.45)')
}
