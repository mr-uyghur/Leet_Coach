// Reads/writes provider, model, and apiKey from chrome.storage.local.
// Exposes { settings, updateSettings, isLoaded }.
//
// Key: 'settings' → serialized Settings object.
// Defaults to lmstudio + its default model + empty apiKey on first run.

import { useState, useEffect, useCallback } from 'react'
import type { Settings } from '../../shared/types'
import { PROVIDERS, DEFAULT_PROVIDER } from '../../shared/constants'
import { loadSettings, saveSettings } from '../../background/storage'

const DEFAULT_SETTINGS: Settings = {
  provider: DEFAULT_PROVIDER,
  model: PROVIDERS[DEFAULT_PROVIDER].defaultModel,
  apiKey: '',
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [isLoaded, setIsLoaded] = useState(false)

  // Load from storage on mount
  useEffect(() => {
    let cancelled = false

    loadSettings()
      .then((saved) => {
        if (!cancelled) setSettings(saved)
      })
      .catch((err) => {
        console.error('[LCCoach Panel] Failed to load settings:', err)
      })
      .finally(() => {
        if (!cancelled) setIsLoaded(true)
      })

    return () => {
      cancelled = true
    }
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch }
      // When the provider changes, reset the model to that provider's default
      // (unless the caller is explicitly setting the model at the same time).
      if (patch.provider && !patch.model) {
        next.model = PROVIDERS[patch.provider].defaultModel
      }
      saveSettings(next).catch((err) => {
        console.error('[LCCoach Panel] Failed to save settings:', err)
      })
      return next
    })
  }, [])

  return { settings, updateSettings, isLoaded }
}
