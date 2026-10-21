import { onBeforeUnmount, onMounted, watch } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { HUBS, GUANGDONG_HUB_IDS } from '../data/network'

type WakeHandle = { release(): Promise<void>; addEventListener(type: string, listener: () => void): void }
export function useDisplayRuntime() {
  const store = useDashboardStore()
  let timer: number | undefined
  let lastInput = Date.now()
  let lastTour = 0
  let tourStep = 0
  let wake: WakeHandle | null = null
  let acquiring = false
  let refreshedDay = ''
  const params = new URLSearchParams(location.search)
  const refresh = params.get('refresh')
  async function acquireWake() {
    if (wake || acquiring || !store.kioskOn || document.hidden) return
    const api = (navigator as unknown as { wakeLock?: { request(type: string): Promise<WakeHandle> } }).wakeLock
    if (!api) { store.wakeStatus = '此环境不支持防息屏'; return }
    acquiring = true
    try {
      const handle = await api.request('screen')
      if (!store.kioskOn || document.hidden) { await handle.release(); return }
      wake = handle
      store.wakeStatus = '防息屏已启用'
      handle.addEventListener('release', () => { if (wake === handle) wake = null; store.wakeStatus = '防息屏已释放' })
    } catch { store.wakeStatus = '防息屏申请失败，请检查权限或 HTTPS' }
    finally { acquiring = false }
  }
  async function releaseWake() {
    const handle = wake
    wake = null
    try { await handle?.release() } catch { store.notify('防息屏释放失败') }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen()
      else store.notify('此浏览器不支持全屏，请使用系统全屏')
    } catch { store.notify('无法进入全屏，请检查浏览器权限') }
  }
  function activity() { lastInput = Date.now(); store.cursorHidden = false; if (store.tourOn) store.tourPaused = true }
  function key(e: KeyboardEvent) {
    if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || (e.target as HTMLElement)?.closest('input,textarea,select,[contenteditable=true]')) return
    if (e.key.toLowerCase() === 'f') { e.preventDefault(); void fullscreen() }
  }
  function context(e: Event) { if (store.kioskOn) e.preventDefault() }
  function fullscreenChange() { store.fullscreen = !!document.fullscreenElement }
  function visibility() { if (document.hidden) void releaseWake(); else { activity(); void acquireWake() } }
  watch(() => store.kioskOn, (enabled) => { if (enabled) void acquireWake(); else { store.cursorHidden = false; void releaseWake() } })
  watch(() => store.tourOn, () => { lastInput = Date.now(); lastTour = Date.now(); store.tourPaused = store.tourOn })
  onMounted(() => {
    store.kioskOn = params.get('kiosk') === '1'
    store.tourOn = params.get('tour') === '1'
    for (const name of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.addEventListener(name, activity, { passive: true })
    window.addEventListener('keydown', key)
    document.addEventListener('contextmenu', context)
    document.addEventListener('visibilitychange', visibility)
    document.addEventListener('fullscreenchange', fullscreenChange)
    timer = window.setInterval(() => {
      const now = Date.now(), idle = now - lastInput
      store.cursorHidden = store.kioskOn && idle > 3000
      store.tourPaused = store.tourOn && idle < 30_000
      if (store.tourOn && !store.tourPaused && !document.hidden && now - lastTour > 10_000) {
        const gd = tourStep % 6 >= 3
        store.view = gd ? 'guangdong' : 'china'
        const hubs = HUBS.filter(h => gd ? GUANGDONG_HUB_IDS.has(h.id) : h.level === 1)
        store.selectHub(hubs[tourStep % hubs.length]!.id)
        tourStep++; lastTour = now
      }
      const date = new Date(), day = date.toLocaleDateString('en-CA')
      const time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      if (store.kioskOn && refresh && /^\d{2}:\d{2}$/.test(refresh) && time === refresh && day !== refreshedDay && idle > 30_000 && store.dataStatus === 'ready') {
        refreshedDay = day; location.reload()
      }
    }, 1000)
    void acquireWake()
  })
  onBeforeUnmount(() => {
    window.clearInterval(timer)
    for (const name of ['pointermove', 'pointerdown', 'keydown', 'wheel']) window.removeEventListener(name, activity)
    window.removeEventListener('keydown', key)
    document.removeEventListener('contextmenu', context)
    document.removeEventListener('visibilitychange', visibility)
    document.removeEventListener('fullscreenchange', fullscreenChange)
    store.kioskOn = false
    void releaseWake()
  })
  return { fullscreen }
}
