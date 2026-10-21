<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'
import { GUANGDONG_HUB_IDS } from '../data/network'

const store = useDashboardStore()
// 使用行政归属，避免包围盒把外省网点误纳入。
const gdHubs = computed(() =>
  store.hubs
    .filter((h) => GUANGDONG_HUB_IDS.has(h.id))
    .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0)),
)
</script>

<template>
  <Panel title="广东仓配概览" :extra="`利用率 TOP8 · 共 ${gdHubs.length} 个`">
    <ul class="list">
      <li v-for="h in gdHubs.slice(0, 8)" :key="h.id" :class="{ selected: h.id === store.selectedHubId }"
        role="button" tabindex="0" :aria-pressed="h.id === store.selectedHubId"
        @click="store.selectHub(h.id)" @keydown.enter="store.selectHub(h.id)" @keydown.space.prevent="store.selectHub(h.id)">
        <span class="name">{{ h.name }}</span>
        <span class="bar">
          <span
            class="fill"
            :class="{ hot: (h.utilization ?? 0) >= 88 }"
            :style="{ width: `${h.utilization ?? 0}%` }"
          />
        </span>
        <span class="val">{{ h.utilization ?? 0 }}%</span>
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
  gap: 9px;
  padding: 2px;
  cursor: pointer;
  border-radius: 4px;
}
li:hover {
  background: #111a23;
}
li.selected { background: #2a251e; box-shadow: inset 2px 0 #ff8a3d; }
.name {
  width: 34px;
  font-size: 13px;
  color: #c8d6e3;
  flex: none;
}
.bar {
  flex: 1;
  height: 8px;
  background: #16202a;
  border-radius: 4px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: #5b7a99;
  border-radius: 4px;
  transition: width 0.6s ease;
}
.fill.hot {
  background: #f0524d;
}
.val {
  width: 38px;
  text-align: right;
  font-size: 13px;
  color: #d7e2ec;
  font-variant-numeric: tabular-nums;
}
.backlog {
  width: 86px;
  font-size: 12px;
  color: #8fa3b8;
  flex: none;
}
</style>
