const STORAGE_KEY = "memact_brain_sessions";
const MAX_TURNS = 20;
const MAX_INACTIVITY_MS = 30 * 60 * 1000;

function normalizeText(value, maxLen = 4000) {
  const text = String(value || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) {
    return "";
  }
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

function nowIso() {
  return new Date().toISOString();
}

function toTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

async function readSessions() {
  const storage = chrome.storage?.session;
  if (!storage) {
    return {};
  }

  const record = await storage.get(STORAGE_KEY).catch(() => ({}));
  const sessions = record?.[STORAGE_KEY];
  return sessions && typeof sessions === "object" ? sessions : {};
}

async function writeSessions(sessions) {
  const storage = chrome.storage?.session;
  if (!storage) {
    return;
  }

  await storage.set({
    [STORAGE_KEY]: sessions,
  });
}

function normalizeSession(sessionId, rawSession) {
  const turns = Array.isArray(rawSession?.turns)
    ? rawSession.turns
        .map((turn) => ({
          role: turn?.role === "assistant" ? "assistant" : "user",
          content: normalizeText(turn?.content),
          timestamp: normalizeText(turn?.timestamp || nowIso(), 80),
        }))
        .filter((turn) => turn.content)
        .slice(-MAX_TURNS)
    : [];

  return {
    sessionId,
    updatedAt: normalizeText(rawSession?.updatedAt || nowIso(), 80),
    turns,
  };
}

function isExpiredSession(session) {
  const lastTurn = session?.turns?.[session.turns.length - 1];
  const lastTimestamp = toTimestamp(lastTurn?.timestamp || session?.updatedAt);
  if (!lastTimestamp) {
    return false;
  }
  return Date.now() - lastTimestamp > MAX_INACTIVITY_MS;
}

async function getSessionRecord(sessionId) {
  const normalizedSessionId = normalizeText(sessionId, 120);
  if (!normalizedSessionId) {
    throw new Error("session id is required");
  }

  const sessions = await readSessions();
  const session = normalizeSession(normalizedSessionId, sessions[normalizedSessionId]);

  if (isExpiredSession(session)) {
    delete sessions[normalizedSessionId];
    await writeSessions(sessions);
    return normalizeSession(normalizedSessionId, null);
  }

  return session;
}

export async function addTurn(sessionId, role, content) {
  const normalizedRole = role === "assistant" ? "assistant" : "user";
  const normalizedContent = normalizeText(content);
  if (!normalizedContent) {
    return getSessionRecord(sessionId);
  }

  const normalizedSessionId = normalizeText(sessionId, 120);
  const sessions = await readSessions();
  const session = normalizeSession(normalizedSessionId, sessions[normalizedSessionId]);
  const timestamp = nowIso();

  session.turns = [
    ...session.turns,
    {
      role: normalizedRole,
      content: normalizedContent,
      timestamp,
    },
  ].slice(-MAX_TURNS);
  session.updatedAt = timestamp;

  sessions[normalizedSessionId] = session;
  await writeSessions(sessions);
  return session;
}

export async function getHistory(sessionId, count = 6) {
  const session = await getSessionRecord(sessionId);
  const safeCount = Math.max(0, Number(count || 0) || 0);
  return safeCount ? session.turns.slice(-safeCount) : session.turns.slice();
}

export async function clearSession(sessionId) {
  const normalizedSessionId = normalizeText(sessionId, 120);
  if (!normalizedSessionId) {
    return;
  }

  const sessions = await readSessions();
  delete sessions[normalizedSessionId];
  await writeSessions(sessions);
}

export async function getSessionState(sessionId) {
  return getSessionRecord(sessionId);
}
