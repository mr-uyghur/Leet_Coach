import { describe, it, expect } from 'vitest'
import { buildCodeReviewPrompt } from './codeReview'
import { buildSolutionPrompt } from './solution'
import { buildEdgeCasesPrompt } from './edgeCases'
import type { ProblemContext } from '../types'

const PROBLEM: ProblemContext = {
  slug: 'two-sum',
  title: 'Two Sum',
  statement: 'Return indices of the two numbers that add up to target.',
  constraints: '2 <= nums.length <= 10^4',
  difficulty: 'Easy',
  code: 'function twoSum(nums, target) {}',
}

describe('code review prompt', () => {
  it('uses local-model-friendly review sections', () => {
    const prompt = buildCodeReviewPrompt(PROBLEM)
    expect(prompt).toContain('<review_rules>')
    expect(prompt).toContain('<conversation_protocol>')
    expect(prompt).toContain('<forbidden>')
  })

  it('instructs one issue at a time and includes missing-code fallback', () => {
    const prompt = buildCodeReviewPrompt(PROBLEM)
    expect(prompt).toContain('Surface only one issue at a time')
    expect(prompt).toContain("I can't see your code yet. Write or paste some code first, then ask for review again.")
  })
})

describe('solution prompt', () => {
  it('keeps the structured first solution format', () => {
    const prompt = buildSolutionPrompt(PROBLEM)
    expect(prompt).toContain('<first_full_solution_format>')
    expect(prompt).toContain('### 1. Intuition')
    expect(prompt).toContain('### 4. Complexity Analysis')
  })

  it('instructs follow-up answers not to repeat the full solution', () => {
    const prompt = buildSolutionPrompt(PROBLEM)
    expect(prompt).toContain('If the visible conversation already contains a full solution')
    expect(prompt).toContain('Do not repeat the full structured solution unless the user explicitly asks')
  })
})

describe('edge cases prompt', () => {
  it('keeps the exact output format and missing-problem fallback', () => {
    const prompt = buildEdgeCasesPrompt(PROBLEM)
    expect(prompt).toContain('<output_format>')
    expect(prompt).toContain('**Case N: [short descriptive name]**')
    expect(prompt).toContain("I can't see the problem yet. Navigate to a LeetCode problem or refresh the page, then ask me again.")
  })

  it('forbids algorithm leakage and code', () => {
    const prompt = buildEdgeCasesPrompt(PROBLEM)
    expect(prompt).toContain('Do not hint at, name, or suggest the solution algorithm or pattern')
    expect(prompt).toContain('Do not provide code')
  })
})
