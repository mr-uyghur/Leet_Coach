// Component tests for ModeSelector.

import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModeSelector from './ModeSelector'
import { useChatStore } from '../stores/chatStore'

function resetStore(mode: 'socratic' | 'review' | 'edgecases' = 'socratic') {
  useChatStore.setState({
    messages: [],
    inFlightContent: '',
    inFlightThinking: '',
    isStreaming: false,
    streamError: null,
    isConversationHydrating: false,
    currentProblem: null,
    hintTier: 0,
    mode,
    solutionUnlocked: false,
  })
}

beforeEach(() => resetStore())

describe('ModeSelector rendering', () => {
  it('renders all three mode tabs', () => {
    render(<ModeSelector />)
    expect(screen.getByText('Socratic')).toBeInTheDocument()
    expect(screen.getByText('Review')).toBeInTheDocument()
    expect(screen.getByText('Edge Cases')).toBeInTheDocument()
  })

  it('active mode has aria-pressed=true', () => {
    resetStore('socratic')
    render(<ModeSelector />)
    const socraticBtn = screen.getByRole('button', { name: /Socratic/ })
    expect(socraticBtn).toHaveAttribute('aria-pressed', 'true')
    const reviewBtn = screen.getByRole('button', { name: /Review/ })
    expect(reviewBtn).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('ModeSelector interactions', () => {
  it('clicking Review sets mode to review', async () => {
    const user = userEvent.setup()
    render(<ModeSelector />)
    await user.click(screen.getByRole('button', { name: /Review/ }))
    expect(useChatStore.getState().mode).toBe('review')
  })

  it('clicking Edge Cases sets mode to edgecases', async () => {
    const user = userEvent.setup()
    render(<ModeSelector />)
    await user.click(screen.getByRole('button', { name: /Edge Cases/ }))
    expect(useChatStore.getState().mode).toBe('edgecases')
  })

  it('clicking Socratic from review mode switches back', async () => {
    const user = userEvent.setup()
    resetStore('review')
    render(<ModeSelector />)
    await user.click(screen.getByRole('button', { name: /Socratic/ }))
    expect(useChatStore.getState().mode).toBe('socratic')
  })

  it('active mode button shows aria-pressed=true after switching', async () => {
    const user = userEvent.setup()
    render(<ModeSelector />)
    await user.click(screen.getByRole('button', { name: /Review/ }))
    const reviewBtn = screen.getByRole('button', { name: /Review/ })
    expect(reviewBtn).toHaveAttribute('aria-pressed', 'true')
  })
})
