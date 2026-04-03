function normalize(value, maxLength = 0) {
  const text = String(value || '')
    .replace(/\s+/g, ' ')
    .trim()

  if (!text) {
    return ''
  }

  if (maxLength && text.length > maxLength) {
    return `${text.slice(0, maxLength - 3).trim()}...`
  }

  return text
}

function ensureQuestion(value) {
  const text = normalize(value, 180).replace(/[.!]+$/, '')
  if (!text) {
    return ''
  }
  return /[?]$/.test(text) ? text : `${text}?`
}

function looksLikeQuestion(value) {
  return /^(what|where|when|why|how|who|which|did|do|does|was|were|is|are|can|could|should|would|will|am|have|has|had)\b/i.test(
    normalize(value)
  )
}

function looksLikeSyntheticCommand(value) {
  return /^(show|find|open|results for|activity from|pages about|show memories from|show documentation for|show videos about)\b/i.test(
    normalize(value)
  )
}

function looksLikeOvertemplatedQuestion(value) {
  return /^(what do i remember about|what do i remember from|what was i searching about|where did i see|how have i been using)\b/i.test(
    normalize(value)
  )
}

function pushSuggestion(items, seen, entry) {
  const completion = normalize(entry?.completion || entry?.title, 180)
  if (!completion) {
    return
  }

  const key = completion.toLowerCase()
  if (seen.has(key)) {
    return
  }

  seen.add(key)
  items.push({
    id: normalize(entry?.id) || `suggestion-${items.length + 1}-${key}`,
    category: normalize(entry?.category) || 'Starter',
    title: normalize(entry?.title, 180) || completion,
    subtitle: normalize(entry?.subtitle, 120) || 'Grounded in local memory on this device.',
    completion,
  })
}

function buildHistoryAnchoredSuggestions(recentEntries = []) {
  return recentEntries
    .map((entry) => normalize(entry?.query || entry, 180))
    .filter(Boolean)
    .filter((query) => !looksLikeSyntheticCommand(query) && !looksLikeOvertemplatedQuestion(query))
    .map((query) => ({
      category: 'Recent chat',
      title: ensureQuestion(query),
      subtitle: 'Continue from something you already asked.',
      completion: ensureQuestion(query),
    }))
}

function buildAnswerAnchoredSuggestions(answerMeta = null) {
  const candidates = [
    ...(Array.isArray(answerMeta?.relatedQueries) ? answerMeta.relatedQueries : []),
    ...(Array.isArray(answerMeta?.sessionPrompts) ? answerMeta.sessionPrompts : []),
  ]

  return candidates
    .map((value) => normalize(value, 180))
    .filter(Boolean)
    .filter((value) => looksLikeQuestion(value) && !looksLikeSyntheticCommand(value))
    .map((value) => ({
      category: 'Connected memory',
      title: ensureQuestion(value),
      subtitle: 'Picked from nearby evidence and related memory.',
      completion: ensureQuestion(value),
    }))
}

function buildAiAnchoredSuggestions(aiQueries = []) {
  return aiQueries
    .map((value) => normalize(value, 180))
    .filter(Boolean)
    .map((value) => ({
      category: 'Suggested question',
      title: ensureQuestion(value),
      subtitle: 'Reframed from your current question.',
      completion: ensureQuestion(value),
    }))
}

function buildAiStarterSuggestions(aiStarters = []) {
  return aiStarters
    .map((value) => normalize(value, 180))
    .filter(Boolean)
    .filter((value) => looksLikeQuestion(value) && !looksLikeSyntheticCommand(value))
    .map((value) => ({
      category: 'Starter',
      title: ensureQuestion(value),
      subtitle: 'Grounded in recent memory and past chats.',
      completion: ensureQuestion(value),
    }))
}

function buildFallbackSuggestions(fallbackSuggestions = []) {
  return fallbackSuggestions
    .map((entry) => ({
      category: normalize(entry?.category) || 'Starter',
      rawTitle: normalize(entry?.title || entry?.completion, 180),
      rawSubtitle: normalize(entry?.subtitle, 120),
      rawCompletion: normalize(entry?.completion || entry?.title, 180),
    }))
    .filter((entry) => entry.rawCompletion)
    .filter(
      (entry) =>
        (looksLikeQuestion(entry.rawCompletion) || looksLikeQuestion(entry.rawTitle)) &&
        !looksLikeSyntheticCommand(entry.rawCompletion) &&
        !looksLikeSyntheticCommand(entry.rawTitle)
    )
    .map((entry) => ({
      category: entry.category,
      title: looksLikeQuestion(entry.rawTitle) ? ensureQuestion(entry.rawTitle) : entry.rawTitle,
      subtitle: entry.rawSubtitle || 'Grounded in saved memory on this device.',
      completion: looksLikeQuestion(entry.rawCompletion)
        ? ensureQuestion(entry.rawCompletion)
        : entry.rawCompletion,
    }))
}

export function buildNaturalSuggestions({
  answerMeta = null,
  aiQueries = [],
  aiStarters = [],
  fallbackSuggestions = [],
  recentEntries = [],
  limit = 12,
}) {
  const items = []
  const seen = new Set()

  for (const entry of buildAiStarterSuggestions(aiStarters)) {
    pushSuggestion(items, seen, entry)
  }

  for (const entry of buildAiAnchoredSuggestions(aiQueries)) {
    pushSuggestion(items, seen, entry)
  }

  for (const entry of buildAnswerAnchoredSuggestions(answerMeta)) {
    pushSuggestion(items, seen, entry)
  }

  for (const entry of buildHistoryAnchoredSuggestions(recentEntries)) {
    pushSuggestion(items, seen, entry)
  }

  for (const entry of buildFallbackSuggestions(fallbackSuggestions)) {
    pushSuggestion(items, seen, entry)
  }

  return items.slice(0, limit)
}
