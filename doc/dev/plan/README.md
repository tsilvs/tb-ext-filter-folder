# Required changes

## Behavior bugs/inconsistencies (must fix)

### Storage fallback

+ Prefs only read/write via [`browserApi.storage.sync.get()`](../../../ext/options.js), [`browserApi.storage.sync.set()`](../../../ext/options.js), [`browserApi.storage.sync.get()`](../../../ext/ui.js); no local fallback despite [`STORAGE_AREAS`](../../../ext/config/constants.js).
+ If sync is unavailable/disabled/throws, config reverts to defaults each run ([`DEFAULT_CONFIG`](../../../ext/config/constants.js)). **Fix:** `sync -> local` fallback or unified storage wrapper.

### Root selection vs Inbox anchoring

+ Folder creation always anchors under Inbox because [`createFolders()`](../../../ext/background.js) calls [`findInboxFolder()`](../../../ext/modules/MailClient.js) and [`getParentId()`](../../../ext/background.js) returns Inbox when `index === 0`.
+ **Fix:** use account root for top-level; if Inbox is desired, require explicit `Inbox/...` in user path.

### URI parsing gaps

+ [`REGEX_PATTERNS.ACTION_URI`](../../../ext/config/constants.js) only matches “Move to folder,” so [`extractUriFromBlock()`](../../../ext/modules/RuleEngine.js) ignores “Copy to folder” and other folder actions.
+ [`REGEX_PATTERNS.BASE_URI`](../../../ext/config/constants.js) only matches `imap://...`; Local Folders use `mailbox://...`, causing false mismatches in [`extractBaseUri()`](../../../ext/modules/RuleEngine.js) and [`validateAccountRulesMatch()`](../../../ext/ui.js). [`uriToPath()`](../../../ext/modules/RuleEngine.js) already supports both; fix regex capture.

### Scan limit is not honored

+ Preference wiring is correct: [`options.html`](../../../ext/options.html) -> [`DEFAULT_CONFIG.scanLimit`](../../../ext/config/constants.js) -> [`loadConfig()`](../../../ext/ui.js) -> [`formDiscovery` handler](../../../ext/ui.js).
+ Backend uses a single page: [`getSenders()`](../../../ext/modules/MailClient.js) -> [`api.messages.list()`](../../../ext/modules/MailClient.js) then slice. **Fix:** paginate until limit reached or exhausted.

---

## Data integrity protections (must add)

### Special character & path sanitization

[`RuleEngine.js`](../../../../../ext/modules/RuleEngine.js); partial

+ Current: URL encoding via `encodeURIComponent()` (line ~162).
+ Required: validation + user warnings + custom mapping UI.
+ **Rationale:** some IMAP servers reject encoded chars / Windows FS limits; but auto-replace breaks source->folder mapping. **Solution:** warn + custom mapping.

### Consistent encoding/decoding

+ Audit URI construction/parsing; document encoding standards; add encode/decode tests; centralize encoding utilities ([`RuleEngine.js`](../../../ext/modules/RuleEngine.js) + [`MailClient.js`](../../../ext/modules/MailClient.js)).

### Collision resolution

+ Existing: case-insensitive merge in [`background.js:analyze()`](../../../ext/background.js).
+ Required: detect collision types (case/special/encoding), user choice UI, resolution strategy config, logging.

---

## Reliability & recovery (must add)

### Error recovery for folder creation

+ Existing: try/catch in [`background.js:createFolders()`](../../../ext/background.js).
+ Required: checkpointing, progress persistence, resume after reload, resume notifications, rollback for failed batches, detailed logging.

---

## Filter types refactor (required schema fix)

### Summary

+ Fix incorrect `FILTER_TYPES` values + naming clarity; replace 5 booleans with `filters[]` config (id/value/enabled/label); array-to-bitmask; dynamic UI; clean break migration. See [`DEFAULT_FILTER_CONFIG`](../../../ext/config/constants.js) and [`RuleEngine.calculateType()`](../../../ext/modules/RuleEngine.js).

### Key decisions

+ Correct constants per Thunderbird spec: `PRE_JUNK=1`, `MANUAL=16`, `POST_JUNK=32`, `SENDING=64`, `ARCHIVE=128`, `PERIODIC=256`.
+ Default selection: Manual + Post Junk = 48.
+ `DEFAULT_FILTER_CONFIG` in [`ext/config/constants.js`](../../../ext/config/constants.js) drives UI + logic.

### Implementation plan (minimal)

1. Update `FILTER_TYPES`, add `DEFAULT_FILTER_CONFIG`, default mask to 48, update `calculateType()` (optional legacy support).
2. Switch `DEFAULT_CONFIG` to `filters[]`; fallback to default array on load.
3. Render checkboxes dynamically in options; `collectPreferences()` serializes `filters[]`.
4. Remove legacy booleans; update README/i18n if labels change.

### Tests

+ `calculateType(filters)` returns 48 when none enabled.
+ Mixed enabled/disabled returns correct sum.
+ Options UI renders all filters from config; save/load preserves enabled flags.
+ Generated rule `type` matches selected mask.

### Corrections

+ Naming consistency: `preJunk`/`postJunk` (ids) vs `PRE_JUNK`/`POST_JUNK` (constants).
+ Keep deep-copy in `ui.js` to avoid shared references.
+ If no migration, ensure `storage.sync.get(DEFAULT_CONFIG)` doesn’t override with booleans; prefer explicit `filters` fallback.
+ `i18n`: labels should be message keys, not raw strings.
