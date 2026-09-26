import { useEffect, useState } from 'react'

import { CaptureOverlay } from '@/features/capture/CaptureOverlay'
import { ComposerOverlay } from '@/features/capture/ComposerOverlay'
import { NothingOverlay } from '@/features/nothing/NothingOverlay'
import { DiscoverScreen } from '@/screens/DiscoverScreen'
import { MomentScreen } from '@/screens/MomentScreen'
import { TimeScreen } from '@/screens/TimeScreen'
import { UnderstandScreen } from '@/screens/UnderstandScreen'
import { stageParam, hasCap } from '@/lib/stage'

import { DeviceFrame } from './DeviceFrame'
import { HistoryOverlay } from './HistoryOverlay'
import { Intro } from './Intro'
import { NewCollectionOverlay } from './NewCollectionOverlay'
import { SettingsOverlay } from './SettingsOverlay'
import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'
import { ThemeSwitch } from './ThemeSwitch'
import { Toast } from './Toast'
import { WatchOverlay } from './WatchOverlay'
import { useStore } from './store'

export function App() {
  const hydrate = useStore((s) => s.hydrate)
  const goPane = useStore((s) => s.goPane)
  const [stage] = useState(() => stageParam())

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  // 路演捷径：直接落到某一屏，跳过开场。
  useEffect(() => {
    if (stage === 'time') goPane('time')
    if (stage === 'discover') goPane('discover')
    if (stage === 'understand') goPane('ai')
  }, [stage, goPane])

  // 截图模式：关掉全部过渡。虚拟时间不推进 CSS transition，不关就会截到中间态。
  useEffect(() => {
    if (!hasCap()) return
    const el = document.createElement('style')
    el.textContent = '*,*::before,*::after{transition:none !important;animation:none !important}'
    document.head.appendChild(el)
    return () => el.remove()
  }, [])

  return (
    <>
      <div className="grain" />
      <DeviceFrame>
        <StatusBar />
        <div className="app">
          <MomentScreen />
          <TimeScreen />
          <DiscoverScreen />
          <UnderstandScreen />
          <NothingOverlay />
          <CaptureOverlay />
          <ComposerOverlay />
          <SettingsOverlay />
          <WatchOverlay />
          <NewCollectionOverlay />
          <HistoryOverlay />
          <Toast />
        </div>
        <TabBar />
        <div className="homebar" />
      </DeviceFrame>
      <Intro skip={!!stage} />
      {/* 主题开关在手机模型之外：它是外壳，不是产品界面 */}
      <ThemeSwitch />
    </>
  )
}
