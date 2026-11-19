<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { ROUTES, hubById } from '../data/network'
import { ROUTE_GEOMETRY } from '../services/geo'
import { fmtCompact, fmtInt } from '../services/format'
import { plateOf, routeOf, statusOf } from '../services/vehicles'

// 干线抽屉：两端网点、今日单量与排名、线上车辆分状态计数、里程与时长、线上告警；地图同时只突出线上车辆
const LEVEL_DOT = ['lv0', 'lv1', 'lv2']
const store = useDashboardStore()
const { focusHub, locateEvent, focusVehicle } = useFocus()
const STATUS_TEXT = ['在途', '装卸', '异常']
const STATUS_CLASS = ['lv0', 'lv0', 'lv2']
const VEHICLE_LIMIT = 8
const index = computed(() => store.selectedRouteIndex)
const ends = computed(() => {
  const i = index.value
  if (i === null) return undefined
  const [a, b] = ROUTES[i]!
  return { from: hubById[a]!, to: hubById[b]! }
})
const orders = computed(() => (index.value === null ? undefined : store.routeOrders[index.value]))
const rank = computed(() => {
  const i = index.value
  if (i === null || orders.value == null) return 0
  return store.routeOrders.filter((v, j) => v > orders.value! || (v === orders.value && j < i)).length + 1
})
const fleet = computed(() => (index.value === null ? undefined : store.routeFleet[index.value]))
const geometry = computed(() => (index.value === null ? undefined : ROUTE_GEOMETRY[index.value]))
const duration = computed(() => {
  const min = geometry.value?.durationMin
  if (min == null) return '—'
  return min >= 60 ? `${Math.floor(min / 60)} 小时 ${min % 60} 分` : `${min} 分钟`
})
// 线上车辆：异常优先，其余按车牌，最多列 8 台；点击追踪（全国视图里干线被车辆点铺满，列表比地图点选可靠）
const lineVehicles = computed(() => {
  const i = index.value
  if (i === null) return []
  const flat = store.vehicles
  const list: { index: number; status: number }[] = []
  for (let k = 0; k * 3 + 2 < flat.length; k++) {
    const code = flat[k * 3 + 2]!
    if (routeOf(code) === i) list.push({ index: k, status: statusOf(code) })
  }
  return list.sort((a, b) => (b.status === 2 ? 1 : 0) - (a.status === 2 ? 1 : 0) || a.index - b.index).slice(0, VEHICLE_LIMIT)
})
const relatedEvents = computed(() => index.value === null ? [] : store.events.filter((e) => e.routeIndex === index.value).slice(0, 4))
const metrics = computed(() => {
  const f = fleet.value
  return [
    { label: '今日单量', value: orders.value != null ? fmtCompact(orders.value) : '—', full: orders.value != null ? fmtInt(orders.value) : '', unit: '单' },
    { label: '单量排名', value: rank.value ? `${rank.value}` : '—', full: `${rank.value} / ${ROUTES.length}`, unit: `/ ${ROUTES.length}` },
    { label: '在途车辆', value: f ? fmtInt(f[0]) : '—', full: f ? fmtInt(f[0]) : '', unit: '台' },
    { label: '线上异常', value: f ? fmtInt(f[2]) : '—', full: f ? fmtInt(f[2]) : '', unit: '起', warn: !!f && f[2] > 0 },
  ]
})
</script>

<template>
  <section v-if="ends && store.hasData" class="route-detail" :class="store.detailSide" aria-label="干线详情">
    <header>
      <div class="titles">
        <h4 :title="`${ends.from.name} ↔ ${ends.to.name}`">{{ ends.from.name }} ↔ {{ ends.to.name }}</h4>
        <p>干线 · 地图只突出线上车辆{{ fleet ? ` · 装卸中 ${fleet[1]} 台` : '' }}</p>
      </div>
      <button class="close" aria-label="关闭干线详情（Esc）" @click="store.selectRoute(null)">×</button>
    </header>

    <div class="ends">
      <button class="hub" :title="`${ends.from.name} · ${ends.from.site} · 点击查看网点`" @click="focusHub(ends.from.id)">
        <b>{{ ends.from.name }}</b><span>{{ ends.from.site }}</span>
      </button>
      <span class="arrow" aria-hidden="true">↔</span>
      <button class="hub" :title="`${ends.to.name} · ${ends.to.site} · 点击查看网点`" @click="focusHub(ends.to.id)">
        <b>{{ ends.to.name }}</b><span>{{ ends.to.site }}</span>
      </button>
    </div>

    <dl class="metrics">
      <div v-for="m in metrics" :key="m.label" class="metric">
        <dt>{{ m.label }}</dt>
        <dd :title="`${m.label}：${m.full} ${m.unit}`"><span class="v" :class="{ warn: m.warn }">{{ m.value }}</span><small>{{ m.unit }}</small></dd>
      </div>
    </dl>

    <p v-if="geometry" class="note">
      真实公路 {{ fmtInt(Math.round(geometry.distanceKm)) }} km · 驾车约 {{ duration }}（OSRM 路径，OpenStreetMap 数据）
    </p>

    <section v-if="lineVehicles.length" class="block">
      <h5>线上车辆 · 显示 {{ lineVehicles.length }} 台 · 点击追踪</h5>
      <div class="plates">
        <button v-for="v in lineVehicles" :key="v.index" class="plate" :class="{ alert: v.status === 2 }" :title="`${plateOf(v.index)} · ${STATUS_TEXT[v.status]} · 点击追踪`" @click="focusVehicle(plateOf(v.index))">
          <i class="sev" :class="STATUS_CLASS[v.status] ?? 'lv0'" />{{ plateOf(v.index) }}
        </button>
      </div>
    </section>

    <section v-if="relatedEvents.length" class="block">
      <h5>线上告警 · {{ relatedEvents.length }}</h5>
      <button v-for="event in relatedEvents" :key="event.id" class="event-link" :title="`${event.type} · ${event.vehicle} · ${event.desc}`" @click="locateEvent(event)">
        <i class="sev" :class="LEVEL_DOT[event.level] ?? 'lv0'" />
        <span class="ev-main"><b>{{ event.type }}</b><span>{{ event.vehicle }}</span></span>
        <time>{{ event.time }}</time>
      </button>
    </section>
  </section>
</template>

<style scoped>
.route-detail {
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
.route-detail.left { right: auto; left: var(--space-4); }
.route-detail.right { right: var(--space-4); left: auto; }
header { display: flex; align-items: flex-start; gap: var(--space-2); }
.titles { flex: 1; min-width: 0; }
h4 { font-size: 18px; font-weight: 700; color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.titles p { font-size: var(--font-small); color: var(--color-tertiary); }
.close { flex: none; background: none; border: none; color: var(--color-tertiary); font-size: 18px; line-height: 1; cursor: pointer; border-radius: var(--radius-control); }
.close:hover { background: var(--color-hover); color: var(--color-heading); }

.ends { display: flex; align-items: stretch; gap: var(--space-2); margin-top: var(--space-4); }
.hub {
  flex: 1;
  min-width: 0;
  min-height: 44px;
  padding: 6px 10px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  background: transparent;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  color: var(--color-heading);
  text-align: left;
  cursor: pointer;
}
.hub:hover { border-color: var(--color-border); background: var(--color-hover); }
.hub b { font-size: var(--font-body); font-weight: 600; }
.hub span { max-width: 100%; font-size: 12px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.arrow { align-self: center; flex: none; color: var(--color-accent); font-weight: 700; }

.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); margin-top: var(--space-4); border-top: 1px solid var(--color-border); }
.metric { container-type: inline-size; min-width: 0; padding: 8px 10px 8px 0; }
.metric:nth-child(odd) { border-right: 1px solid var(--color-border); padding-right: 10px; }
.metric:nth-child(even) { padding-left: 10px; }
.metric:nth-child(n + 3) { border-top: 1px solid var(--color-border); }
.metric dt { font-size: var(--font-small); color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.metric dd { display: flex; align-items: baseline; gap: 3px; min-width: 0; }
.metric .v { min-width: 0; font-family: var(--font-number); font-size: 20px; font-size: clamp(15px, 17cqw, 20px); font-weight: 600; color: var(--color-heading); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.metric .v.warn { color: var(--color-dangerText); }
.metric small { flex: none; font-size: var(--font-small); color: var(--color-tertiary); }
.note { margin-top: var(--space-3); font-size: 12px; color: var(--color-tertiary); line-height: 1.5; }

.block { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--color-track); }
h5 { font-size: 13px; font-weight: 500; color: var(--color-secondary); margin-bottom: var(--space-2); }
.event-link {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--space-2);
  width: 100%;
  min-width: 0;
  padding: 4px 4px 4px 16px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}
.event-link:hover { background: var(--color-hover); }
.sev { position: absolute; left: 5px; top: 50%; margin-top: -3px; width: 6px; height: 6px; border-radius: 50%; }
.lv0 { background: var(--color-border); }
.lv1 { background: var(--color-warning); }
.lv2 { background: var(--color-danger); }
.ev-main { flex: 1; min-width: 0; display: flex; gap: var(--space-2); font-size: var(--font-small); white-space: nowrap; overflow: hidden; }
.ev-main b { flex: none; font-weight: 500; color: var(--color-heading); }
.ev-main span { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--color-secondary); font-family: var(--font-number); }
.event-link time { flex: none; font-family: var(--font-number); font-size: 12px; color: var(--color-tertiary); }
.plates { display: flex; flex-wrap: wrap; gap: 6px; }
.plate {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-secondary);
  font-family: var(--font-number);
  font-size: var(--font-small);
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.plate:hover { background: var(--color-hover); color: var(--color-heading); }
.plate.alert { border-color: var(--color-danger); color: var(--color-dangerText); }
.plate .sev { position: static; margin: 0; }
</style>
