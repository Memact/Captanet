const EVALUATION_PATTERN =
  /\b(enough|ready|good enough|am i doing|should i|worth it|best|better|worse|improve|improving|weak|strong|cover(?:ed|ing)?|missing|gap|gaps)\b/i;
const COMPARISON_PATTERN = /\b(compare|comparison|versus|vs\.?|difference|different from|better than|worse than)\b/i;
const CURRENT_PATTERN = /\b(current|latest|recent news|what changed|has .* changed|today(?:'s)?|now|currently|updated?)\b/i;
const CONNECTION_PATTERN = /\b(relate|connected|link between|how does .* relate|why do these connect|relationship)\b/i;
const SYNTHESIS_PATTERN = /\b(summarize|summary|everything i know|all i know|recap|overview|big picture)\b/i;
const TIMELINE_PATTERN = /\b(when did|first time|last time|how long|timeline|since when|over time)\b/i;
const SESSION_PATTERN = /\b(yesterday|today|this morning|this afternoon|this evening|last night|last week|what was i doing|what did i do|activity)\b/i;
const RECALL_PATTERN = /\b(what did i|show me|where did i|find|recall|remember|what do i remember|what was on)\b/i;
const FOLLOWUP_PATTERN =
  /^(what about|and |also |that |this |those |these |why\b|how so\b|what next\b|what then\b|continue\b|same for\b)/i;

function normalizeText(value, maxLen = 200) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function createTemporalScope(kind, startAt, endAt, label) {
  return {
    kind,
    startAt: new Date(startAt).toISOString(),
    endAt: new Date(endAt).toISOString(),
    label,
  };
}

function inferTemporalScope(query) {
  const lower = normalizeText(query, 400).toLowerCase();
  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);

  if (/\byesterday\b/.test(lower)) {
    const start = new Date(startOfDay);
    start.setDate(start.getDate() - 1);
    const end = new Date(startOfDay);
    end.setMilliseconds(-1);
    return createTemporalScope("yesterday", start, end, "Yesterday");
  }

  if (/\btoday\b/.test(lower)) {
    return createTemporalScope("today", startOfDay, now, "Today");
  }

  if (/\bthis week\b/.test(lower)) {
    const start = new Date(startOfDay);
    const day = start.getDay() || 7;
    start.setDate(start.getDate() - day + 1);
    return createTemporalScope("this_week", start, now, "This week");
  }

  if (/\blast week\b/.test(lower)) {
    const end = new Date(startOfDay);
    end.setDate(end.getDate() - (end.getDay() || 7));
    end.setMilliseconds(-1);
    const start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return createTemporalScope("last_week", start, end, "Last week");
  }

  if (/\bthis month\b/.test(lower)) {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return createTemporalScope("this_month", start, now, "This month");
  }

  return null;
}

export function classifyIntent(query, previousIntent = null) {
  const normalizedQuery = normalizeText(query, 400);
  const temporalScope = inferTemporalScope(normalizedQuery);

  if (!normalizedQuery) {
    return {
      intent: "recall",
      mode: "no_think",
      requiresWebSearch: false,
      temporalScope: null,
    };
  }

  if (FOLLOWUP_PATTERN.test(normalizedQuery) || (normalizedQuery.split(" ").length <= 4 && previousIntent)) {
    return {
      intent: "followup",
      mode: previousIntent?.mode || "no_think",
      requiresWebSearch: Boolean(previousIntent?.requiresWebSearch),
      temporalScope: temporalScope || previousIntent?.temporalScope || null,
    };
  }

  if (CURRENT_PATTERN.test(normalizedQuery)) {
    return {
      intent: "current",
      mode: "web_search",
      requiresWebSearch: true,
      temporalScope,
    };
  }

  if (EVALUATION_PATTERN.test(normalizedQuery)) {
    return {
      intent: "evaluation",
      mode: "think",
      requiresWebSearch: true,
      temporalScope,
    };
  }

  if (COMPARISON_PATTERN.test(normalizedQuery)) {
    return {
      intent: "comparison",
      mode: "think",
      requiresWebSearch: true,
      temporalScope,
    };
  }

  if (CONNECTION_PATTERN.test(normalizedQuery)) {
    return {
      intent: "connection",
      mode: "think",
      requiresWebSearch: false,
      temporalScope,
    };
  }

  if (SYNTHESIS_PATTERN.test(normalizedQuery)) {
    return {
      intent: "synthesis",
      mode: "think",
      requiresWebSearch: false,
      temporalScope,
    };
  }

  if (TIMELINE_PATTERN.test(normalizedQuery)) {
    return {
      intent: "timeline",
      mode: "no_think",
      requiresWebSearch: false,
      temporalScope,
    };
  }

  if (SESSION_PATTERN.test(normalizedQuery)) {
    return {
      intent: "session",
      mode: "no_think",
      requiresWebSearch: false,
      temporalScope,
    };
  }

  if (RECALL_PATTERN.test(normalizedQuery)) {
    return {
      intent: "recall",
      mode: "no_think",
      requiresWebSearch: false,
      temporalScope,
    };
  }

  return {
    intent: "recall",
    mode: temporalScope ? "no_think" : "think",
    requiresWebSearch: false,
    temporalScope,
  };
}
