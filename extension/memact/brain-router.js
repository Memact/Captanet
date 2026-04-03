import {
  generate,
  getBrainStatus,
  interruptGeneration,
  subscribeToBrainStatus,
  warmBrain,
} from "./brain-engine.js";
import { classifyIntent } from "./intent-classifier.js";
import { retrieveMemories } from "./memory-retriever.js";
import { searchWeb } from "./web-search-trigger.js";
import { buildBrainContext } from "./context-builder.js";
import { addTurn, clearSession, getHistory } from "./session-memory.js";

const activeRequests = new Map();

function normalizeText(value, maxLen = 4000) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function derivePointers(results) {
  return (Array.isArray(results) ? results : [])
    .flatMap((result) => {
      const structuredSummary = normalizeText(result?.structured_summary || result?.structuredSummary, 180);
      const displayExcerpt = normalizeText(result?.display_excerpt || result?.displayExcerpt, 180);
      return [structuredSummary, displayExcerpt].filter(Boolean);
    })
    .filter(Boolean)
    .slice(0, 4);
}

function createAnswerMeta({
  text,
  results,
  webResults,
  classification,
  fallbackMode,
  insufficientEvidence,
}) {
  return {
    overview: "",
    answer: text,
    summary: insufficientEvidence
      ? "I do not have enough strong memory to answer this confidently yet."
      : classification?.requiresWebSearch && webResults.length
        ? `Compared ${results.length} saved memories with ${webResults.length} web references.`
        : `Grounded in ${results.length} saved memories.`,
    detailsLabel: "View sources",
    selectedEvidenceIds: (Array.isArray(results) ? results : [])
      .map((result) => normalizeText(result?.id, 80))
      .filter(Boolean),
    pointers: derivePointers(results),
    insufficientEvidence: Boolean(insufficientEvidence),
    fallbackMode: Boolean(fallbackMode),
  };
}

function chunkForStreaming(text) {
  const chunks = [];
  const value = String(text || "");
  const tokens = value.match(/\S+\s*|\n+/g) || [];
  for (const token of tokens) {
    chunks.push(token);
  }
  return chunks;
}

async function streamTemplateResponse(text, emitToken, controller) {
  for (const token of chunkForStreaming(text)) {
    if (controller?.stopped) {
      return false;
    }
    emitToken(token);
    await new Promise((resolve) => setTimeout(resolve, 12));
  }
  return true;
}

async function streamChunkedToken(text, emitToken, controller) {
  for (const token of chunkForStreaming(text)) {
    if (controller?.stopped) {
      return false;
    }
    emitToken(token);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return true;
}

function createRequestController(requestId) {
  const controller = {
    requestId,
    stopped: false,
  };
  activeRequests.set(requestId, controller);
  return controller;
}

function cleanupRequestController(requestId) {
  activeRequests.delete(requestId);
}

export async function warmBrainRouter() {
  return warmBrain();
}

export function getBrainStatusSnapshot() {
  return getBrainStatus();
}

export async function clearBrainConversation(sessionId) {
  await clearSession(sessionId);
}

export function stopBrainQuery(requestId) {
  const normalizedRequestId = normalizeText(requestId, 120);
  if (!normalizedRequestId) {
    return false;
  }

  const controller = activeRequests.get(normalizedRequestId);
  if (!controller) {
    return false;
  }

  controller.stopped = true;
  interruptGeneration();
  return true;
}

export async function handleBrainQuery({
  requestId,
  query,
  sessionId,
  emit,
  embedText,
  cosineSimilarity,
}) {
  const normalizedQuery = normalizeText(query, 500);
  const normalizedSessionId = normalizeText(sessionId, 120);
  const normalizedRequestId = normalizeText(requestId, 120);
  const controller = createRequestController(normalizedRequestId);

  if (!normalizedQuery) {
    emit({
      type: "done",
      text: "",
      answerMeta: createAnswerMeta({
        text: "",
        results: [],
        webResults: [],
        classification: { requiresWebSearch: false },
        fallbackMode: false,
        insufficientEvidence: true,
      }),
      results: [],
      webResults: [],
      fallbackMode: false,
      insufficientEvidence: true,
    });
    cleanupRequestController(normalizedRequestId);
    return;
  }

  const history = await getHistory(normalizedSessionId, 6);
  const classification = classifyIntent(normalizedQuery, null);
  const unsubscribe = subscribeToBrainStatus((status) => {
    if (!status?.loading) {
      return;
    }
    emit({
      type: "progress",
      progress: Number(status.progress || 0),
      text: status.text || "Loading Memact...",
      loading: true,
      fallbackMode: Boolean(status.fallbackMode),
    });
  });

  emit({
    type: "progress",
    progress: 0.08,
    text: "Understanding your question...",
    loading: true,
    fallbackMode: false,
  });

  await addTurn(normalizedSessionId, "user", normalizedQuery);

  try {
    const memory = await retrieveMemories({
      query: normalizedQuery,
      classification,
      embedText,
      cosineSimilarity,
    });

    emit({
      type: "progress",
      progress: 0.28,
      text: "Recalling your saved memory...",
      loading: true,
      fallbackMode: false,
    });

    const webResults = classification.requiresWebSearch
      ? await searchWeb(normalizedQuery, classification.intent)
      : [];

    emit({
      type: "progress",
      progress: 0.48,
      text: webResults.length ? "Comparing with the live web..." : "Connecting the memory trail...",
      loading: true,
      fallbackMode: false,
    });

    const insufficientEvidence = !memory.chunks.length && !webResults.length;
    let finalText = "";
    let fallbackMode = false;
    const currentStatus = getBrainStatus();

    if (!currentStatus.ready) {
      emit({
        type: "progress",
        progress: Math.max(0.56, Number(currentStatus.progress || 0)),
        text: currentStatus.text || "Loading Memact...",
        loading: true,
        fallbackMode: false,
      });
    }

    const warmedStatus = await warmBrain();
    const activeStatus = warmedStatus?.ready ? warmedStatus : getBrainStatus();
    if (!activeStatus?.ready) {
      throw new Error(
        normalizeText(
          activeStatus?.error || activeStatus?.text || "Memact could not load the on-device model.",
          240
        )
      );
    }

    const prompt = buildBrainContext({
      query: normalizedQuery,
      classification,
      memoryContext: memory.promptContext,
      webResults,
      conversationHistory: history,
    });

    emit({
      type: "progress",
      progress: 0.72,
      text: insufficientEvidence
        ? "Memact is checking whether the evidence is enough..."
        : "Memact is writing the reply...",
      loading: true,
      fallbackMode: false,
    });

    const generation = await generate({
      systemPrompt: prompt.systemPrompt,
      userPrompt: prompt.userPrompt,
      async onToken(token) {
        if (controller.stopped) {
          return;
        }
        finalText += token;
        await streamChunkedToken(token, (nextToken) => {
          emit({
            type: "token",
            token: nextToken,
          });
        }, controller);
      },
    });

    fallbackMode = Boolean(generation?.fallbackMode);
    finalText = normalizeText(finalText || generation?.text, 12000);

    if (controller.stopped) {
      if (finalText) {
        await addTurn(normalizedSessionId, "assistant", finalText);
      }
      return;
    }

    const answerMeta = createAnswerMeta({
      text: finalText,
      results: memory.results,
      webResults,
      classification,
      fallbackMode,
      insufficientEvidence,
    });

    await addTurn(normalizedSessionId, "assistant", finalText);

    emit({
      type: "done",
      text: finalText,
      answerMeta,
      results: memory.results,
      webResults,
      fallbackMode,
      insufficientEvidence,
      intent: classification.intent,
      mode: classification.mode,
    });
  } catch (error) {
    if (controller.stopped) {
      return;
    }
    emit({
      type: "error",
      error: String(error?.message || error || "brain query failed"),
    });
  } finally {
    unsubscribe();
    cleanupRequestController(normalizedRequestId);
  }
}
