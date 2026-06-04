// chrome.storage.local helpers for conversation and settings persistence.

import type { Message, Provider, Settings } from '../shared/types'
import { DEFAULT_PROVIDER, PROVIDERS } from '../shared/constants'

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

export async function saveConversation(slug: string, messages: Message[]): Promise<void> {
  await setInStorage({ [conversationKey(slug)]: messages })
}

export async function loadConversation(slug: string): Promise<Message[] | null> {
  const saved = await getFromStorage<unknown>(conversationKey(slug))
  return Array.isArray(saved) ? (saved as Message[]) : null
}

export async function saveSettings(settings: Settings): Promise<void> {
  await setInStorage({ [SETTINGS_KEY]: settings })
}

export async function loadSettings(): Promise<Settings> {
  const saved = await getFromStorage<Partial<Settings>>(SETTINGS_KEY)
  return normalizeSettings(saved)
}
