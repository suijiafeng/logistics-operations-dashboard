import { defineConfig } from 'vitest/config'

// 只跑纯函数单测，不启动 Vue 插件，也不代理模拟引擎。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
