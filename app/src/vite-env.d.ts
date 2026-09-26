/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 线上 LLM 服务的基地址，如 https://api.example.com；开发期留空走本地代理 */
  readonly VITE_API_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
