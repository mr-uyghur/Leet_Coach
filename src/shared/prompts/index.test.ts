// Unit tests for selectSystemPrompt() routing in prompts/index.ts.
// Verifies that the correct prompt type is returned for each mode/tier/unlock combination.

import { describe, it, expect } from 'vitest'
import { selectSystemPrompt } from './index'
import type { ProblemContext } from '../types'

const PROBLEM: ProblemContext = {
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Return indices of the two numbers that add up to target.',
  constraints: '2 <= nums.length <= 10^4',
  difficulty: 'Easy',
  code: 'function twoSum(nums, target) {}',
}

describe('selectSystemPrompt routing', () => {
  it('edgecases mode → edge cases prompt (enforcement ceiling absent)', () => {
    const prompt = selectSystemPrompt({ mode: 'edgecases', hintTier: 0, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt).toContain('Edge Cases')
    // The enforcement ceiling block must NOT appear in edge-cases mode
    expect(prompt).not.toContain('ABSOLUTE CEILING')
  })

  it('review mode → code review prompt (enforcement ceiling absent)', () => {
    const prompt = selectSystemPrompt({ mode: 'review', hintTier: 0, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt.toLowerCase()).toContain('review')
    expect(prompt).not.toContain('ABSOLUTE CEILING')
  })

  it('socratic + not unlocked → coaching prompt with Anti-Spoiler enforcement ceiling', () => {
    const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: 2, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt).toContain('ABSOLUTE CEILING')
    expect(prompt).toContain('Tier 2')
  })

  it('socratic + solutionUnlocked → solution prompt (enforcement ceiling absent, solution content present)', () => {
    const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: 3, solutionUnlocked: true, problem: PROBLEM })
    // The active enforcement ceiling must NOT be present
    expect(prompt).not.toContain('ABSOLUTE CEILING')
    // Solution prompt mentions it is suspended and provides full solution structure
    expect(prompt).toContain('suspended')
    expect(prompt.toLowerCase()).toMatch(/intuition|algorithm|complexity/)
  })

  it('socratic + solutionUnlocked: enforcement ceiling absent for all tiers', () => {
    for (let tier = 0; tier <= 3; tier++) {
      const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: tier as 0|1|2|3, solutionUnlocked: true, problem: PROBLEM })
      expect(prompt).not.toContain('ABSOLUTE CEILING')
    }
  })

  it('hint tier is respected in socratic+locked (Tier 0 Exploration block present)', () => {
    const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: 0, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt).toContain('Exploration')
  })

  it('hint tier is respected in socratic+locked (Tier 3 Pseudocode block present)', () => {
    const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: 3, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt).toContain('Pseudocode')
  })
})
