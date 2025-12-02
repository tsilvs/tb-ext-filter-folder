# CSS Architecture Documentation

## Overview
This directory contains the refactored CSS architecture for the Thunderbird Filter Folder Maker extension. The styles have been split from a single 621-line file into multiple focused files for better maintainability and separation of concerns.

## File Structure

```
ext/css/
├── cmp/            # Self-contained UI components
│   ├── _cards.css         # Card containers and shared config
│   ├── _tabs.css          # CSS-only tabs implementation
│   ├── _buttons.css       # All button variants and states
│   ├── _forms.css         # Input fields, labels, form groups
│   ├── _modals.css        # Modal overlay and content
│   ├── _lists.css         # Discovery lists, folder lists
│   └── _status.css        # Status messages and notifications
├── util/             # Utility classes
│   ├── _spacing.css       # Margin and padding utilities
│   └── _misc.css          # Stats, meta-info, other utilities
├── theme.css              # Design tokens and CSS variables
├── base.css               # Base styles, resets, typography
└── layout.css             # Layout components and grid structure
```

## Loading Order

The CSS files should be loaded in this specific order to ensure proper cascade and inheritance:

1. `theme.css` - Variables and design tokens (must be first)
2. `base.css` - Base styles and resets
3. `layout.css` - Layout structure
4. Component files (any order, but recommended as listed)
5. Utility files (last for overrides)

## Naming Conventions

### Files
- Use lowercase with hyphens for multi-word names
- Component files prefixed with underscore (`_`) to indicate partials
- Utility files prefixed with underscore (`_`) to indicate partials
- Base/layout files in root directory without prefix

### CSS Classes
- Follow BEM-like methodology where appropriate
- Use semantic names that describe purpose, not appearance
- Maintain backward compatibility with existing class names

## Design System

### Theme Variables
All design tokens are centralized in [`theme.css`](../../../ext/css/theme.css):
- Colors (primary, neutral, semantic)
- Spacing (8px base system)
- Typography (fonts, sizes, weights)
- Border radius
- Shadows
- Z-index layers
- Transitions
- Component-specific dimensions

### Component Guidelines
- Components should be self-contained
- Use theme variables instead of hard-coded values
- Include component-specific states (hover, focus, disabled)
- Add comments for complex or non-obvious styles

## Benefits of This Architecture

1. **Separation of Concerns**: Each file has a single, clear responsibility
2. **Maintainability**: Easier to locate and modify specific styles
3. **Reusability**: Component styles can be reused across pages
4. **Performance**: Better caching with smaller, focused files
5. **Scalability**: Easy to add new components as separate files
6. **Consistency**: All hard-coded values replaced with theme variables
7. **Developer Experience**: Clear file organization makes navigation easier

## Usage in HTML

### Standard Loading
```html
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
<link rel="stylesheet" href="css/util/_misc.css">
```

### Alternative: Single Entry Point
You could also create a `main.css` file that imports all others:
```css
/* css/main.css */
@import 'theme.css';
@import 'base.css';
@import 'layout.css';
@import 'cmp/_cards.css';
/* ... etc */
```

Then just link to `main.css` in HTML.

## Maintenance Guidelines

### Adding New Components
1. Create a new file in `cmp/` with underscore prefix
2. Follow the existing naming convention
3. Use theme variables for all values
4. Add the new link to HTML files
5. Update this documentation

### Modifying Existing Styles
1. Locate the appropriate component file
2. Check if the style uses theme variables
3. Update the theme variable if changing a design token
4. Test changes across all pages

### Adding New Utilities
1. Determine if it's a spacing utility or miscellaneous
2. Add to the appropriate utility file
3. Follow existing patterns for class naming

## Migration Notes

- The original `style.css` file can be deprecated after migration
- All hard-coded values have been replaced with theme variables
- Component boundaries are clearly defined
- The architecture supports future enhancements like dark mode

## Future Enhancements

This architecture enables easy implementation of:
- Dark mode support (via theme variable overrides)
- Component variants
- Responsive design patterns
- CSS-in-JS integration if needed
- CSS modules for better encapsulation