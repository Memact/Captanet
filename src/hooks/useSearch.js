import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const RECENT_SEARCHES_KEY = 'memact.recent-searches'
const MAX_RECENTS = 10
const SUGGESTION_LIMIT = 12
function normalize(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeRichText(value) {
  const text = String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const blocks = text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split(/\n+/)
        .map((line) => line.replace(/[ \t]+/g, ' ').trim())
        .filter(Boolean)
        .join('\n')
    )
    .filter(Boolean)
  return blocks.join('\n\n').trim()
}

function toHistoryEntry(entry) {
  if (typeof entry === 'string') {
    const query = normalize(entry)
    return query ? { query, timestamp: '' } : null
  }

  if (!entry || typeof entry !== 'object') {
    return null
  }

  const query = normalize(entry.query)
  if (!query) {
    return null
  }

  const timestamp = normalize(entry.timestamp)
  return { query, timestamp }
}

function readRecentSearches() {
  try {
    const raw = window.localStorage.getItem(RECENT_SEARCHES_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    if (!Array.isArray(parsed)) {
      return []
    }
    return parsed
      .map(toHistoryEntry)
      .filter(Boolean)
      .slice(0, MAX_RECENTS)
  } catch {
    return []
  }
}

function writeRecentSearches(items) {
  try {
    window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(items.slice(0, MAX_RECENTS)))
  } catch {
    // Ignore storage failures.
  }
}

function formatDomain(url, fallback = '') {
  try {
    return url ? new URL(url).hostname.replace(/^www\./, '') : fallback
  } catch {
    return fallback
  }
}

function formatMetaValue(label, value) {
  const normalizedLabel = normalize(label).toLowerCase()
  const normalizedValue = normalize(value)
  if (!normalizedValue) {
    return ''
  }

  if (['captured', 'started', 'ended', 'last seen'].includes(normalizedLabel)) {
    const timestamp = Date.parse(normalizedValue)
    if (Number.isFinite(timestamp)) {
      try {
        return new Intl.DateTimeFormat(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit',
        })
          .format(new Date(timestamp))
          .replace(',', ' \u2022')
      } catch {
        return normalizedValue
      }
    }
  }

  return normalizedValue
}

export function normalizeResult(item, index = 0) {
  const url = normalize(item?.url)
  const domain = formatDomain(url, normalize(item?.domain || item?.application))
  const title =
    normalize(item?.window_title || item?.title || item?.pageTitle || item?.name) ||
    domain ||
    'Memory'

  const rawFullText = normalizeRichText(item?.raw_full_text || item?.rawFullText || item?.full_text || item?.fullText)
  const displayFullText = normalizeRichText(
    item?.display_full_text || item?.displayFullText || rawFullText
  )
  const snippet = normalize(
    item?.content_text ||
      item?.snippet ||
      item?.summary_snippet ||
      displayFullText ||
      item?.searchable_text
  )

  const keyphrases = (() => {
    const raw = item?.keyphrases_json || item?.keyphrases || '[]'
    if (Array.isArray(raw)) return raw.filter(Boolean)
    try {
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed.filter(Boolean) : []
    } catch {
      return []
    }
  })()

  return {
    id: item?.id || `${index}-${title}`,
    title,
    url,
    displayUrl: normalize(item?.display_url || item?.displayUrl || url),
    domain,
    application: normalize(item?.application) || 'Browser',
    occurred_at: item?.occurred_at || item?.captured_at || '',
    snippet,
    fullText: displayFullText,
    rawFullText,
    keyphrases,
    similarity: Number(item?.similarity || item?.score || 0),
    session: item?.session || item?.episode || null,
    source: item?.source || item?.source_type || 'extension',
    interactionType: item?.interaction_type || '',
    duplicateCount: Math.max(1, Number(item?.duplicate_count || item?.duplicateCount || 1)),
    beforeContext: normalize(item?.before_context || item?.beforeContext),
    afterContext: normalize(item?.after_context || item?.afterContext),
    momentSummary: normalize(item?.moment_summary || item?.momentSummary),
    pageType: normalize(item?.page_type || item?.pageType),
    pageTypeLabel: normalize(item?.page_type_label || item?.pageTypeLabel),
    structuredSummary: normalize(item?.structured_summary || item?.structuredSummary),
    displayExcerpt: normalize(item?.display_excerpt || item?.displayExcerpt),
    contextSubject: normalize(item?.context_subject || item?.contextSubject),
    contextEntities: Array.isArray(item?.context_entities || item?.contextEntities)
      ? (item?.context_entities || item?.contextEntities).map((value) => normalize(value)).filter(Boolean)
      : [],
    contextTopics: Array.isArray(item?.context_topics || item?.contextTopics)
      ? (item?.context_topics || item?.contextTopics).map((value) => normalize(value)).filter(Boolean)
      : [],
    factItems: Array.isArray(item?.fact_items || item?.factItems)
      ? (item?.fact_items || item?.factItems)
          .map((entry) => ({
            label: normalize(entry?.label),
            value: normalize(entry?.value),
          }))
          .filter((entry) => entry.label && entry.value)
      : [],
    searchResults: Array.isArray(item?.search_results || item?.searchResults)
      ? (item?.search_results || item?.searchResults).map((value) => normalize(value)).filter(Boolean)
      : [],
    derivativeItems: Array.isArray(item?.derivative_items || item?.derivativeItems)
      ? (item?.derivative_items || item?.derivativeItems)
          .map((entry) => ({
            kind: normalize(entry?.kind),
            label: normalize(entry?.label),
            text: normalizeRichText(entry?.text),
          }))
          .filter((entry) => entry.text)
      : [],
    graphSummary: normalize(item?.graph_summary || item?.graphSummary),
    connectedEvents: Array.isArray(item?.connected_events || item?.connectedEvents)
      ? (item?.connected_events || item?.connectedEvents)
          .map((entry) => ({
            id: normalize(entry?.event_id || entry?.id),
            title: normalize(entry?.title),
            url: normalize(entry?.url),
            domain: normalize(entry?.domain),
            application: normalize(entry?.application),
            occurred_at: normalize(entry?.occurred_at),
            pageType: normalize(entry?.page_type || entry?.pageType),
            relationshipType: normalize(entry?.relationship_type || entry?.relationshipType),
            relationshipLabel:
              normalize(entry?.relationship_label || entry?.relationshipLabel) ||
              normalize(entry?.relationship_type || entry?.relationshipType),
            relationshipScore: Number(entry?.relationship_score ?? entry?.relationshipScore ?? 0),
            relationshipReason:
              normalize(entry?.relationship_reason || entry?.relationshipReason),
            direction: normalize(entry?.direction),
          }))
          .filter((entry) => entry.title)
      : [],
    raw: item || {},
  }
}

function normalizeSuggestion(item, index = 0) {
  const completion = normalize(item?.completion || item?.title || item)
  if (!completion) {
    return null
  }

  return {
    id: normalize(item?.id) || `suggestion-${index}-${completion.toLowerCase()}`,
    category: normalize(item?.category) || 'Recent memory',
    title: normalize(item?.title) || completion,
    subtitle: normalize(item?.subtitle) || 'Saved locally on this device.',
    completion,
  }
}

function pushSuggestionItem(items, seen, entry) {
  const normalized = normalizeSuggestion(entry, items.length)
  if (!normalized) {
    return
  }

  const key = normalized.completion.toLowerCase()
  if (seen.has(key)) {
    return
  }

  seen.add(key)
  items.push(normalized)
}

function suggestionMatches(item, query) {
  const normalizedQuery = normalize(query).toLowerCase()
  if (!normalizedQuery) {
    return true
  }

  const haystack = [
    item?.title,
    item?.subtitle,
    item?.completion,
    item?.category,
  ]
    .map((value) => normalize(value).toLowerCase())
    .join(' ')

  return normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .every((token) => haystack.includes(token))
}

function filterSuggestions(items, query, limit = SUGGESTION_LIMIT) {
  return items.filter((item) => suggestionMatches(item, query)).slice(0, limit)
}

function normalizeAnswerMeta(item) {
  if (!item || typeof item !== 'object') {
    return null
  }

  const detailItems = Array.isArray(item.detailItems)
    ? item.detailItems
        .map((entry) => ({
          label: normalize(entry?.label),
          value: formatMetaValue(entry?.label, entry?.value),
        }))
        .filter((entry) => entry.label && entry.value)
    : []

  const signals = Array.isArray(item.signals)
    ? item.signals.map((value) => normalize(value)).filter(Boolean)
    : []

  const relatedQueries = Array.isArray(item.relatedQueries)
    ? item.relatedQueries.map((value) => normalize(value)).filter(Boolean)
    : []

  const sessionPrompts = Array.isArray(item.sessionPrompts)
    ? item.sessionPrompts.map((value) => normalize(value)).filter(Boolean)
    : []

  const pointers = Array.isArray(item.pointers)
    ? item.pointers.map((value) => normalize(value)).filter(Boolean)
    : []

  return {
    overview: normalize(item.overview),
    answer: normalize(item.answer),
    summary: normalize(item.summary),
    detailsLabel: normalize(item.detailsLabel) || 'Show sources',
    detailItems,
    signals,
    sessionSummary: normalize(item.sessionSummary),
    sessionPrompts,
    relatedQueries,
    pointers,
    selectedEvidenceIds: Array.isArray(item.selectedEvidenceIds)
      ? item.selectedEvidenceIds.map((value) => normalize(value, 80)).filter(Boolean)
      : [],
    insufficientEvidence: Boolean(item.insufficientEvidence),
    confidence: normalize(item.confidence),
  }
}

function humanJoin(values) {
  const items = Array.isArray(values) ? values.filter(Boolean) : []
  if (!items.length) {
    return ''
  }
  if (items.length === 1) {
    return items[0]
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`
  }
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function describeResultForAnswer(result) {
  const title = normalize(result?.title, 120)
  const site = normalize(result?.domain || result?.displayUrl, 60)
  const pageType = normalize(result?.pageTypeLabel || result?.pageType, 40).toLowerCase()
  const query = normalize(result?.searchQuery || result?.contextSubject, 100)

  if (pageType.includes('search') && query) {
    return `search results for "${query}"`
  }
  if (pageType.includes('documentation') && site) {
    return `documentation on ${site}`
  }
  if (title && site && pageType.includes('video')) {
    return `${title} on ${site}`
  }
  if (title) {
    return title
  }
  if (site && pageType) {
    return `${pageType} on ${site}`
  }
  return site || pageType
}

function buildFallbackAnswerMeta(query, results) {
  const normalizedQuery = normalize(query, 140)
  const safeResults = Array.isArray(results) ? results.filter(Boolean) : []
  if (!normalizedQuery || !safeResults.length) {
    return null
  }

  const top = safeResults[0] || {}
  const resultCount = safeResults.length
  const topTitle = normalize(top.title, 160)
  const topSite = normalize(top.domain || top.displayUrl, 80)
  const topSummary = normalize(top.structuredSummary || top.displayExcerpt || top.snippet, 260)
  const topApp = normalize(top.application, 48)
  const queryLower = normalizedQuery.toLowerCase()
  const recentQuestion = /\b(today|yesterday|this week|last week|recent|lately)\b/.test(queryLower)
  const broadQuestion =
    recentQuestion ||
    /\b(what did i|what was i|what have i|where was i|summary|summarize|recap|activity|activities|doing|worked on|focus|focused)\b/.test(
      queryLower
    )
  const sourceMentions = safeResults
    .slice(0, 4)
    .map(describeResultForAnswer)
    .filter(Boolean)
  const selectedEvidenceIds = safeResults
    .map((result) => normalize(result?.id, 80))
    .filter(Boolean)
    .slice(0, 5)

  const pointers = safeResults
    .slice(0, 4)
    .map((result) => {
      const title = normalize(result?.title, 150)
      const site = normalize(result?.domain || result?.displayUrl, 72)
      const summary = normalize(result?.structuredSummary || result?.displayExcerpt || result?.snippet, 180)

      if (summary) {
        return summary
      }

      if (title && site) {
        return `${title} on ${site}.`
      }

      return title || ''
    })
    .filter(Boolean)

  const answer = broadQuestion
    ? sourceMentions.length
      ? `Your saved memory points to ${humanJoin(sourceMentions)}.`
      : `I found ${resultCount} saved memories related to "${normalizedQuery}".`
    : topSummary
      ? topSummary
      : sourceMentions.length
        ? recentQuestion
          ? `Your recent memory points to ${humanJoin(sourceMentions)}.`
          : `The strongest memory trail points to ${humanJoin(sourceMentions)}.`
        : topTitle
          ? `The closest saved memory is ${topTitle}${topSite ? ` on ${topSite}` : ''}.`
          : `I found ${resultCount} saved memories related to "${normalizedQuery}".`

  const summary = broadQuestion
    ? resultCount > 1
      ? `I found ${resultCount} matched memories${topApp ? `, mostly in ${topApp}` : ''}, with the strongest trail moving through ${humanJoin(
          sourceMentions.slice(0, 3)
        )}.`
      : `I found one saved memory connected to this question${topSite ? ` on ${topSite}` : ''}.`
    : resultCount > 1
      ? recentQuestion
        ? `I found ${resultCount} recent memories that connect to this question${topApp ? `, mostly in ${topApp}` : ''}.`
        : `I found ${resultCount} saved memories connected to this question. The strongest trail starts with ${topTitle || 'the closest match'}${topSite ? ` on ${topSite}` : ''}.`
      : `I found one saved memory connected to this question${topSite ? ` on ${topSite}` : ''}.`

  return {
    overview: broadQuestion ? 'What your memory shows' : recentQuestion ? 'Recent memory trail' : 'Matched memories',
    answer,
    summary,
    detailsLabel: 'Show sources',
    detailItems: [],
    signals: [],
    sessionSummary: '',
    sessionPrompts: [],
    relatedQueries: [],
    pointers,
    selectedEvidenceIds,
    insufficientEvidence: resultCount < 2 && !topSummary,
    confidence: resultCount >= 3 ? 'medium' : 'low',
  }
}

function mergeRelatedQueries(current = [], next = []) {
  const seen = new Set()
  const output = []

  for (const value of [...current, ...next]) {
    const normalized = normalize(value, 180)
    if (!normalized) {
      continue
    }
    const key = normalized.toLowerCase()
    if (seen.has(key)) {
      continue
    }
    seen.add(key)
    output.push(normalized)
  }

  return output.slice(0, 6)
}

function dedupeNormalizedResults(items = []) {
  const buckets = new Map()

  for (const result of items) {
    const key = normalize(
      result?.id || `${result?.url || ''}|${result?.title || ''}|${result?.occurred_at || ''}`,
      320
    ).toLowerCase()

    if (!key) {
      continue
    }

    const existing = buckets.get(key)
    if (!existing || Number(result?.similarity || 0) > Number(existing?.similarity || 0)) {
      buckets.set(key, result)
    }
  }

  return [...buckets.values()].sort(
    (left, right) =>
      Number(right?.similarity || 0) - Number(left?.similarity || 0) ||
      String(right?.occurred_at || '').localeCompare(String(left?.occurred_at || ''))
  )
}

export function useSearch(extension, activeTimeFilter = null) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [recentEntries, setRecentEntries] = useState([])
  const [stats, setStats] = useState(null)
  const [status, setStatus] = useState(null)
  const [answerMeta, setAnswerMeta] = useState(null)
  const [loadingStage, setLoadingStage] = useState('')
  const [loadingProgress, setLoadingProgress] = useState(0)
  const latestSearchRef = useRef(0)
  const resultCacheRef = useRef(new Map())
  const progressTimerRef = useRef(null)

  const stopProgressTicker = useCallback(() => {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current)
      progressTimerRef.current = null
    }
  }, [])

  const startProgressTicker = useCallback(
    (cap) => {
      stopProgressTicker()
      progressTimerRef.current = window.setInterval(() => {
        setLoadingProgress((current) => {
          if (current >= cap) {
            return current
          }
          const next = current + Math.max(0.01, (cap - current) * 0.18)
          return Math.min(cap, next)
        })
      }, 110)
    },
    [stopProgressTicker]
  )

  useEffect(() => {
    return () => {
      stopProgressTicker()
    }
  }, [stopProgressTicker])

  useEffect(() => {
    if (typeof window === 'undefined') return
    setRecentEntries(readRecentSearches())
  }, [])

  useEffect(() => {
    if (!extension?.detected) {
      return
    }

    let cancelled = false
    Promise.all([extension.getStatus(), extension.getStats()]).then(([statusResult, statsResult]) => {
      if (cancelled) return
      setStatus(statusResult && !statusResult.error ? statusResult : null)
      setStats(statsResult && !statsResult.error ? statsResult : null)
    })

    return () => {
      cancelled = true
    }
  }, [extension])

  const persistSearch = useCallback((value) => {
    const normalized = normalize(value)
    if (!normalized) return

    setRecentEntries((current) => {
      const timestamp = new Date().toISOString()
      const next = [
        { query: normalized, timestamp },
        ...current.filter((entry) => entry.query.toLowerCase() !== normalized.toLowerCase()),
      ].slice(0, MAX_RECENTS)
      writeRecentSearches(next)
      return next
    })
  }, [])

  const removeHistoryQuery = useCallback((value) => {
    const normalized = normalize(value).toLowerCase()
    if (!normalized) return

    setRecentEntries((current) => {
      const next = current.filter((entry) => entry.query.toLowerCase() !== normalized)
      writeRecentSearches(next)
      return next
    })
  }, [])

  const clearHistory = useCallback(() => {
    writeRecentSearches([])
    setRecentEntries([])
  }, [])

  const runSearch = useCallback(
    async (value, options = {}) => {
      const normalized = normalize(value)
      const threadTurns = Array.isArray(options?.threadTurns) ? options.threadTurns : []
      const threadCacheKey = JSON.stringify(
        threadTurns.slice(-4).map((turn) => [
          normalize(turn?.query, 120),
          normalize(turn?.answerMeta?.answer, 120),
          normalize(turn?.answerMeta?.summary, 120),
        ])
      )
      const cacheKey = `${activeTimeFilter || 'all'}::${normalized.toLowerCase()}::${threadCacheKey}`
      const searchId = latestSearchRef.current + 1
      latestSearchRef.current = searchId
      if (!normalized) {
        setResults([])
        setAnswerMeta(null)
        setError('')
        setLoadingStage('')
        setLoadingProgress(0)
        return []
      }

      if (!extension?.detected) {
        setError('Memact extension is not connected.')
        setResults([])
        setAnswerMeta(null)
        setLoadingStage('')
        setLoadingProgress(0)
        return []
      }

      setLoading(true)
      setError('')
      setLoadingStage('Understanding your question...')
      setLoadingProgress(0.08)
      startProgressTicker(0.18)
      persistSearch(normalized)

      const cached = resultCacheRef.current.get(cacheKey)
      if (cached) {
        setResults(cached.results)
        setAnswerMeta(cached.answerMeta)
      }

      try {
        setLoadingStage('Recalling your local memory...')
        setLoadingProgress(0.22)
        startProgressTicker(0.5)
        const primaryResponse = await extension.search(normalized, 20)
        setLoadingProgress(0.56)
        setLoadingStage('Connecting the strongest memories...')
        setLoadingProgress(0.68)
        startProgressTicker(0.84)

        const usableResponses = [primaryResponse].filter((response) => response && !response.error)

        if (!usableResponses.length) {
          throw new Error(primaryResponse?.error || 'Recall failed.')
        }

        const bestResponse =
          usableResponses.find((response) => Array.isArray(response?.results) && response.results.length) ||
          usableResponses[0]

        const normalizedResults = dedupeNormalizedResults(
          usableResponses.flatMap((response) => {
            const items = Array.isArray(response)
              ? response
              : Array.isArray(response?.results)
                ? response.results
                : []
            return items.map(normalizeResult)
          })
        )
        const normalizedAnswerMeta =
          normalizeAnswerMeta(bestResponse?.answer || bestResponse?.answerMeta) ||
          buildFallbackAnswerMeta(normalized, normalizedResults)
        const enrichedAnswerMeta = normalizedAnswerMeta
        resultCacheRef.current.set(cacheKey, {
          results: normalizedResults,
          answerMeta: enrichedAnswerMeta,
        })
        setAnswerMeta(enrichedAnswerMeta)
        setResults(normalizedResults)
        setLoadingStage('Finishing the answer...')
        setLoadingProgress(0.94)

        if (latestSearchRef.current === searchId) {
          stopProgressTicker()
          setLoadingProgress(1)
        }

        return {
          query: normalized,
          results: normalizedResults,
          answerMeta: enrichedAnswerMeta,
          error: '',
        }
      } catch (err) {
        stopProgressTicker()
        const message = err?.message || 'Recall failed.'
        setError(message)
        setResults([])
        setAnswerMeta(null)
        setLoadingStage('')
        setLoadingProgress(0)
        return {
          query: normalized,
          results: [],
          answerMeta: null,
          error: message,
        }
      } finally {
        window.setTimeout(() => {
          if (latestSearchRef.current === searchId) {
            stopProgressTicker()
            setLoading(false)
            setLoadingStage('')
            setLoadingProgress(0)
          }
        }, 120)
      }
    },
    [activeTimeFilter, extension, persistSearch, startProgressTicker, stopProgressTicker]
  )

  const restoreSearchState = useCallback((snapshot = {}) => {
    latestSearchRef.current += 1
    setLoading(false)
    setError('')
    setQuery(normalize(snapshot.query || snapshot.lastSubmittedQuery))
    setResults(Array.isArray(snapshot.results) ? snapshot.results : [])
    setAnswerMeta(snapshot.answerMeta || null)
    setLoadingStage('')
    setLoadingProgress(0)
  }, [])

  const clearResults = useCallback(() => {
    latestSearchRef.current += 1
    setLoading(false)
    setError('')
    setResults([])
    setAnswerMeta(null)
    setLoadingStage('')
    setLoadingProgress(0)
  }, [])

  const recentSearches = useMemo(
    () => recentEntries.map((entry) => entry.query),
    [recentEntries]
  )

  return {
    query,
    setQuery,
    results,
    loading,
    error,
    status,
    stats,
    answerMeta,
    loadingStage,
    loadingProgress,
    recentEntries,
    recentSearches,
    runSearch,
    restoreSearchState,
    removeHistoryQuery,
    clearHistory,
    clearResults,
  }
}
