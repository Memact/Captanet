const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";

let extractorPromise = null;
let modelReady = false;

function normalizeVector(values) {
  const vector = Array.from(values || []).map((value) => Number(value) || 0);
  let norm = 0;
  for (const value of vector) {
    norm += value * value;
  }
  norm = Math.sqrt(norm) || 1;
  return vector.map((value) => value / norm);
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9@#./+-]+/g, " ")
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

async function hashEmbedding(text, dim = 384) {
  const vector = new Array(dim).fill(0);
  const tokens = tokenize(text);
  for (const token of tokens) {
    const digest = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(token)
    );
    const bytes = new Uint8Array(digest);
    for (let i = 0; i < bytes.length; i += 1) {
      const slot = (bytes[i] + i * 13) % dim;
      const sign = bytes[(i + 7) % bytes.length] % 2 === 0 ? 1 : -1;
      vector[slot] += sign * (1 + bytes[i] / 255);
    }
  }
  return normalizeVector(vector);
}

function getPipelineFactory() {
  if (globalThis.transformers?.pipeline) {
    return globalThis.transformers.pipeline;
  }
  if (typeof globalThis.pipeline === "function") {
    return globalThis.pipeline;
  }
  return null;
}

async function tryLoadTransformers() {
  if (extractorPromise) {
    return extractorPromise;
  }

  extractorPromise = (async () => {
    try {
      if (!getPipelineFactory()) {
        const urls = [
          chrome.runtime?.getURL?.("transformers.min.js"),
          chrome.runtime?.getURL?.("vendor/transformers.min.js")
        ].filter(Boolean);
        for (const url of urls) {
          try {
            importScripts(url);
            if (getPipelineFactory()) {
              break;
            }
          } catch {
            // Try the next candidate or fall back to hashing.
          }
        }
      }

      const pipeline = getPipelineFactory();
      if (!pipeline) {
        throw new Error("transformers.js is not available");
      }

      const extractor = await pipeline("feature-extraction", MODEL_NAME, {
        quantized: true,
        progress_callback: (progress) => {
          const value =
            typeof progress === "number"
              ? progress
              : Number(progress?.progress ?? progress?.loaded ?? 0);
          self.postMessage({
            type: "loading_progress",
            progress: Math.max(0, Math.min(1, value || 0))
          });
        }
      });
      modelReady = true;
      return extractor;
    } catch (error) {
      extractorPromise = null;
      modelReady = false;
      throw error;
    }
  })();

  return extractorPromise;
}

async function embedText(text) {
  try {
    const extractor = await tryLoadTransformers();
    const output = await extractor(String(text || ""), {
      pooling: "mean",
      normalize: true
    });

    const raw =
      output?.data ||
      output?.tolist?.() ||
      output?.values ||
      output ||
      [];
    const vector = Array.from(raw, (value) => Number(value) || 0);
    return normalizeVector(vector);
  } catch {
    return hashEmbedding(text);
  }
}

self.addEventListener("message", async (event) => {
  const message = event?.data || {};
  if (!message || typeof message.type !== "string") {
    return;
  }

  if (message.type === "status") {
    self.postMessage({
      type: "status_result",
      ready: Boolean(modelReady),
      model: MODEL_NAME
    });
    return;
  }

  if (message.type !== "embed") {
    return;
  }

  try {
    const embedding = await embedText(message.text || "");
    self.postMessage({
      type: "embed_result",
      embedding,
      id: message.id
    });
  } catch (error) {
    self.postMessage({
      type: "embed_error",
      error: String(error?.message || error || "embedding failed"),
      id: message.id
    });
  }
});
