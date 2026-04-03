import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { detectClientEnvironment } from '../lib/environment'
import { REQUIRED_EXTENSION_VERSION } from '../lib/appMeta'
import {
  clearWebMemories,
  initializeWebMemoryStore,
  webMemorySearch,
  webMemoryStats,
  webMemoryStatus,
  webMemorySuggestions,
} from '../lib/webMemoryStore'

function supportsWindowMessaging() {
  return typeof window !== 'undefined' && typeof window.postMessage === 'function'
}

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function isResponseType(type) {
  return (
    type === 'MEMACT_SEARCH_RESULT' ||
    type === 'MEMACT_SUGGESTIONS_RESULT' ||
    type === 'MEMACT_STATUS_RESULT' ||
    type === 'MEMACT_STATS_RESULT' ||
    type === 'MEMACT_CLEAR_ALL_DATA_RESULT' ||
    type === 'CAPTANET_GET_EVENTS_RESULT' ||
    type === 'CAPTANET_GET_SESSIONS_RESULT' ||
    type === 'CAPTANET_GET_ACTIVITIES_RESULT' ||
    type === 'CAPTANET_GET_SNAPSHOT_RESULT' ||
    type === 'MEMACT_ERROR'
  )
}

function timestampFilePart() {
  const now = new Date()
  const yyyy = String(now.getFullYear())
  const mm = String(now.getMonth() + 1).padStart(2, '0')
  const dd = String(now.getDate()).padStart(2, '0')
  const hh = String(now.getHours()).padStart(2, '0')
  const mi = String(now.getMinutes()).padStart(2, '0')
  const ss = String(now.getSeconds()).padStart(2, '0')
  return `${yyyy}${mm}${dd}-${hh}${mi}${ss}`
}

function downloadJsonFile(filename, payload) {
  if (typeof document === 'undefined') {
    return false
  }

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: 'application/json;charset=utf-8',
  })
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.rel = 'noreferrer'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.setTimeout(() => {
    window.URL.revokeObjectURL(url)
  }, 1500)
  return true
}

function compareVersions(left, right) {
  const leftParts = String(left || '')
    .split('.')
    .map((value) => Number(value) || 0)
  const rightParts = String(right || '')
    .split('.')
    .map((value) => Number(value) || 0)
  const length = Math.max(leftParts.length, rightParts.length)
  for (let index = 0; index < length; index += 1) {
    const delta = (leftParts[index] || 0) - (rightParts[index] || 0)
    if (delta !== 0) {
      return delta
    }
  }
  return 0
}

export function useExtension() {
  const environment = useMemo(() => detectClientEnvironment(), [])
  const supportsBridge = environment.extensionCapable
  const useWebFallback = environment.mobile || !supportsBridge
  const [ready, setReady] = useState(useWebFallback)
  const [detected, setDetected] = useState(useWebFallback)
  const [bridgeDetected, setBridgeDetected] = useState(false)
  const [webMemoryCount, setWebMemoryCount] = useState(0)
  const [statusInfo, setStatusInfo] = useState(null)
  const pending = useRef(new Map())

  useEffect(() => {
    let cancelled = false

    initializeWebMemoryStore(environment).then((init) => {
      if (cancelled) {
        return
      }
      setWebMemoryCount(Number(init?.memoryCount || 0))
    })

    if (useWebFallback) {
      setReady(true)
      setDetected(true)
    }

    return () => {
      cancelled = true
    }
  }, [environment, useWebFallback])

  const sendToExtension = useCallback((type, payload = {}, timeoutMs = 5000) => {
    if (!supportsWindowMessaging()) {
      return Promise.resolve(null)
    }

    return new Promise((resolve) => {
      const requestId = Math.random().toString(36).slice(2)
      const timer = window.setTimeout(() => {
        pending.current.delete(requestId)
        resolve(null)
      }, timeoutMs)

      pending.current.set(requestId, (value) => {
        window.clearTimeout(timer)
        resolve(value)
      })

      window.postMessage({ type, payload, requestId }, '*')
    })
  }, [])

  const sendWithRetry = useCallback(async (type, payload = {}, options = {}) => {
    const {
      maxRetries = 6,
      initialDelay = 150,
      maxDelay = 1000,
      timeoutMs = 1200,
    } = options

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const response = await sendToExtension(type, payload, timeoutMs)
      if (response && !response.error) {
        return response
      }
      if (attempt === maxRetries) {
        return response
      }
      const delay = Math.min(initialDelay * Math.pow(1.5, attempt), maxDelay)
      await sleep(delay)
    }

    return null
  }, [sendToExtension])

  useEffect(() => {
    if (!supportsWindowMessaging() || !supportsBridge) {
      return undefined
    }

    if (document?.documentElement?.dataset?.memactBridge === 'ready') {
      setDetected(true)
      setBridgeDetected(true)
    }

    const onMessage = (event) => {
      if (event.source !== window) {
        return
      }

      const data = event.data || {}
      if (data.type === 'MEMACT_EXTENSION_READY') {
        setDetected(true)
        setBridgeDetected(true)
        return
      }

      if (!isResponseType(data.type)) {
        return
      }

      setDetected(true)
      setBridgeDetected(true)

      const resolver = pending.current.get(data.requestId)
      if (!resolver) {
        return
      }

      pending.current.delete(data.requestId)

      if (data.type === 'MEMACT_ERROR') {
        resolver({ error: data.error || 'Extension bridge failed.' })
        return
      }

      if (data.type === 'MEMACT_STATUS_RESULT' && data.status) {
        setDetected(true)
        setBridgeDetected(true)
        setReady(Boolean(data.status.ready))
        setStatusInfo(data.status)
      }

      resolver(data.results ?? data.status ?? data.stats ?? data.response ?? null)
    }

    window.addEventListener('message', onMessage)

    let cancelled = false
    const probe = async () => {
      while (!cancelled) {
        const status = await sendWithRetry('MEMACT_STATUS', {}, {
          maxRetries: 8,
          initialDelay: 150,
          maxDelay: 1000,
          timeoutMs: 900,
        })
        if (cancelled) {
          return
        }
        if (status && !status.error) {
          setDetected(true)
          setReady(Boolean(status.ready))
          setStatusInfo(status)
          return
        }
        await sleep(1800)
      }
    }
    probe()

    return () => {
      cancelled = true
      window.removeEventListener('message', onMessage)
    }
  }, [sendWithRetry, supportsBridge])

  const search = useCallback((query, limit = 20) => {
    if (useWebFallback && !bridgeDetected) {
      return webMemorySearch(query, limit, environment)
    }
    return sendToExtension('MEMACT_SEARCH', { query, limit })
  }, [bridgeDetected, environment, sendToExtension, useWebFallback])

  const getSuggestions = useCallback((query = '', timeFilter = null, limit = 6) => {
    if (useWebFallback && !bridgeDetected) {
      return webMemorySuggestions(query, timeFilter, limit)
    }
    return sendToExtension('MEMACT_SUGGESTIONS', { query, timeFilter, limit })
  }, [bridgeDetected, sendToExtension, useWebFallback])

  const getStatus = useCallback(() => {
    if (useWebFallback && !bridgeDetected) {
      return webMemoryStatus(environment)
    }
    return sendToExtension('MEMACT_STATUS', {})
  }, [bridgeDetected, environment, sendToExtension, useWebFallback])

  const getStats = useCallback(() => {
    if (useWebFallback && !bridgeDetected) {
      return webMemoryStats()
    }
    return sendToExtension('MEMACT_STATS', {})
  }, [bridgeDetected, sendToExtension, useWebFallback])

  const clearAllData = useCallback(async () => {
    if (useWebFallback && !bridgeDetected) {
      const response = await clearWebMemories()
      if (response?.ok) {
        setWebMemoryCount(0)
      }
      return response
    }
    return sendToExtension('MEMACT_CLEAR_ALL_DATA', {})
  }, [bridgeDetected, sendToExtension, useWebFallback])

  const getCaptanetEvents = useCallback(
    async ({ limit = 3000 } = {}) => {
      if (!bridgeDetected) {
        return { ok: false, error: 'Captanet snapshot export requires the extension bridge.' }
      }
      return sendToExtension('CAPTANET_GET_EVENTS', { limit })
    },
    [bridgeDetected, sendToExtension]
  )

  const getCaptanetSessions = useCallback(
    async ({ limit = 3000 } = {}) => {
      if (!bridgeDetected) {
        return { ok: false, error: 'Captanet snapshot export requires the extension bridge.' }
      }
      return sendToExtension('CAPTANET_GET_SESSIONS', { limit })
    },
    [bridgeDetected, sendToExtension]
  )

  const getCaptanetActivities = useCallback(
    async ({ limit = 3000 } = {}) => {
      if (!bridgeDetected) {
        return { ok: false, error: 'Captanet snapshot export requires the extension bridge.' }
      }
      return sendToExtension('CAPTANET_GET_ACTIVITIES', { limit })
    },
    [bridgeDetected, sendToExtension]
  )

  const getCaptanetSnapshot = useCallback(
    async ({ limit = 3000 } = {}) => {
      if (!bridgeDetected) {
        return { ok: false, error: 'Captanet snapshot export requires the extension bridge.' }
      }
      return sendToExtension('CAPTANET_GET_SNAPSHOT', { limit }, 15000)
    },
    [bridgeDetected, sendToExtension]
  )

  const exportCaptanetSnapshot = useCallback(
    async ({
      limit = 3000,
      filename = `captanet-snapshot-${timestampFilePart()}.json`,
      download = true,
    } = {}) => {
      const response = await getCaptanetSnapshot({ limit })
      if (!response || response.ok === false || !response.snapshot) {
        return {
          ok: false,
          error: response?.error || 'Could not export the Captanet snapshot.',
          snapshot: null,
          filename: '',
        }
      }

      if (download) {
        downloadJsonFile(filename, response.snapshot)
      }

      return {
        ok: true,
        error: '',
        snapshot: response.snapshot,
        filename,
      }
    },
    [getCaptanetSnapshot]
  )

  const mode = bridgeDetected ? 'extension' : useWebFallback ? 'web-fallback' : 'bridge-required'
  const requiresBridge = mode === 'bridge-required'
  const extensionVersion = statusInfo?.extensionVersion || ''
  const extensionOutdated =
    Boolean(extensionVersion) && compareVersions(extensionVersion, REQUIRED_EXTENSION_VERSION) < 0

  return useMemo(
    () => ({
      ready,
      detected,
      bridgeDetected,
      mode,
      requiresBridge,
      environment,
      webMemoryCount,
      extensionVersion,
      expectedExtensionVersion: REQUIRED_EXTENSION_VERSION,
      extensionOutdated,
      statusInfo,
      search,
      getSuggestions,
      getStatus,
      getStats,
      getCaptanetEvents,
      getCaptanetSessions,
      getCaptanetActivities,
      getCaptanetSnapshot,
      exportCaptanetSnapshot,
      clearAllData,
      sendToExtension,
    }),
    [
      bridgeDetected,
      clearAllData,
      detected,
      environment,
      REQUIRED_EXTENSION_VERSION,
      extensionOutdated,
      extensionVersion,
      exportCaptanetSnapshot,
      getStatus,
      getStats,
      getCaptanetActivities,
      getCaptanetEvents,
      getCaptanetSessions,
      getCaptanetSnapshot,
      getSuggestions,
      mode,
      ready,
      requiresBridge,
      search,
      sendToExtension,
      statusInfo,
      webMemoryCount,
    ]
  )
}
