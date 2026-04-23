import { appendEvent } from "./db.js";
import { buildSuggestionQueries, extractContextProfile, hostnameFromUrl, normalizeText } from "./context-pipeline.js";
import { extractKeyphrases } from "./keywords.js";

const CAPTURE_BOOTSTRAP_STATE_KEY = "capture_bootstrap_state";
const DEFAULT_HISTORY_DAYS = 21;
const DEFAULT_HISTORY_LIMIT = 320;

let importPromise = null;

function readBootstrapState() {
  return chrome.storage.local
    .get(CAPTURE_BOOTSTRAP_STATE_KEY)
    .then((stored) => stored?.[CAPTURE_BOOTSTRAP_STATE_KEY] || null)
    .catch(() => null);
}

function writeBootstrapState(state) {
  return chrome.storage.local.set({
    [CAPTURE_BOOTSTRAP_STATE_KEY]: state,
  });
}

function normalizeHistoryItems(items = []) {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => {
      const url = normalizeText(item?.url, 400);
      const title = normalizeText(item?.title, 200);
      const lastVisitTime = Number(item?.lastVisitTime || 0);
      if (!url || !/^https?:/i.test(url) || !lastVisitTime) {
        return null;
      }
      const key = `${url.toLowerCase()}|${title.toLowerCase()}`;
      if (seen.has(key)) {
        return null;
      }
      seen.add(key);
      return {
        url,
        title,
        lastVisitTime,
      };
    })
    .filter(Boolean)
    .sort((left, right) => right.lastVisitTime - left.lastVisitTime);
}

function buildHistoryContext(item) {
  const browserName = "Browser history";
  const domain = hostnameFromUrl(item.url);
  const title = normalizeText(item.title, 200) || domain || "Visited page";
  const seedText = [title, domain, item.url].filter(Boolean).join(" ");
  const profile = extractContextProfile({
    url: item.url,
    title,
    pageTitle: title,
    window_title: title,
    application: browserName,
    snippet: title,
    content_text: title,
    full_text: title,
    description: domain ? `Visited page from ${domain}.` : "Visited page from browser history.",
    keyphrases: extractKeyphrases(seedText, 8),
    captureIntent: {
      shouldCapture: true,
      shouldKeepMetadataOnly: false,
      shouldPreferStructured: true,
      captureMode: "history_bootstrap",
      pagePurpose: "history_bootstrap",
      targetRegions: ["history entry"],
    },
    clutterAudit: {
      shouldSkip: false,
      shouldPreferStructured: true,
      organizationScore: 0.72,
      clutterScore: 0.18,
      summary: "Imported from browser history for first-use schema seeding.",
    },
    localJudge: {
      shouldSkip: false,
      qualityLabel: "history",
      confidence: 0.72,
    },
    selectiveMemory: {
      rememberScore: 0.66,
      shouldUseForSuggestions: true,
      shouldKeep: true,
      reason: "history_bootstrap",
    },
  });

  return {
    profile,
    keyphrases: extractKeyphrases(
      [title, profile.subject, profile.structuredSummary, ...profile.topics].filter(Boolean).join(" "),
      8
    ),
  };
}

async function importHistoryItems(historyItems) {
  let importedCount = 0;
  let skippedCount = 0;

  for (const item of historyItems) {
    const { profile, keyphrases } = buildHistoryContext(item);
    const occurredAt = new Date(item.lastVisitTime).toISOString();
    const suggestionQueries = buildSuggestionQueries(profile, { limit: 5 });
    const event = {
      occurred_at: occurredAt,
      application: "Browser history",
      window_title: profile.title || item.title || hostnameFromUrl(item.url) || "Visited page",
      url: item.url,
      interaction_type: "history_import",
      content_text: profile.displayExcerpt || profile.structuredSummary || profile.title,
      full_text: profile.displayFullText || profile.rawFullText || profile.title,
      keyphrases_json: JSON.stringify(keyphrases),
      searchable_text: [
        profile.title,
        item.url,
        profile.domain,
        profile.subject,
        profile.structuredSummary,
        profile.displayExcerpt,
        profile.contextText,
        ...profile.topics,
        ...profile.entities,
        ...suggestionQueries.map((entry) => entry.query),
      ]
        .filter(Boolean)
        .join(" "),
      embedding_json: "[]",
      context_profile_json: JSON.stringify({
        ...profile,
        bootstrapImport: true,
        suggestionQueries,
      }),
      selective_memory_json: JSON.stringify({
        rememberScore: 0.66,
        shouldUseForSuggestions: true,
        shouldKeep: true,
        source: "history_bootstrap",
      }),
      capture_packet_json: JSON.stringify({
        points: [profile.structuredSummary || profile.title].filter(Boolean),
        searchTerms: suggestionQueries.map((entry) => entry.query),
        blocks: [
          {
            label: "History entry",
            text: [profile.title, profile.displayExcerpt].filter(Boolean).join(" - "),
          },
        ],
      }),
      capture_quality_json: JSON.stringify({
        source: "history_bootstrap",
        seeded: true,
      }),
      source: "history-bootstrap",
    };

    const result = await appendEvent(event);
    if (result?.skipped) {
      skippedCount += 1;
    } else {
      importedCount += 1;
    }
  }

  return {
    importedCount,
    skippedCount,
  };
}

export async function getBootstrapImportState() {
  const stored = await readBootstrapState();
  return (
    stored || {
      status: "idle",
      imported_at: "",
      imported_count: 0,
      skipped_count: 0,
      scanned_count: 0,
      history_days: DEFAULT_HISTORY_DAYS,
      history_limit: DEFAULT_HISTORY_LIMIT,
      source: "history-bootstrap",
      error: "",
    }
  );
}

export async function runBootstrapImport(options = {}) {
  if (importPromise) {
    return importPromise;
  }

  const force = Boolean(options.force);
  const historyDays = Math.max(1, Number(options.days || DEFAULT_HISTORY_DAYS));
  const historyLimit = Math.max(40, Number(options.limit || DEFAULT_HISTORY_LIMIT));

  importPromise = (async () => {
    const existingState = await getBootstrapImportState();
    if (!force && existingState.status === "complete" && Number(existingState.imported_count || 0) > 0) {
      return {
        ok: true,
        skipped: true,
        ...existingState,
      };
    }

    const startedAt = new Date().toISOString();
    await writeBootstrapState({
      ...existingState,
      status: "running",
      started_at: startedAt,
      error: "",
      history_days: historyDays,
      history_limit: historyLimit,
    });

    try {
      const historyItems = await chrome.history.search({
        text: "",
        maxResults: historyLimit,
        startTime: Date.now() - historyDays * 24 * 60 * 60 * 1000,
      });
      const normalizedItems = normalizeHistoryItems(historyItems).slice(0, historyLimit);
      const importSummary = await importHistoryItems(normalizedItems);
      const completedState = {
        status: "complete",
        started_at: startedAt,
        imported_at: new Date().toISOString(),
        imported_count: importSummary.importedCount,
        skipped_count: importSummary.skippedCount,
        scanned_count: normalizedItems.length,
        history_days: historyDays,
        history_limit: historyLimit,
        source: "history-bootstrap",
        error: "",
      };
      await writeBootstrapState(completedState);
      return {
        ok: true,
        skipped: false,
        ...completedState,
      };
    } catch (error) {
      const failedState = {
        status: "error",
        started_at: startedAt,
        imported_at: "",
        imported_count: 0,
        skipped_count: 0,
        scanned_count: 0,
        history_days: historyDays,
        history_limit: historyLimit,
        source: "history-bootstrap",
        error: String(error?.message || error || "history bootstrap failed"),
      };
      await writeBootstrapState(failedState);
      return {
        ok: false,
        skipped: false,
        ...failedState,
      };
    }
  })();

  try {
    return await importPromise;
  } finally {
    importPromise = null;
  }
}
