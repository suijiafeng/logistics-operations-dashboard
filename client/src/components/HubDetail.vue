<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { HIGH_UTILIZATION } from '../design/tokens'
import { ROUTES, hubById } from '../data/network'
import { provinceName } from '../data/provinces'
import { fmtCompact, fmtInt } from '../services/format'

const BACKLOG_WARN = 650
const LEVEL_TEXT = ['', '一级枢纽', '二级枢纽', '三级网点']
const store = useDashboardStore()
const { focusHub, locateEvent } = useFocus()
const hub = computed(() => store.selectedHub)
const relatedEvents = computed(() => store.events.filter((event) => hub.value &&
  (event.fromId === hub.value.id || event.toId === hub.value.id || event.place.includes(hub.value.name))).slice(0, 3))
// 进出干线：有今日单量时按单量降序，单量与底部线路排行同一份累计
const routes = computed(() => {
  const h = hub.value
  if (!h) return []
  return ROUTES.filter(([a, b]) => a === h.id || b === h.id)
    .map(([a, b]) => { const peer = hubById[a === h.id ? b : a]; return { peer, orders: h.routeOrders?.[peer.id] } })
    .sort((x, y) => (y.orders ?? -1) - (x.orders ?? -1))
})
const hasRouteOrders = computed(() => routes.value.some((r) => r.orders != null))
// 枢纽进出干线可达十几条：默认只列单量最高的几条，其余折叠，切换网点时收起
const PEER_LIMIT = 6
const showAllPeers = ref(false)
watch(() => store.selectedHubId, () => { showAllPeers.value = false })
const shownRoutes = computed(() => showAllPeers.value ? routes.value : routes.value.slice(0, PEER_LIMIT))
const maxOrders = computed(() => Math.max(1, ...(hub.value?.recentOrders ?? [])))
const metrics = computed(() => {
  const h = hub.value
  if (!h) return []
  return [
    { label: '今日到车', value: fmtCompact(h.arrivals), full: fmtInt(h.arrivals), unit: '台' },
    { label: '今日发车', value: fmtCompact(h.departures), full: fmtInt(h.departures), unit: '台' },
    { label: '待分拣积压', value: fmtCompact(h.backlog), full: fmtInt(h.backlog), unit: '件', warn: (h.backlog ?? 0) > BACKLOG_WARN },
    { label: '网点准时率', value: (h.onTime ?? 0).toFixed(1), full: `${(h.onTime ?? 0).toFixed(1)}`, unit: '%' },
  ]
})
const util = computed(() => Math.max(0, Math.min(100, hub.value?.utilization ?? 0)))
const LEVEL_DOT = ['lv0', 'lv1', 'lv2']

function jump(id: string) {
  focusHub(id)
  store.notify(`已切换：${hubById[id].name}网点`)
}
</script>

<template>
  <section v-if="hub && store.hasData" class="hub-detail" :class="store.detailSide" aria-label="网点详情">
    <header>
      <div class="titles">
        <h4 :title="`${hub.name} · ${hub.site}`">{{ hub.name }} · {{ hub.site }}</h4>
        <p :title="`${hub.lng.toFixed(5)}, ${hub.lat.toFixed(5)}（WGS84，OpenStreetMap 公开 POI）`">{{ LEVEL_TEXT[hub.level] ?? '网点' }} · {{ provinceName(hub.province) }} · {{ hub.lng.toFixed(3) }}°E {{ hub.lat.toFixed(3) }}°N</p>
      </div>
      <button class="close" aria-label="关闭网点详情（Esc）" @click="store.selectHub(null)">×</button>
    </header>

    <dl class="metrics">
      <div v-for="m in metrics" :key="m.label" class="metric">
        <dt>{{ m.label }}</dt>
        <dd :title="`${m.label}：${m.full} ${m.unit}`"><span class="v" :class="{ warn: m.warn }">{{ m.value }}</span><small>{{ m.unit }}</small></dd>
      </div>
    </dl>

    <div class="util">
      <div class="util-head">
        <span>仓配利用率<em v-if="util >= HIGH_UTILIZATION" class="hot-tag">高负载</em></span>
        <b :class="{ hot: util >= HIGH_UTILIZATION }">{{ util }}%</b>
      </div>
      <div class="bar"><div class="fill" :class="{ hot: util >= HIGH_UTILIZATION }" :style="{ width: `${util}%` }" /></div>
    </div>

    <section class="block">
      <h5>近 1 小时关联运单 · 5 分钟</h5>
      <div v-if="hub.recentOrders?.length" class="mini-chart" role="img" :aria-label="`近一小时关联运单：${hub.recentOrders.join('、')}`">
        <div v-for="(value, i) in hub.recentOrders" :key="i" class="bucket" :class="{ current: i === hub.recentOrders.length - 1 }"
          :title="`${hub.recentLabels?.[i] ?? ''}：${fmtInt(value)} 单`"><i :style="{ height: `${value / maxOrders * 100}%` }" /></div>
      </div>
      <div v-if="hub.recentLabels?.length" class="chart-labels"><span>{{ hub.recentLabels[0] }}</span><span>{{ hub.recentLabels[hub.recentLabels.length - 1] }} 累计中</span></div>
      <p class="note">统计进出该网点的关联运单，跨网点不可相加。</p>
    </section>

    <section v-if="relatedEvents.length" class="block">
      <h5>相关告警 · {{ relatedEvents.length }}</h5>
      <button v-for="event in relatedEvents" :key="event.id" class="event-link" :title="`${event.type} · ${event.place} · ${event.desc}`" @click="locateEvent(event)">
        <i class="sev" :class="LEVEL_DOT[event.level] ?? 'lv0'" />
        <span class="ev-main"><b>{{ event.type }}</b><span>{{ event.place }}</span></span>
        <time>{{ event.time }}</time>
      </button>
    </section>

    <section class="block">
      <h5>进出干线 · {{ routes.length }} 条{{ hasRouteOrders ? ' · 今日单量' : '' }}</h5>
      <div class="peers">
        <button v-for="r in shownRoutes" :key="r.peer.id" class="peer"
          :title="`${hub.name} ↔ ${r.peer.name}${r.orders != null ? ` · 今日 ${fmtInt(r.orders)} 单` : ''} · 点击查看${r.peer.name}网点`" @click="jump(r.peer.id)">
          <span class="peer-name">{{ hub.name }} ↔ {{ r.peer.name }}</span><b v-if="r.orders != null">{{ fmtCompact(r.orders) }}</b>
        </button>
        <button v-if="routes.length > PEER_LIMIT" class="more" :aria-expanded="showAllPeers" @click="showAllPeers = !showAllPeers">
          {{ showAllPeers ? '收起' : `展开其余 ${routes.length - PEER_LIMIT} 条` }}
        </button>
      </div>
    </section>
  </section>
</template>

<style scoped>
/* 从面包屑下方开始；靠左时给左下角图例留出空间，内容超高在抽屉内滚动 */
.hub-detail {
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
.hub-detail.left { right: auto; left: var(--space-4); max-height: calc(100% - 52px - 140px); }
.hub-detail.right { right: var(--space-4); left: auto; }
header { display: flex; align-items: flex-start; gap: var(--space-2); }
.titles { flex: 1; min-width: 0; }
h4 { font-size: 18px; font-weight: 700; color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.titles p { font-size: var(--font-small); color: var(--color-tertiary); }
.close { flex: none; background: none; border: none; color: var(--color-tertiary); font-size: 18px; line-height: 1; cursor: pointer; border-radius: var(--radius-control); }
.close:hover { background: var(--color-hover); color: var(--color-heading); }

.metrics { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-2); margin-top: var(--space-4); }
.metric { container-type: inline-size; min-width: 0; padding: 8px 10px; border-radius: var(--radius-tile); background: var(--color-elevated); }
.metric dt { font-size: var(--font-small); color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.metric dd { display: flex; align-items: baseline; gap: 3px; min-width: 0; }
.metric .v {
  min-width: 0;
  font-family: var(--font-number);
  font-size: 20px;
  font-size: clamp(15px, 17cqw, 20px);
  font-weight: 600;
  color: var(--color-heading);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.metric .v.warn { color: var(--color-warning); }
.metric small { flex: none; font-size: var(--font-small); color: var(--color-tertiary); }

.util { margin-top: var(--space-4); }
.util-head { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; color: var(--color-secondary); margin-bottom: 6px; }
.util-head b { font-family: var(--font-number); color: var(--color-heading); font-variant-numeric: tabular-nums; }
.util-head b.hot, .hot-tag { color: var(--color-dangerText); }
.hot-tag { font-style: normal; font-size: var(--font-small); margin-left: var(--space-2); }
.bar { height: 6px; background: var(--color-track); border-radius: 3px; overflow: hidden; }
.fill { height: 100%; background: var(--color-barLight); border-radius: 3px; transition: width 0.6s ease; }
.fill.hot { background: var(--color-danger); }

.block { margin-top: var(--space-4); padding-top: var(--space-3); border-top: 1px solid var(--color-track); }
h5 { font-size: 13px; font-weight: 500; color: var(--color-secondary); margin-bottom: var(--space-2); }
.mini-chart { display: flex; align-items: flex-end; height: 56px; gap: 4px; }
.bucket { height: 100%; flex: 1; display: flex; align-items: flex-end; }
.bucket i { display: block; width: 100%; min-height: 2px; background: var(--color-barStrong); border-radius: 2px 2px 0 0; }
.bucket.current i { background: var(--color-accentArea); outline: 1px dashed var(--color-accent); outline-offset: -1px; }
.chart-labels { display: flex; justify-content: space-between; margin-top: 4px; font-family: var(--font-number); font-size: 11px; color: var(--color-tertiary); }
.note { margin-top: var(--space-1); font-size: var(--font-small); color: var(--color-tertiary); line-height: 1.5; }

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
.ev-main span { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--color-secondary); }
.event-link time { flex: none; font-family: var(--font-number); font-size: 11px; color: var(--color-tertiary); }

.peers { display: flex; flex-wrap: wrap; gap: 6px; }
.peer {
  min-height: 28px;
  max-width: 100%;
  padding: 0 10px;
  border: 1px solid var(--color-border);
  border-radius: 14px;
  background: transparent;
  color: var(--color-secondary);
  font-size: var(--font-small);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
}
.peer:hover { background: var(--color-hover); color: var(--color-heading); }
.peer { display: inline-flex; align-items: center; gap: 6px; }
.peer-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.more { min-height: 28px; padding: 0 8px; border: 0; background: none; color: var(--color-barLight); font-size: var(--font-small); cursor: pointer; border-radius: var(--radius-control); }
.more:hover { background: var(--color-hover); }
.peer b { flex: none; font-family: var(--font-number); font-weight: 600; color: var(--color-heading); font-variant-numeric: tabular-nums; }
</style>
