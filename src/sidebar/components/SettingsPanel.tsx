// Slide-in settings panel (fixed overlay from the right).
// Provider dropdown → auto-populates model default.
// API key shown only for Anthropic.
// Ollama/LM Studio: shows endpoint URL (read-only) + Test Connection button.
// All changes auto-save via updateSettings().

import { useState } from 'react'
import type { Settings, Provider } from '../../shared/types'
import { PROVIDERS, AVAILABLE_LOCAL_MODELS } from '../../shared/constants'

interface SettingsPanelProps {
  settings: Settings
  onUpdate: (patch: Partial<Settings>) => void
  onClose: () => void
}

const PROVIDER_LABELS: Record<Provider, string> = {
  anthropic: 'Anthropic (Claude)',
  ollama: 'Ollama (local)',
  lmstudio: 'LM Studio (local)',
}

export default function SettingsPanel({ settings, onUpdate, onClose }: SettingsPanelProps) {
  const [testStatus, setTestStatus] = useState<'idle' | 'testing' | 'ok' | 'fail'>('idle')

  async function handleTestConnection() {
    setTestStatus('testing')
    const baseUrl = settings.provider === 'ollama'
      ? PROVIDERS.ollama.baseUrl
      : PROVIDERS.lmstudio.baseUrl

    try {
      // Hit the /models endpoint as a liveness check (no auth required)
      const url = baseUrl.replace('/chat/completions', '/models')
      const res = await fetch(url, { method: 'GET', signal: AbortSignal.timeout(5000) })
      setTestStatus(res.ok ? 'ok' : 'fail')
    } catch {
      setTestStatus('fail')
    }

    setTimeout(() => setTestStatus('idle'), 3000)
  }

  const isLocal = settings.provider === 'ollama' || settings.provider === 'lmstudio'
  const endpointUrl = isLocal
    ? PROVIDERS[settings.provider as 'ollama' | 'lmstudio'].baseUrl
    : PROVIDERS.anthropic.baseUrl

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        className="fixed top-0 right-0 h-full w-full max-w-xs z-50
                   bg-[#1e1e1e] border-l border-white/10 shadow-2xl
                   flex flex-col"
        role="dialog"
        aria-label="Settings"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
          <h2 className="text-sm font-semibold text-gray-200">⚙ Settings</h2>
          <button
            id="settings-close-btn"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-500 hover:text-gray-200 hover:bg-white/10 transition-all duration-200"
            aria-label="Close settings"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-5">

          {/* Provider */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="settings-provider" className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Provider
            </label>
            <select
              id="settings-provider"
              value={settings.provider}
              onChange={(e) => onUpdate({ provider: e.target.value as Provider })}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200
                         focus:outline-none focus:border-[#FFA116]/40 transition-colors duration-200"
            >
              {(Object.keys(PROVIDER_LABELS) as Provider[]).map((p) => (
                <option key={p} value={p} className="bg-[#1e1e1e]">
                  {PROVIDER_LABELS[p]}
                </option>
              ))}
            </select>
          </div>

          {/* Model */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="settings-model" className="text-xs font-medium text-gray-400 uppercase tracking-wider">
              Model
            </label>
            {settings.provider === 'lmstudio' ? (
              <div className="w-full bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2.5">
                <p className="text-xs text-gray-500 leading-relaxed">
                  Controlled by LM Studio — switch models in the LM Studio app directly.
                </p>
              </div>
            ) : settings.provider === 'ollama' ? (
              <select
                id="settings-model"
                value={settings.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200
                           focus:outline-none focus:border-[#FFA116]/40 transition-colors duration-200"
              >
                {AVAILABLE_LOCAL_MODELS.filter(m => !m.startsWith('gemma-')).map((m) => (
                  <option key={m} value={m} className="bg-[#1e1e1e]">
                    {m}
                  </option>
                ))}
              </select>
            ) : (
              <input
                id="settings-model"
                type="text"
                value={settings.model}
                onChange={(e) => onUpdate({ model: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono
                           focus:outline-none focus:border-[#FFA116]/40 transition-colors duration-200"
                placeholder="e.g. claude-sonnet-4-6"
              />
            )}
          </div>

          {/* API Key — Anthropic only */}
          {settings.provider === 'anthropic' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="settings-apikey" className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                API Key
              </label>
              <input
                id="settings-apikey"
                type="password"
                value={settings.apiKey}
                onChange={(e) => onUpdate({ apiKey: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-gray-200 font-mono
                           focus:outline-none focus:border-[#FFA116]/40 transition-colors duration-200"
                placeholder="sk-ant-…"
                autoComplete="off"
              />
              <p className="text-[10px] text-gray-600">Stored in chrome.storage.local (local device only)</p>
            </div>
          )}

          {/* Endpoint (local providers) */}
          {isLocal && (
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-gray-400 uppercase tracking-wider">
                Endpoint
              </label>
              <div className="flex gap-2">
                <input
                  readOnly
                  value={endpointUrl}
                  className="flex-1 bg-white/[0.03] border border-white/8 rounded-lg px-3 py-2 text-xs text-gray-600 font-mono cursor-default"
                  aria-label="Endpoint URL (read-only)"
                />
              </div>
              <button
                id="settings-test-connection"
                onClick={handleTestConnection}
                disabled={testStatus === 'testing'}
                className={[
                  'w-full px-3 py-2 rounded-lg text-xs font-medium border transition-all duration-200',
                  testStatus === 'ok'
                    ? 'bg-green-500/15 border-green-500/30 text-green-400'
                    : testStatus === 'fail'
                    ? 'bg-red-500/15 border-red-500/30 text-red-400'
                    : 'bg-white/5 border-white/10 text-gray-400 hover:text-gray-200 hover:bg-white/10',
                ].join(' ')}
              >
                {testStatus === 'testing' ? '⟳ Testing…'
                  : testStatus === 'ok' ? '✓ Connected'
                  : testStatus === 'fail' ? '✕ Not reachable'
                  : '↻ Test Connection'}
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-white/10">
          <p className="text-[10px] text-gray-700 text-center">
            Settings saved automatically
          </p>
        </div>
      </div>
    </>
  )
}
