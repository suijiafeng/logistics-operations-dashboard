import { onBeforeUnmount, onMounted, ref, shallowRef, watch, type Ref, type ShallowRef } from 'vue'
import echarts, { type EChartsType } from './echarts'
import { COLORS, FONT } from '../design/tokens'
import { useChartMotion } from './useChartMotion'
import { useDashboardStore } from '../stores/dashboard'

const POINTER_EVENTS = ['mousedown', 'mouseup', 'mousemove', 'mouseout', 'mouseover', 'click', 'dblclick', 'contextmenu',
  'wheel', 'mousewheel', 'pointerdown', 'pointerup', 'pointermove', 'pointerout', 'pointerover', 'pointercancel']

/** 通用 ECharts 挂载：初始化、窗口 resize、卸载销毁（实例用 shallowRef，避免被响应式深代理） */
export function useEcharts(): { el: Ref<HTMLDivElement | null>; chart: ShallowRef<EChartsType | null>; onResized: (cb: () => void) => void } {
  const el = ref<HTMLDivElement | null>(null)
  const chart = shallowRef<EChartsType | null>(null)
  const motion = useChartMotion()
  const store = useDashboardStore()
  let observer: ResizeObserver | undefined
  let resizeTimer: number | undefined
  let resolution: MediaQueryList | undefined
  let dpr = 1

  // 画质上限按物理像素计：整页 zoom 放大 scale 倍时画布再乘 scale，像素预算与未放大时同尺寸屏幕一致
  function currentDpr() {
    const cap = store.quality === 'full' ? 2 : store.quality === 'balanced' ? 1.5 : 1
    return Math.max(1, Math.min(window.devicePixelRatio || 1, cap)) * store.screenScale
  }

  // 图表实例完成 resize / 重建后通知使用方：依赖画布像素尺寸的布局（如地图 layoutCenter）必须在此之后重算
  const resizedCallbacks: (() => void)[] = []
  function emitResized() { for (const cb of resizedCallbacks) cb() }

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

  // 整页 zoom 下 MouseEvent.offsetX/Y 是视觉像素（新旧 Chrome 皆然），而 zrender 直接拿它当画布本地坐标；
  // 在容器捕获阶段把它换算回逻辑像素，悬停、点击、Tooltip 才对得上
  function unzoomPointer(e: Event) {
    const z = store.screenScale
    const pointer = e as MouseEvent & { __unzoomed?: boolean }
    if (z === 1 || pointer.__unzoomed || typeof pointer.offsetX !== 'number') return
    const x = pointer.offsetX / z, y = pointer.offsetY / z
    Object.defineProperties(pointer, { offsetX: { value: x }, offsetY: { value: y }, __unzoomed: { value: true } })
  }

  function onResize() {
    window.clearTimeout(resizeTimer)
    resizeTimer = window.setTimeout(() => {
      if (!chart.value || Math.abs(currentDpr() - dpr) > 0.01) rebuild()
      else chart.value.resize()
      emitResized()
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
  watch(() => [store.quality, store.screenScale], onResize)

  onMounted(() => {
    if (el.value) {
      rebuild()
      observer = new ResizeObserver(onResize)
      observer.observe(el.value)
      for (const name of POINTER_EVENTS) el.value.addEventListener(name, unzoomPointer, true)
      armResolution()
      window.addEventListener('resize', onResize)
    }
  })
  onBeforeUnmount(() => {
    observer?.disconnect()
    for (const name of POINTER_EVENTS) el.value?.removeEventListener(name, unzoomPointer, true)
    resolution?.removeEventListener('change', resolutionChanged)
    window.removeEventListener('resize', onResize)
    window.clearTimeout(resizeTimer)
    chart.value?.dispose()
    chart.value = null
  })
  return { el, chart, onResized: (cb: () => void) => { resizedCallbacks.push(cb) } }
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
