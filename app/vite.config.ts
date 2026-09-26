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

  // 打包 APK 时把默认模型配置预置进产物（用户拍板 2026-09-27：开箱即用真 AI）。
  // 仅 production build 注入；dev 有 /api/llm 代理，不需要也不注入。
  // 已知情并接受的代价：Key 会进产物，APK 被反编译可提取——比赛场景风险可控，
  // 泄露后在厂商后台重置即可。用户在设置里改配置时，这里的值立即被覆盖。
  const presetLlm =
    mode === 'production'
      ? {
          baseUrl: env.LLM_BASE_URL ?? '',
          apiKey: env.LLM_API_KEY ?? '',
          model: env.LLM_MODEL ?? '',
        }
      : { baseUrl: '', apiKey: '', model: '' }

  return {
    plugins: [react(), llmProxy(env), ...(useHttps ? [basicSsl()] : [])],
    define: {
      __CIKE_LLM_PRESET__: JSON.stringify(presetLlm),
    },
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
  }
})
