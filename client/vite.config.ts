import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 开发代理：前端相对路径 /api 快照与 /ws 推送都转发到模拟引擎（默认 8787，可用 ENGINE_URL 覆盖），避免跨域与硬编码地址
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const engine = env.ENGINE_URL || 'http://localhost:8787'

const proxy = {
  '/api': {
    target: engine,
    changeOrigin: true,
    rewrite: (p: string) => p.replace(/^\/api/, ''),
  },
  '/ws': {
    target: engine.replace(/^http/, 'ws'),
    ws: true,
    rewrite: () => '/',
  },
}

export default defineConfig({
  plugins: [vue()],
  // 地图 GeoJSON 以 JSON.parse("…") 形式打包，比同等大小的 JS 对象字面量解析更快
  json: { stringify: true },
  server: { proxy },
  // vite preview 同样代理到引擎，验收脚本可直接对生产构建截图与测帧率
  preview: { proxy },
  build: {
    target: 'chrome87',
    chunkSizeWarningLimit: 2500,
  },
})
