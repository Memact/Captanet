function normalizeText(value, maxLen = 320) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function humanJoin(values) {
  const items = values.filter(Boolean);
  if (!items.length) {
    return "";
  }
  if (items.length === 1) {
    return items[0];
  }
  if (items.length === 2) {
    return `${items[0]} and ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

function describeChunk(chunk) {
  return (
    normalizeText(chunk?.summary, 220) ||
    normalizeText(chunk?.matchedPassage, 220) ||
    normalizeText(chunk?.title, 160)
  );
}

function buildRecallResponse(chunks) {
  const primary = chunks[0];
  const descriptions = chunks.slice(0, 3).map(describeChunk).filter(Boolean);
  const firstLine = descriptions.length
    ? descriptions[0]
    : "I found a saved memory, but the captured detail is still thin.";
  const secondLine = descriptions.length > 1 ? `The strongest trail also points to ${humanJoin(descriptions.slice(1))}.` : "";
  const timing = primary?.timestamp ? `The closest memory was captured on ${primary.timestamp}.` : "";
  return [firstLine, secondLine, timing].filter(Boolean).join(" ");
}

function buildTimelineResponse(chunks) {
  const primary = chunks[0];
  const started = primary?.timestamp ? `The earliest strong trail I can see here starts around ${primary.timestamp}.` : "";
  const related = chunks.length > 1 ? `There are ${chunks.length} memories connected to it in this slice of your history.` : "";
  return [started, related].filter(Boolean).join(" ");
}

function buildSessionResponse(chunks) {
  const descriptions = chunks.slice(0, 4).map(describeChunk).filter(Boolean);
  if (!descriptions.length) {
    return "I can see that session in your memory, but I do not have enough captured detail yet to describe it cleanly.";
  }

  return `In that stretch of activity, you moved through ${humanJoin(descriptions)}.`;
}

function buildSynthesisResponse(chunks) {
  const topics = chunks
    .flatMap((chunk) => Array.isArray(chunk?.topics) ? chunk.topics : [])
    .map((value) => normalizeText(value, 60))
    .filter(Boolean)
    .slice(0, 6);

  const base = chunks.length
    ? `Across ${chunks.length} saved memories, the clearest themes are ${humanJoin(topics.length ? topics : chunks.map((chunk) => normalizeText(chunk?.title, 80)).filter(Boolean).slice(0, 4))}.`
    : "I do not have enough saved memory to synthesize this yet.";

  const detail = chunks[0] ? `The strongest memory anchor is ${describeChunk(chunks[0])}.` : "";
  return [base, detail].filter(Boolean).join(" ");
}

export function assembleTemplateResponse({ query, classification, chunks, webResults = [] }) {
  const safeChunks = Array.isArray(chunks) ? chunks.filter(Boolean) : [];
  const safeWebResults = Array.isArray(webResults) ? webResults.filter(Boolean) : [];
  const intent = classification?.intent || "recall";

  let answer = "";
  if (!safeChunks.length && !safeWebResults.length) {
    answer = `I do not have enough saved memory to answer "${normalizeText(query, 120)}" well yet.`;
  } else if (intent === "timeline") {
    answer = buildTimelineResponse(safeChunks);
  } else if (intent === "session") {
    answer = buildSessionResponse(safeChunks);
  } else if (intent === "synthesis" || intent === "connection" || intent === "comparison") {
    answer = buildSynthesisResponse(safeChunks);
  } else {
    answer = buildRecallResponse(safeChunks);
  }

  if (safeWebResults.length) {
    answer = `${answer} I also found ${safeWebResults.length} fresh web references to compare against your saved memory.`;
  }

  return {
    text: answer,
    fallbackMode: true,
    insufficientEvidence: !safeChunks.length,
  };
}
