// Component tests for SolutionGate.
//
// Invariants:
//   - Hidden unless mode==='socratic' && hintTier===3 && !solutionUnlocked.
//   - Clicking the gate button shows the inline confirmation dialog.
//   - Cancelling dismisses the dialog without calling onUnlock.
//   - Confirming calls unlockSolution() in the store AND calls the onUnlock prop.
//   - Button label matches the shared SOLUTION_GATE_LABEL constant (drift guard).

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import SolutionGate from './SolutionGate'
import { useChatStore } from '../stores/chatStore'
import { SOLUTION_GATE_LABEL } from '../../shared/constants'

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
// Visibility gating
// ---------------------------------------------------------------------------

describe('visibility', () => {
  it('hidden at tier < 3', () => {
    resetStore({ mode: 'socratic', hintTier: 2, solutionUnlocked: false })
    const { container } = render(<SolutionGate onUnlock={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('hidden in review mode even at tier 3', () => {
    resetStore({ mode: 'review', hintTier: 3, solutionUnlocked: false })
    const { container } = render(<SolutionGate onUnlock={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('hidden in edgecases mode even at tier 3', () => {
    resetStore({ mode: 'edgecases', hintTier: 3, solutionUnlocked: false })
    const { container } = render(<SolutionGate onUnlock={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('hidden once solutionUnlocked is true', () => {
    resetStore({ mode: 'socratic', hintTier: 3, solutionUnlocked: true })
    const { container } = render(<SolutionGate onUnlock={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('visible at tier 3 in socratic mode before unlock', () => {
    resetStore({ mode: 'socratic', hintTier: 3, solutionUnlocked: false })
    render(<SolutionGate onUnlock={vi.fn()} />)
    const btn = screen.getByRole('button', { name: new RegExp(SOLUTION_GATE_LABEL) })
    expect(btn).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Drift guard
// ---------------------------------------------------------------------------

describe('SOLUTION_GATE_LABEL drift guard', () => {
  it('gate button textContent contains SOLUTION_GATE_LABEL', () => {
    resetStore({ mode: 'socratic', hintTier: 3, solutionUnlocked: false })
    render(<SolutionGate onUnlock={vi.fn()} />)
    // getByRole is more robust: the button's accessible name includes the label text
    const btn = screen.getByRole('button', { name: new RegExp(SOLUTION_GATE_LABEL) })
    expect(btn.textContent).toContain(SOLUTION_GATE_LABEL)
  })
})

// ---------------------------------------------------------------------------
// Confirmation flow
// ---------------------------------------------------------------------------

describe('confirmation dialog', () => {
  it('clicking the gate button shows the confirmation dialog', async () => {
    const user = userEvent.setup()
    resetStore({ mode: 'socratic', hintTier: 3, solutionUnlocked: false })
    render(<SolutionGate onUnlock={vi.fn()} />)

    await user.click(screen.getByRole('button', { name: new RegExp(SOLUTION_GATE_LABEL) }))
    expect(screen.getByText(/Are you sure/i)).toBeInTheDocument()
  })

  it('cancelling dismisses the dialog without calling onUnlock', async () => {
    const user = userEvent.setup()
    const onUnlock = vi.fn()
    resetStore({ mode: 'socratic', hintTier: 3, solutionUnlocked: false })
    render(<SolutionGate onUnlock={onUnlock} />)

    await user.click(screen.getByRole('button', { name: new RegExp(SOLUTION_GATE_LABEL) }))
    await user.click(screen.getByRole('button', { name: /cancel/i }))

    expect(onUnlock).not.toHaveBeenCalled()
    expect(useChatStore.getState().solutionUnlocked).toBe(false)
    // Dialog gone, gate button back
    expect(screen.getByRole('button', { name: new RegExp(SOLUTION_GATE_LABEL) })).toBeInTheDocument()
  })

  it('confirming calls unlockSolution in store and the onUnlock prop', async () => {
    const user = userEvent.setup()
    const onUnlock = vi.fn()
    resetStore({ mode: 'socratic', hintTier: 3, solutionUnlocked: false })
    render(<SolutionGate onUnlock={onUnlock} />)

    await user.click(screen.getByRole('button', { name: new RegExp(SOLUTION_GATE_LABEL) }))
    await user.click(screen.getByRole('button', { name: /show solution/i }))

    expect(onUnlock).toHaveBeenCalledOnce()
    expect(useChatStore.getState().solutionUnlocked).toBe(true)
  })
})
