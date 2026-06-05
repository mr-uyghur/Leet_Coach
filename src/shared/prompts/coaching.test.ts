// Unit tests for the coaching prompt builder.
//
// Critical invariants:
//   1. The Anti-Spoiler prompt references UI control names derived from shared constants.
//   2. The decline pointer is tier-aware: tiers 0-2 point to hint progression;
//      tier 3 points at the Show Full Solution gate.
//   3. Tier-specific allowed/forbidden XML blocks are included without leaking
//      higher-tier instruction blocks into lower tiers.

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

describe('Anti-Spoiler prompt references shared UI constants', () => {
  it('tier 0 prompt mentions the hint controls and all hint labels', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain(HINT_PANEL_LABEL)
    for (const label of HINT_TIER_LABELS) {
      expect(prompt).toContain(label)
    }
  })

  it('tier 3 prompt mentions the solution gate label', () => {
    const prompt = buildCoachingPrompt(3, PROBLEM)
    expect(prompt).toContain(SOLUTION_GATE_LABEL)
  })

  it('tiers 0-2 use the short hint unlock decline line', () => {
    for (let tier = 0; tier <= 2; tier++) {
      const prompt = buildCoachingPrompt(tier, PROBLEM)
      expect(prompt).toContain('"Unlock the next hint level to continue."')
    }
  })

  it('tier 3 uses the solution gate decline line', () => {
    const prompt = buildCoachingPrompt(3, PROBLEM)
    expect(prompt).toContain(`"Use the "${SOLUTION_GATE_LABEL}" button to continue."`)
  })
})

describe('tier directive blocks', () => {
  it('tier 0 includes Exploration directive', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain('<tier id="0" name="Exploration">')
    expect(prompt).toContain('<allowed>')
    expect(prompt).toContain('<forbidden>')
  })

  it('tier 1 includes Nudge directive', () => {
    const prompt = buildCoachingPrompt(1, PROBLEM)
    expect(prompt).toContain('<tier id="1" name="Nudge">')
  })

  it('tier 2 includes Strategy directive', () => {
    const prompt = buildCoachingPrompt(2, PROBLEM)
    expect(prompt).toContain('<tier id="2" name="Strategy">')
  })

  it('tier 3 includes Pseudocode directive', () => {
    const prompt = buildCoachingPrompt(3, PROBLEM)
    expect(prompt).toContain('<tier id="3" name="Pseudocode">')
  })

  it('tier 0 does not include the Tier 3 directive block', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).not.toContain('<tier id="3" name="Pseudocode">')
  })
})

describe('local-model prompt structure', () => {
  it('contains conversation protocol and anti-spoiler XML sections', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain('<conversation_protocol>')
    expect(prompt).toContain('<anti_spoiler>')
    expect(prompt).toContain('<required_response>')
  })

  it('contains the missing problem fallback instruction', () => {
    const prompt = buildCoachingPrompt(0, PROBLEM)
    expect(prompt).toContain("I can't see the problem yet. Try refreshing the LeetCode page, then ask me again.")
  })
})

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
