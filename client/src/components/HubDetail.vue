<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { HIGH_UTILIZATION } from '../design/tokens'
import { ROUTES, hubById } from '../data/network'

const store = useDashboardStore()
const hub = computed(() => store.selectedHub)
const relatedEvents = computed(() => store.events.filter((event) => hub.value &&
  (event.fromId === hub.value.id || event.toId === hub.value.id || event.place.includes(hub.value.name))).slice(0, 3))
const routes = computed(() => !hub.value ? [] : ROUTES.filter(([a, b]) => a === hub.value?.id || b === hub.value?.id)
  .map(([a, b]) => hubById[a === hub.value?.id ? b : a]))
const maxOrders = computed(() => Math.max(1, ...(hub.value?.recentOrders ?? [])))

function jump(id: string) {
  store.selectHub(id)
  store.notify(`已切换：${hubById[id].name}网点`)
}

function fmt(n?: number) {
  return (n ?? 0).toLocaleString('zh-CN')
}
</script>

<template>
  <section v-if="hub && store.hasData" class="hub-detail" :class="store.detailSide" aria-label="网点详情">
    <header>
      <h4>{{ hub.name }}分拨中心</h4>
      <button class="close" aria-label="关闭网点详情（Esc）" @click="store.selectHub(null)">×</button>
    </header>
    <div class="rows">
      <div class="row"><span>今日到车</span><b>{{ fmt(hub.arrivals) }} 台</b></div>
      <div class="row"><span>今日发车</span><b>{{ fmt(hub.departures) }} 台</b></div>
      <div class="row"><span>待分拣积压</span><b :class="{ warn: (hub.backlog ?? 0) > 650 }">{{ fmt(hub.backlog) }} 件</b></div>
      <div class="row"><span>网点准时率</span><b>{{ (hub.onTime ?? 0).toFixed(1) }}%</b></div>
    </div>
    <div class="util">
      <div class="util-head"><span>仓配利用率</span><b>{{ hub.utilization ?? 0 }}%</b></div>
      <p class="load-state" :class="{ hot: (hub.utilization ?? 0) >= HIGH_UTILIZATION }">{{ (hub.utilization ?? 0) >= HIGH_UTILIZATION ? '高负载' : '正常' }} · 预警阈值 ≥{{ HIGH_UTILIZATION }}%</p>
      <div class="bar"><div class="fill" :style="{ width: `${hub.utilization ?? 0}%` }" /></div>
    </div>
    <details open>
      <summary>近 1 小时关联运单 · 5 分钟桶</summary>
      <div v-if="hub.recentOrders?.length" class="mini-chart" role="img" :aria-label="`近一小时关联运单：${hub.recentOrders.join('、')}`">
        <div v-for="(value, i) in hub.recentOrders" :key="i" class="bucket" :title="`${hub.recentLabels?.[i]}：${value} 单`"><i :style="{ height: `${value / maxOrders * 100}%` }" /></div>
      </div>
      <div class="chart-labels"><span>{{ hub.recentLabels?.[0] }}</span><span>{{ hub.recentLabels?.[6] }}</span><span>{{ hub.recentLabels?.[11] }} 累计中</span></div>
      <p class="note">统计进出该网点的关联运单；跨网点不可相加作为全网总量。</p>
    </details>
    <details open>
      <summary>相关异常 · 最近接收记录</summary>
      <p v-if="!relatedEvents.length" class="note">最近接收记录暂无本网点事件。</p>
      <button v-for="event in relatedEvents" :key="event.id" class="detail-link" @click="store.locateEvent(event)">{{ event.time }} {{ event.type }} · {{ event.place }}</button>
    </details>
    <details>
      <summary>进出干线 · {{ routes.length }} 条双向连接</summary>
      <button v-for="peer in routes" :key="peer.id" class="detail-link" @click="jump(peer.id)">{{ hub.name }} ↔ {{ peer.name }} · 查看网点</button>
    </details>
  </section>
</template>

<style scoped>
.hub-detail {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 288px;
  max-width: calc(100% - 32px);
  max-height: calc(100% - 72px);
  overflow: auto;
  background: var(--color-overlay);
  border-radius: var(--radius-panel);
  padding: var(--space-4) var(--space-4);
  box-shadow: var(--shadow-panel);
  z-index: 5;
}
.hub-detail.left { right: auto; left: 16px; }
.hub-detail.right { right: 16px; left: auto; }
header { position: sticky; top: -16px; padding-block: 4px; background: var(--color-overlay); z-index: 1; }
details { border-top: 1px solid var(--color-border); margin-top: var(--space-3); padding-top: var(--space-2); }
summary { min-height: 32px; cursor: pointer; font-size: var(--font-small); color: var(--color-heading); }
.detail-link { display: block; width: 100%; text-align: left; border: 0; border-radius: 4px; background: transparent; color: var(--color-text); font-size: var(--font-small); padding: var(--space-1); cursor: pointer; }
.detail-link:hover { background: var(--color-hover); }
.mini-chart { display: flex; align-items: flex-end; height: 64px; gap: 4px; }
.bucket { height: 100%; flex: 1; display: flex; align-items: flex-end; }
.bucket i { display: block; width: 100%; background: var(--color-accent); border-radius: 2px 2px 0 0; }
.chart-labels { display: flex; justify-content: space-between; font-size: var(--font-small); color: var(--color-secondary); }
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-2);
}
h4 {
  font-size: var(--font-title);
  color: var(--color-heading);
  letter-spacing: 1px;
}
.close {
  background: none;
  border: none;
  color: var(--color-secondary);
  font-size: var(--font-title);
  cursor: pointer;
  line-height: 1;
}
.close:hover { background: var(--color-hover); color: var(--color-heading); }
.load-state { font-size: var(--font-small); color: var(--color-secondary); margin-bottom: var(--space-1); }
.load-state.hot { color: var(--color-dangerText); }
.rows .row {
  display: flex;
  justify-content: space-between;
  padding: var(--space-1) 0;
  font-size: var(--font-body);
  color: var(--color-secondary);
}
.rows .row b {
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.rows .row b.warn {
  color: var(--color-dangerText);
}
.util {
  margin-top: var(--space-2);
}
.util-head {
  display: flex;
  justify-content: space-between;
  font-size: var(--font-body);
  color: var(--color-secondary);
  margin-bottom: var(--space-1);
}
.util-head b {
  color: var(--color-accentValue);
}
.bar {
  height: 8px;
  background: var(--color-track);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.fill {
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-control);
  transition: width 0.6s ease;
}
.note {
  margin-top: var(--space-2);
  font-size: var(--font-small);
  color: var(--color-secondary);
  line-height: 1.5;
}
</style>
