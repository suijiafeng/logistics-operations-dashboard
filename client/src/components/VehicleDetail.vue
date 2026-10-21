<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { hubById } from '../data/network'
import { fetchVehicle } from '../services/vehicles'
import { fmtInt } from '../services/format'

// 车辆抽屉：详情由 /vehicles/:plate 每 2 秒轮询（速度、朝向、里程、ETA），位置由地图按 1Hz 增量包下标跟随
const POLL_MS = 2000
const STATUS_TEXT = ['在途', '装卸中', '异常']
const STATUS_CLASS = ['ok', 'dwell', 'alert']
const store = useDashboardStore()
const { focusHub } = useFocus()
const loading = ref(false)
let timer: number | undefined
let controller: AbortController | undefined

const plate = computed(() => store.selectedPlate)
const detail = computed(() => store.vehicle)
const from = computed(() => detail.value ? hubById[detail.value.fromId] : undefined)
const to = computed(() => detail.value ? hubById[detail.value.toId] : undefined)
const progress = computed(() => {
  const d = detail.value
  return d && d.routeKm > 0 ? Math.max(0, Math.min(100, Math.round(d.traveledKm / d.routeKm * 100))) : 0
})
const eta = computed(() => {
  const min = detail.value?.etaMin
  if (min == null) return '—'
  return min >= 60 ? `${Math.floor(min / 60)} 小时 ${min % 60} 分` : `${min} 分钟`
})
const heading = computed(() => {
  const deg = detail.value?.heading
  if (deg == null) return ''
  const names = ['北', '东北', '东', '东南', '南', '西南', '西', '西北']
  return `${names[Math.round(deg / 45) % 8]} ${deg}°`
})

async function poll() {
  const current = plate.value
  if (!current) return
  controller?.abort()
  controller = new AbortController()
  loading.value = !store.vehicle
  try {
    const data = await fetchVehicle(current, controller.signal)
    if (plate.value !== current) return
    if (!data) { store.vehicleError = '车辆不存在或已下线'; store.vehicle = null; return }
    store.vehicle = data
    store.vehicleError = ''
  } catch (error) {
    if ((error as Error).name === 'AbortError' || plate.value !== current) return
    store.vehicleError = `车辆详情暂不可用：${(error as Error).message}`
  } finally {
    if (plate.value === current) loading.value = false
  }
}

function stop() {
  window.clearInterval(timer)
  timer = undefined
  controller?.abort()
  controller = undefined
}

watch(plate, (value) => {
  stop()
  if (!value) return
  void poll()
  timer = window.setInterval(() => { if (!document.hidden) void poll() }, POLL_MS)
}, { immediate: true })
onBeforeUnmount(stop)
</script>

<template>
  <section v-if="plate && store.hasData" class="vehicle-detail" :class="store.detailSide" aria-label="车辆详情">
    <header>
      <div class="titles">
        <h4 :title="plate">{{ plate }}</h4>
        <p v-if="detail">
          <span class="status" :class="STATUS_CLASS[detail.status] ?? 'ok'">{{ STATUS_TEXT[detail.status] ?? '未知' }}</span>
          · 追踪中 · 位置每秒更新
        </p>
        <p v-else-if="store.vehicleError" class="err">{{ store.vehicleError }}</p>
        <p v-else>{{ loading ? '正在读取车辆详情…' : '' }}</p>
      </div>
      <button class="close" aria-label="关闭车辆详情（Esc）" @click="store.selectVehicle(null)">×</button>
    </header>

    <template v-if="detail && from && to">
      <div class="route">
        <button class="hub" :title="`${from.name} · ${from.site} · 点击查看网点`" @click="focusHub(from.id)">{{ from.name }}</button>
        <span class="arrow" aria-hidden="true">→</span>
        <button class="hub" :title="`${to.name} · ${to.site} · 点击查看网点`" @click="focusHub(to.id)">{{ to.name }}</button>
      </div>
      <div class="progress" role="progressbar" :aria-valuenow="progress" aria-valuemin="0" aria-valuemax="100" :aria-label="`已行驶 ${progress}%`">
        <div class="bar"><div class="fill" :style="{ width: `${progress}%` }" /></div>
        <div class="progress-labels">
          <span>已行驶 {{ fmtInt(detail.traveledKm) }} km</span>
          <span>剩余 {{ fmtInt(detail.remainingKm) }} km</span>
        </div>
      </div>

      <dl class="metrics">
        <div class="metric"><dt>当前车速</dt><dd><span class="v">{{ detail.speedKmh }}</span><small>km/h</small></dd></div>
        <div class="metric"><dt>预计到达</dt><dd><span class="v eta">{{ eta }}</span></dd></div>
        <div class="metric"><dt>行驶朝向</dt><dd><span class="v">{{ heading }}</span></dd></div>
        <div class="metric"><dt>干线全长</dt><dd><span class="v">{{ fmtInt(detail.routeKm) }}</span><small>km</small></dd></div>
      </dl>
      <p class="coords" :title="`${detail.position[0].toFixed(5)}, ${detail.position[1].toFixed(5)}（WGS84）`">
        {{ detail.position[0].toFixed(4) }}°E {{ detail.position[1].toFixed(4) }}°N · 沿真实公路折线行驶，仿真 60× 加速
      </p>
    </template>
  </section>
</template>

<style scoped>
.vehicle-detail {
  position: absolute;
  top: 52px;
  width: 300px;
  max-width: calc(100% - 32px);
  max-height: calc(100% - 68px);
  overflow: auto;
  overscroll-behavior: contain;
  background: var(--color-overlay);
  border: 1px solid var(--color-border);
  border-radius: var(--radius-panel);
  padding: 14px var(--space-4) var(--space-4);
  box-shadow: var(--shadow-panel);
  z-index: 5;
}
.vehicle-detail.left { right: auto; left: var(--space-4); }
.vehicle-detail.right { right: var(--space-4); left: auto; }
header { display: flex; align-items: flex-start; gap: var(--space-2); }
.titles { flex: 1; min-width: 0; }
h4 { font-family: var(--font-number); font-size: 18px; font-weight: 700; color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-variant-numeric: tabular-nums; }
.titles p { font-size: var(--font-small); color: var(--color-tertiary); }
.titles .err { color: var(--color-dangerText); white-space: normal; }
.status { font-weight: 500; }
.status.ok { color: var(--color-accentText); }
.status.dwell { color: var(--color-secondary); }
.status.alert { color: var(--color-dangerText); }
.close { flex: none; background: none; border: none; color: var(--color-tertiary); font-size: 18px; line-height: 1; cursor: pointer; border-radius: var(--radius-control); }
.close:hover { background: var(--color-hover); color: var(--color-heading); }

.route { display: flex; align-items: center; gap: var(--space-2); margin-top: var(--space-4); }
.hub {
  flex: 1;
  min-width: 0;
  min-height: 32px;
  padding: 0 10px;
  background: var(--color-elevated);
  border: 1px solid transparent;
  border-radius: var(--radius-control);
  color: var(--color-heading);
  font-size: var(--font-body);
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.hub:hover { border-color: var(--color-border); background: var(--color-hover); }
.arrow { flex: none; color: var(--color-accent); font-weight: 700; }
.progress { margin-top: var(--space-3); }
.bar { height: 6px; background: var(--color-track); border-radius: 3px; overflow: hidden; }
.fill { height: 100%; background: var(--color-accent); border-radius: 3px; transition: width 0.6s ease; }
.progress-labels { display: flex; justify-content: space-between; margin-top: 4px; font-family: var(--font-number); font-size: 11px; color: var(--color-tertiary); font-variant-numeric: tabular-nums; }

.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-4); }
.metric { min-width: 0; padding: 8px 10px; border-radius: var(--radius-tile); background: var(--color-elevated); }
.metric dt { font-size: var(--font-small); color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.metric dd { display: flex; align-items: baseline; gap: 3px; min-width: 0; }
.metric .v { min-width: 0; font-family: var(--font-number); font-size: 20px; font-weight: 600; color: var(--color-heading); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.metric .v.eta { font-size: 16px; }
.metric small { flex: none; font-size: var(--font-small); color: var(--color-tertiary); }
.coords { margin-top: var(--space-3); font-size: 11px; color: var(--color-tertiary); line-height: 1.5; }
</style>
