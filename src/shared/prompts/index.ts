// Prompt routing and shared utilities.
//
// selectSystemPrompt() is the single entry point called by the background service worker
// on every CHAT_REQUEST. All prompt-selection logic lives here; the background knows nothing
// about coaching modes or hint tiers except the values it receives in the message payload.
//
// formatProblemContext() is the single canonical rendering of problem data embedded in every
// system prompt. All four builders import and call this — never inline problem context.

import type { ProblemContext, HintTier, Mode } from '../types'
import { buildCoachingPrompt } from './coaching'
import { buildCodeReviewPrompt } from './codeReview'
import { buildEdgeCasesPrompt } from './edgeCases'
import { buildSolutionPrompt } from './solution'

// ---------------------------------------------------------------------------
// Shared problem context formatter
// ---------------------------------------------------------------------------

/**
 * Render the problem fields into a formatted block appended to every system prompt.
 * Keeps the problem context consistently structured across all modes.
 */
export function formatProblemContext(problem: ProblemContext): string {
  const parts: string[] = []

  parts.push('---')
  parts.push('## Problem Context')
  parts.push('')

  if (problem.title) {
    const difficultyTag = problem.difficulty ? ` (${problem.difficulty})` : ''
    parts.push(`**Problem:** ${problem.title}${difficultyTag}`)
    parts.push('')
  }

  if (problem.statement) {
    parts.push('**Problem Statement:**')
    parts.push(problem.statement.trim())
    parts.push('')
  }

  if (problem.constraints) {
    parts.push('**Constraints:**')
    parts.push(problem.constraints.trim())
    parts.push('')
  }

  if (problem.code && problem.code.trim()) {
    parts.push("**User's Current Code:**")
    if (problem.codeSource === 'dom-fallback' || problem.codeComplete === false) {
      parts.push('_Code extraction warning: Monaco was unavailable; this may be a partial visible-editor snapshot._')
      parts.push('')
    }
    parts.push('```')
    parts.push(problem.code.trim())
    parts.push('```')
    parts.push('')
  } else {
    parts.push("**User's Current Code:** _(not yet available)_")
    parts.push('')
  }

  return parts.join('\n')
}

// ---------------------------------------------------------------------------
// Prompt selector
// ---------------------------------------------------------------------------

export interface SelectPromptOptions {
  mode: Mode
  hintTier: HintTier
  solutionUnlocked: boolean
  problem: ProblemContext
}

/**
 * Select and build the correct system prompt for the current request context.
 *
 * Routing priority:
 *   1. Edge Cases mode → edge-cases prompt (ignores tier; thinking mode already disabled by BG)
 *   2. Code Review mode → code-review prompt (ignores tier)
 *   3. Socratic + solutionUnlocked → solution prompt (Anti-Spoiler Rule suspended)
 *   4. Socratic → coaching prompt at the current tier (Anti-Spoiler Rule enforced)
 *
 * Note: once solutionUnlocked is true, all subsequent socratic messages use the solution prompt,
 * allowing the user to ask follow-up questions about the revealed solution.
 */
export function selectSystemPrompt({
  mode,
  hintTier,
  solutionUnlocked,
  problem,
}: SelectPromptOptions): string {
  switch (mode) {
    case 'edgecases':
      return buildEdgeCasesPrompt(problem)

    case 'review':
      return buildCodeReviewPrompt(problem)

    case 'socratic':
      if (solutionUnlocked) {
        return buildSolutionPrompt(problem)
      }
      return buildCoachingPrompt(hintTier, problem)

    default: {
      // TypeScript exhaustiveness — should never reach here.
      const _exhaustive: never = mode
      console.error('[LCCoach Prompts] Unknown mode:', String(_exhaustive), '— falling back to coaching')
      return buildCoachingPrompt(hintTier, problem)
    }
  }
}
