const STOPWORDS = new Set([
  "a",
  "about",
  "after",
  "all",
  "also",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "because",
  "been",
  "but",
  "by",
  "can",
  "could",
  "for",
  "from",
  "has",
  "have",
  "how",
  "i",
  "if",
  "in",
  "into",
  "is",
  "it",
  "its",
  "may",
  "more",
  "not",
  "of",
  "on",
  "or",
  "should",
  "that",
  "the",
  "their",
  "this",
  "to",
  "was",
  "what",
  "when",
  "where",
  "which",
  "who",
  "why",
  "with",
  "you",
  "your",
]);

export function normalizeText(value, maxLength = 0) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return maxLength && text.length > maxLength ? `${text.slice(0, maxLength - 3).trim()}...` : text;
}

export function slug(value, fallback = "item") {
  const normalized = normalizeText(value)
    .toLowerCase()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || fallback;
}

export function uniqueLines(lines, limit = 80) {
  const seen = new Set();
  const output = [];
  for (const line of lines || []) {
    const normalized = normalizeText(line, 220);
    const key = normalized.toLowerCase();
    if (!normalized || normalized.length < 3 || seen.has(key)) {
      continue;
    }
    seen.add(key);
    output.push(normalized);
    if (output.length >= limit) {
      break;
    }
  }
  return output;
}

export function extractKeyphrases(text, limit = 18) {
  const tokens = normalizeText(text, 5000)
    .split(/\s+/)
    .map((token) => token.replace(/^[^\w]+|[^\w]+$/g, ""))
    .filter((token) => token.length > 2 && !STOPWORDS.has(token.toLowerCase()));
  const counts = new Map();

  for (const token of tokens) {
    const key = token.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  for (let size = 3; size >= 2; size -= 1) {
    for (let index = 0; index <= tokens.length - size; index += 1) {
      const phraseTokens = tokens.slice(index, index + size).map((token) => token.toLowerCase());
      if (new Set(phraseTokens).size < phraseTokens.length) {
        continue;
      }
      const phrase = phraseTokens.join(" ");
      if (phrase.length >= 8) {
        counts.set(phrase, (counts.get(phrase) || 0) + size);
      }
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, limit)
    .map(([phrase]) => phrase);
}

export function splitSentences(text, limit = 16) {
  return normalizeText(text, 4000)
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => normalizeText(sentence, 260))
    .filter((sentence) => sentence.length >= 16)
    .slice(0, limit);
}
