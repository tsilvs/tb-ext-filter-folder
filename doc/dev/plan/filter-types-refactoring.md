# Summary

+ Fix incorrect `FILTER_TYPES` values and rename for clarity (pre/post junk, periodic).
+ Replace five boolean flags with a single `filters[]` array (id/value/enabled/label).
+ Simplify type-bitmask calculation via array filter/reduce and default to Manual+PostJunk (48).
+ Refactor options/UI to render checkboxes dynamically from `filters[]`.
+ Clean break migration with release notes; remove legacy after rollout.

## Key decisions

+ Correct constant mapping (Thunderbird spec): `PRE_JUNK=1`, `MANUAL=16`, `POST_JUNK=32`, `SENDING=64`, `ARCHIVE=128`, `PERIODIC=256`.
+ Default selection is Manual + Post Junk = 48.
+ `DEFAULT_FILTER_CONFIG` lives in [`ext/config/constants.js`](ext/config/constants.js:1) and drives UI + logic.

## Architecture

+ **Current:** storage booleans → `ui.js` → `getFilterTypeMask()` → [`RuleEngine.calculateType()`](ext/modules/RuleEngine.js:165) (boolean-to-bitmask).
+ **Target:** storage `filters[]` → `ui.js` → `calculateType(filters)` (array-to-bitmask). UI checkboxes generated from config.

## Implementation plan

1. **Constants/engine:** update `FILTER_TYPES` and add `DEFAULT_FILTER_CONFIG`; change default mask to 48; update `calculateType()` to accept array (optional temporary legacy support).
2. **Storage:** switch `DEFAULT_CONFIG` to `filters[]`; on load, fallback to default array if missing.
3. **UI:** replace hardcoded checkboxes with dynamic render in options; update `collectPreferences()` to serialize `filters[]`.
4. **Cleanup/docs:** remove legacy path; update README/i18n/messages if terminology changed.

## Risks & mitigations

+ **High risk:** options UI change + clean break migration. Mitigate with staged rollout, clear notes, and manual regression checks.
+ **Medium risk:** storage schema change; mitigate by fallback defaults.
+ **Low risk:** constants + calculateType refactor.

## Tests

+ `calculateType(filters)` returns 48 when none enabled.
+ Mixed enabled/disabled filters return correct sum.
+ Options UI renders all filters from config; save/load preserves enabled flags.
+ Generated rule `type` matches selected mask.

## Corrections

+ Ensure naming consistency: `preJunk`/`postJunk` vs `PRE_JUNK`/`POST_JUNK` (id vs constant).
+ Keep default copy behavior in `ui.js` (deep copy of filter array) to avoid shared references.
+ If no migration, ensure `storage.sync.get(DEFAULT_CONFIG)` doesn’t override with booleans; prefer explicit `filters` fallback.
+ Consider `i18n`: labels should be message keys, not raw strings.
