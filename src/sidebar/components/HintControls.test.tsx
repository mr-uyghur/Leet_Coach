// Component tests for HintControls.
//
// Key invariants:
//   - Button N enabled only when hintTier >= N-1 (monotonic gate).
//   - All buttons disabled in 'review' and 'edgecases' modes.
//   - Clicking an already-active tier is a no-op.
//   - Active tier shows aria-pressed=true and check mark prefix.
//   - Button labels match the shared HINT_TIER_LABELS constant (drift guard).
//   - Section header matches HINT_PANEL_LABEL constant (drift guard).

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HintControls from './HintControls'
import { useChatStore } from '../stores/chatStore'
import { HINT_TIER_LABELS, HINT_PANEL_LABEL } from '../../shared/constants'

function resetStore(overrides?: Partial<Parameters<typeof useChatStore.setState>[0]>) {
  useChatStore.setState({
    messages: [],
    inFlightContent: '',
    inFlightThinking: '',
    isStreaming: false,
    streamError: null,
    isConversationHydrating: false,
    currentProblem: null,
    hintTier: 0,
    mode: 'socratic',
    solutionUnlocked: false,
    ...overrides,
  })
}

beforeEach(() => resetStore())

// ---------------------------------------------------------------------------
// Drift guards
// ---------------------------------------------------------------------------

describe('label drift guards', () => {
  it('renders the HINT_PANEL_LABEL as section header', () => {
    render(<HintControls />)
    expect(screen.getByText(HINT_PANEL_LABEL)).toBeInTheDocument()
  })

  it('renders all three HINT_TIER_LABELS as button text', () => {
    render(<HintControls />)
    for (const label of HINT_TIER_LABELS) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })
})

// ---------------------------------------------------------------------------
// Initial state (tier 0 — no hints unlocked)
// ---------------------------------------------------------------------------

describe('tier 0 initial state', () => {
  it('Nudge button is enabled (tier 1 unlocked when hintTier >= 0)', () => {
    render(<HintControls />)
    const nudge = screen.getByText(HINT_TIER_LABELS[0]).closest('button')!
    expect(nudge).not.toBeDisabled()
  })

  it('Strategy button is disabled (needs tier >= 1)', () => {
    render(<HintControls />)
    const strategy = screen.getByText(HINT_TIER_LABELS[1]).closest('button')!
    expect(strategy).toBeDisabled()
  })

  it('Pseudocode button is disabled (needs tier >= 2)', () => {
    render(<HintControls />)
    const pseudocode = screen.getByText(HINT_TIER_LABELS[2]).closest('button')!
    expect(pseudocode).toBeDisabled()
  })
})

// ---------------------------------------------------------------------------
// Clicking Nudge advances tier
// ---------------------------------------------------------------------------

describe('clicking tier buttons', () => {
  it('clicking Nudge sets hintTier to 1', async () => {
    const user = userEvent.setup()
    render(<HintControls />)
    await user.click(screen.getByText(HINT_TIER_LABELS[0]).closest('button')!)
    expect(useChatStore.getState().hintTier).toBe(1)
  })

  it('after tier 1, Strategy becomes enabled', async () => {
    const user = userEvent.setup()
    resetStore({ hintTier: 1 })
    render(<HintControls />)
    const strategy = screen.getByText(HINT_TIER_LABELS[1]).closest('button')!
    expect(strategy).not.toBeDisabled()
  })

  it('clicking an already-active tier is a no-op (button is disabled once active)', () => {
    resetStore({ hintTier: 1 })
    render(<HintControls />)
    const nudge = screen.getByText(HINT_TIER_LABELS[0]).closest('button')!
    // Active buttons are rendered disabled so they cannot be re-clicked
    expect(nudge).toBeDisabled()
  })

  it('all three tiers can be unlocked sequentially', async () => {
    const user = userEvent.setup()
    render(<HintControls />)

    await user.click(screen.getByText(HINT_TIER_LABELS[0]).closest('button')!)
    expect(useChatStore.getState().hintTier).toBe(1)

    const strategy = screen.getByText(HINT_TIER_LABELS[1]).closest('button')!
    await user.click(strategy)
    expect(useChatStore.getState().hintTier).toBe(2)

    const pseudocode = screen.getByText(HINT_TIER_LABELS[2]).closest('button')!
    await user.click(pseudocode)
    expect(useChatStore.getState().hintTier).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// aria-pressed
// ---------------------------------------------------------------------------

describe('aria-pressed', () => {
  it('active tiers have aria-pressed=true', () => {
    resetStore({ hintTier: 2 })
    render(<HintControls />)

    const nudge     = screen.getByText(HINT_TIER_LABELS[0]).closest('button')!
    const strategy  = screen.getByText(HINT_TIER_LABELS[1]).closest('button')!
    const pseudocode = screen.getByText(HINT_TIER_LABELS[2]).closest('button')!

    expect(nudge).toHaveAttribute('aria-pressed', 'true')
    expect(strategy).toHaveAttribute('aria-pressed', 'true')
    expect(pseudocode).toHaveAttribute('aria-pressed', 'false')
  })
})

// ---------------------------------------------------------------------------
// Disabled in non-socratic modes
// ---------------------------------------------------------------------------

describe('disabled in review/edgecases modes', () => {
  it('all buttons are disabled in review mode', () => {
    resetStore({ mode: 'review' })
    render(<HintControls />)
    for (const label of HINT_TIER_LABELS) {
      const btn = screen.getByText(label).closest('button')!
      expect(btn).toBeDisabled()
    }
  })

  it('all buttons are disabled in edgecases mode', () => {
    resetStore({ mode: 'edgecases' })
    render(<HintControls />)
    for (const label of HINT_TIER_LABELS) {
      const btn = screen.getByText(label).closest('button')!
      expect(btn).toBeDisabled()
    }
  })

  it('shows "Not applicable in this mode" hint text in review mode', () => {
    resetStore({ mode: 'review' })
    render(<HintControls />)
    expect(screen.getByText('Not applicable in this mode')).toBeInTheDocument()
  })
})
