<script setup lang="ts">
import Panel from './Panel.vue'
import { useDashboardStore } from '../stores/dashboard'

const store = useDashboardStore()
const LEVEL_CLASS = ['lv0', 'lv1', 'lv2']
const LEVEL_TEXT = ['提醒', '警告', '严重']
</script>

<template>
  <Panel title="实时异常事件" extra="模拟引擎推送">
    <div class="stream">
      <p v-if="store.events.length === 0" class="empty">暂无异常事件，等待模拟引擎推送…</p>
      <TransitionGroup name="evt" tag="ul" class="list">
        <li v-for="e in store.events" :key="e.id" class="item">
          <span class="badge" :class="LEVEL_CLASS[e.level]">{{ LEVEL_TEXT[e.level] }}</span>
          <div class="main">
            <div class="line1">
              <b>{{ e.type }}</b>
              <span class="vehicle">{{ e.vehicle }}</span>
              <span class="place">{{ e.place }}</span>
              <time>{{ e.time }}</time>
            </div>
            <p class="desc">{{ e.desc }}</p>
          </div>
        </li>
      </TransitionGroup>
    </div>
  </Panel>
</template>

<style scoped>
.stream {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  position: relative;
}
.empty {
  color: #4c5d6e;
  font-size: 13px;
  padding: 8px 4px;
}
.list {
  list-style: none;
}
.item {
  display: flex;
  gap: 9px;
  padding: 7px 4px;
  border-bottom: 1px dashed #16222d;
}
.badge {
  flex: none;
  height: 20px;
  padding: 0 7px;
  border-radius: 3px;
  font-size: 11px;
  line-height: 20px;
  font-weight: 600;
  white-space: nowrap;
}
.lv0 { background: #233242; color: #9db4c9; }
.lv1 { background: #4a3a17; color: #eec27a; }
.lv2 { background: #57201d; color: #ff9d97; }
.main {
  flex: 1;
  min-width: 0;
}
.line1 {
  display: flex;
  gap: 8px;
  align-items: baseline;
  font-size: 13px;
}
.line1 b {
  color: #eef4fa;
  font-weight: 600;
  white-space: nowrap;
  flex: none;
}
.vehicle {
  color: #ffb066;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  flex: none;
}
.place {
  color: #7e93a8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
time {
  margin-left: auto;
  color: #4c5d6e;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  flex: none;
}
.desc {
  font-size: 12px;
  color: #63788d;
  margin-top: 1px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.evt-enter-active {
  transition: all 0.35s ease;
}
.evt-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
