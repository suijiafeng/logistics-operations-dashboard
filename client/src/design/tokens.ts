/** DOM 与 Canvas 共用的设计变量；在应用挂载前安装对应 CSS 自定义属性。 */
export const COLORS = {
  canvas: '#070b10', panel: '#0d141b', header: '#0a0f14', elevated: '#131c26',
  track: '#16202a', border: '#263646', hover: '#192631', selected: '#2a251e',
  text: '#d7e2ec', heading: '#eef4fa', secondary: '#8fa3b8',
  accent: '#ff8a3d', accentText: '#ffb066', accentValue: '#ffd9ae', onAccent: '#131313',
  success: '#34c77b', warning: '#e8b13c', danger: '#f0524d', dangerText: '#ff9d97',
  muted: '#5b7a99', route: '#5b7a99',
  infoBg: '#233242', warningBg: '#4a3a17', dangerBg: '#57201d',
  mapArea: '#101a24', mapBorder: '#2a3d51', mapProvince: '#14202c', mapHover: '#293423',
  overlay: 'rgba(13, 20, 27, 0.96)', hud: 'rgba(8, 12, 16, 0.92)',
  legend: 'rgba(10, 15, 20, 0.82)', accentArea: 'rgba(255, 138, 61, 0.13)',
} as const

export const FONT = {
  family: '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif',
  small: 12, body: 14, title: 16, compactPage: 20, page: 24, kpi: 36,
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
  root.setProperty('--control-size', `${CONTROL_SIZE}px`)
  root.setProperty('--event-row-height', `${EVENT_ROW_HEIGHT}px`)
  root.setProperty('--shadow-panel', '0 8px 24px rgba(0, 0, 0, 0.45)')
}
