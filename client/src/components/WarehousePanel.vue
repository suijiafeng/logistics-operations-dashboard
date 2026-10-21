<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'
import { GUANGDONG_HUB_IDS } from '../data/network'
import { HIGH_UTILIZATION } from '../design/tokens'
import { useMediaQuery } from '../services/useMediaQuery'

const store = useDashboardStore()
const compact = useMediaQuery('(max-width: 1599px), (max-height: 980px)')
const limit = computed(() => compact.value ? 5 : 8)
// 使用行政归属，避免包围盒把外省网点误纳入。
const gdHubs = computed(() =>
  store.hubs
    .filter((h) => GUANGDONG_HUB_IDS.has(h.id))
    .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0)),
)
</script>

<template>
  <Panel title="广东仓配概览" :extra="`TOP${limit}/${gdHubs.length} · ≥${HIGH_UTILIZATION}% 高负载`">
    <ul class="list">
      <li v-for="h in gdHubs.slice(0, limit)" :key="h.id" class="interactive-row" :class="{ selected: h.id === store.selectedHubId }"
        role="button" tabindex="0" :aria-pressed="h.id === store.selectedHubId"
        :aria-label="`${h.name}，利用率 ${h.utilization ?? 0}%，${(h.utilization ?? 0) >= HIGH_UTILIZATION ? '高负载' : '正常'}，积压 ${h.backlog ?? 0} 件`"
        @click="store.selectHub(h.id)" @keydown.enter="store.selectHub(h.id)" @keydown.space.prevent="store.selectHub(h.id)">
        <span class="name">{{ h.name }}</span>
        <span class="bar">
          <span
            class="fill"
            :class="{ hot: (h.utilization ?? 0) >= HIGH_UTILIZATION }"
            :style="{ width: `${h.utilization ?? 0}%` }"
          />
        </span>
        <span class="val">{{ h.utilization ?? 0 }}%</span>
        <span class="load-status" :class="{ hot: (h.utilization ?? 0) >= HIGH_UTILIZATION }">{{ (h.utilization ?? 0) >= HIGH_UTILIZATION ? '高负载' : '正常' }}</span>
        <span class="backlog">积压 {{ (h.backlog ?? 0).toLocaleString('zh-CN') }}</span>
      </li>
    </ul>
  </Panel>
</template>

<style scoped>
.list {
  list-style: none;
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  min-height: 0;
}
li {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-1);
  cursor: pointer;
  border-radius: var(--radius-control);
}
li:hover {
  background: var(--color-hover);
}
li.selected { background: var(--color-selected); box-shadow: inset 2px 0 var(--color-accent); }
.name {
  width: 28px;
  font-size: var(--font-body);
  color: var(--color-text);
  flex: none;
}
.bar {
  flex: 1;
  height: 8px;
  background: var(--color-track);
  border-radius: var(--radius-control);
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: var(--color-muted);
  border-radius: var(--radius-control);
  transition: width 0.6s ease;
}
.fill.hot {
  background: var(--color-danger);
}
.val {
  width: 40px;
  text-align: right;
  font-size: var(--font-body);
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
.backlog {
  width: 64px;
  font-size: var(--font-small);
  color: var(--color-secondary);
  flex: none;
}
.load-status { width: 36px; flex: none; font-size: var(--font-small); color: var(--color-secondary); }
.load-status.hot { color: var(--color-dangerText); }
</style>
