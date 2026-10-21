import { nextTick } from 'vue'
import { useDashboardStore, type AnomalyEvent } from '../stores/dashboard'

/**
 * 统一定位入口：选中网点 / 定位事件后，若地图不在视口内（窄屏下面板排在地图下方），滚回地图，
 * 让定位结果与网点详情可见。告警、TOP5、仓配方块、详情内的跳转都走这里。
 */
export function useFocus() {
  const store = useDashboardStore()
  function revealMap() {
    void nextTick(() => {
      const map = document.querySelector('.map-wrap')
      if (!map) return
      const rect = map.getBoundingClientRect()
      if (rect.top >= 0 && rect.bottom <= window.innerHeight) return
      const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches && store.decorationsOn
      map.scrollIntoView({ block: 'start', behavior: smooth ? 'smooth' : 'auto' })
    })
  }
  return {
    focusHub(id: string) { store.selectHub(id); revealMap() },
    locateEvent(event: AnomalyEvent) { store.locateEvent(event); revealMap() },
    focusVehicle(plate: string) { store.selectVehicle(plate); revealMap() },
    focusRoute(index: number) { store.selectRoute(index); revealMap() },
  }
}
