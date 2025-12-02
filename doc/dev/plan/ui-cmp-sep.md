# UI Component Separation

| UI             | Approach        | Status | Reason                                                                                                                                                        |
|----------------|-----------------|--------|---------------------------------------------------------------------------------------------------------------------------------------------------------------|
| Settings Modal | iframe          | Done   | Separate UI for a different task. Reused for "Preferences" tab in extension management                                                                        |
| Rule Generator | iframe          | Todo   | Complex functionality with its own state management. Isolated textarea, independent download functionality. Needs communication with parent for account data. |
| Tabs           | HTML components | Done   | Heavy integration with main application state                                                                                                                 |

2. **Shared Configuration Section**
   - **Why**: Central to all functionality, needs real-time sync
   - **Issues**: State synchronization complexity
   - **Better Approach**: Shared component with event-driven updates

3. **Header Section**
   - **Why**: Simple UI with minimal functionality
   - **Issues**: Overkill for simple button and title
   - **Better Approach**: Simple HTML component

## Recommended Approach: HTML Component Includes

Instead of iframes for most components, use HTML includes with a lightweight assembly system:

### Component Include Pattern
```html
<!-- In main ui.html -->
<div class="component-container" data-component="shared-config">
  <!-- Content loaded from html/cmp/shared/shared-config.html -->
</div>
```

### Benefits Over Iframes
- **Performance**: No additional document overhead
- **Styling**: Shared CSS scope for consistent theming
- **Communication**: Direct DOM access and event handling
- **SEO/Accessibility**: Better semantic structure
- **Debugging**: Simpler DOM inspection

## Proposed Component Structure

```
ext/html/cmp/
├── shared/
│   ├── header.html          # Extension header with settings button
│   ├── shared-config.html   # Account selection, file input, paste area
│   └── tab-navigation.html  # Tab switching controls
├── analysis/
│   ├── analysis-form.html   # Missing folders analysis form
│   └── analysis-results.html # Analysis results display
├── discovery/
│   ├── discovery-form.html  # Discovery scan form
│   ├── discovery-results.html # Discovery results list
│   └── rule-generation.html # Generated rules display and export
├── modal/
│   └── settings-modal.html  # Settings modal wrapper
└── ui.html                  # Main container that assembles all components
```

## Component Specifications

### 1. Shared Components

#### Header Component (`html/cmp/shared/header.html`)
```html
<header class="main-header">
  <h1 data-i18n="extensionName"></h1>
  <button id="btnSettings" class="icon-button" aria-label="Settings" title="Settings">
    <div class="icon icon-md icon-settings"></div>
  </button>
</header>
```

#### Shared Config Component (`html/cmp/shared/shared-config.html`)
```html
<section class="card shared-config">
  <label for="account" data-i18n="imapAccount"></label>
  <select id="account">
    <option data-i18n="loadingAccounts">Loading...</option>
  </select>

  <label for="fileInput" data-i18n="uploadFile"></label>
  <input type="file" id="fileInput" accept=".dat,text/plain">

  <textarea id="pasteInput" class="collapsed" data-i18n-placeholder="pastePlaceholder"></textarea>

  <div class="meta-info">
    <div class="btn-group">
      <button id="btnSortInput" type="button" class="link-button" data-i18n="sortRulesBtn"></button>
      <span class="sep">•</span>
      <button id="btnApplyDefaults" type="button" class="link-button" data-i18n="applyDefaultsBtn"></button>
    </div>
    <span id="ruleCountDisplay"></span>
  </div>
</section>
```

#### Tab Navigation Component (`html/cmp/shared/tab-navigation.html`)
```html
<div class="tabs-container">
  <input type="radio" name="tabs" id="tabInputFolders" checked>
  <input type="radio" name="tabs" id="tabInputDiscovery">
  <nav class="tabs-nav">
    <label for="tabInputFolders" class="tab-label" data-i18n="tabMissingFolders"></label>
    <label for="tabInputDiscovery" class="tab-label" data-i18n="tabRuleDiscovery"></label>
  </nav>
  
  <!-- Tab content containers will be included here -->
</div>
```

### 2. Analysis Components

#### Analysis Form Component (`html/cmp/analysis/analysis-form.html`)
```html
<div class="tab-content" id="contentFolders">
  <section class="card">
    <form id="formAnalyze">
      <section class="instruction" data-i18n="instructions"></section>

      <div class="stats">
        <aside class="stat">
          <div class="stat-label" data-i18n="totalFolders"></div>
          <output class="stat-value" id="statTotal">—</output>
        </aside>
        <aside class="stat">
          <div class="stat-label" data-i18n="leafFolders"></div>
          <output class="stat-value" id="statLeafs">—</output>
        </aside>
        <aside class="stat">
          <div class="stat-label" data-i18n="filterRules"></div>
          <output class="stat-value" id="statRules">—</output>
        </aside>
      </div>

      <div class="checkbox-group">
        <input type="checkbox" id="mergeCase" checked>
        <label for="mergeCase" class="inline" data-i18n="mergeCaseLabel"></label>
      </div>

      <div class="actions">
        <button type="submit" id="btnAnalyze" disabled data-i18n="analyzeMissing"></button>
        <aside class="status-area" id="statusFolders"></aside>
      </div>
    </form>
  </section>
</div>
```

#### Analysis Results Component (`html/cmp/analysis/analysis-results.html`)
```html
<section id="analysisResults" class="card">
  <h2 data-i18n="resultsHeader">Results</h2>

  <div class="stats">
    <aside class="stat">
      <div class="stat-label" data-i18n="uniqueLeafs"></div>
      <output class="stat-value" id="resLeafs">—</output>
    </aside>
    <aside class="stat">
      <div class="stat-label" data-i18n="missing"></div>
      <output class="stat-value" id="resMissing">—</output>
    </aside>
  </div>

  <div id="missingList" class="folder-list empty-state">
    <span class="hint" data-i18n="analyzeToSeeFolders"></span>
  </div>

  <div class="actions">
    <button id="btnCreateMissing" disabled data-i18n="createMissingFoldersBtn"></button>
  </div>
</section>
```

### 3. Discovery Components

#### Discovery Form Component (`html/cmp/discovery/discovery-form.html`)
```html
<div class="tab-content" id="contentDiscovery">
  <section class="card">
    <form id="formDiscovery">
      <section class="instruction" data-i18n="discoveryInstructions"></section>
      
      <label data-i18n="scanSourceLabel"></label>
      <select id="scanSource">
        <option data-i18n="loadingFolders"></option>
      </select>

      <label data-i18n="targetRootLabel"></label>
      <div class="input-group">
        <input type="text" id="targetRoot">
        <button type="button" id="btnInfer" data-i18n="inferRootBtn"></button>
      </div>
      <small class="hint" data-i18n="targetRootHint"></small>

      <div class="actions">
        <button type="submit" id="btnScan" class="primary" data-i18n="scanAndDiscover"></button>
        <aside class="status-area" id="statusDiscovery"></aside>
      </div>
    </form>
  </section>
</div>
```

#### Discovery Results Component (`html/cmp/discovery/discovery-results.html`)
```html
<section id="discoveryResults" class="card discovery-list hidden">
  <div class="list-header">
    <input type="checkbox" id="selectAllDiscovery" checked>
    <span class="sortable" data-sort="email">
      <span data-i18n="discoveredEmail"></span>
      <span class="sort-icon"></span>
    </span>
    <span class="sortable" data-sort="path">
      <span data-i18n="proposedPath"></span>
      <span class="sort-icon"></span>
    </span>
  </div>

  <div id="discoveryList"></div>

  <div class="actions">
    <button id="btnCreateDiscovered" disabled data-i18n="btnCreateFoldersOnly"></button>
    <button id="btnGenRules" class="secondary" disabled data-i18n="btnGenerateRulesOnly"></button>
  </div>
</section>
```

#### Rule Generation Component (`html/cmp/discovery/rule-generation.html`)
```html
<section id="genRulesArea" class="card hidden">
  <h3 data-i18n="generatedRulesHeader"></h3>

  <div id="accountMismatchWarning" class="status warning" style="display: none; margin-bottom: 12px;">
    <strong>⚠ Account Mismatch Detected</strong><br>
    Selected Account: <code id="mismatchAccountUri"></code><br>
    Rules Account: <code id="mismatchRulesUri"></code>
  </div>

  <fieldset id="ruleGenerationOptions">
    <div class="checkbox-group">
      <input type="checkbox" id="chkOverrideAccount" disabled title="Enable when account mismatch is detected">
      <label for="chkOverrideAccount" class="inline">
        Override with selected account URI
      </label>
    </div>
  </fieldset>

  <textarea id="genRulesOut" readonly></textarea>

  <div class="checkbox-group" style="margin: 0 0 12px 0;">
    <input type="checkbox" id="chkSortDownload" checked>
    <label for="chkSortDownload" class="inline" data-i18n="sortCombinedLabel"></label>
  </div>

  <div class="actions">
    <button id="btnDownload" data-i18n="downloadCombined"></button>
  </div>
</section>
```

### 4. Modal Component

#### Settings Modal Component (`html/cmp/modal/settings-modal.html`)
```html
<div id="settingsModal" class="modal-overlay">
  <div class="modal-content">
    <header class="modal-header">
      <h2 data-i18n="settingsTitle">Settings</h2>
      <button id="btnCloseSettings" class="icon-button close">&times;</button>
    </header>
    <iframe src="options.html" class="settings-frame"></iframe>
  </div>
</div>
```

## Component Assembly System

### HTML Include System

Since Thunderbird extensions don't support native HTML includes, we'll use a lightweight JavaScript-based component loader:

```javascript
// Component Loader (to be added to ui.js)
class ComponentLoader {
  static async loadComponent(containerId, componentPath) {
    try {
      const response = await fetch(componentPath)
      const html = await response.text()
      const container = document.getElementById(containerId)
      if (container) {
        container.innerHTML = html
        return true
      }
    } catch (error) {
      console.error(`Failed to load component ${componentPath}:`, error)
      return false
    }
  }

  static async loadAllComponents() {
    const components = [
      { id: 'header-container', path: 'html/cmp/shared/header.html' },
      { id: 'shared-config-container', path: 'html/cmp/shared/shared-config.html' },
      { id: 'tab-navigation-container', path: 'html/cmp/shared/tab-navigation.html' },
      { id: 'analysis-form-container', path: 'html/cmp/analysis/analysis-form.html' },
      { id: 'analysis-results-container', path: 'html/cmp/analysis/analysis-results.html' },
      { id: 'discovery-form-container', path: 'html/cmp/discovery/discovery-form.html' },
      { id: 'discovery-results-container', path: 'html/cmp/discovery/discovery-results.html' },
      { id: 'rule-generation-container', path: 'html/cmp/discovery/rule-generation.html' },
      { id: 'settings-modal-container', path: 'html/cmp/modal/settings-modal.html' }
    ]

    const results = await Promise.all(
      components.map(comp => this.loadComponent(comp.id, comp.path))
    )

    return results.every(result => result)
  }
}
```

### Updated Main UI Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title data-i18n="extensionName">Loading...</title>
  <link rel="stylesheet" href="css/theme.css">
  <link rel="stylesheet" href="css/base.css">
  <link rel="stylesheet" href="css/layout.css">
  <link rel="stylesheet" href="css/cmp/_cards.css">
  <link rel="stylesheet" href="css/cmp/_tabs.css">
  <link rel="stylesheet" href="css/cmp/_buttons.css">
  <link rel="stylesheet" href="css/cmp/_forms.css">
  <link rel="stylesheet" href="css/cmp/_status.css">
  <link rel="stylesheet" href="css/cmp/_lists.css">
  <link rel="stylesheet" href="css/cmp/_modals.css">
  <link rel="stylesheet" href="css/cmp/_icons.css">
  <link rel="stylesheet" href="css/util/_misc.css">
  <link rel="stylesheet" href="css/util/_spacing.css">
</head>

<body>
  <main class="container">
    <!-- Header Component -->
    <div id="header-container"></div>

    <!-- Shared Config Component -->
    <div id="shared-config-container"></div>

    <!-- Tab Navigation Component -->
    <div id="tab-navigation-container"></div>

    <!-- Analysis Components -->
    <div id="analysis-form-container"></div>
    <div id="analysis-results-container"></div>

    <!-- Discovery Components -->
    <div id="discovery-form-container"></div>
    <div id="discovery-results-container"></div>
    <div id="rule-generation-container"></div>
  </main>

  <!-- Settings Modal Component -->
  <div id="settings-modal-container"></div>

  <script type="module" src="ui.js"></script>
</body>
</html>
```

## Implementation Roadmap

### Phase 1: Foundation Setup (Day 1)

1. **Create Component Directory Structure**
   ```bash
   mkdir -p ext/html/cmp/{shared,analysis,discovery,modal}
   ```

2. **Create Component Loader Utility**
   - Create `ext/utils/componentLoader.js`
   - Implement component loading functionality

3. **Backup Current Implementation**
   ```bash
   cp ext/ui.html ext/ui.html.backup
   cp ext/ui.js ext/ui.js.backup
   ```

### Phase 2: Component Extraction (Day 1-2)

1. **Extract Shared Components**
   - Header component
   - Shared config component
   - Tab navigation component

2. **Extract Analysis Components**
   - Analysis form component
   - Analysis results component

3. **Extract Discovery Components**
   - Discovery form component
   - Discovery results component
   - Rule generation component

4. **Extract Modal Component**
   - Settings modal component

### Phase 3: Update Main UI File (Day 2)

1. **Create New Main UI Structure**
   - Replace `ext/ui.html` with component-based structure
   - Update CSS links

2. **Update UI JavaScript**
   - Modify `ext/ui.js` to include component loading
   - Ensure all DOM references work correctly

### Phase 4: Testing and Validation (Day 2-3)

1. **Functional Testing**
   - Verify all UI components render correctly
   - Test all interactions and functionality
   - Validate CSS styling consistency

2. **Cross-Platform Testing**
   - Test on different Thunderbird versions
   - Test on different operating systems
   - Test with different themes

### Phase 5: Optimization and Cleanup (Day 3)

1. **Performance Optimization**
   - Add error handling for component loading failures
   - Implement loading indicators
   - Optimize component loading order

2. **Code Cleanup**
   - Remove unused code from original files
   - Add comments and documentation
   - Final validation

## CSS Architecture

### Current CSS Structure (Maintained)
The current CSS is well-organized and should be maintained:
- **Base styles** ([`base.css`](../../ext/css/base.css))
- **Layout components** ([`layout.css`](../../ext/css/layout.css))
- **Theme variables** ([`theme.css`](../../ext/css/theme.css))
- **Component-specific styles** in [`css/cmp/`](../../ext/css/cmp) directory
- **Utility styles** in [`css/util/`](../../ext/css/util) directory

### Component-Specific CSS (Optional)
For complex components, optional component-specific CSS files can be added:
- `html/cmp/shared/shared.css` - Shared component overrides
- `html/cmp/analysis/analysis.css` - Analysis component overrides
- `html/cmp/discovery/discovery.css` - Discovery component overrides

## Benefits of This Approach

### Immediate Benefits
- **Maintainability**: Smaller, focused files easier to edit
- **Development velocity**: Multiple developers can work on different components
- **Code organization**: Clear separation of concerns
- **Testing**: Components can be tested in isolation

### Long-term Benefits
- **Reusability**: Components can be reused in future features
- **Scalability**: Easy to add new components or modify existing ones
- **Performance**: Better caching and loading optimization
- **Developer experience**: Clearer code structure and easier onboarding

## Risk Mitigation

### Potential Issues and Solutions

1. **Component Loading Failures**
   - **Risk**: Components fail to load, breaking UI
   - **Mitigation**: Add comprehensive error handling, implement fallback mechanisms

2. **CSS Inheritance Issues**
   - **Risk**: Component styling breaks due to CSS inheritance changes
   - **Mitigation**: Test all components with existing CSS, maintain current structure

3. **JavaScript Reference Issues**
   - **Risk**: DOM element references break after component loading
   - **Mitigation**: Ensure all element IDs remain consistent, test all functionality

4. **Performance Degradation**
   - **Risk**: Multiple HTTP requests slow down loading
   - **Mitigation**: Implement component loading optimization, consider bundling

### Rollback Plan
If critical issues arise:
1. Restore backup files: `cp ext/ui.html.backup ext/ui.html`
2. Restore JavaScript backup: `cp ext/ui.js.backup ext/ui.js`
3. Remove component directory: `rm -rf ext/html/cmp/`
4. Remove component loader: `rm ext/utils/componentLoader.js`

## Success Criteria

### Functional Requirements
- [ ] All existing functionality works without regression
- [ ] UI renders correctly in all supported Thunderbird versions
- [ ] Component loading is reliable and error-free
- [ ] Performance is maintained or improved

### Technical Requirements
- [ ] Code is more maintainable and organized
- [ ] Components are logically separated
- [ ] CSS inheritance works correctly
- [ ] JavaScript integration is seamless

### Development Requirements
- [ ] Multiple developers can work on different components
- [ ] Component files are focused and single-purpose
- [ ] Documentation is clear and comprehensive
- [ ] Testing is comprehensive

## Conclusion

This separation of concerns approach provides a solid foundation for improving the maintainability and scalability of the Thunderbird extension UI. By focusing on HTML + CSS separation first, we establish a clean structure that can later support JavaScript refactoring without disrupting existing functionality.

The component-based approach balances the benefits of modularity with the practical considerations of Thunderbird extension development, avoiding the complexity of iframes where they're not needed while preserving their benefits for truly isolated functionality like the settings modal.