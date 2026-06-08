import { useCallback, useEffect, useRef, useState } from 'react'
import type { RefObject } from 'react'
import { PANEL_PORT_NAME } from '../../shared/messages'

export type PortStatus = 'connecting' | 'connected' | 'disconnected'

export interface BackgroundPortHandle {
  portRef: RefObject<chrome.runtime.Port | null>
  portVersion: number
  status: PortStatus
  portError: string | null
  sendToBackground: (message: unknown) => boolean
}

const BASE_RECONNECT_DELAY_MS = 500
const MAX_RECONNECT_DELAY_MS = 5000

export function useBackgroundPort(): BackgroundPortHandle {
  const portRef = useRef<chrome.runtime.Port | null>(null)
  const disposedRef = useRef(false)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reconnectAttemptRef = useRef(0)

  const [portVersion, setPortVersion] = useState(0)
  const [status, setStatus] = useState<PortStatus>('connecting')
  const [portError, setPortError] = useState<string | null>(null)

  const clearReconnectTimer = useCallback(() => {
    if (!reconnectTimerRef.current) return
    clearTimeout(reconnectTimerRef.current)
    reconnectTimerRef.current = null
  }, [])

  const connect = useCallback(() => {
    if (disposedRef.current) return
    clearReconnectTimer()
    setStatus('connecting')

    try {
      const port = chrome.runtime.connect({ name: PANEL_PORT_NAME })
      portRef.current = port
      reconnectAttemptRef.current = 0
      setPortError(null)
      setStatus('connected')
      setPortVersion((v) => v + 1)

      port.onDisconnect.addListener(() => {
        if (portRef.current === port) {
          portRef.current = null
          setPortVersion((v) => v + 1)
        }

        const lastError = chrome.runtime.lastError?.message
        setPortError(lastError ?? 'Disconnected from background service worker')
        setStatus('disconnected')

        if (disposedRef.current) return
        reconnectAttemptRef.current += 1
        const delay = Math.min(
          BASE_RECONNECT_DELAY_MS * 2 ** (reconnectAttemptRef.current - 1),
          MAX_RECONNECT_DELAY_MS,
        )
        reconnectTimerRef.current = setTimeout(connect, delay)
      })
    } catch (err) {
      portRef.current = null
      setPortVersion((v) => v + 1)
      setStatus('disconnected')
      setPortError(err instanceof Error ? err.message : 'Failed to connect to background')

      if (disposedRef.current) return
      reconnectAttemptRef.current += 1
      const delay = Math.min(
        BASE_RECONNECT_DELAY_MS * 2 ** (reconnectAttemptRef.current - 1),
        MAX_RECONNECT_DELAY_MS,
      )
      reconnectTimerRef.current = setTimeout(connect, delay)
    }
  }, [clearReconnectTimer])

  useEffect(() => {
    disposedRef.current = false
    connect()

    return () => {
      disposedRef.current = true
      clearReconnectTimer()
      const port = portRef.current
      portRef.current = null
      if (port) {
        try {
          port.disconnect()
        } catch {
          // Already disconnected.
        }
      }
    }
  }, [clearReconnectTimer, connect])

  const sendToBackground = useCallback((message: unknown): boolean => {
    const port = portRef.current
    if (!port) {
      setPortError('Not connected to background service worker')
      return false
    }

    try {
      port.postMessage(message)
      return true
    } catch (err) {
      setPortError(err instanceof Error ? err.message : 'Failed to send message to background')
      return false
    }
  }, [])

  return { portRef, portVersion, status, portError, sendToBackground }
}
