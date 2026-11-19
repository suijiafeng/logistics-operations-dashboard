<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { fmtInt } from '../services/format'

// 冷链监控：冷链车辆数、超温中、今日超温告警、平均偏差；超温车辆列表按持续时间排序，点击追踪并在抽屉看温度曲线
const ROWS = 6
const store = useDashboardStore()
const { focusVehicle } = useFocus()
const c = computed(() => store.cold)
const tiles = computed(() => c.value ? [
  { label: '冷链车辆', value: fmtInt(c.value.count), unit: '台' },
  { label: '超温中', value: fmtInt(c.value.overCount), unit: '台', warn: c.value.overCount > 0 },
  { label: '今日超温告警', value: fmtInt(c.value.alertsToday), unit: '起' },
  { label: '平均偏差', value: c.value.avgDeviation.toFixed(2), unit: '℃' },
] : [])
const over = computed(() => (c.value?.over ?? []).slice(0, ROWS))
function duration(since: number) {
  const sec = Math.max(0, Math.round((store.checkedAt - since) / 1000))
  return sec >= 60 ? `${Math.floor(sec / 60)} 分 ${sec % 60} 秒` : `${sec} 秒`
}
</script>

<template>
  <div class="cold">
    <dl class="tiles">
      <div v-for="t in tiles" :key="t.label" class="tile"><dt>{{ t.label }}</dt><dd :class="{ warn: t.warn }">{{ t.value }}<small>{{ t.unit }}</small></dd></div>
    </dl>
    <ol v-if="over.length" class="list" aria-label="超温车辆">
      <li v-for="o in over" :key="o.plate">
        <button type="button" class="row" :class="{ selected: o.plate === store.selectedPlate }" :title="`${o.plate} · ${o.driver} · 当前 ${o.temp}℃，范围 ${o.lo}…${o.hi}℃ · 已持续 ${duration(o.since)} · 点击追踪并查看温度曲线`" @click="focusVehicle(o.plate)">
          <i class="dot" :class="{ alert: o.alert }" />
          <span class="plate">{{ o.plate }}</span>
          <span class="driver">{{ o.driver }}</span>
          <b class="temp">{{ o.temp.toFixed(1) }}℃</b>
          <span class="range">{{ o.lo }}…{{ o.hi }}℃</span>
          <span class="since">{{ duration(o.since) }}{{ o.alert ? ' · 已告警' : '' }}</span>
        </button>
      </li>
    </ol>
    <p v-else class="empty">{{ store.hasData ? '当前没有超温车辆' : '正在加载…' }}</p>
  </div>
</template>

<style scoped>
.cold { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 6px; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.tile { min-width: 0; padding: 2px 8px; border-right: 1px solid var(--color-border); }
.tile:last-child { border-right: 0; }
.tile dt { font-size: 12px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile dd { font-family: var(--font-number); font-size: 16px; font-weight: 600; color: var(--color-heading); font-variant-numeric: tabular-nums; white-space: nowrap; }
.tile dd.warn { color: var(--color-dangerText); }
.tile small { margin-left: 2px; font-size: 12px; font-weight: 400; color: var(--color-tertiary); }
.list { list-style: none; flex: 1; min-height: 0; overflow: hidden; display: grid; grid-auto-rows: minmax(0, 1fr); }
.row {
  display: grid;
  grid-template-columns: 8px minmax(0, 5.5em) minmax(3em, auto) auto auto minmax(0, 1fr);
  align-items: center;
  column-gap: 6px;
  width: 100%;
  min-height: 22px;
  padding: 0 4px;
  border: 0;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--color-text);
  font-size: var(--font-small);
  text-align: left;
  cursor: pointer;
}
.row:hover { background: var(--color-hover); }
.row.selected { background: var(--color-selected); }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-warning); }
.dot.alert { background: var(--color-danger); }
.plate { font-family: var(--font-number); color: var(--color-heading); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.driver { color: var(--color-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.temp { font-family: var(--font-number); color: var(--color-dangerText); font-variant-numeric: tabular-nums; white-space: nowrap; }
.range { font-family: var(--font-number); font-size: 12px; color: var(--color-tertiary); white-space: nowrap; font-variant-numeric: tabular-nums; }
.since { font-size: 12px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-align: right; font-variant-numeric: tabular-nums; }
.empty { color: var(--color-secondary); font-size: var(--font-small); }
</style>
