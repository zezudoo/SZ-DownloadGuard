---
date: 2026-02-02T09:32:31.0064785-03:00
researcher: zezudoo
git_commit: 6ce973d0fb725337e6f93022708630f3f6af0faa
branch: main
repository: SZ-DownloadGuard
topic: "Complete codebase research for the WA Download Guard Chrome extension"
tags: [research, codebase, chrome-extension, service-worker, content-script, options-page, policy]
status: complete
last_updated: 2026-02-02
last_updated_by: zezudoo
---

# Research: Complete codebase research for the WA Download Guard Chrome extension

**Date**: 2026-02-02T09:32:31.0064785-03:00  
**Researcher**: zezudoo  
**Git Commit**: 6ce973d0fb725337e6f93022708630f3f6af0faa  
**Branch**: main  
**Repository**: SZ-DownloadGuard

## Research Question
do a completely codebase research for this chrome extension, to better understating for llms and future devs to future features developments and codebase alterations

## Summary
The repository is a Manifest V3 Chrome extension centered on a single service worker (`sw.js`) that applies allowlist-based download decisions for WhatsApp-originated downloads, a content script (`content-whatsapp.js`) that blocks many download attempts earlier in-page, and an options page (`options/options.html` + `options/options.js`) that controls policy URL and manual policy refresh. The main data model is stored in `chrome.storage.local` (`enabled`, `configUrl`, `policy`, `policyFetchedAt`) with short-lived tab-origin hints in `chrome.storage.session`. Runtime communication occurs through four message types (`wa-tab-ping`, `wa-tab-clear`, `refresh-policy`, `wa-blocked-notify`). Documentation about the policy JSON format and operational behavior is in `policy.md`.

## Detailed Findings

### Extension Manifest and Runtime Surface
- The extension uses Manifest V3, minimum Chrome 114, and registers a module service worker at `sw.js` (`manifest.json:2`, `manifest.json:7`, `manifest.json:27`).
- The content script `content-whatsapp.js` runs at `document_start` on `https://*.whatsapp.com/*` and `https://wa.me/*` with `all_frames: true` (`manifest.json:28-34`).
- The options page is `options/options.html` (`manifest.json:36`).
- Granted extension permissions are `downloads`, `notifications`, `storage`, and `alarms` (`manifest.json:15-20`).
- Host permissions include WhatsApp domains and `https://wazap.coopavel.com.br/*` (used by the default policy URL) (`manifest.json:21-26`, `sw.js:12-13`).

### Service Worker (`sw.js`) Behavior
- Storage keys and defaults are centralized in `STORAGE` and `DEFAULT_CONFIG_URL` (`sw.js:4-13`), with WhatsApp host matching regexes (`sw.js:15-16`).
- Utility functions normalize extensions/MIME values and extract extension from filename or URL (`sw.js:35-70`).
- Notification flow uses `chrome.notifications.create`, and `notifyOnce` deduplicates by download ID with a cooldown map (`sw.js:76-106`).
- `cancelAndErase` applies `chrome.downloads.cancel` and `chrome.downloads.erase` for blocked downloads (`sw.js:108-111`).
- WhatsApp tab tracking stores a timestamp per tab in `chrome.storage.session` and expires entries after 2 minutes (`sw.js:18-21`, `sw.js:114-147`).
- Remote policy lifecycle:
  - Read config URL from storage or fallback default (`sw.js:150-153`).
  - Load cached policy + timestamp (`sw.js:155-161`).
  - Validate/normalize policy shape (`mode === "allow"`, arrays required, lists normalized) (`sw.js:163-179`).
  - Save policy and fetch timestamp (`sw.js:181-186`).
  - Fetch policy with `fetch(..., cache: "no-store")` and optional non-blocking behavior (`sw.js:188-203`).
  - `getPolicyForDecision` returns cached policy and asynchronously refreshes when TTL expires; if missing, it triggers background refresh and returns `null` (`sw.js:205-217`).
- Download origin classification (`isFromWhatsApp`) considers URL/referrer domains, and for `blob:`/`data:` URLs uses referrer or recent WhatsApp tab context (`sw.js:226-241`).
- Decision engine (`decideAllow`) returns `{allow, reason, ext, mime}`:
  - no policy -> block (`no-policy`) (`sw.js:249-251`);
  - MIME present and non-generic -> MIME must be allowed, and extension must also be allowed if present (`sw.js:257-261`);
  - missing/ generic MIME -> extension is required and must be allowed (`sw.js:263-265`).
- Block message text is generated from `reason` values (`sw.js:268-281`).
- Download hook pipeline:
  - `handleDownload` coordinates enabled toggle check, origin check, decision, blocking action, and dedupe/in-flight guards (`sw.js:294-326`).
  - Primary hook: `chrome.downloads.onDeterminingFilename` (`sw.js:328-337`).
  - Fallback hook: `chrome.downloads.onCreated` + delayed handler (`sw.js:339-350`).
- Runtime message API exposed by service worker (`chrome.runtime.onMessage`):
  - `wa-tab-ping` and `wa-tab-clear` update tab tracking (`sw.js:356-367`);
  - `refresh-policy` triggers blocking refresh and returns status + policy summary (`sw.js:369-383`);
  - `wa-blocked-notify` displays a notification (`sw.js:385-387`).
- Alarm/bootstrap lifecycle:
  - recurring alarm created with 60-minute period (`sw.js:23-26`, `sw.js:390-395`);
  - alarm handler refreshes policy (`sw.js:398-401`);
  - on install/update, default keys are initialized and policy is fetched once (`sw.js:404-417`);
  - on browser startup, alarm is ensured (`sw.js:419-421`).

### Content Script (`content-whatsapp.js`) Behavior
- Executes in an IIFE and identifies top-frame; top-frame sends periodic `wa-tab-ping` every 60s and clears on `pagehide` (`content-whatsapp.js:2-18`).
- Keeps local runtime state (`enabled`, `hasPolicy`, `allowedExts`) synchronized from `chrome.storage.local` and `chrome.storage.onChanged` (`content-whatsapp.js:20-59`).
- Builds toast UI infrastructure dynamically (`style` + host container) and renders animated toasts for blocked actions (`content-whatsapp.js:61-156`).
- URL helpers classify WhatsApp/blob/data URLs and extract extension from filename/URL (`content-whatsapp.js:158-176`).
- `shouldBlockByExt` decision logic for in-page interception:
  - disabled -> never block,
  - no policy -> block,
  - with policy -> block only when extension is detected and not in allowlist (`content-whatsapp.js:177-184`).
- `BLOCK` helper shows toast and emits `wa-blocked-notify` to service worker (`content-whatsapp.js:186-191`).
- Interceptors applied:
  - capturing click handler for anchor navigation/downloads (`content-whatsapp.js:194-216`);
  - override of `HTMLAnchorElement.prototype.click` for programmatic clicks (`content-whatsapp.js:219-238`);
  - override of `window.open` for extension-bearing WhatsApp URLs (`content-whatsapp.js:241-255`);
  - capturing `keydown` handler for Enter on focused anchors (`content-whatsapp.js:258-275`).

### Options Page (`options/options.html` + `options/options.js`)
- The options UI contains:
  - a permanently checked+disabled `enabled` checkbox (`options/options.html:105-110`);
  - allowlist URL input (`options/options.html:112-118`);
  - `Salvar` and `Atualizar agora` buttons plus status/info text areas (`options/options.html:120-131`).
- `load()` reads local storage keys and renders policy cache summary (mode, allowed ext/mime counts, age seconds) (`options/options.js:13-37`).
- `save()` writes `enabled=true` and the configured policy URL (`options/options.js:39-52`).
- `refresh()` sends `refresh-policy` message to service worker and updates status message from response (`options/options.js:54-69`).
- Event wiring: click handlers for save/refresh and `DOMContentLoaded` load (`options/options.js:71-73`).

### Documentation and Ancillary Files
- `policy.md` documents policy schema, field semantics, decision behavior, examples, and operational steps for publishing/updating allowlist JSON (`policy.md:1-251`).
- `readme.md` currently contains only repository title (`readme.md:1`).
- License is MIT (`LICENSE:1-21`).
- `.gitattributes` enables text auto-normalization (`.gitattributes:1-2`).

### Data Contracts and Cross-Component Integration
- Storage keys shared across service worker, content script, and options page: `enabled`, `configUrl`, `policy`, `policyFetchedAt` (`sw.js:4-8`, `content-whatsapp.js:45-57`, `options/options.js:1-19`).
- Message contracts:
  - `wa-tab-ping`: content script -> service worker with current URL (`content-whatsapp.js:10`, `sw.js:356-360`);
  - `wa-tab-clear`: content script -> service worker on pagehide (`content-whatsapp.js:16`, `sw.js:363-366`);
  - `refresh-policy`: options page -> service worker request/response (`options/options.js:59`, `sw.js:369-383`);
  - `wa-blocked-notify`: content script -> service worker notify request (`content-whatsapp.js:190`, `sw.js:385-387`).
- Enforcement layers:
  - in-page interception in content script before download pipeline where possible (`content-whatsapp.js:194-275`);
  - download API enforcement in service worker as authoritative fallback/primary backend (`sw.js:294-350`).

## Code References
- `manifest.json:2-37` - Extension entrypoints, permissions, host scope, and options page registration.
- `sw.js:4-26` - Core constants: storage keys, default config URL, host regexes, and alarm schedule.
- `sw.js:149-217` - Policy retrieval, normalization, caching, refresh, and TTL-based refresh trigger.
- `sw.js:226-266` - WhatsApp origin detection and allow/block decision function.
- `sw.js:294-350` - Download handling pipeline and fallback strategy.
- `sw.js:353-388` - Runtime message handlers for tab tracking, refresh API, and notification relay.
- `content-whatsapp.js:20-59` - Local policy/toggle state synchronization via storage.
- `content-whatsapp.js:61-156` - In-page toast infrastructure and rendering.
- `content-whatsapp.js:177-275` - In-page blocking logic and interceptors.
- `options/options.js:13-73` - Options load/save/refresh workflow and service worker messaging.
- `options/options.html:101-135` - Options page DOM structure linked to options script.
- `policy.md:18-75` - Policy schema and decision model documentation.

## Architecture Documentation
The extension follows a two-layer enforcement architecture:

1. **Content-layer interception** (`content-whatsapp.js`): intercepts likely download triggers (anchor clicks, programmatic clicks, `window.open`, keyboard activation) and blocks earlier with an in-page toast when policy-based extension checks indicate blocking.
2. **Download-layer enforcement** (`sw.js`): receives download events from Chrome APIs and performs definitive policy evaluation (origin, MIME, extension, policy availability), then cancels/erases blocked downloads and triggers system notifications.

Policy data is externally hosted (URL in storage), fetched by the service worker, normalized, cached in local storage, and shared reactively with content/options scripts via storage reads and storage change events.

## Historical Context (from thoughts/)
- No `thoughts/` directory exists in this repository at the time of research, so no historical notes were available.

## Related Research
- No prior documents were present under `thoughts/shared/research/` before this report.

## Open Questions
- No Git remote is configured in this local repository, so GitHub permalink generation was not applicable during this run.
- `hack/spec_metadata.sh` was not present in this repository, so metadata values were collected directly from local git/date commands.
