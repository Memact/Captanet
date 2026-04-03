# Captanet

Captanet is the foundation system extracted from the original Memact project.

It answers:

`What happened?`

It is responsible for:

- capturing user activity
- filtering noisy captures
- detecting sessions
- grouping activity into structured memory units
- storing episodic memory locally
- exposing clean event/session/activity APIs

The existing Memact website and extension experience still live here as the current product shell on top of the Captanet foundation.

## Why It Matters

Captanet is the memory substrate beneath the product.

It turns noisy page-level and app-level activity into cleaner, structured, retrievable memory units that downstream systems can consume consistently.

That makes Captanet the stable foundation for:

- memory-aware products
- recall interfaces
- downstream influence analysis
- future analytics or agent layers that need a deterministic event/activity contract

## Relationship To Influnet

This repository now represents the `captanet/` system in the split architecture:

- `captanet/` answers: "What happened?"
- `influnet/` answers: "What led to what?"

Influnet must consume Captanet outputs only through the Captanet API and snapshot contract.

## Captanet Snapshot Export

Captanet now exposes a first-class snapshot export path for downstream consumers like Influnet.

When the website is open with the browser extension bridge active, you can use either:

- the website menu item `Export Captanet Snapshot`
- the browser runtime API:

```js
await window.captanet.getSnapshot({ limit: 3000 })
await window.captanet.exportSnapshot({ limit: 3000 })
```

The exported JSON uses the documented Captanet snapshot contract and is the only format Influnet should read directly.

## Embedding And Reuse

Technical answer:

- yes, Captanet is structured to be embedded consistently into future Memact-controlled projects
- the stable reuse boundary is its public data contract, not its internal storage or pipeline modules

Recommended reuse surface:

- `window.captanet.getEvents({ limit })`
- `window.captanet.getSessions({ limit })`
- `window.captanet.getActivities({ limit })`
- `window.captanet.getSnapshot({ limit })`
- exported Captanet snapshot JSON

Recommended rule:

- treat Captanet as a foundation service
- treat its snapshot and API contract as the integration layer
- do not couple new projects to internal files like `db.js`, `context-pipeline.js`, or UI-specific code

License answer:

- the current repository license is proprietary
- you can reuse Captanet inside your own Memact-controlled projects
- it is not currently licensed for open third-party embedding or redistribution

## What Memact Does

- captures browser memories locally through the desktop extension
- lets the website recall those memories through a conversational thread
- supports phone browsers in local web mode
- skips junk, shell pages, and low-value captures where possible
- connects related events through an Episodic Graph
- applies selective memory so stronger captures are kept and weaker ones are compressed or demoted
- handles PDFs, math-heavy content, chemistry notation, and symbol-heavy text better than a plain snippet UI
- shows key points, matched passages, facts, connected memory, and optionally the full extracted memory

## Current Product Shape

### Website

- React + Vite website
- works on desktop and phone browsers
- conversational recall UI with a thread-style answer surface
- `Message` composer with native browser voice input where supported
- local chat history stored in the browser
- hidden sources dialog per answer
- memory detail dialog with:
  - key points
  - matched passages
  - facts
  - connected memory
  - optional full extracted text
  - optional raw captured text

### Desktop Extension

- Chromium-based extension for Edge, Chrome, Brave, Vivaldi, and similar browsers
- captures browsing activity locally
- uses local storage and local recall indexes
- opens `https://www.memact.com` when the toolbar icon is clicked
- can be installed manually through the website setup flow
- exposes its installed version so the website can warn if the extension is outdated

### Phone Mode

- runs as a local web shell
- supports local recall UI and local storage fallback
- does not do desktop-style automatic cross-browser capture

## Major Features

### Conversational Recall

Memact now behaves more like a memory conversation than a search page.

Each reply is grounded in local captured memories and can show:

- a direct answer
- a short summary
- key points
- sources from memory

### Selective Memory

Memact assigns a memory action and tier to captures so everything is not treated equally.

Possible actions:

- `retain`
- `compress`
- `demote`
- `skip`

Possible tiers:

- `core`
- `supporting`
- `background`
- `fleeting`

This helps Memact:

- keep strong memories richer
- reduce clutter from weak captures
- avoid low-value memories polluting recall
- weight results by memory importance

### Episodic Graph

Memact connects events to other events with typed relationships and scores.

Examples:

- search result -> opened page
- docs page -> follow-up action
- reading -> coding
- same topic
- same entity
- same session continuation

This helps answer:

- what led to this?
- what happened after this?
- what else was connected to this?

### Rich Capture Packets

Memact stores a richer capture packet for each event instead of collapsing most activity into a thin snippet.

A packet can include:

- page type
- activity label
- subject
- structured summary
- key points
- search terms
- extracted content blocks

### PDF, Math, Chemistry, and Symbol Support

Memact handles technical content better than a plain browser-history search tool.

Current support includes:

- PDF extraction with `pdf.js`
- KaTeX rendering
- MathJax fallback
- `mhchem` support for chemistry notation
- better symbol font fallbacks for Greek, physics, and mathematical text

### Faster Local Recall

Memact uses local indexing and caching so recall feels more immediate.

Current speed layers include:

- Dexie-backed local storage
- FlexSearch indexes for quick local lookup
- cached result reuse
- local chat-history restore
- deterministic answer shaping from the strongest matched memories

## How Memact Works

1. The extension captures a page locally.
2. Memact extracts the page title, URL, snippet, full text, app, site, time, and session context.
3. Capture intent decides whether the page should be stored fully, stored structurally, kept as metadata only, or skipped.
4. Clutter audit scores the capture for noise, repetition, and low-value formatting.
5. Context extraction builds a structured page profile.
6. Selective memory assigns a tier, action, retention mode, and remember score.
7. Sessions group nearby related activity.
8. The Episodic Graph links strongly related events.
9. Query parsing and ranking recall those memories using exact signals first and broader semantic support second.
10. The website renders a conversational answer plus direct supporting evidence.

## Retrieval Model

Memact is local-first and retrieval-driven.

It combines:

- exact field matching
- metadata filters
- local embeddings
- reranking
- session support
- selective memory weighting
- episodic graph support
- derivative passages for better evidence display

## Tech Stack

- React
- Vite
- Node HTTP server for local/static hosting
- Manifest V3 browser extension
- IndexedDB
- Dexie
- FlexSearch
- `@xenova/transformers`
- `pdfjs-dist`
- KaTeX
- MathJax
- `mhchem`

## Important Local Modules

- `extension/memact/background.js`
  - capture orchestration, storage flow, and extension messaging
- `extension/memact/context-pipeline.js`
  - structured page understanding and cleaned memory text
- `extension/memact/capture-intent.js`
  - decides what kind of page this is and what should be kept
- `extension/memact/clutter-audit.js`
  - scores noisy captures and trims or skips them
- `extension/memact/page-intelligence.js`
  - local usefulness judgement
- `extension/memact/selective-memory.js`
  - memory tiering, retention, and remember scoring
- `extension/memact/query-engine.js`
  - retrieval, reranking, sessions, episodic graph, and answer shaping
- `extension/memact/pdf-support.js`
  - PDF extraction support
- `extension/memact/search-index.js`
  - local fast index support
- `src/lib/webMemoryStore.js`
  - website fallback memory store with Dexie and local indexing
- `src/components/MathRichText.jsx`
  - math, chemistry, and symbol-friendly rendering
- `src/lib/appMeta.js`
  - shared website / extension version contract

## Privacy

- local-first by default
- no cloud memory sync
- no cloud answer generation
- no screenshot capture
- no keystroke logging

Your browsing memories stay on-device unless you explicitly open the original pages yourself.

## Running Locally

Install dependencies:

```powershell
npm install
```

Start the dev server:

```powershell
npm run dev
```

Build the website:

```powershell
npm run build
```

Run the production server locally:

```powershell
npm run start
```

Package the extension zip:

```powershell
npm run package-extension
```

## Loading The Extension Manually

Use the website menu item `Install Browser Extension`.

Manual flow:

1. Open `edge://extensions`, `chrome://extensions`, `brave://extensions`, `opera://extensions`, or `vivaldi://extensions`
2. Turn on Developer mode
3. Click `Load unpacked`
4. Select the extracted folder that directly contains `manifest.json`
5. Reload the Memact website

## Supported Hosts

The extension bridge currently supports:

- `http://localhost`
- `http://127.0.0.1`
- `http://0.0.0.0`
- `https://memact.com`
- `https://www.memact.com`

## Render Deployment

Memact can be served with the included Node server.

The current `render.yaml` uses:

- `runtime: node`
- `buildCommand: npm run build`
- `startCommand: npm run start`

No cloud-model environment variables are required for the current local-only build.

## Repo Layout

- `src/` - website UI
- `extension/memact/` - browser extension
- `public/` - static website assets
- `assets/` - fonts and visual assets
- `memact_branding/` - logos and brand files
- `server/` - local server helpers
- `scripts/` - packaging and support scripts

## Status

This is `MVP v1.2`.

It is deployable and useful, but still experimental. Capture cleanliness, recall quality, conversational grounding, and memory organization are actively improving.

## License

This repository uses the same license text as the original Memact codebase.

See `LICENSE`.
