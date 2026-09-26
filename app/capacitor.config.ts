import type { CapacitorConfig } from '@capacitor/cli'

/**
 * Capacitor 配置：把 app/ 的 Web 产物（dist/）装进原生安卓壳。
 *
 * 几个不能改错的点：
 * - webDir 必须是 'dist'，与 vite 的 outDir 一致，否则 cap sync 会拷空目录。
 * - androidScheme 用 'https'：WebView 里的 origin 变成 https://localhost，
 *   是安全上下文，getUserMedia（录音/相机）才不会被直接拒绝。
 * - appId 同时是 Java 包名，只能是 [a-z0-9.]，改它等于换一个 App。
 */
const config: CapacitorConfig = {
  appId: 'cn.wanyueyuan.cike',
  appName: '此刻',
  webDir: 'dist',
  android: {
    // 音频录制需要 WebView 允许自动播放/采集，Capacitor 默认已处理；
    // 这里不开 allowMixedContent —— 全部走本地 https，没有混合内容需求。
    allowMixedContent: false,
  },
}

export default config
