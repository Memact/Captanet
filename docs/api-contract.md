# Memact Capture API Contract

Downstream Memact engines must consume Capture only through the public data contract.

Capture is the source-of-truth evidence boundary for Memact's citation and answer engine. It should expose enough structured website-consumption data for downstream systems to cite what the user actually consumed, without forcing those systems to read Capture internals.

## Public Functions

Located in `extension/memact/capture-api.js`.

- `getEvents({ limit })`
  Returns normalized, noise-filtered event records in chronological order.

- `getSessions({ limit })`
  Returns chronological session windows derived from the event stream.

- `getActivities({ limit })`
  Returns semantic activity units derived from the same session builder.

- `getContentUnits({ limit })`
  Returns ordered content units captured from webpages, transcripts/captions, PDFs, and image context.

- `getGraphPackets({ limit })`
  Returns multimedia graph packets with content units, nodes, edges, and pending local media jobs.

- `getMediaJobs({ limit })`
  Returns pending local OCR/ASR jobs. These are job descriptors only, not raw media.

- `getCaptureSnapshot({ limit })`
  Returns a full snapshot with `events`, `sessions`, `activities`, `content_units`, `graph_packets`, and `pending_media_jobs`.

## Snapshot Shape

```json
{
  "system": "capture",
  "snapshot_type": "capture-memory-export",
  "schema_version": 2,
  "generated_at": "2026-04-03T12:00:00.000Z",
  "counts": {
    "events": 120,
    "sessions": 28,
    "activities": 28,
    "content_units": 240,
    "graph_packets": 92,
    "pending_media_jobs": 3
  },
  "events": [],
  "sessions": [],
  "activities": [],
  "content_units": [],
  "graph_packets": [],
  "pending_media_jobs": []
}
```

## Multimedia Graph Packet Shape

```json
{
  "packet_id": "mgc_12_attention_video",
  "packet_type": "multimedia_graph_capture",
  "schema_version": 1,
  "source": "browser_extension",
  "event_id": 12,
  "url": "https://example.com/video",
  "domain": "example.com",
  "title": "How Attention Works",
  "media_type": "video",
  "captured_at": "2026-04-03T12:00:00.000Z",
  "content_units": [
    {
      "unit_id": "transcript_1",
      "media_type": "video",
      "unit_type": "transcript_segment",
      "text": "Repeated exposure shapes attention.",
      "location": "Transcript or captions",
      "confidence": 0.82
    }
  ],
  "nodes": [
    {
      "id": "repeated_exposure",
      "label": "repeated exposure",
      "type": "concept",
      "count": 1
    }
  ],
  "edges": [
    {
      "from": "repeated_exposure",
      "to": "attention",
      "type": "shapes",
      "evidence": "Repeated exposure shapes attention.",
      "unit_id": "transcript_1",
      "confidence": 0.92,
      "extraction": "pattern"
    }
  ],
  "processing_jobs": []
}
```

Graph packets are deterministic local evidence envelopes. They do not claim final origin or influence by themselves. Schema, Memory, Origin, and Influence decide what survives and how it should be used later.

Raw audio/video blobs are not part of this contract. When transcript text is missing, Capture exposes a pending local media job so a future local helper can transcribe without forcing Capture clients to handle media files.

## Activity Shape

```json
{
  "id": 14,
  "key": "startup",
  "label": "Reading about startup",
  "subject": "startup",
  "summary": "Saved page about startup.",
  "started_at": "2026-04-03T08:00:00.000Z",
  "ended_at": "2026-04-03T08:14:00.000Z",
  "duration_ms": 840000,
  "event_count": 3,
  "keyphrases": ["startup", "pitch deck"],
  "domains": ["youtube.com"],
  "applications": ["chrome"],
  "mode": "reading",
  "event_ids": [11, 12, 13],
  "events": [
    {
      "id": 11,
      "occurred_at": "2026-04-03T08:05:00.000Z",
      "url": "https://youtube.com/watch?v=startup-ideas",
      "domain": "youtube.com",
      "application": "chrome",
      "title": "Startup Ideas Video",
      "context_subject": "startup",
      "page_type": "video",
      "structured_summary": "Saved page about startup."
    }
  ]
}
```

The nested `events` array is especially useful for downstream evidence-first systems such as Inference, Origin, and Influence because it preserves the page/domain/title trail behind a higher-level activity.

## Evidence Fields

Downstream engines should prefer these evidence fields when available:

- `url`
- `domain`
- `title`
- `occurred_at`
- `started_at`
- `ended_at`
- `content_text`
- `full_text`
- `display_full_text`
- `context_profile`
- `capture_packet`
- nested activity `events`

These fields are what let Memact answer with citations instead of unsupported summaries.

## Bridge Messages

These messages are now forwarded through `extension/memact/bridge.js`.

- `CAPTURE_GET_EVENTS`
- `CAPTURE_GET_SESSIONS`
- `CAPTURE_GET_ACTIVITIES`
- `CAPTURE_GET_CONTENT_UNITS`
- `CAPTURE_GET_GRAPH_PACKETS`
- `CAPTURE_GET_MEDIA_JOBS`
- `CAPTURE_GET_SNAPSHOT`
- `CAPTURE_BOOTSTRAP_HISTORY`
- `CAPTURE_BOOTSTRAP_STATUS`
- `CAPTURE_CLEAR_BOOTSTRAP_HISTORY`
- `MEMACT_STATUS`

Responses:

- `CAPTURE_GET_EVENTS_RESULT`
- `CAPTURE_GET_SESSIONS_RESULT`
- `CAPTURE_GET_ACTIVITIES_RESULT`
- `CAPTURE_GET_CONTENT_UNITS_RESULT`
- `CAPTURE_GET_GRAPH_PACKETS_RESULT`
- `CAPTURE_GET_MEDIA_JOBS_RESULT`
- `CAPTURE_GET_SNAPSHOT_RESULT`
- `CAPTURE_BOOTSTRAP_HISTORY_RESULT`
- `CAPTURE_BOOTSTRAP_STATUS_RESULT`
- `CAPTURE_CLEAR_BOOTSTRAP_HISTORY_RESULT`
- `MEMACT_STATUS_RESULT`

`MEMACT_STATUS` includes a lightweight sync signature:

```json
{
  "ready": true,
  "eventCount": 120,
  "sessionCount": 28,
  "graphPacketCount": 92,
  "contentUnitCount": 240,
  "pendingMediaJobCount": 3,
  "lastEventAt": "2026-04-25T05:00:00.000Z",
  "lastGraphPacketAt": "2026-04-25T05:00:02.000Z",
  "memorySignature": "120|28|92|240|3|2026-04-25T05:00:00.000Z|2026-04-25T05:00:02.000Z|complete|2026-04-25T04:58:00.000Z|54"
}
```

Clients should compare `memorySignature` before asking for `CAPTURE_GET_SNAPSHOT`.
If the signature did not change, the previous knowledge envelope is still current.

## Browser Runtime Export

When an authorized host is running with the extension bridge enabled, the page exposes a small runtime API:

That runtime is provided by `extension/memact/page-api.js`, which is injected into the page by `extension/memact/bridge.js`.

- `window.capture.getEvents({ limit })`
- `window.capture.getSessions({ limit })`
- `window.capture.getActivities({ limit })`
- `window.capture.getContentUnits({ limit })`
- `window.capture.getGraphPackets({ limit })`
- `window.capture.getMediaJobs({ limit })`
- `window.capture.getSnapshot({ limit })`
- `window.capture.exportSnapshot({ limit })`

`exportSnapshot()` is now an alias for `getSnapshot()` for developer compatibility. It does not write files.
`downloadSnapshot()` is intentionally disabled.

Capture does not download snapshots. Live products should use `MEMACT_STATUS`, `memorySignature`, and `CAPTURE_GET_SNAPSHOT` through the bridge so captured data stays local and only moves when a Memact client requests it.
`MEMACT_STATUS.sync` reports `mode: "memory_pulse_bridge"` and `automaticDownloads: false` so clients can tell that automatic capture is running without a file-export loop.

This runtime is available by default on:

- `memact.com`
- localhost development hosts

It can also be enabled on any other authorized origin after the user explicitly grants access by clicking the extension action on that host once.

## Dependency Rule

- Capture must not import Inference, Schema, Interface, Influence, or Origin.
- Downstream engines may consume only the snapshot/activity contract above.
- No downstream engine may read `db.js`, `context-pipeline.js`, or other Capture internals directly.

## Platform Rule

Capture is the evidence source for every Memact client, not only the website.

Future Android capture should produce the same public snapshot shape:

- `events`
- `sessions`
- `activities`
- `content_units`
- `graph_packets`
- `pending_media_jobs`
- evidence fields such as `url`, `title`, `domain`, timestamps, and captured text

Future API explanation should never call Capture internals.
It should receive downstream evidence envelopes produced from this public contract.
