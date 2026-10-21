<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const max = computed(() => {
  const t = store.topHubs[0]
  return t ? (t.arrivals ?? 0) + (t.departures ?? 0) : 1
})
</script>

<template>
  <Panel title="网点吞吐 TOP5" extra="到车 + 发车">
    <ul class="list">
      <li v-for="(h, i) in store.topHubs" :key="h.id" @click="store.selectHub(h.id)">
        <span class="rank">{{ i + 1 }}</span>
        <span class="name">{{ h.name }}</span>
        <span class="bar">
          <span
            class="fill"
            :style="{ width: `${(((h.arrivals ?? 0) + (h.departures ?? 0)) / max) * 100}%` }"
          />
        </span>
        <span class="val">{{ ((h.arrivals ?? 0) + (h.departures ?? 0)).toLocaleString('zh-CN') }}</span>
      </li>
    </ul>
  </Panel>
</template>

<style scoped>
.list {
  list-style: none;
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  flex: 1;
}
li {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 2px;
  cursor: pointer;
  border-radius: 4px;
}
li:hover {
  background: #111a23;
}
.rank {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  background: #1a2634;
  color: #ffb066;
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.name {
  width: 40px;
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
  background: #ff8a3d;
  border-radius: 4px;
  transition: width 0.6s ease;
}
.val {
  width: 58px;
  text-align: right;
  font-size: 13px;
  color: #d7e2ec;
  font-variant-numeric: tabular-nums;
}
</style>
