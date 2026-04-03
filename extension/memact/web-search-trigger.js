const SEARCH_RESULT_LIMIT = 5;

function normalizeText(value, maxLen = 240) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function stripPersonalContext(query) {
  return normalizeText(
    String(query || "")
      .replace(/\b(my|me|i|am i|have i|should i|did i|was i|for me)\b/gi, " ")
      .replace(/\s+/g, " ")
      .trim(),
    200
  );
}

function reformulateQuery(query, intent) {
  const normalizedQuery = normalizeText(query, 220);
  const stripped = stripPersonalContext(normalizedQuery);

  if (intent === "evaluation" && stripped) {
    return `${stripped} syllabus requirements checklist`;
  }

  if (intent === "comparison" && stripped) {
    return `${stripped} comparison latest guide`;
  }

  if (intent === "current" && stripped) {
    return `${stripped} latest update`;
  }

  return stripped || normalizedQuery;
}

function normalizeSearchResult(item) {
  const title = normalizeText(item?.Text || item?.title, 180);
  const url = normalizeText(item?.FirstURL || item?.url, 320);
  const summary = normalizeText(item?.Result || item?.summary, 260).replace(/<[^>]+>/g, "");

  if (!title && !summary) {
    return null;
  }

  return {
    title: title || summary,
    url,
    summary: summary || title,
    date: "",
    freshness: "unknown",
  };
}

function flattenRelatedTopics(items, output = []) {
  for (const item of items || []) {
    if (Array.isArray(item?.Topics) && item.Topics.length) {
      flattenRelatedTopics(item.Topics, output);
      continue;
    }

    const normalized = normalizeSearchResult(item);
    if (normalized) {
      output.push(normalized);
    }
  }

  return output;
}

async function fetchInstantAnswers(query) {
  const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`web search failed with status ${response.status}`);
  }

  const payload = await response.json();
  const primaryResults = []
    .concat(normalizeSearchResult(payload))
    .concat(flattenRelatedTopics(payload?.Results || []))
    .concat(flattenRelatedTopics(payload?.RelatedTopics || []))
    .filter(Boolean);

  const seen = new Set();
  return primaryResults.filter((item) => {
    const key = `${item.title}|${item.url}`.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export async function searchWeb(query, intent) {
  const searchQuery = reformulateQuery(query, intent);
  if (!searchQuery) {
    return [];
  }

  try {
    const results = await fetchInstantAnswers(searchQuery);
    return results.slice(0, SEARCH_RESULT_LIMIT);
  } catch {
    return [];
  }
}
