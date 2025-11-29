# Thunderbird Filter Folder Creator BRD

**Version:** 2.1  
**Platform:** [Mozilla Thunderbird](https://www.thunderbird.net/) (Gecko 115.0+)

## Purpose

Automate IMAP folder management via message filter rules.

## Core Workflows

1. **Synchronization**: Parse `msgFilterRules.dat` → detect missing IMAP folders → create them
2. **Discovery**: Scan inbox → extract sender domains → propose folder hierarchy → generate filter rules
3. **Organization**: Auto-structure senders as `Domain/User` hierarchies

## Technical Stack

### Architecture

- ES6 Modules (import/export)
- async/await for heavy operations
- Separation: utility modules, API wrappers, error handlers
- Pure HTML/CSS/JS (minimal JS)

### APIs

- `messenger` (Thunderbird-specific)
- `browser` (WebExtension standard)
- `browser.storage.sync` (state persistence)
- In-memory state (runtime data)
- `runtime.sendMessage` (stateless requests)
- `runtime.connect` (long-running ops)
- **Background Worker** for business logic (UI-independent)

### Styling

CSS:
+ variables
+ Grid
+ Flexbox

## Functional Requirements

### Filter Synchronization

**Input:** User selects IMAP account + uploads/pastes `msgFilterRules.dat`

**Process:**
- Parse filter file → extract `imap://`/`mailbox://` URIs
- Normalize to readable paths
- Recursively scan IMAP account → build folder cache
- Compare required vs existing paths
- Optional case-insensitive merge

**Output:**
- Stats: folder count, leaf folders, rule count
- List missing paths
- Batch-create button (recursive: A → A/B → A/B/C)

### Rule Discovery

**Input:** Source folder + scan limit (100-5000) + target root path

**Process:**
- Scan last N messages
- Extract unique "From" addresses
- Exclude addresses with existing rules
- Generate reverse-domain paths (`bob@google.com` → `com/google/bob`)

**Output:**
- Interactive list with proposed paths
- **Action A:** Batch-create folders
- **Action B:** Generate filter rules → append to target root
- Download combined `.dat` file

### Configuration

#### Trigger

##### Format

Bitmask calculation for filter execution:

| Decimal | Meaning       |
|--------:|:--------------|
|       1 | New Mail      |
|      16 | Manual Run    |
|      32 | After Sending |
|      64 | Archiving     |
|     128 | Periodic      |

##### Features

- Bulk-update trigger settings
- Sort rules alphabetically by target path
- Persist preferences: `scanLimit`, `defaultRoot`, `filterTriggers`, `mergeCase`
- Modal UI + Add-on Manager access

## Non-Functional Requirements

### Architecture

- **Compatibility:** Gecko ≥115.0
- **Performance:** Background context for scanning/creation
- **Security:** No `eval()`, minimal permissions (`accountsRead`, `messagesRead`, `accountsFolders`)
+ **State Management:** Extension must maintain consistent state between background worker and UI contexts using message passing protocol
+ **API Rate Limiting:** IMAP operations must implement throttling/batching to prevent server rate limits (max N ops/second configurable)
+ **Idempotency:** All folder/rule operations must be idempotent - safe to retry on failure
+ **Error Recovery:** Background operations must persist progress state - resumable after crash/restart
+ **Memory Constraints:** Folder scanning must use streaming/pagination - avoid loading entire message lists into memory
+ **Dependency Injection:** API wrappers must be injectable for testing/mocking

### Code Style

- **Error Handling:** Graceful handling of permission errors, "folder exists" treated as success
+ **Linting:** ESLint with strict ruleset (no-var, prefer-const, no-eval)
+ **Naming Conventions:** camelCase functions/variables, PascalCase classes, SCREAMING_SNAKE_CASE constants
+ **Pure Functions:** Utility modules must contain only pure functions - no side effects
+ **Documentation:** JSDoc for public APIs - param types, return types, examples
+ **Error Messages:** User-facing errors must be actionable, technical errors logged with stack traces
+ **Magic Numbers:** No hardcoded values - extract to named constants or config

### Accessibility

- **I18n:** `data-i18n` + `messenger.i18n.getMessage`
+ **Keyboard Navigation:** All interactive elements must be keyboard-accessible (tab order, Enter/Space activation)
+ **Screen Reader:** ARIA labels/roles for dynamic content updates, loading states, error messages
+ **Focus Management:** Focus must be managed during modal open/close, async operations completion
+ **Visual Indicators:** Loading/progress states must have both visual and text indicators
+ **Color Contrast:** UI must meet WCAG 2.1 AA standards (4.5:1 text, 3:1 non-text)
