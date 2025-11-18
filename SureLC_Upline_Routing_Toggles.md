# SureLC Demo & Upline Pages – Enable/Disable Guide

This project currently hides the legacy **SureLC Demo** and **Upline Explorer** pages without deleting any of their code. This doc explains where the switches are and how to turn those pages back on.

---

## 1. Root Routing (what renders for each URL)

File: `src/main.tsx:1`

```ts
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import UplineHierarchyPage from './pages/UplineHierarchyPage'
import VisualHierarchyPage from './pages/VisualHierarchyPage'
import './index.css'

const pathname = window.location.pathname.toLowerCase()

const SHOW_UPLINE_PAGE = false
const SHOW_SURELC_DEMO_PAGE = false

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {SHOW_UPLINE_PAGE && pathname.includes('upline') ? (
      <UplineHierarchyPage />
    ) : SHOW_SURELC_DEMO_PAGE && pathname.includes('surelc-demo') ? (
      <App />
    ) : (
      <VisualHierarchyPage />
    )}
  </React.StrictMode>,
)
```

### Current behavior (as of this change)

- `SHOW_UPLINE_PAGE = false`
- `SHOW_SURELC_DEMO_PAGE = false`
- All routes (including `/`, `/visual-hierarchy`, `/upline`, `/surelc-demo`) render `VisualHierarchyPage`.

### How to re‑enable the pages

- To bring back the **Upline Explorer** at `/upline`:
  - Set `SHOW_UPLINE_PAGE = true` in `src/main.tsx`.
- To bring back the **SureLC Demo** at `/surelc-demo`:
  - Set `SHOW_SURELC_DEMO_PAGE = true` in `src/main.tsx`.

With those flags set to `true`, routing behaves as:

- `/upline` → `UplineHierarchyPage`
- `/surelc-demo` → `App` (SureLC org chart demo)
- Any other path (including `/` and `/visual-hierarchy`) → `VisualHierarchyPage`.

---

## 2. Visual Hierarchy header button → SureLC Demo

File: `src/pages/VisualHierarchyPage.tsx`

At the top of the file (near other constants):

```ts
const SURELC_DEMO_LINK_ENABLED = false;
```

In the header JSX:

```tsx
<header className="visual-hierarchy-header">
  <div className="visual-hierarchy-header__content">
    {SURELC_DEMO_LINK_ENABLED && (
      <button
        type="button"
        className="visual-hierarchy-back"
        aria-label="Open SureLC Demo"
        onClick={() => window.location.assign('/surelc-demo')}
      >
        <ArrowLeft size={16} />
        SureLC Demo
      </button>
    )}
    <h1>Visual Upline Hierarchy</h1>
    ...
```

### Current behavior

- `SURELC_DEMO_LINK_ENABLED = false` → the **SureLC Demo** button is **hidden** in the Visual Hierarchy header.

### How to show the button again

- Set `SURELC_DEMO_LINK_ENABLED = true` in `src/pages/VisualHierarchyPage.tsx`.
- Make sure `SHOW_SURELC_DEMO_PAGE = true` in `src/main.tsx` so `/surelc-demo` actually renders the page.

---

## 3. SureLC Demo label in the classic header (optional)

File: `src/App.tsx`

The classic hierarchy page header includes a label for the demo:

```tsx
<div className="header-left">
  <h1>Hierarchy Management System</h1>
  <span className="firm-name">Major Revolution Financial Group</span>
  <span className="firm-name">SureLC Demo</span>
</div>
```

If you ever want to visually de‑emphasize or hide the “SureLC Demo” label while keeping the component logic intact, you can:

- Comment out that line, or
- Wrap it in a simple flag, similar to the patterns above.

No business logic depends on this label; it’s just UI text.

---

## 4. Summary

- **Nothing has been deleted.** Only the routing and the Visual Hierarchy header button have been gated behind flags.
- To restore the old pages:
  - Turn on `SHOW_UPLINE_PAGE` and/or `SHOW_SURELC_DEMO_PAGE` in `src/main.tsx`.
  - Optionally re‑enable the Visual Hierarchy → SureLC Demo button via `SURELC_DEMO_LINK_ENABLED` in `src/pages/VisualHierarchyPage.tsx`.

This file is your quick reference so you can safely toggle the demo and upline experiences on or off without re‑digging through the code.

