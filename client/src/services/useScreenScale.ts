import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '../stores/dashboard'

/** 设计基准：1920×1080；超过即等比放大，最多 2 倍（3840×2160 @1x） */
const BASE_W = 1920
const BASE_H = 1080
const MAX_SCALE = 2

/**
 * 以 1080 高度为基准的整页 CSS zoom。
 * - 只在视口 CSS 高度 > 1080 且宽度 > 1920 时放大；≤1080 的屏幕保持真实尺寸响应式布局。
 * - scale 取 min(高/1080, 宽/1920)：横屏与超宽屏按高度放大，多出的宽度留给地图；
 *   4:3、竖屏等不足 16:9 的屏幕按宽度放大，保证逻辑宽度不低于 1920，不会误触窄屏布局。
 * - 不用 transform：zoom 会真正重排，ECharts 画布按 DPR×scale 重建保持清晰，指针坐标也不偏移。
 */
export function useScreenScale() {
  const store = useDashboardStore()
  const disabled = new URLSearchParams(location.search).get('scale') === 'off'
  const style = ref<Record<string, string>>({})

  function compute() {
    const w = window.innerWidth, h = window.innerHeight
    const scale = disabled || h <= BASE_H ? 1 : Math.max(1, Math.min(h / BASE_H, w / BASE_W, MAX_SCALE))
    store.screenScale = Math.round(scale * 1000) / 1000
    // 缩放子树里 vw/vh 也会被 zoom 再乘一次，所以把逻辑视口尺寸以 px 下发给 --vw / --vh
    style.value = store.screenScale === 1 ? {} : {
      zoom: String(store.screenScale),
      '--vw': `${w / store.screenScale / 100}px`,
      '--vh': `${h / store.screenScale / 100}px`,
    }
  }
  compute()
  installLegacyZoomRectFix(() => store.screenScale)
  onMounted(() => window.addEventListener('resize', compute))
  onBeforeUnmount(() => window.removeEventListener('resize', compute))
  return style
}

/**
 * Chrome 128 以前（含构建目标 Chrome 87）的旧版 zoom：getBoundingClientRect 返回的是除以 zoom 后的值，
 * 而 MouseEvent.clientX 仍是视口像素。ECharts（zrender）用二者换算指针坐标，会导致悬停/点击错位。
 * 检测到旧语义时把缩放根内元素的矩形乘回 zoom，统一为新版（标准化 zoom）的视口坐标语义。
 */
let rectFixInstalled = false
function installLegacyZoomRectFix(scale: () => number) {
  if (rectFixInstalled || typeof document === 'undefined') return
  rectFixInstalled = true
  const probe = document.createElement('div')
  probe.style.cssText = 'position:absolute;visibility:hidden;zoom:2;width:10px;height:10px'
  document.body.appendChild(probe)
  const legacy = Math.round(probe.getBoundingClientRect().width) === 10
  probe.remove()
  if (!legacy) return
  const native = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const rect = native.call(this)
    const z = scale()
    if (z === 1 || !this.closest('[data-screen-scale]')) return rect
    return new DOMRect(rect.x * z, rect.y * z, rect.width * z, rect.height * z)
  }
}
