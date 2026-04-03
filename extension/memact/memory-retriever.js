import { getEventsByTimeRange, getRecentEvents } from "./db.js";
import { answerLocalQuery } from "./query-engine.js";
import { getIndexedSearchCandidates } from "./search-index.js";

const DEFAULT_TOKEN_BUDGET = 2200;
const TOKEN_TO_CHAR_RATIO = 4;
const DEFAULT_RESULT_LIMIT = 8;

function normalizeText(value, maxLen = 4000) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function normalizeRichText(value, maxLen = 6000) {
  const text = String(value || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const normalized = text
    .split(/\n{2,}/)
    .map((block) =>
      block
        .split(/\n+/)
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .filter(Boolean)
        .join("\n")
    )
    .filter(Boolean)
    .join("\n\n")
    .trim();
  if (!normalized) {
    return "";
  }
  return normalized.length > maxLen ? normalized.slice(0, maxLen) : normalized;
}

function parseJsonArray(value) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return [];
  }
}

function trimList(values, maxItems = 6, maxLen = 140) {
  return values
    .map((value) => normalizeText(value, maxLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

function buildFactItems(result) {
  const directFactItems = Array.isArray(result?.fact_items)
    ? result.fact_items
    : Array.isArray(result?.factItems)
      ? result.factItems
      : [];

  return directFactItems
    .map((item) => ({
      label: normalizeText(item?.label, 60),
      value: normalizeText(item?.value, 220),
    }))
    .filter((item) => item.label && item.value)
    .slice(0, 6);
}

function buildDerivativeItems(result) {
  const directDerivativeItems = Array.isArray(result?.derivative_items)
    ? result.derivative_items
    : Array.isArray(result?.derivativeItems)
      ? result.derivativeItems
      : [];

  return directDerivativeItems
    .map((item) => ({
      kind: normalizeText(item?.kind, 40),
      label: normalizeText(item?.label, 80),
      text: normalizeRichText(item?.text, 420),
    }))
    .filter((item) => item.text)
    .slice(0, 5);
}

function buildConnectedEvents(result) {
  const connectedEvents = Array.isArray(result?.connected_events)
    ? result.connected_events
    : Array.isArray(result?.connectedEvents)
      ? result.connectedEvents
      : [];

  return connectedEvents
    .map((item) => ({
      id: normalizeText(item?.event_id || item?.id, 80),
      title: normalizeText(item?.title, 160),
      url: normalizeText(item?.url, 280),
      relationshipType: normalizeText(item?.relationship_type || item?.relationshipType, 60),
      relationshipReason: normalizeText(item?.relationship_reason || item?.relationshipReason, 180),
    }))
    .filter((item) => item.title)
    .slice(0, 4);
}

function buildMemoryChunk(result) {
  const keyPoints = trimList(parseJsonArray(result?.keyphrases_json || result?.keyphrases), 6, 80);
  const entities = trimList(result?.context_entities || result?.contextEntities || [], 6, 60);
  const topics = trimList(result?.context_topics || result?.contextTopics || [], 6, 60);
  const matchedPassage = normalizeRichText(
    result?.display_excerpt ||
      result?.displayExcerpt ||
      result?.structured_summary ||
      result?.structuredSummary ||
      result?.snippet ||
      result?.content_text,
    420
  );

  return {
    id: normalizeText(result?.id, 80),
    title: normalizeText(result?.title || result?.window_title, 180),
    url: normalizeText(result?.url, 280),
    timestamp: normalizeText(result?.occurred_at || result?.captured_at, 80),
    tier: normalizeText(
      result?.selective_memory?.tier ||
        result?.selective_memory_tier ||
        result?.selectiveMemoryTier ||
        "supporting",
      40
    ),
    summary: normalizeRichText(result?.structured_summary || result?.structuredSummary || result?.snippet, 320),
    keyPoints,
    facts: buildFactItems(result),
    entities,
    topics,
    matchedPassage,
    derivatives: buildDerivativeItems(result),
    connectedEvents: buildConnectedEvents(result),
    rawResult: result,
  };
}

function formatFactBlock(items) {
  if (!items.length) {
    return "";
  }

  return items.map((item) => `- ${item.label}: ${item.value}`).join("\n");
}

function formatDerivativeBlock(items) {
  if (!items.length) {
    return "";
  }

  return items
    .map((item, index) =>
      item.label ? `- Passage ${index + 1} (${item.label}): ${item.text}` : `- Passage ${index + 1}: ${item.text}`
    )
    .join("\n");
}

function formatConnectedBlock(items) {
  if (!items.length) {
    return "";
  }

  return items
    .map((item) => {
      const reason = item.relationshipReason ? ` — ${item.relationshipReason}` : "";
      return `- ${item.title}${item.relationshipType ? ` [${item.relationshipType}]` : ""}${reason}`;
    })
    .join("\n");
}

function estimateCharsForBudget(tokenBudget) {
  return Math.max(2400, tokenBudget * TOKEN_TO_CHAR_RATIO);
}

function formatChunkForPrompt(chunk) {
  const sections = [
    `Title: ${chunk.title || "Untitled memory"}`,
    chunk.url ? `URL: ${chunk.url}` : "",
    chunk.timestamp ? `Captured: ${chunk.timestamp}` : "",
    chunk.tier ? `Tier: ${chunk.tier}` : "",
    chunk.summary ? `Summary: ${chunk.summary}` : "",
    chunk.keyPoints.length ? `Key points: ${chunk.keyPoints.join("; ")}` : "",
    chunk.entities.length ? `Entities: ${chunk.entities.join(", ")}` : "",
    chunk.topics.length ? `Topics: ${chunk.topics.join(", ")}` : "",
    chunk.matchedPassage ? `Matched passage: ${chunk.matchedPassage}` : "",
    chunk.facts.length ? `Facts:\n${formatFactBlock(chunk.facts)}` : "",
    chunk.derivatives.length ? `Matched passages:\n${formatDerivativeBlock(chunk.derivatives)}` : "",
    chunk.connectedEvents.length ? `Connected events:\n${formatConnectedBlock(chunk.connectedEvents)}` : "",
  ].filter(Boolean);

  return sections.join("\n");
}

function applyBudget(chunks, tokenBudget = DEFAULT_TOKEN_BUDGET) {
  const charBudget = estimateCharsForBudget(tokenBudget);
  const selected = [];
  let consumed = 0;

  for (const chunk of chunks) {
    const formatted = formatChunkForPrompt(chunk);
    if (!formatted) {
      continue;
    }
    if (selected.length && consumed + formatted.length > charBudget) {
      break;
    }
    selected.push({
      ...chunk,
      promptText: formatted,
    });
    consumed += formatted.length;
  }

  return selected;
}

async function getScopedEvents(temporalScope) {
  if (!temporalScope?.startAt || !temporalScope?.endAt) {
    return getRecentEvents(3000);
  }

  return getEventsByTimeRange(temporalScope.startAt, temporalScope.endAt, 3000).catch(() =>
    getRecentEvents(3000)
  );
}

export async function retrieveMemories({
  query,
  classification,
  embedText,
  cosineSimilarity,
  limit = DEFAULT_RESULT_LIMIT,
  tokenBudget = DEFAULT_TOKEN_BUDGET,
}) {
  const normalizedQuery = normalizeText(query, 400);
  if (!normalizedQuery) {
    return {
      results: [],
      chunks: [],
      promptContext: "",
      answerMeta: null,
      insufficientEvidence: true,
    };
  }

  const scopedEvents = await getScopedEvents(classification?.temporalScope);
  const candidateEvents = getIndexedSearchCandidates(
    scopedEvents,
    normalizedQuery,
    Math.max(limit * 40, 320)
  );

  const response = await answerLocalQuery({
    query: normalizedQuery,
    limit,
    rawEvents: candidateEvents.length ? candidateEvents : scopedEvents,
    embedText,
    cosineSimilarity,
  });

  const results = Array.isArray(response?.results) ? response.results : [];
  const chunks = applyBudget(results.map(buildMemoryChunk), tokenBudget);

  return {
    results,
    chunks,
    promptContext: chunks
      .map((chunk, index) => `Memory ${index + 1}\n${chunk.promptText}`)
      .join("\n\n---\n\n"),
    answerMeta: response?.answer || null,
    insufficientEvidence: chunks.length === 0,
  };
}
