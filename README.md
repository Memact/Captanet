# Memact Capture

Version: `v0.0`

Capture is the browser evidence layer.

It owns one job:

```text
observe useful digital activity and store it as local evidence
```

Capture does not explain thoughts, form schemas, or generate answers. It records what the user encountered so other Memact layers can work from evidence.

## What This Repo Owns

- Chrome/Chromium extension runtime.
- Automatic page, tab, navigation, and interaction capture.
- Content extraction from webpages, PDFs, visible captions/transcripts, selections, and image context.
- Noise filtering for empty pages, auth screens, browser chrome, and low-value activity.
- Local IndexedDB storage for events, sessions, content units, graph packets, and media jobs.
- Public bridge APIs for Website and downstream engines.
- Extension packaging.

## Local Evidence Model

Capture stores several levels of evidence:

- `events`
  Individual useful activity records.

- `sessions`
  Time windows built from events.

- `activities`
  Higher-level activity groups built from sessions/events.

- `content_units`
  Captured text fragments such as article paragraphs, captions, transcript segments, PDF text, image captions, and selected text.

- `graph_packets`
  Local packets containing content units, extracted nodes, extracted edges, and evidence text.

- `media_jobs`
  Local OCR/ASR job descriptors. These are not raw media files.

## Multimedia Boundary

Capture is automatic and local-first.

It does not:

- download snapshots to the user's Downloads folder
- show capture popups while browsing
- store raw audio/video blobs
- send captured media to the cloud

For video/audio, Capture first looks for captions, transcript text, and page context. If transcript text is missing, it records a local ASR job descriptor for a future helper.

For images, Capture stores alt text, captions, filenames, nearby section context, and OCR job descriptors for likely text-heavy images.

## Public API

Downstream code should use only the public contract in [`docs/api-contract.md`](docs/api-contract.md).

Page API:

```js
await window.capture.getEvents({ limit: 3000 });
await window.capture.getSessions({ limit: 3000 });
await window.capture.getActivities({ limit: 3000 });
await window.capture.getContentUnits({ limit: 1200 });
await window.capture.getGraphPackets({ limit: 400 });
await window.capture.getMediaJobs({ limit: 200 });
await window.capture.getSnapshot({ limit: 3000 });
```

`exportSnapshot()` is kept as an alias for `getSnapshot()`. It returns data; it does not write a file.

## Run Locally

Prerequisites:

- Node.js `20+`
- npm `10+`
- Chrome, Edge, or another Chromium browser

Install:

```powershell
npm install
```

Validate:

```powershell
npm run check
```

Build extension zip:

```powershell
npm run build
```

The zip is created at:

```text
artifacts/memact-extension.zip
```

Load unpacked:

1. Open `chrome://extensions` or `edge://extensions`.
2. Enable Developer Mode.
3. Click `Load unpacked`.
4. Select `extension/memact/`.

## Verify Capture

After loading the extension, browse normally. Then open an authorized Memact page and run:

```js
const snapshot = await window.capture.getSnapshot({ limit: 50 });
console.log(snapshot.events.length);
console.log(snapshot.graph_packets[0]);
```

## Security Notes

- The bridge is restricted to authorized Memact origins.
- Memory pulses contain counts and signatures, not captured page content.
- Broad host access is used for observation only.
- Raw media is not stored by the extension.

## License

See `LICENSE`.
