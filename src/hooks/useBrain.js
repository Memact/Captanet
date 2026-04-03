import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { normalizeResult } from './useSearch'

function normalize(value, maxLen = 4000) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
  if (!text) {
    return ''
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text
}

function humanizeBrainError(value) {
  const normalized = normalize(value, 240)
  const lower = normalized.toLowerCase()

  if (!normalized) {
    return 'Memact could not finish that reply.'
  }
  if (lower === 'model_load_timeout') {
    return 'Memact is still loading the on-device model. Give it a little more time and try again.'
  }
  if (lower === 'generation_start_timeout' || lower === 'generation_stream_timeout') {
    return 'Memact took too long to finish that reply. Try again once the model settles.'
  }
  if (lower === 'webgpu_unavailable') {
    return 'Memact needs WebGPU on this device before the on-device model can run.'
  }
  return normalized
}

function createRequestId() {
  return `brain-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function createTurn(query, turnId = '') {
  return {
    id: turnId || `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    query: normalize(query, 500),
    createdAt: new Date().toISOString(),
    pending: true,
    error: '',
    results: [],
    webSources: [],
    answerMeta: {
      answer: '',
      summary: '',
      pointers: [],
      selectedEvidenceIds: [],
      insufficientEvidence: false,
      detailsLabel: 'View sources',
    },
  }
}

function postToBridge(type, payload = {}, requestId = createRequestId()) {
  window.postMessage({ type, payload, requestId }, '*')
  return requestId
}

function normalizeWebResult(item, index = 0) {
  const title = normalize(item?.title || item?.summary || `Web result ${index + 1}`, 180)
  if (!title) {
    return null
  }

  return {
    id: normalize(item?.id || `${index}-${title}`, 120),
    title,
    url: normalize(item?.url, 320),
    summary: normalize(item?.summary, 260),
    date: normalize(item?.date, 80),
  }
}

function normalizeAnswerMeta(item, text) {
  if (!item || typeof item !== 'object') {
    return {
      answer: normalize(text, 12000),
      summary: '',
      pointers: [],
      selectedEvidenceIds: [],
      insufficientEvidence: false,
      detailsLabel: 'View sources',
    }
  }

  return {
    overview: normalize(item?.overview, 200),
    answer: normalize(item?.answer || text, 12000),
    summary: normalize(item?.summary, 400),
    pointers: Array.isArray(item?.pointers)
      ? item.pointers.map((value) => normalize(value, 240)).filter(Boolean)
      : [],
    selectedEvidenceIds: Array.isArray(item?.selectedEvidenceIds)
      ? item.selectedEvidenceIds.map((value) => normalize(value, 80)).filter(Boolean)
      : [],
    insufficientEvidence: Boolean(item?.insufficientEvidence),
    detailsLabel: normalize(item?.detailsLabel, 80) || 'View sources',
    fallbackMode: Boolean(item?.fallbackMode),
  }
}

export function useBrain(extension) {
  const [turns, setTurns] = useState([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isModelLoading, setIsModelLoading] = useState(false)
  const [modelLoadProgress, setModelLoadProgress] = useState(0)
  const [loadingText, setLoadingText] = useState('')
  const [templateMode, setTemplateMode] = useState(false)
  const [lastError, setLastError] = useState('')
  const pendingRequestsRef = useRef(new Map())
  const queuedQueriesRef = useRef([])
  const sendQueryRef = useRef(null)
  const warmRequestedRef = useRef(false)

  const flushQueue = useCallback(
    (sendImpl) => {
      if (pendingRequestsRef.current.size) {
        return
      }
      const next = queuedQueriesRef.current.shift()
      if (next) {
        sendImpl(next.query, next.options)
      }
    },
    []
  )

  const refreshStatus = useCallback(() => {
    if (!extension?.bridgeDetected) {
      return
    }
    postToBridge('MEMACT_BRAIN_STATUS')
  }, [extension?.bridgeDetected])

  const stopTurn = useCallback(
    (turn) => {
      const turnId = normalize(turn?.id, 120)
      if (!turnId) {
        return false
      }

      const pendingEntry = [...pendingRequestsRef.current.entries()].find(
        ([, pending]) => pending.turnId === turnId
      )
      if (!pendingEntry) {
        return false
      }

      const [requestId] = pendingEntry
      pendingRequestsRef.current.delete(requestId)
      postToBridge('MEMACT_BRAIN_STOP', {
        targetRequestId: requestId,
      })

      setTurns((current) =>
        current.map((entry) => {
          if (entry.id !== turnId) {
            return entry
          }
          const partialAnswer = normalize(entry?.answerMeta?.answer, 12000)
          const partialSummary = normalize(entry?.answerMeta?.summary, 400)
          return {
            ...entry,
            pending: false,
            error: '',
            answerMeta: {
              ...normalizeAnswerMeta(entry?.answerMeta, partialAnswer),
              answer: partialAnswer,
              summary: partialSummary || (partialAnswer ? '' : 'Stopped before the reply finished.'),
            },
          }
        })
      )

      setIsStreaming(pendingRequestsRef.current.size > 0)
      if (!pendingRequestsRef.current.size) {
        setLoadingText('')
      }
      setLastError('')
      if (typeof sendQueryRef.current === 'function') {
        flushQueue(sendQueryRef.current)
      }
      return true
    },
    [flushQueue]
  )

  useEffect(() => {
    if (!extension?.bridgeDetected) {
      warmRequestedRef.current = false
      return undefined
    }

    const onMessage = (event) => {
      if (event.source !== window) {
        return
      }

      const data = event.data || {}
      if (!String(data.type || '').startsWith('MEMACT_BRAIN_')) {
        return
      }

      if (data.type === 'MEMACT_BRAIN_STATUS_RESULT') {
        const response = data.response || {}
        setIsModelLoading(Boolean(response.loading))
        setModelLoadProgress(Number(response.progress || 0))
        setLoadingText(normalize(response.text, 180))
        setTemplateMode(Boolean(response.fallbackMode))
        return
      }

      if (data.type === 'MEMACT_BRAIN_PROGRESS') {
        setIsModelLoading(Boolean(data.loading))
        setModelLoadProgress(Number(data.progress || 0))
        setLoadingText(normalize(data.text, 180))
        setTemplateMode(Boolean(data.fallbackMode))
        const pending = pendingRequestsRef.current.get(data.requestId)
        if (pending) {
          setTurns((current) =>
            current.map((turn) =>
              turn.id === pending.turnId
                ? {
                    ...turn,
                    pending: true,
                  }
                : turn
            )
          )
        }
        return
      }

      if (data.type === 'MEMACT_BRAIN_QUERY_ACK') {
        if (data.response?.ok === false) {
          const pending = pendingRequestsRef.current.get(data.requestId)
          if (pending) {
            pendingRequestsRef.current.delete(data.requestId)
            setTurns((current) =>
              current.map((turn) =>
                turn.id === pending.turnId
                  ? {
                      ...turn,
                      pending: false,
                      error: humanizeBrainError(data.response?.error || 'Memact could not start that reply.'),
                    }
                  : turn
              )
            )
          }
          setIsStreaming(false)
          setLastError(humanizeBrainError(data.response?.error || 'Memact could not start that reply.'))
        }
        return
      }

      const pending = pendingRequestsRef.current.get(data.requestId)
      if (!pending) {
        return
      }

      if (data.type === 'MEMACT_BRAIN_TOKEN') {
        setTurns((current) =>
          current.map((turn) =>
            turn.id === pending.turnId
              ? {
                  ...turn,
                  pending: true,
                  answerMeta: {
                    ...turn.answerMeta,
                    answer: `${turn.answerMeta?.answer || ''}${data.token || ''}`,
                  },
                }
              : turn
          )
        )
        setIsStreaming(true)
        setLoadingText('Memact is replying...')
        return
      }

      if (data.type === 'MEMACT_BRAIN_DONE') {
        pendingRequestsRef.current.delete(data.requestId)
        setTurns((current) =>
          current.map((turn) =>
            turn.id === pending.turnId
              ? {
                  ...turn,
                  pending: false,
                  error: '',
                  results: Array.isArray(data.results)
                    ? data.results.map((result, index) => normalizeResult(result, index))
                    : [],
                  webSources: Array.isArray(data.webResults)
                    ? data.webResults
                        .map((result, index) => normalizeWebResult(result, index))
                        .filter(Boolean)
                    : [],
                  answerMeta: normalizeAnswerMeta(data.answerMeta, data.text),
                }
              : turn
          )
        )
        setIsStreaming(false)
        setIsModelLoading(false)
        setModelLoadProgress(1)
        setLoadingText('')
        setTemplateMode(Boolean(data.fallbackMode))
        if (typeof sendQueryRef.current === 'function') {
          flushQueue(sendQueryRef.current)
        }
        return
      }

      if (data.type === 'MEMACT_BRAIN_ERROR') {
        pendingRequestsRef.current.delete(data.requestId)
        const errorMessage = humanizeBrainError(data.error || 'Memact could not finish that reply.')
        setTurns((current) =>
          current.map((turn) =>
            turn.id === pending.turnId
              ? {
                  ...turn,
                  pending: false,
                  error: errorMessage,
                }
              : turn
          )
        )
        setLastError(errorMessage)
        setIsStreaming(false)
        setIsModelLoading(false)
        if (typeof sendQueryRef.current === 'function') {
          flushQueue(sendQueryRef.current)
        }
      }
    }

    window.addEventListener('message', onMessage)
    refreshStatus()
    return () => {
      window.removeEventListener('message', onMessage)
    }
  }, [extension?.bridgeDetected, flushQueue, refreshStatus])

  useEffect(() => {
    if (!extension?.bridgeDetected || warmRequestedRef.current) {
      return
    }

    warmRequestedRef.current = true
    postToBridge('MEMACT_BRAIN_WARM')
  }, [extension?.bridgeDetected])

  const sendQuery = useCallback(
    async (queryText, options = {}) => {
      const normalizedQuery = normalize(queryText, 500)
      if (!normalizedQuery) {
        return null
      }

      if (pendingRequestsRef.current.size) {
        queuedQueriesRef.current.push({ query: normalizedQuery, options })
        return null
      }

      const sessionId = normalize(options.sessionId || 'default', 120)
      const turnId = normalize(options.turnId, 120) || `turn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      setLastError('')
      setIsStreaming(true)
      setLoadingText(extension?.bridgeDetected ? 'Memact is preparing your reply...' : 'Recalling your saved memory...')
      setTurns((current) => {
        const baseTurn = createTurn(normalizedQuery, turnId)
        if (options.replaceExistingTurn) {
          return current.map((turn) => (turn.id === turnId ? baseTurn : turn))
        }
        return [...current, baseTurn]
      })

      if (!extension?.bridgeDetected && typeof extension?.search === 'function') {
        try {
          const response = await extension.search(normalizedQuery, 20)
          const rawResults = Array.isArray(response)
            ? response
            : Array.isArray(response?.results)
              ? response.results
              : []
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    pending: false,
                    results: rawResults.map((result, index) => normalizeResult(result, index)),
                    webSources: [],
                    answerMeta: normalizeAnswerMeta(
                      response?.answer,
                      response?.answer?.answer || response?.answer?.summary || ''
                    ),
                  }
                : turn
            )
          )
          setIsStreaming(false)
          setLoadingText('')
          return turnId
        } catch (error) {
          const message = normalize(error?.message || error || 'Recall failed.', 240)
          setTurns((current) =>
            current.map((turn) =>
              turn.id === turnId
                ? {
                    ...turn,
                    pending: false,
                    error: message,
                  }
                : turn
            )
          )
          setLastError(message)
          setIsStreaming(false)
          setLoadingText('')
          return null
        }
      }

      if (!extension?.bridgeDetected) {
        const message = 'Memact is unavailable because the extension bridge is not connected.'
        setTurns((current) =>
          current.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  pending: false,
                  error: message,
                }
              : turn
          )
        )
        setLastError(message)
        setIsStreaming(false)
        return null
      }

      const requestId = postToBridge(
        'MEMACT_BRAIN_QUERY',
        {
          query: normalizedQuery,
          sessionId,
        }
      )

      pendingRequestsRef.current.set(requestId, {
        turnId,
        sessionId,
      })
      return requestId
    },
    [extension?.bridgeDetected, extension?.search]
  )

  useEffect(() => {
    sendQueryRef.current = sendQuery
  }, [sendQuery])

  const regenerateTurn = useCallback(
    (turn, options = {}) => {
      if (!turn?.id || !turn?.query) {
        return
      }

      setTurns((current) =>
        current.map((entry) =>
          entry.id === turn.id
            ? {
                ...createTurn(turn.query, turn.id),
                createdAt: new Date().toISOString(),
              }
            : entry
        )
      )
      sendQuery(turn.query, {
        sessionId: options.sessionId || 'default',
        turnId: turn.id,
        replaceExistingTurn: true,
      })
    },
    [sendQuery]
  )

  const clearConversation = useCallback(
    (sessionId = 'default') => {
      setTurns([])
      setLastError('')
      setIsStreaming(false)
      setLoadingText('')
      setModelLoadProgress(0)
      queuedQueriesRef.current = []
      pendingRequestsRef.current.clear()
      if (extension?.bridgeDetected) {
        postToBridge('MEMACT_BRAIN_CLEAR_SESSION', {
          sessionId,
        })
      }
    },
    [extension?.bridgeDetected]
  )

  const hydrateConversation = useCallback((storedTurns = []) => {
    setTurns(Array.isArray(storedTurns) ? storedTurns : [])
    setLastError('')
    setIsStreaming(false)
  }, [])

  return useMemo(
    () => ({
      turns,
      isStreaming,
      isModelLoading,
      modelLoadProgress,
      loadingText,
      templateMode,
      lastError,
      sendQuery,
      regenerateTurn,
      stopTurn,
      clearConversation,
      hydrateConversation,
      refreshStatus,
      setTurns,
    }),
    [
      clearConversation,
      hydrateConversation,
      isModelLoading,
      isStreaming,
      lastError,
      loadingText,
      modelLoadProgress,
      refreshStatus,
      regenerateTurn,
      sendQuery,
      stopTurn,
      templateMode,
      turns,
    ]
  )
}
