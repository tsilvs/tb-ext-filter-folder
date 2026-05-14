# Thunderbird Extension Source Code Review

## Project Overview

**Name:** Filter Folder Creator (for Thunderbird)
**Version:** 2.1
**Author:** Seva Tsiliurik
**Minimum Thunderbird Version:** 115.0
**ID:** filter-folder-creator@tsilvs

This is a Thunderbird WebExtension that automates IMAP folder management by parsing message filter rules, detecting missing folders, creating them, and discovering new senders for rule generation.

---

## File Structure & Architecture

```
/ext/
├── manifest.json                 # Extension metadata & permissions
├── background.js                 # Service worker (message routing, long operations)
├── ui.js                        # Main UI logic (~1467 lines)
├── ui.html                      # Main interface
├── options.js                   # Settings page logic
├── options.html                 # Settings interface
├── style.css                    # Legacy styles
│
├── /config/
│   └── constants.js             # Centralized configuration & constants
│
├── /modules/
│   ├── MailClient.js            # Thunderbird API wrapper (pure functions)
│   └── RuleEngine.js            # Filter rule parsing & generation
│
├── /utils/
│   ├── dom.js                   # DOM manipulation helpers
│   ├── data.js                  # Data transformation utilities
│   ├── storage.js               # Browser storage with fallback
│   ├── functional.js            # Error handling & functional patterns
│   ├── pathSanitizer.js         # Path encoding/decoding & validation
│   └── store.js                 # Minimal state management
│
├── /css/
│   ├── theme.css                # Color scheme & typography (145 lines)
│   ├── base.css                 # Base element styling (32 lines)
│   ├── layout.css               # Layout structure (16 lines)
│   └── /cmp/                    # Component-specific styles
│       ├── _buttons.css
│       ├── _cards.css
│       ├── _forms.css
│       ├── _icons.css
│       ├── _lists.css
│       ├── _modals.css
│       ├── _status.css
│       └── _tabs.css
│   └── /util/
│       ├── _misc.css
│       └── _spacing.css
│
└── /_locales/en/
    └── messages.json            # Internationalization strings
```

## Logical Bugs

**1. `background.js:145` — `resolveRoot` has dead `accountId` param**

```js
const resolveRoot = (folders, accountId, preferredRoot) => {
```

`accountId` is accepted but never used. Confuses callers.

**2. `background.js:210-215` — `handleCreationError` treats "already exists" as success silently**

```js
if (!error.message.includes(ERROR_MESSAGES.ALREADY_EXISTS)) {
    results.failed.push(...)
} else {
    results.created.push(path)  // "already exists" silently counted as created
}
```

Fine semantically, but `results.created` now has false positives — callers can't distinguish "created" from "already existed". Add a third bucket (`skipped`) or a flag.

**3. `background.js:228-235` — `sendDeleteProgress` is a dead duplicate of `sendProgress`**
Both send identical messages. `sendDeleteProgress` was likely kept from an earlier refactor and can be deleted.

**4. `background.js:85-102` — `scanMessages` vs `scanFolderSenders` are near-identical**
Both: get folder → get account → call `MailClient.getSenders`. Only difference: return shape (`Array` vs `{ folderId, senders }`). One wrapper is redundant. The background `MESSAGE_ROUTES` only routes `scanMessages` and `scanFolderSenders`; `ui.js` uses both. Pick one contract or unify.

**5. `ui.js:40` — `const state = store.getState()` caches a reference that works by accident**
`createStore` mutates the same object via `Object.assign(state, partial)`, so this cached reference stays "live". But this is an implementation detail that's not part of the store's contract. Subscribers exist precisely to react to changes; caching the state ref bypasses that and makes the code fragile against any store refactor that replaces state objects.

**6. `ui.js:862-909` — ports not disconnected on error**
`runCreate` and `runDelete` both call `port.disconnect()` on `complete` but not on `error`. The port leaks until the extension context is destroyed.

```js
} else if (msg.type === 'error') {
    setStatus(statusId, msg.error, 'error')
    btn.disabled = false
    // port.disconnect() missing
}
```

**7. `ui.js:1332-1335` — `btnDeleteInvalidRules` re-generates rules from a single email per multi-email rule**

```js
.map(rule => RuleEngine.generateBlock(...)(rule.emails[0], rule.path, ...))
```

Rules with multiple `from` conditions (`rule.emails.length > 1`) are silently collapsed to just the first email.

**8. `constants.js:35` vs `constants.js:97` — duplicate defaults**
`DEFAULT_CONFIG.scanLimit = 500` and `LIMITS.DEFAULT_SCAN_LIMIT = 500` are the same value. Two sources of truth. `storage.js` uses `DEFAULT_CONFIG`; `MailClient.getSenders` uses `LIMITS`. Consolidate: `DEFAULT_CONFIG.scanLimit = LIMITS.DEFAULT_SCAN_LIMIT`.

---

### Thunderbird 140+ Compatibility

**9. `manifest.json:10` — `strict_min_version: "115.0"` should be `"128.0"` minimum**
TB 115 predates the MV3 migration. Your extension uses MV3 (`manifest_version: 3`) and `messenger.folders.delete` (added ~TB 128). Set `strict_min_version` to at least `"128.0"`, preferably `"140.0"` if you're targeting 140.

**10. `background.js` — `background.scripts` with `type: module` is correct for Thunderbird MV3**
Chrome MV3 requires `service_worker`; Thunderbird MV3 uses `scripts + type: module`. This is correct as-is for Thunderbird.

**11. `MailClient.js:210-213` — `findInboxFolder` locale-sensitive fallback**

```js
return (
	folders.find((f) => f.type === "inbox" || f.name === INBOX_FOLDER_NAME) ||
	folders[0]
);
```

`f.type === 'inbox'` is correct. The `f.name === 'Inbox'` fallback breaks in non-English Thunderbird. Remove the name fallback; the `type` check is sufficient and locale-independent.

**12. `ui.js:693` — same locale issue**

```js
if (f.name === "Inbox") opt.selected = true;
```

Use `f.type === 'inbox'` instead.

---

### Code Smells & Style

**13. `ui.js:628,635` — `PLACEHOLDER_URI` constant not used**
`"imap://REPLACE_ME"` appears as a hardcoded string literal in 6+ places across `ui.js` and `background.js`. `constants.js` already exports `PLACEHOLDER_URI`. Import and use it.

**14. `ui.js:865,891` — `PORT_NAMES`/`MESSAGE_TYPES` constants not used**
`runCreate`/`runDelete` hardcode `'create-folders'`, `'progress'`, `'complete'`, `'error'` as strings instead of using the constants from `constants.js`.

**15. `ui.js:1046-1052` — dead empty else branch**

```js
} else {
    // No changes needed or empty
}
```

Delete it.

**16. `ui.js:1203` — hardcoded i18n string**
`setStatus('statusFolders', 'Done', 'success')` — `'Done'` should use `browserApi.i18n.getMessage(...)` like the rest.

**17. `ui.js:213` — `withButtonBusy` has stray extra indentation level**
The function body is indented one tab deeper than the surrounding code. Cosmetic, but breaks consistency.

**18. `storage.js:9`, `ui.js:11` — unnecessary `browser` compat check**

```js
const browserApi = typeof browser !== "undefined" ? browser : messenger;
```

Thunderbird extensions always have `messenger`. The `browser` global exists in TB too (it's an alias), but this check adds noise. Pick `messenger` everywhere for clarity.

**19. `RuleEngine.js:93-94` — noisy `new RegExp` from `.source`**

```js
const condRegex = new RegExp(REGEX_PATTERNS.EMAIL_CONDITION.source, "gi");
```

The constant already has `/gi` flags (visible in `constants.js:83`). Extracting `.source` and re-adding `'gi'` works but is confusing. Document why (stateful regex reset per call), or define the constant without flags and add them here.

---

## Architecture / Reusability

**20. `dedupeRawRules`, `dedupeRawRulesByPath` (`ui.js:159-199`) belong in `RuleEngine.js`**
These are pure text transformations on rule content — same layer as `sortRawRules`. Move them there. The two functions share identical structure (header split, block parse, dedup by key); extract a `dedupeRules(content, keyFn)` helper.

**21. `pathSuffixToEmail` (`ui.js:251`) is the inverse of `RuleEngine.emailToPath` — belongs in `RuleEngine.js`**

**22. `buildEmailToRulePathMap` (`ui.js:260`), `analyzeRulesAndFolders` (`ui.js:273`) — pure logic in wrong layer**
These operate only on parsed rule data and folder paths. No DOM access. Move to `RuleEngine.js`.

**23. `ui.js:formAnalyze.onsubmit` (~150 lines) — business logic embedded in event handler**
The leaf scan loop, inbox scan, email set building, and analysis computation are all inline in the submit handler. Extract to a named async function (e.g. `runAnalysis(accountId, filterContent, options)`) that returns the analysis result. The handler should only orchestrate: call → update state → update status.

**24. `background.js:handlePortConnection:486-516` — duplicated port dispatch pattern**

```js
if (port.name === PORT_NAMES.CREATE_FOLDERS) { ... }
else if (port.name === PORT_NAMES.DELETE_FOLDERS) { ... }
```

Both branches have identical structure. Extract:

```js
const PORT_HANDLERS = {
	[PORT_NAMES.CREATE_FOLDERS]: createFolders,
	[PORT_NAMES.DELETE_FOLDERS]: deleteFolders,
};
const handlePortConnection = (port) => {
	const handler = PORT_HANDLERS[port.name];
	if (!handler) return;
	port.onMessage.addListener(async (msg) => {
		try {
			port.postMessage({
				type: MESSAGE_TYPES.COMPLETE,
				results: await handler(msg, port),
			});
		} catch (e) {
			port.postMessage({ type: MESSAGE_TYPES.ERROR, error: e.message });
		}
	});
};
```

**25. `background.js:deleteFolders` — deep nesting from try/retry/verify**
Three levels of try/catch for a single delete + optional retry + verify. Extract to `deleteWithRetry(folderId)` returning `{ ok, verified }` so the main loop stays flat.

---

## Summary

| Severity            | Count | Areas                                                  |
| ------------------- | ----- | ------------------------------------------------------ |
| Bug / logical error | 7     | `background.js`, `ui.js`                               |
| TB 140 compat       | 3     | `manifest.json`, `MailClient.js`, `ui.js`              |
| Code smell          | 8     | `ui.js`, `constants.js`, `storage.js`, `RuleEngine.js` |
| Architecture        | 6     | `ui.js`, `background.js`, `RuleEngine.js`              |

Priority fixes: **#6** (port leak), **#7** (data loss on multi-email rules), **#9** (manifest version), **#11/#12** (locale bugs), **#2** (misleading created vs already-existed), **#24** (easy win, removes ~25 lines of duplication).
