# Minimal High-Impact Changes

This document defines the minimal set of architectural changes that will fix the most critical issues in the Thunderbird Filter Folder Maker extension.

## Analysis Summary

From the 9 major issue categories identified, **5 architectural changes** will fix **~80% of the critical problems** with relatively low implementation complexity.

**Priority Order:** Storage → Root Path → URI Parsing → Path Sanitization → Filter Schema

---

## Change 1: Storage Service Layer

### How it works

Create a unified storage abstraction ([`ext/utils/storage.js`](../../ext/utils/storage.js)) that implements automatic sync→local fallback:

```javascript
async function get(keys) {
  try {
    return await browser.storage.sync.get(keys)
  } catch (error) {
    console.warn('Sync storage failed, using local:', error)
    return await browser.storage.local.get(keys)
  }
}

async function set(items) {
  try {
    await browser.storage.sync.set(items)
  } catch (error) {
    console.warn('Sync storage failed, using local:', error)
    await browser.storage.local.set(items)
  }
}
```

Replace all direct `browserApi.storage.sync.*` calls in:

- [`ext/options.js`](../../ext/options.js:44) - `restoreOptions()`, `saveOptions()`
- [`ext/ui.js`](../../ext/ui.js:75) - `loadConfig()`

**Technical Notes:**

- No migration needed - first successful read wins
- Transparent to existing code - same API signature
- Falls back permanently until sync becomes available again

### What it fixes

**Issues Fixed:**

- ✅ **Storage fallback** - Config no longer reverts to defaults when sync is unavailable/disabled
- ✅ **Data persistence** - Users don't lose their preferences unexpectedly

**Impact:** HIGH - Prevents data loss and user frustration

**Complexity:** LOW - ~30 lines of code, 3 file edits

---

## Change 2: Root Path Strategy

### How it works

Make Inbox anchoring optional by introducing a root resolution strategy in [`ext/background.js`](../../ext/background.js:125):

**Current behavior:**

```javascript
const getParentId = (folderMap, inbox, pathParts, index) => {
  if (index === 0) return inbox.id  // Always Inbox
  // ...
}
```

**New behavior:**

```javascript
const resolveRoot = (folders, accountId, preferredRoot) => {
  // 1. If user specified explicit root, use it
  if (preferredRoot) {
    const folder = folders.find(f => 
      f.cleanPath.toLowerCase() === preferredRoot.toLowerCase()
    )
    if (folder) return folder
  }
  
  // 2. Fall back to account root (first folder)
  return folders[0] || null
}

const getParentId = (folderMap, rootFolder, pathParts, index) => {
  if (index === 0) return rootFolder.id  // Use resolved root
  // ... rest unchanged
}
```

Update [`createFolders()`](../../ext/background.js:195) to use the new strategy:

```javascript
const rootFolder = resolveRoot(folders, accountId, data.preferredRoot)
if (!rootFolder) throw new Error('No root folder found')
```

**Configuration:**

- Add UI option: "Folder Creation Root" (dropdown: Account Root / Inbox / Custom)
- Store in config: `folderRoot: ''` (empty = account root, 'Inbox' = inbox)
- If user wants Inbox subfolders, they prefix paths with `Inbox/...`

### What it fixes

**Issues Fixed:**

- ✅ **Root selection vs Inbox anchoring** - Users can choose where folders are created
- ✅ **Flexibility** - Supports both top-level and nested folder structures

**Impact:** HIGH - Fundamental folder placement control

**Complexity:** LOW - ~50 lines of code, parameterization change

---

## Change 3: URI Parser Enhancement

### How it works

Extend regex patterns in [`ext/config/constants.js`](../../ext/config/constants.js:70) to support all folder actions and URI schemes:

**Current patterns:**

```javascript
ACTION_URI: /action="Move to folder"[\s\S]*?actionValue="([^"]+)"/,
BASE_URI: /actionValue="(imap:\/\/[^/]+)\//,
```

**Enhanced patterns:**

```javascript
// Match Move OR Copy to folder
ACTION_URI: /action="(?:Move|Copy) to folder"[\s\S]*?actionValue="([^"]+)"/,

// Match imap:// OR mailbox:// (Local Folders)
BASE_URI: /actionValue="((?:imap|mailbox):\/\/[^/]+)\//,
```

**Testing:**

- Verify Copy to folder rules are now discovered
- Verify Local Folders (mailbox://) URIs are parsed correctly

### What it fixes

**Issues Fixed:**

- ✅ **URI parsing gaps** - Now handles "Copy to folder" actions
- ✅ **Local Folders support** - Recognizes `mailbox://` URIs
- ✅ **Account validation** - Correct base URI comparison in [`validateAccountRulesMatch()`](../../ext/ui.js:54)

**Impact:** MEDIUM - Expands functionality, fixes false positives

**Complexity:** LOW - 2 regex changes

---

## Change 4: Path Sanitizer Service

### How it works

Create centralized encoding/validation service ([`ext/utils/pathSanitizer.js`](../../ext/utils/pathSanitizer.js)) with three responsibilities:

**1. Detection**

```javascript
function analyzePathIssues(path) {
  const issues = []
  
  // Check for problematic characters
  if (/[<>:"|?*\\]/.test(path)) {
    issues.push({ type: 'windows-forbidden', chars: path.match(/[<>:"|?*\\]/g) })
  }
  
  // Check for encoding issues
  if (path !== encodeURIComponent(path)) {
    issues.push({ type: 'needs-encoding', original: path })
  }
  
  // Check for case collisions (compare with existing)
  // ...
  
  return issues
}
```

**2. Encoding/Decoding**

```javascript
// Centralize encoding logic from RuleEngine.js:80
function encodePath(path) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function decodePath(uri) {
  const match = uri.match(/(?:imap|mailbox):\/\/[^/]+(?:@[^/]+)?\/(.+)/)
  return match ? decodeURIComponent(match[1]) : null
}
```

**3. Warnings**

```javascript
function generateWarnings(pathIssues) {
  return pathIssues.map(issue => {
    switch (issue.type) {
      case 'windows-forbidden':
        return `Path contains forbidden characters: ${issue.chars.join(', ')}`
      case 'needs-encoding':
        return `Path will be URL-encoded: "${issue.original}"`
      // ...
    }
  })
}
```

**Integration:**

- Add validation in [`ui.js`](../../ext/ui.js) before folder creation
- Show warning dialog with detected issues + "Continue Anyway" option
- Update [`RuleEngine.buildFullUri()`](../../ext/modules/RuleEngine.js:79) to use centralized encoder
- Update [`RuleEngine.uriToPath()`](../../ext/modules/RuleEngine.js:46) to use centralized decoder

### What it fixes

**Issues Fixed:**

- ✅ **Special character sanitization** - Detects and warns about problematic paths
- ✅ **Consistent encoding/decoding** - Single source of truth for URI operations
- ✅ **User awareness** - Warns before creating potentially problematic folders

**Impact:** HIGH - Data integrity and user experience

**Complexity:** MEDIUM - ~150 lines, UI integration needed

---

## Change 5: Filter Config Schema Migration

### How it works

Replace boolean flags with structured array in [`ext/config/constants.js`](../../ext/config/constants.js:6):

**Current schema:**

```javascript
DEFAULT_CONFIG = {
  filterManual: true,
  filterNewMail: true,
  filterSending: false,
  filterArchive: false,
  filterPeriodic: false
}
```

**New schema:**

```javascript
FILTER_TYPES = {
  PRE_JUNK: 1,      // Was NEW_MAIL - CORRECTED
  MANUAL: 16,       // Correct
  POST_JUNK: 32,    // Was NEW_MAIL_JUNK - CORRECTED  
  SENDING: 64,      // Was 32 - CORRECTED
  ARCHIVE: 128,     // Was 64 - CORRECTED
  PERIODIC: 256     // Was 128 - CORRECTED
}

DEFAULT_FILTER_CONFIG = [
  { id: 'preJunk', value: 1, label: 'optPreJunk', enabled: false },
  { id: 'manual', value: 16, label: 'optManual', enabled: true },
  { id: 'postJunk', value: 32, label: 'optPostJunk', enabled: true },
  { id: 'sending', value: 64, label: 'optSending', enabled: false },
  { id: 'archive', value: 128, label: 'optArchive', enabled: false },
  { id: 'periodic', value: 256, label: 'optPeriodic', enabled: false }
]

DEFAULT_CONFIG = {
  // ... other fields
  filters: DEFAULT_FILTER_CONFIG  // Array instead of booleans
}
```

**Migration logic** in storage service:

```javascript
async function get(keys) {
  const data = await getFromStorage(keys)
  
  // Auto-migrate old boolean schema to new array schema
  if (data.filterManual !== undefined && !data.filters) {
    data.filters = DEFAULT_FILTER_CONFIG.map(f => ({
      ...f,
      enabled: f.id === 'manual' ? data.filterManual :
               f.id === 'preJunk' ? data.filterNewMail :
               f.id === 'sending' ? data.filterSending :
               f.id === 'archive' ? data.filterArchive :
               f.id === 'periodic' ? data.filterPeriodic : f.enabled
    }))
    // Remove old keys
    delete data.filterManual
    delete data.filterNewMail
    // ... etc
  }
  
  return data
}
```

**UI Updates** ([`ext/options.html`](../../ext/options.html)):

- Replace hardcoded checkboxes with dynamic rendering
- Generate from `DEFAULT_FILTER_CONFIG` array

**Logic Updates** ([`ext/modules/RuleEngine.js`](../../ext/modules/RuleEngine.js:165)):

```javascript
export const calculateType = (filters) => {
  const sum = filters
    .filter(f => f.enabled)
    .reduce((acc, f) => acc + f.value, 0)
  
  // Default to Manual + Post-Junk (48) if none selected
  return sum === 0 ? 48 : sum
}
```

### What it fixes

**Issues Fixed:**

- ✅ **Incorrect filter type values** - Uses correct Thunderbird spec constants
- ✅ **Schema extensibility** - Easy to add new filter types
- ✅ **Default correctness** - Manual + Post-Junk = 48 (not 17)
- ✅ **Dynamic UI** - Options render from config, not hardcoded

**Impact:** HIGH - Correctness of generated filters

**Complexity:** MEDIUM - Migration logic + UI refactor

---

## Change 6: Message Pagination (Optional)

### How it works

Implement proper pagination in [`ext/modules/MailClient.js`](../../ext/modules/MailClient.js:201):

**Current implementation:**

```javascript
const messages = await api.messages.list(String(folderId))
const list = (messages.messages || []).slice(0, messageLimit)
```

**Paginated implementation:**

```javascript
export const getSenders = (api) => async (folderId, limit, selfIdentities = []) => {
  const messageLimit = limit || LIMITS.DEFAULT_SCAN_LIMIT
  const selfEmails = toSet(selfIdentities.map(i => (i.email || '').toLowerCase()))
  const senders = new Set()
  
  let page = await api.messages.list(String(folderId))
  let collected = 0
  
  while (page && collected < messageLimit) {
    const batch = page.messages || []
    
    for (const msg of batch) {
      if (collected >= messageLimit) break
      
      const email = extractEmail(msg.author)
      if (!shouldExcludeEmail(selfEmails, email)) {
        senders.add(email)
      }
      collected++
    }
    
    // Get next page if available and under limit
    if (page.id && collected < messageLimit) {
      page = await api.messages.continueList(page.id)
    } else {
      break
    }
  }
  
  return fromSet(senders)
}
```

### What it fixes

**Issues Fixed:**

- ✅ **Scan limit honored** - Stops fetching when limit reached
- ✅ **Performance** - Doesn't load all messages unnecessarily
- ✅ **Memory efficiency** - Processes messages in batches

**Impact:** MEDIUM - Performance for large folders

**Complexity:** MEDIUM - Requires understanding Thunderbird pagination API

**Note:** This change is optional for the minimal set - the current implementation works, just inefficiently.

---

## Implementation Strategy

### Phase 1: Foundation (Must-Have)

1. **Storage Service Layer** - Prevents data loss
2. **Root Path Strategy** - Correct folder placement

### Phase 2: Correctness (Must-Have)

3. **URI Parser Enhancement** - Quick regex fix
2. **Filter Config Schema** - Correct filter types

### Phase 3: Data Integrity (Recommended)

5. **Path Sanitizer Service** - User warnings + centralized encoding

### Phase 4: Optimization (Optional)

6. **Message Pagination** - Performance improvement

---

## Excluded from Minimal Set

The following issues are **not addressed** by this minimal change set:

### Collision Resolution UI

**Why excluded:** Can be handled manually; requires complex UI. Users can rename folders themselves if collisions occur.

### Error Recovery with Checkpointing

**Why excluded:** High complexity, low frequency of failures. Current try/catch handles most errors adequately.

### Custom Path Mapping UI

**Why excluded:** Low priority; path sanitizer warnings are sufficient for MVP.

---

## Impact Summary

| Change | Issues Fixed | Impact | Complexity | Priority |
|--------|--------------|--------|------------|----------|
| Storage Service | 1 (storage fallback) | HIGH | LOW | Must-Have |
| Root Path Strategy | 1 (inbox anchoring) | HIGH | LOW | Must-Have |
| URI Parser | 2 (action types, schemes) | MEDIUM | LOW | Must-Have |
| Path Sanitizer | 2 (special chars, encoding) | HIGH | MEDIUM | Recommended |
| Filter Schema | 1 (filter types) | HIGH | MEDIUM | Must-Have |
| Pagination | 1 (scan limit) | MEDIUM | MEDIUM | Optional |

**Total Issues Fixed:** 8 of 9 major issue categories (~89%)

**Total New Code:** ~400-500 lines across 5-6 files

**Files Modified:** ~8-10 existing files

**Backward Compatibility:** Full (automatic migration)

---

## Risks and Mitigations

### Risk 1: Storage Migration

**Risk:** Users lose settings during migration  
**Mitigation:** Migration is additive - old keys remain until first save

### Risk 2: Root Path Breaking Change

**Risk:** Users expect Inbox behavior  
**Mitigation:** Make configurable with migration to preserve existing behavior

### Risk 3: Filter Type Schema

**Risk:** Complex migration breaks existing configs  
**Mitigation:** Comprehensive fallback logic, defaults to safe values

---

## Testing Strategy

### Unit Tests Needed

- Storage fallback behavior (sync fail → local success)
- Root path resolution (explicit, inbox, account root)
- URI regex matching (all action types, all schemes)
- Path sanitization (detection, encoding, warnings)
- Filter type calculation (array-based, correct values)

### Integration Tests Needed

- End-to-end folder creation with different root strategies
- Config save/load across storage backends
- Filter generation with new type masks

### Manual Testing

- Test with sync disabled → verify local fallback
- Test folder creation at different roots
- Test with Local Folders (mailbox:// URIs)
- Test with paths containing special characters
- Verify filter import/export preserves types

---

## Success Metrics

✅ **Zero data loss** when sync storage is unavailable  
✅ **User control** over folder creation root  
✅ **100% URI scheme coverage** (imap + mailbox)  
✅ **User awareness** of path encoding issues  
✅ **Correct filter types** matching Thunderbird spec  
✅ **Backward compatible** with existing configurations
