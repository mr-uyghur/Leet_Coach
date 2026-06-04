// chrome.storage.local helpers for conversation and settings persistence.

import type { Message, HintTier, Provider, Settings } from '../shared/types'
import { DEFAULT_PROVIDER, PROVIDERS } from '../shared/constants'

// Stored alongside messages so hint progress and solution state survive panel close/reopen.
export interface SavedConversationState {
  messages: Message[]
  hintTier: HintTier
  solutionUnlocked: boolean
}

const SETTINGS_KEY = 'settings'

function conversationKey(slug: string): string {
  return `conversation:${slug}`
}

function getFromStorage<T>(key: string): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(key, (result) => {
      const err = chrome.runtime.lastError
      if (err) {
        reject(new Error(err.message))
        return
      }
      resolve(result[key] as T | undefined)
    })
  })
}

function setInStorage(items: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    chrome.storage.local.set(items, () => {
      const err = chrome.runtime.lastError
      if (err) {
        reject(new Error(err.message))
        return
      }
      resolve()
    })
  })
}

function isProvider(value: unknown): value is Provider {
  return typeof value === 'string' && value in PROVIDERS
}

function normalizeSettings(saved: Partial<Settings> | undefined): Settings {
  const provider = isProvider(saved?.provider) ? saved.provider : DEFAULT_PROVIDER

  return {
    provider,
    model: typeof saved?.model === 'string' && saved.model
      ? saved.model
      : PROVIDERS[provider].defaultModel,
    apiKey: typeof saved?.apiKey === 'string' ? saved.apiKey : '',
  }
}

export async function saveConversation(
  slug: string,
  state: SavedConversationState,
): Promise<void> {
  await setInStorage({ [conversationKey(slug)]: state })
}

export async function loadConversation(slug: string): Promise<SavedConversationState | null> {
  const saved = await getFromStorage<unknown>(conversationKey(slug))
  if (!saved) return null

  // Backward compat: Phase 6 stored a bare Message[]. Migrate to the new shape.
  if (Array.isArray(saved)) {
    return { messages: saved as Message[], hintTier: 0, solutionUnlocked: false }
  }

  if (
    saved !== null &&
    typeof saved === 'object' &&
    Array.isArray((saved as SavedConversationState).messages)
  ) {
    const s = saved as SavedConversationState
    return {
      messages: s.messages,
      hintTier: (typeof s.hintTier === 'number' ? s.hintTier : 0) as HintTier,
      solutionUnlocked: typeof s.solutionUnlocked === 'boolean' ? s.solutionUnlocked : false,
    }
  }

  return null
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setInStorage({ [SETTINGS_KEY]: settings })
}

export async function loadSettings(): Promise<Settings> {
  const saved = await getFromStorage<Partial<Settings>>(SETTINGS_KEY)
  return normalizeSettings(saved)
}
