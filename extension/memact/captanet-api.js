import { cosineSimilarity, getRecentEvents } from "./db.js";
import { createCaptanetActivitySnapshot } from "./activity-model.js";

export async function getEvents(options = {}) {
  const limit = Math.max(1, Number(options.limit || 3000));
  const snapshot = createCaptanetActivitySnapshot(await getRecentEvents(limit), {
    cosineSimilarity,
  });
  return snapshot.events;
}

export async function getSessions(options = {}) {
  const limit = Math.max(1, Number(options.limit || 3000));
  const snapshot = createCaptanetActivitySnapshot(await getRecentEvents(limit), {
    cosineSimilarity,
  });
  return snapshot.sessions;
}

export async function getActivities(options = {}) {
  const limit = Math.max(1, Number(options.limit || 3000));
  const snapshot = createCaptanetActivitySnapshot(await getRecentEvents(limit), {
    cosineSimilarity,
  });
  return snapshot.activities;
}

export async function getCaptanetSnapshot(options = {}) {
  const limit = Math.max(1, Number(options.limit || 3000));
  const snapshot = createCaptanetActivitySnapshot(await getRecentEvents(limit), {
    cosineSimilarity,
  });
  return {
    system: "captanet",
    snapshot_type: "captanet-memory-export",
    schema_version: 1,
    generated_at: new Date().toISOString(),
    counts: {
      events: snapshot.events.length,
      sessions: snapshot.sessions.length,
      activities: snapshot.activities.length,
    },
    ...snapshot,
  };
}
