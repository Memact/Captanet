# Memact description

**Permissioned intent infrastructure for apps.**

```text
Understand what users are trying to do.
```

Memact is infrastructure that helps apps predict user intent from approved digital activity, without giving them raw access to a user's private data.

This repo is the Capture layer. It records useful approved digital activity as local evidence that downstream Memact layers can filter, structure, store, and use for intent prediction.

## System position

```text
Access -> Capture -> Inference -> Schema -> Memory -> Intent
```

Capture is local evidence collection. It does not produce final intent predictions, expose a user's full memory graph, or sell raw activity as a data feed.

## Copy rules

Use:

- "Permissioned intent infrastructure for apps."
- "Understand what users are trying to do."
- "approved digital activity"
- "local evidence"
- "sensitive activity is skipped before downstream processing"

Avoid:

- generic AI wrapper language
- vague memory-plugin language
- raw-data export framing
- claims that apps get the whole memory graph
- open-source wording unless the repo license explicitly says so
