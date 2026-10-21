<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'
import { GD_BOUNDS } from '../data/network'

const store = useDashboardStore()
// 广东网点：坐标落在广东包围盒内的分拨中心
const gdHubs = computed(() =>
  store.hubs
    .filter(
      (h) =>
        h.lng >= GD_BOUNDS.lngMin && h.lng <= GD_BOUNDS.lngMax && h.lat >= GD_BOUNDS.latMin && h.lat <= GD_BOUNDS.latMax,
    )
    .sort((a, b) => (b.utilization ?? 0) - (a.utilization ?? 0)),
)
</script>

<template>
  <Panel title="广东仓配概览" extra="利用率">
    <ul class="list">
      <li v-for="h in gdHubs" :key="h.id" @click="store.selectHub(h.id)">
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
  color: #63788d;
  flex: none;
}
</style>
