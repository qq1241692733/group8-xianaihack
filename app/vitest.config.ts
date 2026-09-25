import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

// 与 vite.config.ts 解耦：测试只跑记忆层纯逻辑，不需要 React 插件与 LLM 中间件。
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
