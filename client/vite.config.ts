import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发代理：前端相对路径 /api 快照与 /ws 推送都转发到模拟引擎（8787），避免跨域与硬编码地址
export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:8787',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/ws': {
        target: 'ws://localhost:8787',
        ws: true,
        rewrite: () => '/',
      },
    },
  },
  build: {
    chunkSizeWarningLimit: 2500,
  },
})
