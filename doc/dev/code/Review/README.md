# Thunderbird Extension Source Code Review

## Project Overview

**Name:** Filter Folder Creator (for Thunderbird)
**Version:** 2.1
**Author:** Seva Tsiliurik
**Minimum Thunderbird Version:** 128.0
**ID:** filter-folder-creator@tsilvs

This is a Thunderbird WebExtension that automates IMAP folder management by parsing message filter rules, detecting missing folders, creating them, and discovering new senders for rule generation.

---

## File Structure & Architecture

```
/ext/
├── manifest.json                 # Extension metadata & permissions
├── background.js                 # Service worker (message routing, long operations)
├── ui.js                        # Main UI logic (~1770 lines)
├── ui.html                      # Main interface
├── options.js                   # Settings page logic
├── options.html                 # Settings interface
├── style.css                    # Legacy styles (unused?)
│
├── /config/
│   └── constants.js             # Centralized configuration & constants
│
├── /modules/
│   ├── MailClient.js            # Thunderbird API wrapper
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
│   ├── theme.css                # Color scheme & typography
│   ├── base.css                 # Base element styling
│   ├── layout.css               # Layout structure
│   └── /cmp/                   # Component-specific styles
│   └── /util/
│
└── /_locales/en/
    └── messages.json            # Internationalization strings
```

---

## Critical Bugs

**1. `ui.js:1291` — All main event handlers nested inside `btnApplyDefaults.onclick` ⚠️**

All of the following handlers are registered **inside** the `btnApplyDefaults.onclick` callback (confirmed via tab-level inspection):

- `formAnalyze.onsubmit` (analyze button)
- `btnCreateMissing.onclick`
- `btnCreateMissingInline.onclick`
- `btnGenMissingInbox.onclick`
- `btnDownloadRules.onclick`
- `btnGenMissingLeaf.onclick`
- `btnGenMismatched.onclick`
- `btnDeleteEmptyFolders.onclick`
- `btnDeleteInvalidRules.onclick`
- `formDiscovery.onsubmit`
- `selectAll.onchange`
- `.sortable` column headers
- `btnCreateDiscovered.onclick`
- `btnGenRules.onclick`

None of these handlers are registered at startup. They only become active after the user clicks "Apply Defaults". The entire core UI is non-functional until then. This was introduced in the "Code review refactor" commit.

**Fix:** Hoist all handler registrations to `DOMContentLoaded` level. `btnApplyDefaults.onclick` should only contain its own action (updating filter types in the textarea).

---

## Code Smells

**2. `ui.js:956,971` and scattered — hardcoded non-i18n status strings in `runDelete` and other handlers**

Multiple `setStatus(...)` calls use raw string literals instead of `browserApi.i18n.getMessage(...)`:

| Location          | String                                                     |
| ----------------- | ---------------------------------------------------------- |
| `ui.js:956`       | `"Deleting folders..."`                                    |
| `ui.js:971`       | `` `Deleted ${n}, failed ${m}` ``                          |
| `ui.js:1242`      | `"Target root was invalid and was reset to Account Root."` |
| `ui.js:1380,1405` | `"No folders to create."`                                  |
| `ui.js:1445`      | `"No rules to download."`                                  |
| `ui.js:1630`      | `"Scanning..."`                                            |
| `ui.js:1645`      | `"No source folder selected."`                             |
| `ui.js:1688`      | `` `Found ${n}` ``                                         |
| `ui.js:1735`      | `"No folders selected to create."`                         |

These are inconsistent with the rest of the file and block future localization.

**3. `MailClient.js:346`, `RuleEngine.js:468` — "Legacy Namespace Export" label is misleading**

Both modules export a namespace object (`MailClient`, `RuleEngine`) labeled "Legacy Namespace Export (for backward compatibility during migration)". But `ui.js` imports and uses these as the **primary API** — there is no migration in progress and no alternative. The "legacy" comment implies these exports should be avoided, which is confusing. Rename the section comment to something like `// Namespace Export` or document the migration target.

**4. `RuleEngine.js:108` — `new RegExp` from `.source` is confusing without a comment**

```js
const condRegex = new RegExp(REGEX_PATTERNS.EMAIL_CONDITION.source, "gi");
```

A comment was added (`// NOTE: Reconstructing with 'gi' flags to avoid stateful regex issues across calls`), which is good. But the cleaner fix is to define the constant without flags in `constants.js` and add them at the call site — then the reconstruction reason is self-evident. The current approach works but requires the comment to stay in sync.

---

## Thunderbird Compatibility Note

**`background.js` — `background.scripts` with `type: module` is correct for Thunderbird MV3**
Chrome MV3 requires `service_worker`; Thunderbird MV3 uses `scripts + type: module`. This is correct as-is.
