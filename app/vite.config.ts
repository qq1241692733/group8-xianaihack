import { fileURLToPath } from 'node:url'

import basicSsl from '@vitejs/plugin-basic-ssl'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

import { llmProxy } from './server/llmProxy.ts'

export default defineConfig(({ mode }) => {
  // 只读 LLM_ 前缀的变量。非 VITE_ 前缀不会被注入客户端，
  // 所以 Key 只活在中间件里，进不了浏览器。
  const env = loadEnv(mode, process.cwd(), 'LLM_')

  // getUserMedia（麦克风/相机）要求安全上下文。localhost 天然满足，
  // 但手机走 http://<局域网IP> 会被浏览器直接拒绝——所以 `vite --host` 时挂自签证书。
  // 本地 localhost 仍走 http，免掉自签证书告警。
  const useHttps = process.argv.includes('--host')

  return {
    plugins: [react(), llmProxy(env), ...(useHttps ? [basicSsl()] : [])],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
