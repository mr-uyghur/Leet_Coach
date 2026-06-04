import { useEffect } from 'react'
import { PANEL_PORT_NAME } from '../shared/messages'

// Phase 2: minimal connect-and-log to verify the content↔background↔panel pipeline.
// Full UI is Phase 4.
export default function App() {
  useEffect(() => {
    const port = chrome.runtime.connect({ name: PANEL_PORT_NAME })

    port.onMessage.addListener((msg) => {
      if (msg.type === 'PROBLEM_UPDATED') {
        console.log('[LCCoach Panel] Problem received:', msg.payload)
      }
    })

    return () => port.disconnect()
  }, [])

  return (
    <div className="flex flex-col h-screen bg-[#1a1a1a] text-white">
      <div className="p-4 border-b border-white/10 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-[#FFA116]">LeetCode Coach</h1>
          <p className="text-xs text-gray-500 mt-0.5">Navigate to a problem to start</p>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <p className="text-gray-500 text-sm">Open a LeetCode problem to begin</p>
      </div>
    </div>
  )
}
