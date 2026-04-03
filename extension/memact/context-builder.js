const SYSTEM_PROMPT = `You are Memact - the private intelligence layer of a personal memory engine.

Your job is to help the user understand, recall, and reason about their own digital activity.

Rules:
- Speak conversationally, like a brilliant friend who has read everything they have ever read
- Ground every answer in the provided memory evidence - never invent facts
- When web results are provided, blend them naturally with memory evidence
- Be direct. Lead with the answer. Never start with "Based on your memories..."
- Use natural language. No bullet dumps unless the user asks for a list
- If memories are sparse, say so honestly rather than padding
- For evaluative queries, give a real opinion grounded in the evidence
- Keep responses tight - two to four paragraphs maximum unless asked for more
- Never mention that you are an AI or a language model
- Never break character`;

function normalizeText(value, maxLen = 6000) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function formatConversationHistory(history) {
  const turns = Array.isArray(history) ? history.slice(-4) : [];
  if (!turns.length) {
    return "No previous conversation turns.";
  }

  return turns
    .map((turn) => {
      const role = turn?.role === "assistant" ? "Memact" : "User";
      return `${role}: ${normalizeText(turn?.content, 900)}`;
    })
    .filter(Boolean)
    .join("\n");
}

function formatWebResults(results) {
  const safeResults = Array.isArray(results) ? results.filter(Boolean) : [];
  if (!safeResults.length) {
    return "No web results were needed.";
  }

  return safeResults
    .slice(0, 4)
    .map((item, index) =>
      [
        `Web ${index + 1}`,
        `Title: ${normalizeText(item?.title, 180)}`,
        item?.url ? `URL: ${normalizeText(item.url, 280)}` : "",
        item?.summary ? `Summary: ${normalizeText(item.summary, 260)}` : "",
        item?.date ? `Date: ${normalizeText(item.date, 60)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n\n");
}

export function buildBrainContext({
  query,
  classification,
  memoryContext,
  webResults,
  conversationHistory,
}) {
  const modeDirective = classification?.mode === "think" ? "/think" : "/no_think";
  const memoryBlock = normalizeText(memoryContext, 9000) || "No memory evidence matched.";
  const historyBlock = formatConversationHistory(conversationHistory);
  const webBlock = formatWebResults(webResults);

  const userPrompt = [
    `${modeDirective}`,
    `Current user question: ${normalizeText(query, 400)}`,
    "",
    "Conversation history:",
    historyBlock,
    "",
    "Personal memory evidence:",
    memoryBlock,
    "",
    "External web results:",
    webBlock,
    "",
    "Write a direct, natural answer grounded in the evidence above. If the evidence is thin or conflicting, say that plainly.",
  ].join("\n");

  return {
    systemPrompt: SYSTEM_PROMPT,
    userPrompt,
  };
}
