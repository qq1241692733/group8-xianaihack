import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/App'
import { initTheme } from '@/app/theme'

import '@/styles/global.css'

// 必须在渲染之前：晚一步就会先画一帧夜版再跳到昼版，那一下白闪比没有昼版更糟。
initTheme()

const host = document.getElementById('root')
if (!host) throw new Error('#root 不存在')

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
