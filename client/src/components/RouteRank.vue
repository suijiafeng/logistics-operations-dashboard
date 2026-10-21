<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const max = computed(() => store.routeVolumes[0]?.value ?? 1)
</script>

<template>
  <Panel title="干线运量排行" extra="今日单量 · TOP8">
    <div class="grid">
      <div v-for="(r, i) in store.routeVolumes" :key="r.name" class="item">
        <span class="rank">{{ i + 1 }}</span>
        <span class="name">{{ r.name }}</span>
        <span class="bar"><span class="fill" :style="{ width: `${(r.value / max) * 100}%` }" /></span>
        <span class="val">{{ r.value.toLocaleString('zh-CN') }}</span>
      </div>
    </div>
  </Panel>
</template>

<style scoped>
.grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: repeat(4, 1fr);
  grid-auto-flow: column;
  column-gap: 36px;
  align-items: center;
  padding: 0 6px;
}
.item {
  display: flex;
  align-items: center;
  gap: 9px;
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
  width: 108px;
  font-size: 13px;
  color: #c8d6e3;
  flex: none;
  white-space: nowrap;
}
.bar {
  flex: 1;
  height: 8px;
  background: #16202a;
  border-radius: 4px;
  overflow: hidden;
  max-width: 520px;
}
.fill {
  display: block;
  height: 100%;
  background: #ff8a3d;
  border-radius: 4px;
  transition: width 0.6s ease;
}
.val {
  width: 52px;
  text-align: right;
  font-size: 13px;
  color: #d7e2ec;
  font-variant-numeric: tabular-nums;
}
</style>
