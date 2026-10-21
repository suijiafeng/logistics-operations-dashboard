<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'
import { useFocus } from '../services/useFocus'
import { fmtInt } from '../services/format'

// 司机安全：今日超速 / 急刹 / 疲劳计数与车队均分，评分最低的司机排行（100 分起扣：超速 -2、急刹 -1、疲劳 -5），点击追踪该车
const ROWS = 6
const store = useDashboardStore()
const { focusVehicle } = useFocus()
const s = computed(() => store.safety)
const tiles = computed(() => s.value ? [
  { label: '今日超速', value: s.value.today.speeding },
  { label: '今日急刹', value: s.value.today.braking },
  { label: '疲劳驾驶', value: s.value.today.fatigue, warn: s.value.today.fatigue > 0 },
  { label: '车队均分', value: s.value.avgScore, unit: '分' },
] : [])
const worst = computed(() => (s.value?.worst ?? []).slice(0, ROWS))
function tone(score: number) { return score < 80 ? 'danger' : score < 90 ? 'warn' : 'ok' }
</script>

<template>
  <div class="safety">
    <dl class="tiles">
      <div v-for="t in tiles" :key="t.label" class="tile"><dt>{{ t.label }}</dt><dd :class="{ warn: t.warn }">{{ fmtInt(t.value) }}<small v-if="t.unit">{{ t.unit }}</small></dd></div>
    </dl>
    <ol v-if="worst.length" class="list" aria-label="安全评分最低司机">
      <li v-for="(d, i) in worst" :key="d.plate">
        <button type="button" class="row" :class="{ selected: d.plate === store.selectedPlate }" :title="`${d.driver} · ${d.plate} · 评分 ${d.score} · 超速 ${d.speeding} 急刹 ${d.braking} 疲劳 ${d.fatigue} · 点击追踪`" @click="focusVehicle(d.plate)">
          <span class="rank">{{ i + 1 }}</span>
          <span class="driver">{{ d.driver }}</span>
          <span class="plate">{{ d.plate }}</span>
          <span class="bar"><i :class="tone(d.score)" :style="{ width: `${d.score}%` }" /></span>
          <b class="score" :class="tone(d.score)">{{ d.score }}</b>
          <span class="counts">超{{ d.speeding }} 刹{{ d.braking }}<template v-if="d.fatigue"> 疲{{ d.fatigue }}</template></span>
        </button>
      </li>
    </ol>
    <p v-else class="empty">{{ store.hasData ? '今日暂无扣分司机' : '正在加载…' }}</p>
  </div>
</template>

<style scoped>
.safety { display: flex; flex-direction: column; flex: 1; min-height: 0; gap: 6px; }
.tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
.tile { min-width: 0; padding: 4px 8px; border-radius: var(--radius-tile); background: var(--color-elevated); }
.tile dt { font-size: 11px; color: var(--color-tertiary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tile dd { font-family: var(--font-number); font-size: 16px; font-weight: 600; color: var(--color-heading); font-variant-numeric: tabular-nums; }
.tile dd.warn { color: var(--color-dangerText); }
.tile small { margin-left: 2px; font-size: 11px; font-weight: 400; color: var(--color-tertiary); }
.list { list-style: none; flex: 1; min-height: 0; overflow: hidden; display: grid; grid-auto-rows: minmax(0, 1fr); }
.row {
  display: grid;
  grid-template-columns: 16px minmax(4em, auto) minmax(0, 5.5em) minmax(24px, 1fr) 2em auto;
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
.rank { font-family: var(--font-number); font-size: 11px; color: var(--color-tertiary); }
.driver { color: var(--color-heading); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.plate { font-family: var(--font-number); color: var(--color-secondary); font-variant-numeric: tabular-nums; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bar { height: 4px; background: var(--color-track); border-radius: 2px; overflow: hidden; }
.bar i { display: block; height: 100%; border-radius: 2px; background: var(--color-barStrong); }
.bar i.warn { background: var(--color-warning); }
.bar i.danger { background: var(--color-danger); }
.score { font-family: var(--font-number); font-variant-numeric: tabular-nums; color: var(--color-heading); text-align: right; }
.score.warn { color: var(--color-warning); }
.score.danger { color: var(--color-dangerText); }
.counts { font-size: 11px; color: var(--color-tertiary); white-space: nowrap; }
.empty { color: var(--color-secondary); font-size: var(--font-small); }
</style>
