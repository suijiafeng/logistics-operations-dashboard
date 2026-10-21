<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const now = ref(new Date())
let timer: number | undefined
onMounted(() => {
  timer = window.setInterval(() => (now.value = new Date()), 1000)
})
onBeforeUnmount(() => window.clearInterval(timer))

function fmt(n: number) {
  return n.toLocaleString('zh-CN')
}
</script>

<template>
  <header class="topbar">
    <div class="brand">
      <div class="logo">运</div>
      <div class="titles">
        <h1>智慧物流数据可视化监控平台</h1>
        <p>全国干线网实时运行总览</p>
      </div>
    </div>

    <div class="kpis">
      <div class="kpi">
        <span class="kpi-label">在途车辆</span>
        <span class="kpi-value">{{ fmt(store.kpi.enRoute) }}<small>台</small></span>
      </div>
      <div class="kpi">
        <span class="kpi-label">今日运单</span>
        <span class="kpi-value">{{ fmt(store.kpi.ordersToday) }}<small>单</small></span>
      </div>
      <div class="kpi">
        <span class="kpi-label">准时率</span>
        <span class="kpi-value">{{ store.kpi.onTimeRate.toFixed(1) }}<small>%</small></span>
      </div>
      <div class="kpi alert">
        <span class="kpi-label">待处理异常</span>
        <span class="kpi-value">{{ fmt(store.kpi.pendingAnomalies) }}<small>起</small></span>
      </div>
    </div>

    <div class="meta">
      <div class="clock">
        {{ now.toLocaleTimeString('zh-CN', { hour12: false }) }}
        <span class="date">{{ now.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }) }}</span>
      </div>
      <div class="status">
        <span class="dot" :class="{ off: !store.connected }" />
        {{ store.connected ? '实时数据已连接' : '数据连接中断' }}
        <span class="sim">数据来源：自研模拟引擎（仿真数据）</span>
      </div>
      <button class="hud-btn" :class="{ on: store.hudOn }" @click="store.hudOn = !store.hudOn">性能 HUD</button>
    </div>
  </header>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  gap: 28px;
  padding: 0 20px;
  background: #0a0f14;
}
.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: none;
}
.logo {
  width: 40px;
  height: 40px;
  border-radius: 8px;
  background: #ff8a3d;
  color: #131313;
  font-size: 22px;
  font-weight: 800;
  display: flex;
  align-items: center;
  justify-content: center;
}
.titles h1 {
  font-size: 21px;
  font-weight: 700;
  letter-spacing: 2px;
  color: #eef4fa;
  white-space: nowrap;
}
.titles p {
  font-size: 12px;
  color: #63788d;
  letter-spacing: 3px;
  margin-top: 1px;
}
.kpis {
  display: flex;
  gap: 34px;
  margin: 0 auto;
}
.kpi {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}
.kpi-label {
  font-size: 12px;
  color: #7e93a8;
  letter-spacing: 2px;
}
.kpi-value {
  font-size: 27px;
  font-weight: 700;
  color: #ffd9ae;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.kpi-value small {
  font-size: 13px;
  color: #7e93a8;
  margin-left: 4px;
  font-weight: 400;
}
.kpi.alert .kpi-value {
  color: #ff8f8a;
}
.meta {
  flex: none;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}
.clock {
  font-size: 19px;
  font-weight: 600;
  color: #d7e2ec;
  font-variant-numeric: tabular-nums;
}
.clock .date {
  font-size: 12px;
  color: #63788d;
  margin-left: 8px;
  font-weight: 400;
}
.status {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  color: #7e93a8;
}
.status .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #34c77b;
  animation: pulse 1.6s infinite;
}
.status .dot.off {
  background: #f0524d;
  animation: none;
}
.status .sim {
  color: #4c5d6e;
  margin-left: 6px;
}
@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.35; }
  100% { opacity: 1; }
}
.hud-btn {
  margin-top: 2px;
  background: #16202a;
  color: #7e93a8;
  border: none;
  border-radius: 4px;
  padding: 3px 10px;
  font-size: 12px;
  cursor: pointer;
}
.hud-btn.on {
  background: #ff8a3d;
  color: #131313;
  font-weight: 600;
}
</style>
