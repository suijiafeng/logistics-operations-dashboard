<script setup lang="ts">
import { computed } from 'vue'
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'
import { fmtCompact, fmtInt } from '../services/format'

// 运单五段漏斗：每段显示今日到达该段的累计数、占揽收的比例与当前在制数；段间箭头标转化率
const store = useDashboardStore()
const s = computed(() => store.shipments)
const stages = computed(() => {
  const data = s.value
  if (!data) return []
  const base = Math.max(1, data.funnel[0] ?? 0)
  return data.stages.map((name, i) => {
    const total = data.funnel[i] ?? 0
    const prev = i > 0 ? Math.max(1, data.funnel[i - 1] ?? 0) : total
    return {
      name,
      total,
      pct: Math.round(total / base * 100),
      conv: i > 0 ? Math.round(total / prev * 1000) / 10 : 100,
      inStage: i < 4 ? data.inStage[i] ?? 0 : 0,
      last: i === 4,
    }
  })
})
const onTime = computed(() => s.value?.punctuality.find((p) => p.name.startsWith('准时'))?.value)
const extra = computed(() => s.value
  ? `今日累计 · 在制 ${fmtCompact(s.value.live)} 单 · 签收 ${fmtCompact(s.value.signedToday)}${onTime.value != null ? ` · 准时 ${onTime.value}%` : ''}`
  : '今日累计')
</script>

<template>
  <Panel title="运单链路" :extra="extra">
    <ol v-if="stages.length" class="funnel" aria-label="运单五段漏斗">
      <li v-for="(st, i) in stages" :key="st.name" class="stage" :class="{ last: st.last }">
        <span v-if="i > 0" class="conv" :title="`由${stages[i - 1]!.name}到${st.name}的转化率`">{{ st.conv }}%</span>
        <div class="tile" :title="`${st.name}：今日累计 ${fmtInt(st.total)} 单，占揽收 ${st.pct}%${st.last ? '' : `，当前在制 ${fmtInt(st.inStage)} 单`}`">
          <span class="name">{{ st.name }}</span>
          <b class="value">{{ fmtCompact(st.total) }}</b>
          <span class="bar"><i :style="{ width: `${st.pct}%` }" /></span>
          <small>{{ st.last ? `占揽收 ${st.pct}%` : `在制 ${fmtCompact(st.inStage)}` }}</small>
        </div>
      </li>
    </ol>
    <p v-else class="empty">{{ store.hasData ? '引擎未提供运单数据' : '正在加载…' }}</p>
  </Panel>
</template>

<style scoped>
.funnel { list-style: none; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 4px; }
.stage { position: relative; min-width: 0; }
.conv {
  position: absolute;
  left: -2px;
  top: 50%;
  transform: translate(-50%, -50%);
  z-index: 1;
  padding: 0 4px;
  border-radius: 7px;
  background: var(--color-panel);
  border: 1px solid var(--color-track);
  font-family: var(--font-number);
  font-size: 10px;
  line-height: 14px;
  color: var(--color-tertiary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
.tile {
  container-type: inline-size;
  display: grid;
  gap: 2px;
  padding: 8px 8px 6px;
  border-radius: var(--radius-tile);
  background: var(--color-elevated);
  min-width: 0;
}
.last .tile { background: var(--color-infoBg); }
.name { font-size: var(--font-small); color: var(--color-secondary); white-space: nowrap; }
.value {
  font-family: var(--font-number);
  font-size: 20px;
  font-size: clamp(14px, 24cqw, 20px);
  font-weight: 600;
  line-height: 1.2;
  color: var(--color-heading);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar { height: 3px; background: var(--color-track); border-radius: 2px; overflow: hidden; }
.bar i { display: block; height: 100%; background: var(--color-barStrong); }
.last .bar i { background: var(--color-barLight); }
small { font-size: 11px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.empty { color: var(--color-secondary); font-size: var(--font-small); }
@media (max-height: 820px) {
  .tile { padding: 4px 6px; }
  .value { font-size: 16px; font-size: clamp(13px, 20cqw, 16px); }
  small { display: none; }
}
</style>
