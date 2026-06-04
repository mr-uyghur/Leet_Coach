// "Show Solution" gate — only visible in socratic mode when Pseudocode tier is reached
// and the solution hasn't been unlocked yet.
//
// Flow: Button click → inline confirmation dialog → Confirm → unlockSolution() + callback.
// This is the ONLY path that bypasses the Anti-Spoiler Rule (by explicit user intent).

import { useState } from 'react'
import { useChatStore } from '../stores/chatStore'
import { SOLUTION_GATE_LABEL } from '../../shared/constants'

interface SolutionGateProps {
  onUnlock: () => void
}

export default function SolutionGate({ onUnlock }: SolutionGateProps) {
  const hintTier = useChatStore((s) => s.hintTier)
  const mode = useChatStore((s) => s.mode)
  const solutionUnlocked = useChatStore((s) => s.solutionUnlocked)
  const unlockSolution = useChatStore((s) => s.unlockSolution)

  const [confirming, setConfirming] = useState(false)

  // Only render in socratic mode, after Pseudocode tier, before unlock
  if (mode !== 'socratic' || hintTier < 3 || solutionUnlocked) return null

  function handleConfirm() {
    unlockSolution()
    setConfirming(false)
    onUnlock()
  }

  if (confirming) {
    return (
      <div className="flex flex-col gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-xl">
        <p className="text-xs text-amber-300 leading-snug">
          ⚠️ This will reveal the full solution. Are you sure?
        </p>
        <div className="flex gap-2">
          <button
            id="solution-gate-cancel"
            onClick={() => setConfirming(false)}
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 transition-all duration-200"
          >
            Cancel
          </button>
          <button
            id="solution-gate-confirm"
            onClick={handleConfirm}
            className="flex-1 px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500/25 border border-amber-500/50 text-amber-300 hover:bg-amber-500/35 transition-all duration-200"
          >
            Show Solution
          </button>
        </div>
      </div>
    )
  }

  return (
    <button
      id="solution-gate-btn"
      onClick={() => setConfirming(true)}
      className="w-full px-3 py-1.5 rounded-xl text-xs font-medium bg-amber-500/10 border border-amber-500/25 text-amber-400/80 hover:bg-amber-500/20 hover:border-amber-500/40 hover:text-amber-300 transition-all duration-200"
      title="Reveal the full solution (requires confirmation)"
    >
      🔓 {SOLUTION_GATE_LABEL}
    </button>
  )
}
