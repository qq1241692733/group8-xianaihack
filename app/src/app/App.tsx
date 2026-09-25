import { useEffect } from 'react'

import { CaptureOverlay } from '@/features/capture/CaptureOverlay'
import { NothingOverlay } from '@/features/nothing/NothingOverlay'
import { MomentScreen } from '@/screens/MomentScreen'
import { TimeScreen } from '@/screens/TimeScreen'
import { UnderstandScreen } from '@/screens/UnderstandScreen'

import { DeviceFrame } from './DeviceFrame'
import { Intro } from './Intro'
import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'
import { Toast } from './Toast'
import { useStore } from './store'

export function App() {
  const hydrate = useStore((s) => s.hydrate)

  useEffect(() => {
    void hydrate()
  }, [hydrate])

  return (
    <>
      <div className="grain" />
      <DeviceFrame>
        <StatusBar />
        <div className="app">
          <MomentScreen />
          <TimeScreen />
          <UnderstandScreen />
          <NothingOverlay />
          <CaptureOverlay />
          <Toast />
        </div>
        <TabBar />
        <div className="homebar" />
      </DeviceFrame>
      <Intro />
    </>
  )
}
