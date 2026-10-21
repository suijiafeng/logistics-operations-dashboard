<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const max = computed(() => Math.max(1, store.routeVolumes[0]?.value ?? 0))
</script>

<template>
  <Panel title="全国干线运量排行" extra="今日累计 · TOP8">
    <TransitionGroup name="rank" tag="div" class="grid">
      <div v-for="(r, i) in store.routeVolumes" :key="r.id ?? r.name" class="item">
        <span class="rank">{{ i + 1 }}</span>
        <span class="name">{{ r.name }}</span>
        <span class="bar"><span class="fill" :style="{ width: `${(r.value / max) * 100}%` }" /></span>
        <span class="val">{{ r.value.toLocaleString('zh-CN') }}</span>
      </div>
    </TransitionGroup>
  </Panel>
</template>

<style scoped>
.grid {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: repeat(4, 1fr);
  grid-auto-flow: column;
  column-gap: var(--space-8);
  align-items: center;
  padding: 0 var(--space-2);
}
.item {
  display: flex;
  align-items: center;
  gap: var(--space-2);
}
.rank-move { transition: transform 0.5s ease; }
.rank {
  width: 18px;
  height: 18px;
  border-radius: var(--radius-control);
  background: var(--color-track);
  color: var(--color-accentText);
  font-size: var(--font-small);
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: none;
}
.name {
  width: 108px;
  font-size: var(--font-body);
  color: var(--color-text);
  flex: none;
  white-space: nowrap;
}
.bar {
  flex: 1;
  height: 8px;
  background: var(--color-track);
  border-radius: var(--radius-control);
  overflow: hidden;
  max-width: 520px;
}
.fill {
  display: block;
  height: 100%;
  background: var(--color-accent);
  border-radius: var(--radius-control);
  transition: width 0.6s ease;
}
.val {
  width: 52px;
  text-align: right;
  font-size: var(--font-body);
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}
@media (max-width: 767px) {
  .grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: repeat(8, minmax(28px, 1fr)); grid-auto-flow: row; column-gap: 0; padding: 0; }
}
</style>
