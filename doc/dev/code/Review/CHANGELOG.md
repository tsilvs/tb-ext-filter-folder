# Filter Folder Creator — Code Review Fixes

**Date:** 2026-05-14

## Summary

Implemented all priority fixes and most code-smell improvements from the source-code review. All changes are minimal, focused, and preserve existing behavior unless noted.

---

## Bugs / Logical Errors

| #   | Issue                                                                | Fix                                                                                                | Files           |
| --- | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------- |
| 1   | `resolveRoot` accepted unused `accountId` param                      | Removed parameter                                                                                  | `background.js` |
| 2   | `handleCreationError` silently counted "already exists" as `created` | Added `results.skipped` bucket so callers can distinguish true creations from pre-existing folders | `background.js` |
| 3   | `sendDeleteProgress` was a dead duplicate of `sendProgress`          | Removed function; deletion flow now reuses `sendProgress`                                          | `background.js` |
| 5   | `const state = store.getState()` cached a live reference by accident | Removed cached reference; all state reads now explicitly call `store.getState()`                   | `ui.js`         |
| 6   | Ports not disconnected on `error` in `runCreate`/`runDelete`         | Added `port.disconnect()` in both error handlers                                                   | `ui.js`         |
| 7   | `btnDeleteInvalidRules` collapsed multi-email rules to first email   | Generates a block for **every** email in the rule, preserving all conditions                       | `ui.js`         |

---

## Thunderbird 140+ Compatibility

| #   | Issue                                                                 | Fix                                                                              | Files           |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------- |
| 9   | `strict_min_version: "115.0"` predates MV3 features used              | Bumped to `"128.0"`                                                              | `manifest.json` |
| 11  | `findInboxFolder` used locale-sensitive `f.name === 'Inbox'` fallback | Removed name fallback; `f.type === 'inbox'` is sufficient and locale-independent | `MailClient.js` |
| 12  | `ui.js` selected source folder by hardcoded `"Inbox"` name            | Replaced with `f.type === 'inbox'`                                               | `ui.js`         |

---

## Code Smells & Style

| #   | Issue                                                                         | Fix                                                                                                     | Files                               |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 8   | Duplicate `scanLimit` defaults (`DEFAULT_CONFIG` vs `LIMITS`)                 | `DEFAULT_CONFIG.scanLimit` now references `LIMITS.DEFAULT_SCAN_LIMIT`                                   | `constants.js`                      |
| 13  | Hardcoded `"imap://REPLACE_ME"` in 6+ places                                  | Replaced all occurrences with `PLACEHOLDER_URI` constant                                                | `ui.js`                             |
| 14  | `runCreate`/`runDelete` hardcoded port/type strings                           | Now use `PORT_NAMES.*` and `MESSAGE_TYPES.*` constants                                                  | `ui.js`                             |
| 15  | Dead empty `else` branch after `btnApplyDefaults`                             | Removed                                                                                                 | `ui.js`                             |
| 16  | Hardcoded `'Done'` status string                                              | Uses `browserApi.i18n.getMessage('done')`                                                               | `ui.js`                             |
| 17  | `withButtonBusy` had stray extra indentation                                  | Fixed indentation to match surrounding code                                                             | `ui.js`                             |
| 18  | Unnecessary `typeof browser !== 'undefined'` compat checks                    | Replaced with direct `messenger` usage                                                                  | `ui.js`, `storage.js`, `options.js` |
| 19  | `new RegExp(..., 'gi')` reconstructed from `.source` of already-flagged regex | Defined `EMAIL_CONDITION` without flags in `constants.js`; added explanatory comment in `RuleEngine.js` | `constants.js`, `RuleEngine.js`     |

---

## Architecture

| #     | Issue                                                                         | Fix                                                                                                                                                                                                                                                                         | Files                                    |
| ----- | ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 4     | `scanMessages` and `scanFolderSenders` were near-identical discovery wrappers | Kept `scanFolderSenders` (self-describing `{ folderId, senders }` shape), removed `scanMessages`; updated `ui.js` discovery submit to use the unified action and extract `.senders`                                                                                         | `background.js`, `ui.js`, `constants.js` |
| 20–22 | Pure rule-processing functions lived in `ui.js`                               | Moved `dedupeRawRules`, `dedupeRawRulesByPath`, `pathSuffixToEmail`, `buildEmailToRulePathMap`, and `analyzeRulesAndFolders` to `RuleEngine.js`; extracted shared `dedupeRules(content, keyFn)` helper; `analyzeRulesAndFolders` now accepts `rules` instead of reading DOM | `ui.js`, `modules/RuleEngine.js`         |
| 23    | `formAnalyze.onsubmit` embedded ~150 lines of business logic                  | Extracted `runAnalysis(accountId, filterContent, options)`; handler now only orchestrates DOM state and delegates scanning / computation to the new function                                                                                                                | `ui.js`                                  |
| 24    | Duplicated port dispatch pattern in `handlePortConnection`                    | Extracted `PORT_HANDLERS` lookup map; reduced ~25 lines of duplication                                                                                                                                                                                                      | `background.js`                          |
| 25    | `deleteFolders` main loop had three nested try/catch levels                   | Extracted `deleteWithRetry(folderId)` returning `{ ok, verified, retryAttempted, errorMessage }`; flattened the loop to a single try/catch level; preserved retry, verify, logging, and `deleted`/`failed` categorization                                                   | `background.js`                          |

---

## Files Modified

- `ext/manifest.json`
- `ext/background.js`
- `ext/ui.js`
- `ext/options.js`
- `ext/config/constants.js`
- `ext/modules/MailClient.js`
- `ext/modules/RuleEngine.js`
- `ext/utils/storage.js`

---

## Validation

- All `ext/**/*.js` files passed `node --check` syntax validation.
- Grepped to confirm zero remaining:
  - `typeof browser` compat checks
  - Hardcoded `"imap://REPLACE_ME"` strings (outside `PLACEHOLDER_URI` definition)
  - `f.name === 'Inbox'` locale-sensitive comparisons
