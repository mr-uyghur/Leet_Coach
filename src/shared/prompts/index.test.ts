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
  it('edgecases mode -> edge cases prompt (anti-spoiler section absent)', () => {
    const prompt = selectSystemPrompt({ mode: 'edgecases', hintTier: 0, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt).toContain('Edge Cases')
    expect(prompt).not.toContain('<anti_spoiler>')
  })

  it('review mode -> code review prompt (anti-spoiler section absent)', () => {
    const prompt = selectSystemPrompt({ mode: 'review', hintTier: 0, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt.toLowerCase()).toContain('review')
    expect(prompt).not.toContain('<anti_spoiler>')
  })

  it('socratic + not unlocked -> coaching prompt with anti-spoiler section', () => {
    const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: 2, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt).toContain('<anti_spoiler>')
    expect(prompt).toContain('<tier id="2" name="Strategy">')
  })

  it('socratic + solutionUnlocked -> solution prompt (anti-spoiler section absent, solution content present)', () => {
    const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: 3, solutionUnlocked: true, problem: PROBLEM })
    expect(prompt).not.toContain('<anti_spoiler>')
    expect(prompt).toContain('suspended')
    expect(prompt.toLowerCase()).toMatch(/intuition|algorithm|complexity/)
  })

  it('socratic + solutionUnlocked: anti-spoiler section absent for all tiers', () => {
    for (let tier = 0; tier <= 3; tier++) {
      const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: tier as 0|1|2|3, solutionUnlocked: true, problem: PROBLEM })
      expect(prompt).not.toContain('<anti_spoiler>')
    }
  })

  it('hint tier is respected in socratic+locked (Tier 0 Exploration block present)', () => {
    const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: 0, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt).toContain('<tier id="0" name="Exploration">')
  })

  it('hint tier is respected in socratic+locked (Tier 3 Pseudocode block present)', () => {
    const prompt = selectSystemPrompt({ mode: 'socratic', hintTier: 3, solutionUnlocked: false, problem: PROBLEM })
    expect(prompt).toContain('<tier id="3" name="Pseudocode">')
  })
})
