// Progressive hint tier buttons: Nudge (1) → Strategy (2) → Pseudocode (3).
//
// Rules:
//   - Button N is enabled only if hintTier >= N-1 (must be at previous tier first).
//   - All buttons are disabled in 'review' and 'edgecases' modes.
//   - Active tier button shows highlighted orange.
//   - Tier advances forward via buttons; ↺ reset button (visible when tier > 0) returns to tier 0.
//
// IMPORTANT: The button labels and section header are imported from shared/constants.ts.
// The coaching prompt's Anti-Spoiler decline line references the same constants —
// if you rename a label, update it there and it propagates to both the UI and the AI response.

import { useChatStore } from '../stores/chatStore'
import type { HintTier } from '../../shared/types'
import { HINT_TIER_LABELS, HINT_PANEL_LABEL } from '../../shared/constants'

const TIERS: { tier: HintTier; label: string; description: string }[] = [
  { tier: 1, label: HINT_TIER_LABELS[0], description: 'Guiding questions, no pattern name' },
  { tier: 2, label: HINT_TIER_LABELS[1], description: 'Names the pattern + why it fits' },
  { tier: 3, label: HINT_TIER_LABELS[2], description: 'Step-by-step in plain English' },
]

export default function HintControls() {
  const hintTier = useChatStore((s) => s.hintTier)
  const mode = useChatStore((s) => s.mode)
  const solutionUnlocked = useChatStore((s) => s.solutionUnlocked)
  const setHintTier = useChatStore((s) => s.setHintTier)
  const resetHints = useChatStore((s) => s.resetHints)

  const disabled = mode === 'review' || mode === 'edgecases'
  const activeTier = TIERS.find((t) => t.tier === hintTier)

  return (
    <div className="flex flex-col gap-1.5">
      {/* Section header */}
      <div className="flex items-center justify-between min-h-[14px]">
        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
          {HINT_PANEL_LABEL}
        </span>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-600 italic">
            {disabled
              ? 'Not applicable in this mode'
              : activeTier
              ? activeTier.description
              : 'Unlock a hint level below'}
          </span>
          {(hintTier > 0 || solutionUnlocked) && (
            <button
              onClick={resetHints}
              disabled={disabled}
              title="Reset hint level"
              className="text-[10px] text-gray-500 hover:text-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors leading-none"
            >
              ↺
            </button>
          )}
        </div>
      </div>

      <div className="flex gap-1">
        {TIERS.map(({ tier, label, description }) => {
          const unlocked = !disabled && hintTier >= tier - 1
          const active = hintTier >= tier
          const isCurrentTier = hintTier === tier

          return (
            <button
              key={tier}
              id={`hint-btn-tier-${tier}`}
              onClick={() => {
                if (unlocked && !active) setHintTier(tier)
              }}
              disabled={!unlocked || active}
              title={disabled ? 'Hint controls disabled in this mode' : description}
              className={[
                'flex-1 px-2 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 border',
                active
                  ? isCurrentTier
                    ? 'bg-[#FFA116]/25 border-[#FFA116]/60 text-[#FFA116] cursor-default'
                    : 'bg-[#FFA116]/10 border-[#FFA116]/30 text-[#FFA116]/60 cursor-default'
                  : unlocked
                  ? 'bg-white/5 border-white/15 text-gray-300 hover:bg-[#FFA116]/10 hover:border-[#FFA116]/30 hover:text-[#FFA116] cursor-pointer'
                  : 'bg-white/[0.02] border-white/5 text-gray-600 cursor-not-allowed',
              ].join(' ')}
              aria-pressed={active}
            >
              {active && <span className="mr-1">✓</span>}
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
