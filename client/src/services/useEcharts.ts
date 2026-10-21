import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import * as echarts from 'echarts'
import { COLORS, FONT } from '../design/tokens'
import { useChartMotion } from './useChartMotion'
import { useDashboardStore } from '../stores/dashboard'

/** 通用 ECharts 挂载：初始化、窗口 resize、卸载销毁（实例用 shallowRef，避免被响应式深代理） */
export function useEcharts(): { el: Ref<HTMLDivElement | null>; chart: ShallowRef<echarts.EChartsType | null> } {
  const el = ref<HTMLDivElement | null>(null)
  const chart = shallowRef<echarts.EChartsType | null>(null)
  const motion = useChartMotion()
  const store = useDashboardStore()
  let observer: ResizeObserver | undefined
  let resizeTimer: number | undefined
  let resolution: MediaQueryList | undefined
  let dpr = 1

  function currentDpr() {
    const cap = store.quality === 'full' ? 2 : store.quality === 'balanced' ? 1.5 : 1
    return Math.max(1, Math.min(window.devicePixelRatio || 1, cap))
  }

  function rebuild() {
    if (!el.value || !el.value.clientWidth || !el.value.clientHeight) return
    const old = chart.value
    const option = old?.getOption()
    old?.dispose()
    chart.value = null
    dpr = currentDpr()
    const instance = echarts.init(el.value, undefined, { renderer: 'canvas', devicePixelRatio: dpr })
    if (option) instance.setOption(option)
    chart.value = instance
    store.renderDpr = dpr
    syncMotion()
  }

  function onResize() {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (!chart.value || Math.abs(currentDpr() - dpr) > 0.01) rebuild()
      else chart.value.resize()
    }, 100)
  }

  function armResolution() {
    resolution?.removeEventListener('change', resolutionChanged)
    resolution = window.matchMedia(`(resolution: ${window.devicePixelRatio || 1}dppx)`)
    resolution.addEventListener('change', resolutionChanged)
  }
  function resolutionChanged() { armResolution(); onResize() }

  function syncMotion() {
    chart.value?.setOption({ animation: motion.value, animationDuration: 200, animationDurationUpdate: 300,
      textStyle: { fontFamily: FONT.family, fontSize: FONT.small, color: COLORS.secondary } })
  }
  watch(motion, syncMotion)
  watch(() => store.quality, onResize)

  onMounted(() => {
    if (el.value) {
      rebuild()
      observer = new ResizeObserver(onResize)
      observer.observe(el.value)
      armResolution()
      window.addEventListener('resize', onResize)
    }
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    resolution?.removeEventListener('change', resolutionChanged)
    window.removeEventListener('resize', onResize)
    window.clearTimeout(resizeTimer)
    chart.value?.dispose()
    chart.value = null
  })
  return { el, chart }
}

/** 深色大屏统一的 ECharts 文本样式 */
export const TEXT = {
  color: COLORS.secondary,
  fontFamily: FONT.family,
  fontSize: FONT.small,
}
export const TOOLTIP = {
  backgroundColor: COLORS.elevated, borderWidth: 0,
  textStyle: { color: COLORS.text, fontSize: FONT.body, fontFamily: FONT.family },
}
export const ACCENT = COLORS.accent
export const GREEN = COLORS.success
export const RED = COLORS.danger
export const AMBER = COLORS.warning
export const BLUEGRAY = COLORS.muted
