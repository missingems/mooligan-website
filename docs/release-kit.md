# The release kit

A release kit is everything the website needs to know about one release of the Mooligan app,
in one folder. It is the only thing passed between the two halves of the pipeline:

- **The marketing engineer** (in `missingems/Mooligan`) writes the release notes, keeps the
  feature catalogue current, and writes the UI tours; the capture job on a macOS runner replays
  the tours and adds the screenshots and videos. Together they **produce** the kit.
- **The article writer** (in this repository) **consumes** the kit and updates the instructions. It never
  reads the app’s code, so everything it needs must be in the kit.

This document is the contract. Version 1 is described here; the JSON Schemas in
[`schemas/release-kit/`](../schemas/release-kit) are its machine-readable half, and
`npm run validate-kit <folder>` checks a kit against both.

```
release-kit-1.4.0/
  manifest.json          the app version, devices, and every captured asset
  changes.json           what changed since the previous kit
  release-notes.md       what’s new, written for people using the app
  features/
    filtering.md         one file per feature: what it does, its use cases and their flows
    …
  assets/
    filtering/stack-filters/result.iphone-17-pro.light.png        framed, full size
    filtering/stack-filters/result.iphone-17-pro.light.web.png    framed, sized for the web
    filtering/stack-filters/result.iphone-17-pro.light.raw.png    unframed
    …
```

An example lives in [`examples/release-kit/`](../examples/release-kit).

## Names

Every id is lower-case kebab-case: `filtering`, `stack-filters`, `result`.

- A **feature** is a thing the app does, with its own place in the app: `filtering`, `scanner`.
- A **use case** is one job a person does with a feature: `stack-filters`, `clear-filters`.
- A **flow** is the steps of a use case, in order.
- A **capture** is a moment in a flow worth showing. Its asset id is
  `<feature>/<use case>/<capture>`, and its files are named
  `<capture>.<device>.<appearance>[.web|.raw].<ext>` under `assets/<feature>/<use case>/`.

Ids are stable across releases. Renaming one is a removal plus an addition.

## `features/<feature>.md`

The feature catalogue is **cumulative**: every kit carries every feature the app has, not just the
ones that changed. The article writer needs the whole catalogue to keep the instructions complete, and
`changes.json` to know where to look first. The catalogue lives in the app repository and is
updated alongside the code.

Front matter (schema: `feature.schema.json`), then a description in Markdown:

```markdown
---
id: filtering
title: Filtering
summary: Narrow any list of cards by colour, type, rarity, mana value or format.
since: 1.0.0
ui: [Filter, Clear, Done]
use_cases:
  - id: stack-filters
    title: Narrow a list with several filters
    goal: Find every blue card legal in Modern.
    flow:
      - step: Open any list of cards, such as a set or search results.
      - step: Tap `Filter`.
        capture: filter-sheet
      - step: Choose Blue under Colour, then Modern under Format, and tap `Done`.
      - step: The list shows only matching cards, with the filters in a row above it.
        capture: result
    video: walkthrough
---
Filters narrow whatever list is on screen. They stack, and stay until removed…
```

- `ui` lists the labels exactly as the app shows them. The writer copies their spelling and
  sets them as `` `labels` ``.
- `capture` on a step names a screenshot taken at that step. `video` names a recording of the
  whole flow. Both must exist in `manifest.json`.
- The description is for the writer, not for readers: say what the feature is for, how it
  behaves, its limits and edge cases, and anything a person might get wrong. Plain facts; the
  writer supplies the voice.

## `manifest.json`

Schema: `manifest.schema.json`.

```json
{
  "kit_version": 1,
  "app": { "version": "1.4.0", "build": "212", "commit": "3f2a9c1", "released": "2026-10-01" },
  "previous": "1.3.0",
  "locale": "en-GB",
  "devices": [
    { "id": "iphone-17-pro", "name": "iPhone 17 Pro", "family": "iphone", "points": [402, 874], "scale": 3 }
  ],
  "appearances": ["light", "dark"],
  "assets": [
    {
      "id": "filtering/stack-filters/result",
      "feature": "filtering",
      "use_case": "stack-filters",
      "capture": "result",
      "kind": "screenshot",
      "description": "A list of blue cards legal in Modern, with the two filters in a row above it.",
      "files": [
        {
          "device": "iphone-17-pro",
          "appearance": "light",
          "framed": "assets/filtering/stack-filters/result.iphone-17-pro.light.png",
          "web": "assets/filtering/stack-filters/result.iphone-17-pro.light.web.png",
          "raw": "assets/filtering/stack-filters/result.iphone-17-pro.light.raw.png",
          "width": 600,
          "height": 1226
        }
      ]
    }
  ]
}
```

- `description` is the alt text: what the capture shows, in one sentence.
- `width` and `height` are those of the `web` file.
- Every asset has a file for **every** device and appearance listed at the top.

### Devices

One representative per size class the app supports, not every model:

| id | name | why |
| --- | --- | --- |
| `iphone-se-3` | iPhone SE (3rd generation) | the smallest screen still supported |
| `iphone-17` | iPhone 17 | the common size |
| `iphone-17-pro-max` | iPhone 17 Pro Max | the largest phone; App Store 6.9″ |
| `ipad-pro-13` | iPad Pro 13″ | only if the app runs on iPad |

The website shows one device (`figures.device` in `content/book.yml`). The others are for the App
Store and for marketing.

### Screenshots

- PNG. `raw` is the simulator’s screenshot at native resolution, status bar set with
  `xcrun simctl status_bar … override` (9:41, full signal, full battery).
- `framed` is the raw screenshot inside Apple’s official device bezel (Apple Design Resources),
  on a transparent background, at full resolution.
- `web` is the framed image scaled to 600 px wide, at most 400 KB.

### Videos

- H.264 MP4, no audio, 30 fps, at most 15 seconds. Recorded with
  `xcrun simctl io <device> recordVideo --codec=h264`, trimmed to the flow.
- `framed` composites the bezel over the recording; `web` is scaled to 600 px wide, at most 3 MB.
- Every video file entry also has `poster`: a framed, web-sized PNG of its first frame.

### Determinism

Captures are made in the app’s **demo mode**: bundled sample data, a fixed date and clock, no
network, no onboarding, no review prompts. The same build must produce the same pixels, so that a
changed screenshot always means changed app.

## `changes.json`

Schema: `changes.schema.json`. What moved since the kit for `previous`.

```json
{
  "from": "1.3.0",
  "to": "1.4.0",
  "features": {
    "new": ["deck-builder"],
    "changed": [
      { "id": "filtering", "use_cases": ["stack-filters"], "summary": "Filters can be saved and applied again." }
    ],
    "removed": [
      { "id": "legacy-search", "summary": "Merged into search." }
    ]
  },
  "assets": {
    "new": ["deck-builder/build-a-deck/result"],
    "changed": [{ "id": "filtering/stack-filters/result", "difference": 0.18 }],
    "removed": []
  }
}
```

- `features.changed` lists behaviour changes, from the code. `summary` says what a reader would
  notice.
- `assets.changed` lists captures whose pixels differ from the previous kit; `difference` is the
  fraction of pixels that changed (on the website’s device, light appearance). A capture can change
  when its feature didn’t, for example after a redesign elsewhere.
- For the first kit, `from` is `null` and every feature and asset is `new`.

## `release-notes.md`

What’s new, written for people who use the app. Front matter gives the version and date; then up
to three sections, in this order, each a list:

```markdown
---
version: 1.4.0
date: 2026-10-01
---
## New
- **Saved filters.** Keep a set of filters and apply it again with one tap. [feature: filtering]

## Improved
- The scanner reads foil cards more reliably in low light. [feature: scanner]

## Fixed
- Double-faced cards now open on the face you scanned. [feature: scanner]
```

`[feature: id]` ties an item to the catalogue; items that don’t concern one feature leave it out.

## Delivery

1. The marketing engineer’s pull request in the app repository carries the release notes, the
   catalogue changes and the tours. The capture job runs the tours on that pull request and posts
   the framed screenshots to it for review.
2. When the release is published, the publish job assembles the kit, checks it with
   `validate-kit`, and attaches it to the GitHub release as `release-kit-<version>.zip`.
3. It then fires the article writer’s routine with this text:
   `{"version": "1.4.0", "kit": "<URL of release-kit-1.4.0.zip>"}`.

## Versioning this format

`kit_version` is bumped for any change a consumer would have to handle. Adding optional fields
doesn’t count. The article writer refuses kits with a version it doesn’t know.
