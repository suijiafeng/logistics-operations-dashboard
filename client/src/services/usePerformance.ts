import { onBeforeUnmount, onMounted } from 'vue'
import { useDashboardStore } from '../stores/dashboard'

export function usePerformance() {
  const store = useDashboardStore()
  let raf = 0, count = 0, start = 0, started = 0, changedAt = 0
  let low = 0, high = 0, resizedAt = 0
  const resized = () => { resizedAt = performance.now(); low = high = 0 }
  const reset = () => { count = 0; start = performance.now(); low = high = 0 }
  const levels = ['full', 'balanced', 'low'] as const
  function loop(now: number) {
    if (!start) start = started = now
    count++
    const elapsed = now - start
    if (elapsed >= 1000) {
      if (!document.hidden) {
        store.fps = Math.round(count * 1000 / elapsed)
        store.frameMs = Math.round(elapsed / count * 10) / 10
        if (store.autoQuality && now - started > 10_000 && now - resizedAt > 5000) {
          low = store.fps < 30 ? low + 1 : 0
          high = store.fps > 55 ? high + 1 : 0
          const index = levels.indexOf(store.quality)
          if (low >= 4 && index < 2 && now - changedAt > 10_000) {
            store.quality = levels[index + 1]
            store.qualityReason = '连续低于 30 FPS，自动降低装饰和渲染预算'
            changedAt = now; low = high = 0
          } else if (high >= 30 && index > 0 && now - changedAt > 60_000) {
            store.quality = levels[index - 1]
            store.qualityReason = '帧率持续恢复，逐级恢复渲染预算'
            changedAt = now; low = high = 0
          }
        }
      }
      count = 0; start = now
    }
    raf = requestAnimationFrame(loop)
  }
  onMounted(() => {
    raf = requestAnimationFrame(loop)
    window.addEventListener('resize', resized)
    document.addEventListener('visibilitychange', reset)
  })
  onBeforeUnmount(() => {
    cancelAnimationFrame(raf)
    window.removeEventListener('resize', resized)
    document.removeEventListener('visibilitychange', reset)
  })
}
