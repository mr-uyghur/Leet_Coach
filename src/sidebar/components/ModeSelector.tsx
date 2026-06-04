// Three-tab mode selector: Socratic Chat | Code Review | Edge Cases.
// Active tab uses LeetCode orange accent (glassmorphism pill).
// Hint controls are disabled in Review and Edge Cases modes — enforced in HintControls.tsx.

import { useChatStore } from '../stores/chatStore'
import type { Mode } from '../../shared/types'

const MODES: { id: Mode; label: string; icon: string; description: string }[] = [
  {
    id: 'socratic',
    label: 'Socratic',
    icon: '🧠',
    description: 'Guided questions — I help you think, not hand you the answer',
  },
  {
    id: 'review',
    label: 'Review',
    icon: '🔍',
    description: 'Spot bugs in your current code — I ask before I correct',
  },
  {
    id: 'edgecases',
    label: 'Edge Cases',
    icon: '⚡',
    description: 'Generate tricky test cases to stress-test your solution',
  },
]

export default function ModeSelector() {
  const mode = useChatStore((s) => s.mode)
  const setMode = useChatStore((s) => s.setMode)

  const activeMode = MODES.find((m) => m.id === mode)!

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
        {MODES.map(({ id, label, icon, description }) => {
          const active = mode === id
          return (
            <button
              key={id}
              id={`mode-btn-${id}`}
              onClick={() => setMode(id)}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200',
                active
                  ? 'bg-[#FFA116]/20 border border-[#FFA116]/50 text-[#FFA116] shadow-[0_0_12px_rgba(255,161,22,0.15)]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/5',
              ].join(' ')}
              aria-pressed={active}
              title={description}
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          )
        })}
      </div>
      <p className="text-[10px] text-gray-500 leading-snug px-0.5">
        {activeMode.description}
      </p>
    </div>
  )
}
