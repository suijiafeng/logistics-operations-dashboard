<script lang="ts">
/** 桑基图取省际前 N 对；InsightPanel 的说明文字也用这个常量 */
export const OD_TOP = 12
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useEcharts, TEXT, TOOLTIP } from '../services/useEcharts'
import { COLORS, FONT } from '../design/tokens'
import { useDashboardStore } from '../stores/dashboard'
import { provinceShortName } from '../data/provinces'
import { fmtCompact, fmtInt } from '../services/format'

// 省际 OD 流向（面板正文，由 InsightPanel 的页签承载）：左列发出省、右列到达省，流量 = 今日由实体统计的运单数。
// 省内流向（珠三角互发）远大于省际，引擎只给合计，不进图；同一省同时出现在两侧时用不同节点避免成环。
const store = useDashboardStore()
const { el, chart } = useEcharts()
const flows = computed(() => (store.shipments?.od ?? []).slice(0, OD_TOP))

function render() {
  const c = chart.value
  if (!c) return
  const list = flows.value
  // 节点显示名放在 title 字段：data 项的 label 字段是 ECharts 的标签配置，不能当字符串用
  const nodes = new Map<string, { name: string; title: string; side: 'out' | 'in' }>()
  for (const f of list) {
    nodes.set(`${f.from}>`, { name: `${f.from}>`, title: provinceShortName(f.from), side: 'out' })
    nodes.set(`>${f.to}`, { name: `>${f.to}`, title: provinceShortName(f.to), side: 'in' })
  }
  c.setOption({
    tooltip: {
      ...TOOLTIP,
      trigger: 'item',
      formatter: (p: { dataType?: string; data?: { source?: string; target?: string; value?: number; title?: string }; value?: number }) =>
        p.dataType === 'edge' && p.data
          ? `${provinceShortName(p.data.source!.replace('>', ''))} → ${provinceShortName(p.data.target!.replace('>', ''))}：${fmtInt(p.data.value ?? 0)} 单`
          : `${p.data?.title ?? ''}：${fmtInt(Number(p.value) || 0)} 单`,
    },
    series: [{
      type: 'sankey',
      left: 4, right: 4, top: 6, bottom: 6,
      nodeWidth: 10,
      nodeGap: 6,
      nodeAlign: 'justify',
      draggable: false,
      layoutIterations: 32,
      label: { ...TEXT, fontSize: FONT.small, color: COLORS.text, formatter: (p: { data?: { title?: string } }) => p.data?.title ?? '' },
      itemStyle: { color: COLORS.barStrong, borderWidth: 0 },
      lineStyle: { color: 'gradient', opacity: 0.32, curveness: 0.5 },
      emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.6 } },
      data: [...nodes.values()].map((n) => ({ name: n.name, title: n.title, itemStyle: { color: n.side === 'out' ? COLORS.barStrong : COLORS.barLight },
        // 右列节点标签放在节点左侧，不被面板边缘裁掉
        ...(n.side === 'in' ? { label: { position: 'left' } } : {}) })),
      links: list.map((f) => ({ source: `${f.from}>`, target: `>${f.to}`, value: f.value })),
    }],
  }, { notMerge: false })
}

watch([chart, () => store.chartVersion], render)
</script>

<template>
  <div ref="el" class="chart" role="img" :aria-label="`省际运单流向桑基图：${flows.map((f) => `${provinceShortName(f.from)}到${provinceShortName(f.to)} ${fmtCompact(f.value)} 单`).join('，')}`" />
</template>

<style scoped>
.chart { flex: 1; min-height: 0; }
</style>
