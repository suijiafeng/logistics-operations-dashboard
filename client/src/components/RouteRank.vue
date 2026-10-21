<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import RankRow from './RankRow.vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
// 版面固定两列 × 4 行；数据多于 8 条时只取前 8，少于 8 条时空位留白
const rows = computed(() => store.routeVolumes.slice(0, 8))
const max = computed(() => Math.max(1, ...rows.value.map((r) => r.value)))
</script>

<template>
  <Panel title="干线运量排行 TOP8" extra="全国 · 今日累计单量">
    <TransitionGroup name="rank" tag="div" class="grid">
      <RankRow v-for="(r, i) in rows" :key="r.id ?? r.name" :rank="i + 1" :name="r.name" :value="r.value" :max="max" />
    </TransitionGroup>
  </Panel>
</template>

<style scoped>
.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  grid-template-rows: repeat(4, minmax(0, 1fr));
  grid-auto-flow: column;
  column-gap: var(--space-8);
  align-items: center;
  --rank-name-width: 9em;
}
.rank-move { transition: transform 0.5s ease; }
@media (max-width: 767px) {
  .grid { grid-template-columns: minmax(0, 1fr); grid-template-rows: repeat(8, minmax(28px, 1fr)); grid-auto-flow: row; column-gap: 0; }
}
</style>
