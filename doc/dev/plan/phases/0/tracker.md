# Phase 0: Architectural Foundation (Compressed)

## Completed (links + intent)

- Constants module — [`ext/config/constants.js`](../../../../../ext/config/constants.js): centralized constants/regex/messages.
- DOM utilities — [`ext/utils/dom.js`](../../../../../ext/utils/dom.js): reusable DOM helpers.
- Functional utilities — [`ext/utils/functional.js`](../../../../../ext/utils/functional.js): composition/HOFs/error handling.
- Data utilities — [`ext/utils/data.js`](../../../../../ext/utils/data.js): data transforms + deep utils.
- Theme extraction — [`ext/css/theme.css`](../../../../../ext/css/theme.css): CSS variables + a11y support.
- Rule engine refactor — [`ext/modules/RuleEngine.js`](../../../../../ext/modules/RuleEngine.js): pure functions + DI + legacy namespace.
- Mail client refactor — [`ext/modules/MailClient.js`](../../../../../ext/modules/MailClient.js): pure functions + DI + legacy namespace.
- Background refactor — [`ext/background.js`](../../../../../ext/background.js): helpers + routing + composition.
- Options refactor — [`ext/options.js`](../../../../../ext/options.js), [`ext/options.html`](../../../../../ext/options.html): module setup + apply/collect helpers.

## Remaining (core refactor suggestion)

- UI.js refactor — [`ext/ui.js`](../../../../../ext/ui.js)
  - Import constants + utilities.
  - Extract state management to a module.
  - Create pure functions for config, accounts, stats, discovery, validation.
  - Separate event handlers.
  - Use DOM utilities throughout.

## Files Created

- [`ext/config/constants.js`](../../../../../ext/config/constants.js)
- [`ext/utils/dom.js`](../../../../../ext/utils/dom.js)
- [`ext/utils/functional.js`](../../../../../ext/utils/functional.js)
- [`ext/utils/data.js`](../../../../../ext/utils/data.js)
- [`ext/css/theme.css`](../../../../../ext/css/theme.css)

## Files Modified

- [`ext/modules/RuleEngine.js`](../../../../../ext/modules/RuleEngine.js)
- [`ext/modules/MailClient.js`](../../../../../ext/modules/MailClient.js)
- [`ext/background.js`](../../../../../ext/background.js)
- [`ext/options.js`](../../../../../ext/options.js)
- [`ext/options.html`](../../../../../ext/options.html)

## Breaking Changes

- None (legacy namespaces retained).
<!--  -->