<script setup lang="ts">
import { computed } from 'vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const hub = computed(() => store.selectedHub)

function fmt(n?: number) {
  return (n ?? 0).toLocaleString('zh-CN')
}
</script>

<template>
  <div v-if="hub" class="hub-detail">
    <header>
      <h4>{{ hub.name }}分拨中心</h4>
      <button class="close" @click="store.selectHub(null)">×</button>
    </header>
    <div class="rows">
      <div class="row"><span>今日到车</span><b>{{ fmt(hub.arrivals) }} 台</b></div>
      <div class="row"><span>今日发车</span><b>{{ fmt(hub.departures) }} 台</b></div>
      <div class="row"><span>待分拣积压</span><b :class="{ warn: (hub.backlog ?? 0) > 650 }">{{ fmt(hub.backlog) }} 件</b></div>
      <div class="row"><span>网点准时率</span><b>{{ (hub.onTime ?? 0).toFixed(1) }}%</b></div>
    </div>
    <div class="util">
      <div class="util-head"><span>仓配利用率</span><b>{{ hub.utilization ?? 0 }}%</b></div>
      <div class="bar"><div class="fill" :style="{ width: `${hub.utilization ?? 0}%` }" /></div>
    </div>
    <p class="note">数据由模拟引擎按该网点实时状态推送，点击其他网点可切换。</p>
  </div>
</template>

<style scoped>
.hub-detail {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 252px;
  background: rgba(13, 20, 27, 0.96);
  border-radius: 6px;
  padding: 14px 16px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.45);
  z-index: 5;
}
header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}
h4 {
  font-size: 16px;
  color: #eef4fa;
  letter-spacing: 1px;
}
.close {
  background: none;
  border: none;
  color: #7e93a8;
  font-size: 18px;
  cursor: pointer;
  line-height: 1;
}
.rows .row {
  display: flex;
  justify-content: space-between;
  padding: 5px 0;
  font-size: 13px;
  color: #7e93a8;
}
.rows .row b {
  color: #d7e2ec;
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
.rows .row b.warn {
  color: #ff8f8a;
}
.util {
  margin-top: 10px;
}
.util-head {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  color: #7e93a8;
  margin-bottom: 5px;
}
.util-head b {
  color: #ffd9ae;
}
.bar {
  height: 8px;
  background: #1a2634;
  border-radius: 4px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: #ff8a3d;
  border-radius: 4px;
  transition: width 0.6s ease;
}
.note {
  margin-top: 10px;
  font-size: 12px;
  color: #4c5d6e;
  line-height: 1.5;
}
</style>
