// Global test setup — runs before every test file.
// 1. Extends expect() with @testing-library/jest-dom matchers.
// 2. Installs a minimal chrome API mock so units that import background/storage.ts,
//    useSettings, or useProblem don't crash on missing globals.

import '@testing-library/jest-dom'

// ---------------------------------------------------------------------------
// Chrome API mock
// ---------------------------------------------------------------------------

// In-memory storage backend shared across all calls within a test.
// Cleared via afterEach / beforeEach in individual tests when isolation matters.
const _storage: Record<string, unknown> = {}

const chromeMock = {
  storage: {
    local: {
      get: vi.fn(
        (keys: string | string[] | null, cb?: (result: Record<string, unknown>) => void) => {
          const keyList: string[] =
            keys === null
              ? Object.keys(_storage)
              : Array.isArray(keys)
              ? keys
              : [keys]
          const result: Record<string, unknown> = {}
          for (const k of keyList) {
            if (k in _storage) result[k] = _storage[k]
          }
          if (cb) cb(result)
          return Promise.resolve(result)
        },
      ),
      set: vi.fn((items: Record<string, unknown>, cb?: () => void) => {
        Object.assign(_storage, items)
        if (cb) cb()
        return Promise.resolve()
      }),
      remove: vi.fn((keys: string | string[], cb?: () => void) => {
        const keyList = Array.isArray(keys) ? keys : [keys]
        for (const k of keyList) delete _storage[k]
        if (cb) cb()
        return Promise.resolve()
      }),
    },
  },
  runtime: {
    connect: vi.fn(() => ({
      name: 'mock-port',
      postMessage: vi.fn(),
      onMessage: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      onDisconnect: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
      disconnect: vi.fn(),
    })),
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    getURL: vi.fn((path: string) => `chrome-extension://mock-id/${path}`),
    lastError: undefined as chrome.runtime.LastError | undefined,
  },
}

// Attach to globalThis so any import of chrome.* resolves at the module level.
Object.defineProperty(globalThis, 'chrome', {
  value: chromeMock,
  writable: true,
  configurable: true,
})

// Expose a helper so tests can reset the in-memory storage between test cases.
export function clearChromeMockStorage() {
  for (const key of Object.keys(_storage)) {
    delete _storage[key]
  }
}

// Reset mocks between tests — keeps calls from leaking across test cases.
afterEach(() => {
  vi.clearAllMocks()
})
