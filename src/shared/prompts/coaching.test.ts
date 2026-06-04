// Unit tests for the coaching prompt builder.
//
// Critical invariants:
//   1. The Anti-Spoiler decline line references UI control names derived from
//      the SAME shared constants that HintControls.tsx and SolutionGate.tsx render.
//      This is the drift guard — if you rename a label, these tests fail, telling you
//      to update the shared constant and the prompt simultaneously.
//   2. The decline pointer is tier-aware: tiers 0–2 point at Hint Level buttons;
//      tier 3 points at the Show Full Solution gate.
//   3. Each tier's directive block is included in the prompt for that tier and NOT
//      in the prompts for lower tiers.

import { describe, it, expect } from 'vitest'
import { buildCoachingPrompt } from './coaching'
import {
  HINT_TIER_LABELS,
  HINT_PANEL_LABEL,
  SOLUTION_GATE_LABEL,
} from '../constants'
import type { ProblemContext } from '../types'

const PROBLEM: ProblemContext = {
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Return indices of the two numbers that add up to target.',
  constraints: '2 <= nums.length <= 10^4',
  difficulty: 'Easy',
  code: 'function twoSum(nums, target) {}',
}

// ---------------------------------------------------------------------------
// Drift guard — shared constants flow into the prompt
// ---------------------------------------------------------------------------

describe('Anti-Spoiler decline line references shared UI constants', () => {
  it('tier 0 decline mentions HINT_PANEL_LABEL', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain(HINT_PANEL_LABEL)
  })

  it('tier 0 decline mentions all three HINT_TIER_LABELS', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    for (const label of HINT_TIER_LABELS) {
      expect(prompt).toContain(label)
    }
  })

  it('tier 1 decline mentions HINT_PANEL_LABEL', () => {
    const prompt = buildCoachingPrompt(1, PROBLEM)
    expect(prompt).toContain(HINT_PANEL_LABEL)
  })

  it('tier 2 decline mentions HINT_PANEL_LABEL', () => {
    const prompt = buildCoachingPrompt(2, PROBLEM)
    expect(prompt).toContain(HINT_PANEL_LABEL)
  })

  it('tier 3 decline mentions SOLUTION_GATE_LABEL instead of HINT_PANEL_LABEL', () => {
    const prompt = buildCoachingPrompt(3, PROBLEM)
    // At tier 3 (max), the model should point at the solution gate, not the hint buttons
    expect(prompt).toContain(SOLUTION_GATE_LABEL)
  })

  it('tier 3 decline does NOT mention HINT_PANEL_LABEL as the next action', () => {
    // There is no higher hint to unlock — pointing at Hint Level buttons at tier 3 is wrong.
    // The prompt may still mention the label in passing but the decline line must reference the gate.
    const prompt = buildCoachingPrompt(3, PROBLEM)
    expect(prompt).toContain(SOLUTION_GATE_LABEL)
    // The key test: the old broken line should not appear
    expect(prompt).not.toContain(
      "I can give you a stronger hint if you click the hint button",
    )
  })
})

// ---------------------------------------------------------------------------
// Tier directives
// ---------------------------------------------------------------------------

describe('tier directive blocks', () => {
  it('tier 0 includes Exploration directive', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain('Tier 0')
    expect(prompt).toContain('Exploration')
  })

  it('tier 1 includes Nudge directive', () => {
    const prompt = buildCoachingPrompt(1, PROBLEM)
    expect(prompt).toContain('Tier 1')
    expect(prompt).toContain('Nudge')
  })

  it('tier 2 includes Strategy directive', () => {
    const prompt = buildCoachingPrompt(2, PROBLEM)
    expect(prompt).toContain('Tier 2')
    expect(prompt).toContain('Strategy')
  })

  it('tier 3 includes Pseudocode directive', () => {
    const prompt = buildCoachingPrompt(3, PROBLEM)
    expect(prompt).toContain('Tier 3')
    expect(prompt).toContain('Pseudocode')
  })

  it('tier 0 does NOT include the Tier 3 (Pseudocode) directive block', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    // The decline line lists tier labels by name (Nudge/Strategy/Pseudocode) for discoverability —
    // that's intentional. What must NOT appear is the Tier 3 directive *block* header.
    expect(prompt).not.toContain('Tier 3')
    expect(prompt).not.toContain('## Current Hint Level: Pseudocode')
  })

  it('tier 1 does NOT include the Tier 3 directive block', () => {
    const prompt = buildCoachingPrompt(1, PROBLEM)
    expect(prompt).not.toContain('Tier 3')
    expect(prompt).not.toContain('## Current Hint Level: Pseudocode')
  })
})

// ---------------------------------------------------------------------------
// Anti-Spoiler ceiling presence
// ---------------------------------------------------------------------------

describe('Anti-Spoiler ceiling', () => {
  it('Anti-Spoiler enforcement ceiling present at every tier', () => {
    for (let tier = 0; tier <= 3; tier++) {
      const prompt = buildCoachingPrompt(tier, PROBLEM)
      expect(prompt).toContain('ABSOLUTE CEILING')
    }
  })
})

// ---------------------------------------------------------------------------
// Problem context embedded
// ---------------------------------------------------------------------------

describe('problem context', () => {
  it('includes the problem title', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain('Two Sum')
  })

  it('includes the problem statement', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain('Return indices')
  })

  it("includes the user's current code", () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain('twoSum')
  })

  it('handles missing code gracefully', () => {
    const prompt = buildCoachingPrompt(0, { ...PROBLEM, code: '' })
    expect(prompt).toContain('not yet available')
  })
})
