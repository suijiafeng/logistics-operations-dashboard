<script setup lang="ts">
import { computed } from 'vue'
import { fmtInt } from '../services/format'

const props = defineProps<{ rank: number; name: string; value: number; max: number }>()
const pct = computed(() => `${Math.max(0, Math.min(100, (props.value / Math.max(1, props.max)) * 100))}%`)
</script>

<template>
  <!-- 列宽：名次固定 / 名称有上下限超长省略 / 进度条吃剩余 / 数值按内容自适应，数据变长不撑破 -->
  <div class="rank-row">
    <span class="rank">{{ rank }}</span>
    <span class="name" :title="name">{{ name }}</span>
    <span class="bar"><span class="fill" :style="{ width: pct }" /></span>
    <span class="val">{{ fmtInt(value) }}</span>
  </div>
</template>

<style scoped>
.rank-row {
  display: grid;
  grid-template-columns: 20px minmax(2.5em, var(--rank-name-width, 6em)) minmax(24px, 1fr) auto;
  align-items: center;
  column-gap: 10px;
  min-width: 0;
  min-height: var(--rank-row-height, 28px);
  padding: 0 var(--space-1);
  border-radius: var(--radius-control);
}
.rank {
  color: var(--color-tertiary);
  font-family: var(--font-number);
  font-size: var(--font-small);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.name {
  min-width: 0;
  font-size: var(--font-body);
  color: var(--color-text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bar {
  height: 6px;
  background: var(--color-track);
  border-radius: 3px;
  overflow: hidden;
}
.fill {
  display: block;
  height: 100%;
  background: var(--color-barStrong);
  border-radius: 3px;
  transition: width 150ms ease-out;
}
.val {
  min-width: 4ch;
  text-align: right;
  font-family: var(--font-number);
  font-size: var(--font-body);
  font-weight: 500;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}
</style>
