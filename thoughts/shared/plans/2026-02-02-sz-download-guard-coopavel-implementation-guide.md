# SZ Download Guard Coopavel Implementation Guide

## Overview

This guide adapts the existing WA-focused extension into **SZ Download Guard Coopavel** with domain-scoped enforcement for `https://coopavelcoop.sz.chat/*`, remote policy defaults from the provided Gist, and a navy-themed options experience.

## Current State Analysis

The current implementation is a two-layer enforcement model (content interception + service worker enforcement) targeted at WhatsApp hosts. Core behavior and policy caching already exist and can be reused with targeted refactoring.

Key baseline points:
- Extension branding and labels are WA-specific (`manifest.json:3-6`, `manifest.json:14`, `options/options.html:6`, `options/options.html:103`, `content-whatsapp.js:189`).
- Allowed host scope is WhatsApp plus a legacy policy host (`manifest.json:21-26`).
- Download origin detection is WhatsApp-specific (`sw.js:15-16`, `sw.js:226-241`).
- Default policy URL points to `wazap.coopavel.com.br` (`sw.js:12-13`, `options/options.js:8-9`).
- Options page uses a green accent and dual light/dark scheme, not Coopavel navy branding (`options/options.html:5`, `options/options.html:12-40`, `options/options.html:22-23`).

## Desired End State

After implementation:
1. The extension is consistently branded as **SZ Download Guard Coopavel** in manifest metadata, UI text, and docs.
2. Policy enforcement is applied only to downloads initiated from `https://coopavelcoop.sz.chat/*`.
3. Downloads from all other domains are never blocked by this extension.
4. Default policy source is:
   `https://gist.githubusercontent.com/zezudoo/d335a55f69fea0abb9b4c8c15ac3d738/raw/6fb3ff240732d6a3b071c00b3d43b90662282850/allowlist_sz_guard.json`
5. Policy lifecycle supports startup/install refresh, periodic refresh, cached fallback, and strict JSON validation.
6. Options page ships with a navy visual system that is accessible and security-focused.

### Key Discoveries
- Existing architecture already has the right integration points for scoped origin checks and policy refresh (`sw.js:149-217`, `sw.js:294-350`).
- Content script currently runs only on WhatsApp URLs and must be retargeted to Coopavel domain (`manifest.json:28-34`).
- Runtime contracts (`wa-tab-ping`, `wa-tab-clear`, `refresh-policy`, `wa-blocked-notify`) are shared across layers and must be renamed in lockstep (`sw.js:356-387`, `content-whatsapp.js:10`, `content-whatsapp.js:16`, `options/options.js:59`).
- Policy docs already define schema fields (`schema_version`, `mode`, `ttl_seconds`, allowed lists) that can be enforced more strictly in code (`policy.md:18-50`, `sw.js:163-179`).

## What We're NOT Doing

- No server-side changes on `coopavelcoop.sz.chat`.
- No malware scanning beyond extension/MIME policy allowlisting.
- No enterprise policy transport or signed policy verification in this phase.
- No popup UI redesign (scope is options/settings page only).
- No multi-browser port (Chrome MV3 remains target runtime).

## Implementation Approach

Keep the current two-layer architecture and retarget it:
- Replace WhatsApp host logic with Coopavel-domain logic.
- Keep service worker as authoritative blocker via download APIs.
- Keep content script as early UX layer for faster user feedback.
- Strengthen policy validation/version checks and fallback telemetry.
- Redesign options UI around navy tokens while preserving existing settings workflow.

## Phase 1: Rebrand and Runtime Surface Alignment

### Overview

Apply product renaming and manifest/runtime surface updates so all user-visible and internal references are aligned to SZ Download Guard Coopavel.

### Changes Required

#### 1. Manifest metadata and host scope
**File**: `manifest.json`  
**Changes**:
- Rename `name`, `short_name`, `description`, and action title.
- Replace host permissions with Coopavel + Gist host.
- Update content script match scope to Coopavel domain.
- Rename content script file if chosen (`content-whatsapp.js` -> `content-coopavel.js`) and update manifest reference.

```json
{
  "name": "SZ Download Guard Coopavel",
  "short_name": "SZ Guard",
  "description": "Policy-based download protection for Coopavel SZ Chat.",
  "action": { "default_title": "SZ Download Guard Coopavel" },
  "host_permissions": [
    "https://coopavelcoop.sz.chat/*",
    "https://gist.githubusercontent.com/*"
  ],
  "content_scripts": [
    {
      "matches": ["https://coopavelcoop.sz.chat/*"],
      "js": ["content-coopavel.js"],
      "run_at": "document_start",
      "all_frames": true
    }
  ]
}
```

#### 2. Internal naming cleanup
**Files**: `sw.js`, `content-whatsapp.js` (or `content-coopavel.js`), `options/options.html`, `options/options.js`, `policy.md`, `readme.md`  
**Changes**:
- Replace WA/WhatsApp naming in labels, notification titles, console prefixes, and comments.
- Rename runtime message types from `wa-*` to `sz-*` (or `coopavel-*`) consistently across sender/receiver pairs.
- Keep storage key names stable (`enabled`, `configUrl`, `policy`, `policyFetchedAt`) to avoid forced migration.

### Success Criteria

#### Automated Verification
- [x] Manifest JSON is valid: `python -m json.tool manifest.json > $null`
- [x] Scripts parse without syntax errors: `node --check sw.js`
- [x] Scripts parse without syntax errors: `node --check content-coopavel.js`
- [x] Scripts parse without syntax errors: `node --check options/options.js`
- [x] No stale WA branding in runtime files: `rg -n "WA - Download Guard|WA DL Guard|WhatsApp" manifest.json sw.js content-coopavel.js options policy.md readme.md`

#### Manual Verification
- [ ] Extension card and options title display `SZ Download Guard Coopavel`.
- [ ] Options labels and status text no longer mention WhatsApp.
- [ ] Notifications show the new product name.
- [ ] Extension loads without missing script path errors.

**Implementation Note**: After finishing this phase and passing automated checks, pause for human validation before Phase 2.

---

## Phase 2: Domain-Locked Download Monitoring and Enforcement

### Overview

Retarget origin detection and early interception so enforcement is exclusive to `https://coopavelcoop.sz.chat/*`.

### Changes Required

#### 1. Service worker origin classifier refactor
**File**: `sw.js`  
**Changes**:
- Replace WhatsApp regex constants with a strict Coopavel hostname matcher.
- Rename `isFromWhatsApp` to `isFromProtectedDomain`.
- Keep blob/data handling using referrer and recent protected-tab hints.
- Ensure downloads from non-target domains always return `false` in origin classifier.

```js
const PROTECTED_HOST_RE = /^coopavelcoop\.sz\.chat$/i;

const isProtectedHost = (host) => PROTECTED_HOST_RE.test(host || '');
const isProtectedUrl = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && isProtectedHost(u.hostname);
  } catch {
    return false;
  }
};

async function isFromProtectedDomain(item) {
  if (item?.byExtensionId === chrome.runtime.id) return false;

  const url = item?.finalUrl || item?.url || '';
  const ref = item?.referrer || '';

  if (isProtectedUrl(url) || isProtectedUrl(ref)) return true;

  if (isBlobOrData(url)) {
    if (ref) return isProtectedUrl(ref);
    return await isRecentProtectedTab(item?.tabId);
  }

  return false;
}
```

#### 2. Content script targeting + message contract sync
**Files**: `manifest.json`, `content-coopavel.js`, `sw.js`  
**Changes**:
- Retarget URL helper logic from WhatsApp hosts to Coopavel host.
- Update ping/clear message names to match service worker listener.
- Keep interceptor pattern (click/programmatic click/window.open/Enter) but scoped to target domain URLs only.

#### 3. Enforcement invariants
**File**: `sw.js`  
**Changes**:
- Keep authoritative download-hook enforcement in `onDeterminingFilename` + `onCreated` fallback.
- Ensure disabled state and dedupe logic remain unchanged.
- Keep `no policy => block` behavior, but only for protected-domain-origin downloads.

### Success Criteria

#### Automated Verification
- [x] `node --check sw.js`
- [x] `node --check content-coopavel.js`
- [x] Coopavel host appears in all relevant origin checks: `rg -n "coopavelcoop\.sz\.chat|isFromProtectedDomain|isProtectedUrl" sw.js content-coopavel.js manifest.json`
- [x] WhatsApp host regex and `wa.me` are removed from runtime code: `rg -n "whatsapp\.com|whatsapp\.net|wa\.me" sw.js content-coopavel.js manifest.json`

#### Manual Verification
- [ ] Download from `https://coopavelcoop.sz.chat/*` with blocked type is canceled and removed.
- [ ] Download from `https://coopavelcoop.sz.chat/*` with allowed type succeeds.
- [ ] Download from another domain is never blocked.
- [ ] Blob/data download generated from Coopavel page is still evaluated by policy.

**Implementation Note**: Pause after this phase for manual confirmation before policy-hardening changes.

---

## Phase 3: Remote Policy Source, Caching, and Validation Hardening

### Overview

Set the new default policy endpoint and make policy lifecycle behavior explicit and resilient.

### Changes Required

#### 1. Default policy source migration
**Files**: `sw.js`, `options/options.js`  
**Changes**:
- Set `DEFAULT_CONFIG_URL` to the provided Gist RAW URL.
- On install/update, migrate `configUrl` only when it is empty or still equal to old default (`https://wazap.coopavel.com.br:8090/allowlist_wa_guard.json`).
- Preserve user-customized URLs.

#### 2. Fetch timing and refresh policy
**File**: `sw.js`  
**Changes**:
- Keep fetch on install/update (`onInstalled`) and recurring alarm (`periodMinutes: 60`).
- Add startup immediate refresh (non-blocking) in `onStartup` so first session has fresh policy sooner.
- Keep manual refresh path through options (`refresh-policy` message).

#### 3. Validation and versioning enforcement
**Files**: `sw.js`, `policy.md`  
**Changes**:
- Extend `normalizePolicy` checks:
  - `schema_version === 1`
  - `mode === "allow"`
  - `default_action === "block"` (if provided)
  - `ttl_seconds` numeric and bounded (e.g., 300-86400)
  - `allowed.extensions` and `allowed.mime_types` arrays with deduplicated normalized values
  - optional `updated_at` ISO parse check
- Persist optional diagnostics (`policyLastError`, `policySource`, `policyValidationVersion`) for options visibility.

#### 4. Fallback behavior definition
**File**: `sw.js`  
**Changes**:
- Continue stale-while-revalidate behavior:
  - if cached policy exists and TTL expired -> use cached now + async refresh.
  - if no cached policy -> block protected-domain downloads and attempt async refresh.
- Update options info panel to expose staleness/last fetch outcome.

### Success Criteria

#### Automated Verification
- [x] `node --check sw.js`
- [x] `node --check options/options.js`
- [x] Default URL updated everywhere: `rg -n "allowlist_sz_guard\.json|DEFAULT_CONFIG_URL" sw.js options/options.js`
- [x] Old policy URL removed from runtime source: `rg -n "wazap\.coopavel\.com\.br" sw.js options/options.js manifest.json`
- [x] Policy doc reflects schema validation rules: `rg -n "schema_version|ttl_seconds|default_action" policy.md`

#### Manual Verification
- [ ] Fresh install fetches policy successfully from Gist.
- [ ] Manual refresh updates cached timestamp and summary.
- [ ] If remote policy is unavailable but cache exists, cached policy remains active.
- [ ] If remote policy is unavailable and cache is empty, protected-domain downloads are blocked.
- [ ] Invalid policy JSON is rejected and does not replace last valid cached policy.

**Implementation Note**: Pause for manual validation before final UI polish handoff.

---

## Phase 4: Navy-Themed Options Page Redesign

### Overview

Redesign options/settings UI to a navy identity while preserving existing controls and workflow.

### Changes Required

#### 1. Navy design tokens and layout polish
**File**: `options/options.html`  
**Changes**:
- Replace current palette with navy-forward token set.
- Keep clean card layout but improve hierarchy for security posture (title, policy source, cache health, actions).
- Remove mixed dark-mode defaults if they conflict with brand consistency.

```css
:root {
  --navy-900: #081a3a;
  --navy-800: #0d2a57;
  --navy-700: #17407f;
  --surface: #f3f7ff;
  --card: #ffffff;
  --text: #0b1f45;
  --muted: #4b5f84;
  --border: #c9d7f2;
  --accent: #1f5fbf;
  --accent-strong: #174e9f;
  --ok: #0f766e;
  --danger: #b91c1c;
  --focus: #7fb3ff;
}
```

#### 2. Accessibility and UX consistency
**Files**: `options/options.html`, `options/options.js`  
**Changes**:
- Ensure text/background contrast >= WCAG AA (4.5:1 for body text).
- Add visible keyboard focus styles on inputs/buttons.
- Keep concise security-focused language (e.g., "Policy source", "Last successful sync", "Protection scope: coopavelcoop.sz.chat").
- Keep status feedback semantics (`ok`, `err`) with accessible color + text pairing.

### Success Criteria

#### Automated Verification
- [ ] `node --check options/options.js`
- [ ] HTML parses and references valid script path: `python - <<'PY'
from pathlib import Path
p = Path('options/options.html')
html = p.read_text(encoding='utf-8')
assert 'options.js' in html
print('ok')
PY`
- [ ] Navy tokens exist in options stylesheet: `rg -n "--navy-900|--accent|--focus" options/options.html`

#### Manual Verification
- [ ] Options page visually reflects navy Coopavel identity.
- [ ] All controls are readable and accessible in standard browser zoom levels.
- [ ] Focus indicators are visible for keyboard-only navigation.
- [ ] Status and error messages remain understandable without relying on color alone.

**Implementation Note**: After this phase, run full regression checks before release packaging.

---

## Testing Strategy

### Unit-Level / Static Checks
- Syntax checks for every JS entrypoint (`sw.js`, content script, options script).
- Manifest JSON validity check.
- Grep-based regression checks for old domain/branding references.

### Integration / Behavior Checks
- Unpacked extension smoke test in Chrome.
- Validate both download event hooks (`onDeterminingFilename`, `onCreated` fallback).
- Validate policy refresh through alarm, startup, and manual action.

### Manual Testing Steps
1. Load unpacked extension and confirm branding updates in extension manager and options page.
2. In `https://coopavelcoop.sz.chat/`, attempt one blocked extension and one allowed extension.
3. In a non-Coopavel domain, verify downloads are unaffected.
4. Break policy URL temporarily and verify fallback behavior with and without cached policy.
5. Restore valid policy URL and confirm recovery without reinstall.

## Performance Considerations

- Preserve existing dedupe/in-flight sets to avoid duplicate processing (`sw.js:284-326`).
- Keep alarm refresh at 60 minutes and rely on policy TTL for background refresh trigger (`sw.js:23-26`, `sw.js:205-217`, `sw.js:390-401`).
- Keep content script interception lightweight; avoid expensive DOM scans beyond event-driven hooks.

## Migration Notes

- Existing users should retain `configUrl` if it was manually customized.
- If `configUrl` is missing or still on old default, migrate automatically to the new Gist URL on install/update.
- Keep existing storage keys for compatibility; avoid data loss from key renames.
- If content script filename is renamed, ensure manifest update is atomic in the same release.

## References

- Baseline research: `thoughts/shared/research/2026-02-02-chrome-extension-codebase-research.md`
- Core runtime: `sw.js:4-421`
- Content interception baseline: `content-whatsapp.js:2-278`
- Manifest/runtime surface: `manifest.json:2-37`
- Options UI/script baseline: `options/options.html:1-136`, `options/options.js:1-73`
- Policy schema documentation: `policy.md:18-75`
