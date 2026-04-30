# Memact Capture

Version: `v0.0`

Capture is the observation layer in the Memact architecture.

It answers:

`What did the user encounter?`

This repository contains the browser extension, event capture pipeline, context extraction, storage, session/activity grouping, and the public snapshot API consumed by downstream Memact engines.

Capture is the evidence layer for Memact's citation and answer engine. Its job is to preserve enough website-consumption context that downstream systems can later answer with citations instead of guessing.

## Pipeline Position

```text
Capture -> Inference -> Schema -> Memory -> Interface / Query -> Influence / Origin
```

Capture does not interpret thoughts. It records evidence. Memory later decides what should survive and builds RAG context for answers.

## First-Use Bootstrap

Capture can seed the local store on first use with a limited import of recent browser history. This prevents downstream layers from starting completely empty.

- The import stays local to the extension.
- It creates deterministic metadata-based event records.
- The user must explicitly allow it from the Interface popup.
- It can be requested again through the bridge.
- It can be cleared separately without deleting future captured activity.
- Those imported events are a starting layer until richer live capture takes over.

## What Capture Does

- captures browser activity
- extracts page context and content from websites the user consumes
- filters noisy or low-value events
- stores local event history
- stores multimedia content units and graph evidence packets
- builds sessions and activity groups
- exposes structured snapshots through the bridge
- ranks searches with deterministic local embeddings
- exposes local bridge APIs for downstream engines without automatic file downloads

## Website Evidence Captured

For supported pages, Capture stores the evidence needed for later citation:

- URL, domain, title, page description, and timestamps
- active tab, window, navigation, and route-change signals
- dwell/visibility signals that show the page was actually consumed
- scroll, typing, text selection, media playback, and content-mutation signals
- snippets, cleaned page text, display text, and full extracted text where available
- article paragraphs/headings, caption/transcript text when visible, PDF text, and image context
- local graph packets with content units, extracted nodes, extracted edges, and evidence text
- local pending jobs for OCR/ASR helper work when captions or readable image text are missing
- structured context profiles with topics, entities, page purpose, and capture intent
- capture packets with important blocks, points, search terms, and source metadata
- nested event trails inside activities so later answers can cite the original source

Capture should collect enough useful context for citation while still filtering obvious noise, empty pages, auth screens, and low-value browser chrome.

## Multimedia Graph Capture

Capture now writes a local graph packet beside each useful event:

```text
webpage / video / audio / image / PDF
-> content units
-> nodes and edges
-> graph evidence packet
-> local IndexedDB
```

This is automatic. It does not download snapshots, show capture popups, store raw audio/video, or send captured media to the cloud.

Current automatic coverage:

- webpages and articles: headings, paragraphs, quotes, list items, selections, metadata
- video pages: visible captions/transcript segments when the page exposes them, plus local ASR job markers when transcript text is missing
- audio pages: media metadata plus local ASR job markers when transcript text is missing
- images: alt text, captions, filenames, surrounding section context, and local OCR job markers for likely text-heavy images
- PDFs: extracted text when PDF.js can read the document

Heavy transcription and OCR are intentionally represented as local jobs first. A future local helper can process those jobs during idle time without changing the public contract or uploading raw media.

Silent raw tab-audio capture is not shipped in this layer. Chrome's tab capture path requires extension invocation for the active tab, and storing raw media would weaken the privacy boundary. Capture instead prefers page captions/transcripts first, then leaves local ASR job markers for a helper that can run only when the user has enabled that capability.

## What Capture Does Not Do

- infer cognitive schemas
- decide what shaped a thought
- generate answers
- generate influence claims
- own the product interface

Those concerns belong to Inference, Schema, Interface, Influence, and Origin.

## Public Integration Surface

Downstream systems should consume Capture only through the public snapshot/API boundary.

Primary surface:

- `extension/memact/capture-api.js`
- `docs/api-contract.md`

Public functions:

- `getEvents({ limit })`
- `getSessions({ limit })`
- `getActivities({ limit })`
- `getContentUnits({ limit })`
- `getGraphPackets({ limit })`
- `getMediaJobs({ limit })`
- `getCaptureSnapshot({ limit })`

Runtime bridge messages also expose:

- `MEMACT_STATUS`
  Returns counts, extension state, bootstrap state, and a lightweight `memorySignature`.
- `MEMACT_MEMORY_PULSE`
  Automatically tells an authorized Memact surface that local memory changed.
  This pulse contains counts, state, and a signature only. It does not send captured page content.
- `CAPTURE_BOOTSTRAP_HISTORY`
  Starts local first-use browser activity import.
- `CAPTURE_CLEAR_BOOTSTRAP_HISTORY`
  Clears only browser-imported seed memories.

Clients should use `memorySignature` before requesting a full snapshot so they do not repeatedly move the same captured data.

## Automatic Sync Model

Capture uses a lightweight Memory Pulse model instead of repeated downloads.

- Capture records useful activity automatically while the user browses.
- When local memory changes, Capture emits a small `MEMACT_MEMORY_PULSE` to authorized Memact pages.
- The pulse carries only status, counts, and `memorySignature`.
- Website refreshes its local knowledge only when that signature changes.
- No captured snapshot is written to Downloads.
- No full captured dataset is sent to Gemini. Downstream answers use selected schema/origin/influence evidence only.

## Security Notes

- Capture does not bundle WebLLM or remote transformer runtimes.
- Capture does not download models at runtime.
- The extension content bridge posts messages only to the current page origin.
- Only authorized Memact pages can access the page bridge.
- The packaged extension exposes only the page API as a web-accessible resource.
- Broad host access is used only so Capture can observe activity across websites the user visits.

## Snapshot Access

Capture snapshots contain:

- `events`
- `sessions`
- `activities`
- `content_units`
- `graph_packets`
- `pending_media_jobs`

Capture stores activity locally inside the extension. It does not download captured snapshots to the user's Downloads folder.

Downstream systems should use the bridge API and `memorySignature` to request data only when the local memory changed.
This is the automatic path for the product: Capture keeps recording useful activity, and clients sync through the bridge instead of watching downloaded files.

Developer snapshot reads are still available from an authorized page:

```js
await window.capture.getSnapshot({
  limit: 3000,
});
```

`window.capture.exportSnapshot({ limit })` is kept as a compatibility alias for `getSnapshot()`.
It returns the snapshot object and does not write a file.

## Terminal Quickstart

Prerequisites:

- Node.js `20+`
- npm `10+`
- a Chromium-based browser for extension loading

Install dependencies:

```powershell
npm install
```

Run validation:

```powershell
npm run check
```

Package the extension:

```powershell
npm run package-extension
```

The packaged extension is written to:

```text
artifacts/memact-extension.zip
```

Load locally:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select `extension/memact/` or the extracted package folder.

If Memact Interface is running, it can also offer the ready-to-download zip from:

```text
public/memact-extension.zip
```

## Verify Capture

After loading the extension, browse normally and interact with real pages.

Capture refreshes on:

- navigation
- SPA route changes
- tab/window focus changes
- visible page dwell
- meaningful content mutations
- media playback
- scroll, typing, and text selection activity

To inspect a snapshot from an authorized page:

```js
const snapshot = await window.capture.getSnapshot({ limit: 50 });
console.log(snapshot.activities[0]);
console.log(snapshot.graph_packets[0]);
```

## Downstream Flow

The intended local pipeline is:

```powershell
cd ..\website
npm run dev
```

Website / Query should ask Capture through the extension bridge. If a file-based run is needed for debugging, create a manual snapshot export first, then feed that file into Inference and Schema.

## Repository Layout

- `extension/memact/`
  Core extension runtime, capture pipeline, storage, session/activity model, and bridge.
- `docs/api-contract.md`
  Public Capture contract.
- `scripts/sync-vendors.mjs`
  Syncs extension vendor assets.
- `scripts/package-extension.mjs`
  Packages the extension into `artifacts/memact-extension.zip`.

## Embedding And Reuse

Capture is reusable inside Memact-controlled projects through its public API and snapshot contract.

The current license is proprietary. It is not licensed for open third-party embedding or redistribution.

## License

See `LICENSE`.
