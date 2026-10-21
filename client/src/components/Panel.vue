<script setup lang="ts">
defineProps<{ title: string; extra?: string }>()
</script>

<template>
  <section class="panel">
    <header class="panel-head">
      <span class="tick" />
      <h3>{{ title }}</h3>
      <span v-if="extra" class="extra">{{ extra }}</span>
    </header>
    <div class="panel-body">
      <slot />
    </div>
  </section>
</template>

<style scoped>
.panel {
  background: #0d141b;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
}
.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px 4px;
}
.panel-head .tick {
  width: 4px;
  height: 14px;
  background: #ff8a3d;
  border-radius: 2px;
  flex: none;
}
.panel-head h3 {
  font-size: 15px;
  font-weight: 600;
  color: #d7e2ec;
  letter-spacing: 1px;
}
.panel-head .extra {
  margin-left: auto;
  font-size: 12px;
  color: #63788d;
}
.panel-body {
  flex: 1;
  min-height: 0;
  padding: 6px 10px 10px;
  display: flex;
  flex-direction: column;
}
</style>
