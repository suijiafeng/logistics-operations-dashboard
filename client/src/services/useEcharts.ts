import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import * as echarts from 'echarts'
import { COLORS, FONT } from '../design/tokens'
import { useChartMotion } from './useChartMotion'

/** 通用 ECharts 挂载：初始化、窗口 resize、卸载销毁（实例用 shallowRef，避免被响应式深代理） */
export function useEcharts(): { el: Ref<HTMLDivElement | null>; chart: ShallowRef<echarts.EChartsType | null> } {
  const el = ref<HTMLDivElement | null>(null)
  const chart = shallowRef<echarts.EChartsType | null>(null)
  const motion = useChartMotion()
  let observer: ResizeObserver | undefined
  let resizeFrame = 0

  function onResize() {
    cancelAnimationFrame(resizeFrame)
    resizeFrame = requestAnimationFrame(() => chart.value?.resize())
  }

  function syncMotion() {
    chart.value?.setOption({ animation: motion.value, animationDuration: 200, animationDurationUpdate: 300,
      textStyle: { fontFamily: FONT.family, fontSize: FONT.small, color: COLORS.secondary } })
  }
  watch(motion, syncMotion)

  onMounted(() => {
    if (el.value) {
      chart.value = echarts.init(el.value, undefined, { renderer: 'canvas' })
      syncMotion()
      observer = new ResizeObserver(onResize)
      observer.observe(el.value)
    }
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    cancelAnimationFrame(resizeFrame)
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
