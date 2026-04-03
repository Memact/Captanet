# Captanet / Influnet Split Notes

## What Was Kept In Captanet

- All event capture, context extraction, noise filtering, sessioning, storage, extension bridge, and existing Memact app/UI code.
- All browser-extension assets and bundled runtime dependencies.
- All website assets, styles, and packaging scripts required to keep the existing product working.

## What Was Created For Influnet

- A separate `influnet/` package intended to become its own standalone repository.
- A deterministic CLI engine that reads Captanet activity snapshots and computes repeated directional transitions.

## Split Files

- Root `.gitignore`
  Split into `captanet/.gitignore` and `influnet/.gitignore`.

- Root `package.json`
  Split into `captanet/package.json` and `influnet/package.json`.

- Root `README.md`
  Split into `captanet/README.md` and `influnet/README.md`.

## Generated Outputs

- `.vite/`
- `dist/`
- `node_modules/`
- `logs/`
- `external/`
- `server/`

These are generated artefacts, empty folders, or local install outputs and do not belong in either independent codebase.

The packaged browser extension download remains at `public/memact-extension.zip` because the current Captanet product shell links to it directly during setup.

## Important Architectural Decision

No pre-existing source file contained both Captanet logic and Influnet logic because Influnet did not exist yet. The actual cross-system split happened at the repo/config/API boundary:

- existing app + extension source moved into `captanet/`
- new deterministic influence engine created in `influnet/`
- Captanet now exposes a stable snapshot API so Influnet does not read storage internals
