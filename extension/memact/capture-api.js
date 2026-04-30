import {
  cosineSimilarity,
  getPendingMediaJobs,
  getRecentContentUnits,
  getRecentEvents,
  getRecentGraphPackets,
} from "./db.js";
import { createCaptureActivitySnapshot } from "./activity-model.js";

export async function getEvents(options = {}) {
  const limit = Math.max(1, Number(options.limit || 3000));
  const snapshot = createCaptureActivitySnapshot(await getRecentEvents(limit), {
    cosineSimilarity,
  });
  return snapshot.events;
}

export async function getSessions(options = {}) {
  const limit = Math.max(1, Number(options.limit || 3000));
  const snapshot = createCaptureActivitySnapshot(await getRecentEvents(limit), {
    cosineSimilarity,
  });
  return snapshot.sessions;
}

export async function getActivities(options = {}) {
  const limit = Math.max(1, Number(options.limit || 3000));
  const snapshot = createCaptureActivitySnapshot(await getRecentEvents(limit), {
    cosineSimilarity,
  });
  return snapshot.activities;
}

export async function getContentUnits(options = {}) {
  const limit = Math.max(1, Number(options.limit || 1200));
  return getRecentContentUnits(limit);
}

export async function getGraphPackets(options = {}) {
  const limit = Math.max(1, Number(options.limit || 400));
  return getRecentGraphPackets(limit);
}

export async function getMediaJobs(options = {}) {
  const limit = Math.max(1, Number(options.limit || 200));
  return getPendingMediaJobs(limit);
}

export async function getCaptureSnapshot(options = {}) {
  const limit = Math.max(1, Number(options.limit || 3000));
  const [events, contentUnits, graphPackets, mediaJobs] = await Promise.all([
    getRecentEvents(limit),
    getRecentContentUnits(Math.max(1200, limit)),
    getRecentGraphPackets(Math.max(400, Math.ceil(limit / 2))),
    getPendingMediaJobs(200),
  ]);
  const snapshot = createCaptureActivitySnapshot(events, {
    cosineSimilarity,
  });
  return {
    system: "capture",
    snapshot_type: "capture-memory-export",
    schema_version: 2,
    generated_at: new Date().toISOString(),
    counts: {
      events: snapshot.events.length,
      sessions: snapshot.sessions.length,
      activities: snapshot.activities.length,
      content_units: contentUnits.length,
      graph_packets: graphPackets.length,
      pending_media_jobs: mediaJobs.length,
    },
    content_units: contentUnits,
    graph_packets: graphPackets,
    pending_media_jobs: mediaJobs,
    ...snapshot,
  };
}
