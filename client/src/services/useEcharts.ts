import { onBeforeUnmount, onMounted, ref, shallowRef, type Ref, type ShallowRef } from 'vue'
import * as echarts from 'echarts'

/** 通用 ECharts 挂载：初始化、窗口 resize、卸载销毁（实例用 shallowRef，避免被响应式深代理） */
export function useEcharts(): { el: Ref<HTMLDivElement | null>; chart: ShallowRef<echarts.EChartsType | null> } {
  const el = ref<HTMLDivElement | null>(null)
  const chart = shallowRef<echarts.EChartsType | null>(null)

  function onResize() {
    chart.value?.resize()
  }

  onMounted(() => {
    if (el.value) {
      chart.value = echarts.init(el.value, undefined, { renderer: 'canvas' })
      window.addEventListener('resize', onResize)
    }
  })
  onBeforeUnmount(() => {
    window.removeEventListener('resize', onResize)
    chart.value?.dispose()
    chart.value = null
  })
  return { el, chart }
}

/** 深色大屏统一的 ECharts 文本样式 */
export const TEXT = {
  color: '#8fa3b8',
  fontFamily: '"Noto Sans CJK SC", "PingFang SC", "Microsoft YaHei", sans-serif',
}
export const ACCENT = '#ff8a3d'
export const GREEN = '#34c77b'
export const RED = '#f0524d'
export const AMBER = '#e8b13c'
export const BLUEGRAY = '#5b7a99'
