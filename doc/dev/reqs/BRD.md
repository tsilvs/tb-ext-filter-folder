# Thunderbird Filter Folder Creator BRD

**Version:** 2.2
**Platform:** [Mozilla Thunderbird](https://www.thunderbird.net/) (Gecko 115.0+)

## Purpose

Automate IMAP folder management via message filter rules.

## Core Workflows

1. **Synchronization**: Parse `msgFilterRules.dat` -> detect missing IMAP folders -> create them
2. **Discovery**: Scan inbox -> extract sender domains -> propose folder hierarchy -> generate filter rules
3. **Organization**: Auto-structure senders as `Domain/User` hierarchies

## Technical Stack

### Architecture

+ ES6 Modules (import/export)
+ async/await for heavy operations
+ Separation: utility modules, API wrappers, error handlers
+ Pure HTML/CSS/JS (minimal JS)

### APIs

+ `messenger` (Thunderbird-specific)
+ `browser` (WebExtension standard)
+ `browser.storage.sync` (state persistence)
+ In-memory state (runtime data)
+ `runtime.sendMessage` (stateless requests)
+ `runtime.connect` (long-running ops)
+ **Background Worker** for business logic (UI-independent)

### Styling

CSS:
+ variables
+ Grid
+ Flexbox

## Functional Requirements

### Filter Synchronization

**Input:** User selects IMAP account + uploads/pastes `msgFilterRules.dat`

**Process:**
+ [x] Parse filter file → extract `imap://`/`mailbox://` URIs
+ [x] Normalize to readable paths
+ [x] Recursively scan IMAP account → build folder cache
+ [x] Compare required vs existing paths
+ [x] Optional case-insensitive merge

**Output:**
+ [x] Stats: folder count, leaf folders, rule count
+ [x] List missing paths
+ [x] Batch-create button (recursive: A → A/B → A/B/C)

### Rule Discovery

**Input:** Source folder + scan limit (100-5000) + target root path

**Process:**
+ [x] Scan last N messages
+ [x] Extract unique "From" addresses
+ [x] Exclude addresses with existing rules
+ [x] Generate reverse-domain paths (`bob@google.com` -> `com/google/bob`)

**Output:**
+ [x] Interactive list with proposed paths
+ [x] **Action A:** Batch-create folders
+ [x] **Action B:** Generate filter rules `->` append to target root
+ [x] Download combined `.dat` file

### Email to Directory Association

**Purpose:** Standardize how email addresses map to filesystem paths to ensure organized hierarchies.

**Requirements:**
+ [x] **Reverse Domain Mapping:** Convert `user@sub.domain.tld` -> `tld/domain/sub/user`
+ [ ] **Special Character Handling:** Sanitize path segments (replace `:`, `/`, `\` with `_`)
+ [ ] **Collision Resolution:** Handle case-insensitive duplicates (e.g. `User@domain` vs `user@domain`)
+ [ ] **Custom Mapping:** Allow user to define custom root paths or regex overrides for specific contacts (can have multiple emails), emails or domains

### Automation

**Purpose:** Reduce manual intervention for keeping folders and rules in sync.

**Requirements:**
+ [ ] **Periodic Background Scan:** Run discovery logic every N minutes (configurable)
+ [ ] **Notification:** Alert user when new unmapped senders exceed a threshold
+ [ ] **Auto-Create:** Option to automatically create missing folders if they match high-confidence patterns
+ [x] **Trigger Automation:** Automatically apply selected trigger bitmasks to generated rules

### Data Persistence & Caching

**Purpose:** Maintain state across browser restarts and efficiently handle large rule files.

**Requirements:**
+ [ ] **Rule Storage:** Persist uploaded `msgFilterRules.dat` content in `browser.storage.local` to survive extension reloads
+ [ ] **Context Awareness:** Associate stored rules with specific IMAP account IDs
+ [ ] **Staleness Warning:** Visual indicator if the stored rules might be out of sync with the filesystem (timestamp check if possible, or manual "Last updated" label)
+ [ ] **Export/Backup:** Allow exporting the internal state configuration to JSON

### Online Email Filter Rules Management

**Purpose:** Bridge local Thunderbird rules with server-side filters (e.g. Gmail Filters) to ensure processing happens even when the client is offline.

**Requirements:**
+ [ ] **Remote Fetch:** Connect to supported providers to fetch active server-side rules
+ [ ] **Rule Translation:** Convert Thunderbird filter syntax to Sieve/XML format
+ [ ] **Sync Direction:** Choose between "Push to Server" (Overwrite remote) or "Pull from Server" (Update local)
+ [ ] **Auth Management:** Securely store OAuth tokens or credentials for rule management access

**Default Supported Providers:**
+ [ ] Gmail
+ [ ] Yandex
+ [ ] Yahoo

Should be extensible through custom:
+ [ ] OpenAPI YAML Spec input with mappings to generic email rule management actions
+ [ ] local rules to remote rules mapping per property

#### Process

**Input:**
+ Selected email account
+ Email server API Mapping config
+ stored necessary API auth
+ stored filter rules from local rules
+ local rules to remote rules mapping per property

Flow: `Remote rules <-> Local rules`

**Process:**
+ [ ] Request filter rules from online email account by appropriate endpoint via appropriate request
+ [ ] Display effective remote filter rules in a list
+ [ ] Allow to manage the list of filters
+ [ ] Map local rules to remote rules

**Output:**
+ [ ] Downloaded & merged remote rules
+ [ ] Updated remote rules from local ones

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

+ [x] Bulk-update trigger settings
+ [x] Sort rules alphabetically by target path
+ [x] Persist preferences: `scanLimit`, `defaultRoot`, `filterTriggers`, `mergeCase`
+ [x] Modal UI + Add-on Manager access

## Non-Functional Requirements

### Architecture

+ [x] **Compatibility:** Gecko ≥115.0
+ [x] **Performance:** Background context for scanning/creation
+ [x] **Security:** No `eval()`, minimal permissions (`accountsRead`, `accountsFolders`, `messagesRead`, `tabs`, `downloads`, `storage`)
+ [x] **State Management:** Extension must maintain consistent state between background worker and UI contexts using message passing protocol
+ [ ] **API Rate Limiting:** IMAP operations must implement throttling/batching to prevent server rate limits (max N ops/second configurable)
+ [x] **Idempotency:** All folder/rule operations must be idempotent - safe to retry on failure
+ [ ] **Error Recovery:** Background operations must persist progress state - resumable after crash/restart
+ [x] **Memory Constraints:** Folder scanning must use streaming/pagination - avoid loading entire message lists into memory
+ [ ] **Dependency Injection:** API wrappers must be injectable for testing/mocking

### Code Style

+ [ ] **Functional Programming style**: Avoid OOP, prioritize pure functions, currying, composition, closures. Namespaces are allowed.
+ [x] **Pure Functions:** Utility modules must contain only pure functions - no side effects
+ [x] **Magic Numbers:** No hardcoded values - extract to named constants or config
+ [ ] **Parametrization:** Constants shouldn't be directly referenced from global / parent context, should be instead passed as an argument / parameter to a function
+ [ ] **Configuration:** All params in configs
+ [x] **Error Handling:** Graceful handling of permission errors, "folder exists" treated as success
+ [x] **Linting:** ESLint with strict ruleset (no-var, prefer-const, no-eval)
+ [x] **Naming Conventions:** camelCase functions/variables, PascalCase classes, SCREAMING_SNAKE_CASE constants
+ [x] **Documentation:** JSDoc for public APIs - param types, return types, examples
+ [x] **Error Messages:** User-facing errors must be actionable, technical errors logged with stack traces
+ [ ] **Reusable code:** As much DRY / code reuse as possible. High modularity of code chunks for combinations is encouraged

### Accessibility

+ [x] **I18n:** `data-i18n` + `messenger.i18n.getMessage`
+ [ ] **Automation**: Most actions that can be automated should be automated, according to user-defined rules.
+ [ ] **List management**: Every list should support applicable bulk actions: selection, CRUD, sorting, etc.
+ [x] **Keyboard Navigation:** All interactive elements must be keyboard-accessible (tab order, Enter/Space activation)
+ [x] **Screen Reader:** ARIA labels/roles for dynamic content updates, loading states, error messages
+ [ ] **Focus Management:** Focus must be managed during modal open/close, async operations completion
+ [x] **Visual Indicators:** Loading/progress states must have both visual and text indicators
+ [x] **Color Contrast:** UI must meet WCAG 2.1 AA standards (4.5:1 text, 3:1 non-text)

