import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from '@/app/App'

import '@/styles/global.css'

const host = document.getElementById('root')
if (!host) throw new Error('#root 不存在')

createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
