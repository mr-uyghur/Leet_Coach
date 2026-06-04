// Typed discriminated union for all chrome.runtime messages.
// TODO: Phase 3 — finalize CHAT_REQUEST / CHAT_DELTA / CHAT_DONE / CHAT_ERROR payloads

import type { Message, Settings } from './types'

// Shared constant — used by both background and sidebar to avoid silent string mismatch.
export const PANEL_PORT_NAME = 'panel' as const

export interface ProblemUpdatedMessage {
  type: 'PROBLEM_UPDATED'
  payload: {
    slug: string
    title: string
    statement: string
    constraints: string
    difficulty: string
    code: string
  }
}

export interface ChatRequestMessage {
  type: 'CHAT_REQUEST'
  payload: {
    messages: Message[]
    settings: Settings
    problemContext: ProblemUpdatedMessage['payload']
    hintTier: 0 | 1 | 2 | 3
    mode: 'socratic' | 'review' | 'edgecases'
    solutionUnlocked: boolean
  }
}

export interface ChatDeltaMessage {
  type: 'CHAT_DELTA'
  delta: string
}

export interface ChatDoneMessage {
  type: 'CHAT_DONE'
  thinkingContent?: string
}

export interface ChatErrorMessage {
  type: 'CHAT_ERROR'
  error: string
}

export interface RequestExtractMessage {
  type: 'REQUEST_EXTRACT'
}

export type ExtensionMessage =
  | ProblemUpdatedMessage
  | RequestExtractMessage
  | ChatRequestMessage
  | ChatDeltaMessage
  | ChatDoneMessage
  | ChatErrorMessage
