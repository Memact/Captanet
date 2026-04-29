const MODEL_NAME = "memact-local-hash-embedding-v1";

let modelReady = true;

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

async function embedText(text) {
  return hashEmbedding(text);
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
