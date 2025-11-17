Got it - you want to turn the current "Visual Upline Hierarchy" view into a vertical mind-map / org-chart hybrid that behaves like Google NotebookLM and the org chart examples you shared. Below is a copy-paste super-prompt (plus a few variants) you can hand to your coding agent so they build the design you have in mind without guesswork.

---

## 1) One-shot "super-prompt" (drop in as a single task)

> **Goal**
> Rebuild the Visual Upline Hierarchy into a vertical, interactive mind-map / org-chart hybrid of contact cards that feels like Google NotebookLM while preserving the rigor of a traditional hierarchy view.
>
> **Tech**
>
> - Frontend: React + TypeScript.
> - Diagram: React Flow (preferred) with ELK.js (vertical layering) or Dagre if ELK is heavy.
> - Styling: CSS variables (design tokens) + CSS Modules (or Tailwind if the repo already uses it).
> - Accessibility: keyboard navigation, focus rings, ARIA roles.
>
> **Data model**
>
> ```ts
> type Status = 'active' | 'inactive' | 'pending';
> interface PersonNode {
>   id: string;
>   name: string;
>   npn: string;
>   avatarUrl?: string;
>   title?: string;
>   downlineCount?: number;
>   status: Status;
>   metrics?: { volume?: number; lastSeen?: string };
>   parentId?: string | null;
>   branchSummary?: {
>     active: number;
>     inactive: number;
>     pending: number;
>   };
> }
> ```
>
> **Layout and behavior (NotebookLM-inspired vertical mind map)**
>
> - Canvas orientation: top-to-bottom with a central spine column. Root node is centered and anchored; branches spill left and right but stay inside their generation lane.
> - Generational lanes: snap each depth level to evenly spaced horizontal lanes. Lanes have subtle guide lines that appear on hover, focus, or while dragging.
> - Node cards:
>   - 320-360px wide, minimum height 76px, with an 8px leading accent bar that reflects branch health via gradient.
>   - Left cluster: avatar or initials (40px) and expansion chevron.
>   - Right cluster: bold name line, secondary line with NPN and optional title, tertiary metadata such as "126 downline" or "Last seen 4h ago".
>   - Badges: status chip and branch summary pill (for example "8 active / 2 pending").
> - Spine navigation: when a node is selected, keep its ancestors aligned on the vertical spine and fan out siblings with staggered offsets, matching the NotebookLM rhythm.
> - Connectors: smooth bezier edges with soft glow, attaching at the accent bar. Draw branch rails behind nodes to guide the eye from parent to child clusters.
> - Expand and collapse: chevron toggle on every node with 180 ms ease-out animation. Collapsed branches show a pill with hidden descendant count and quick actions to expand.
> - Density control: Comfortable, Cozy, and Compact options adjust lane spacing, node padding, and text size via CSS classes and trigger layout recomputation.
> - Focus mode: Space bar or search entry toggles a focus lens that dims unrelated nodes, highlights the active path, and surfaces breadcrumbs in a floating header.
> - Inspector panel: selecting a node opens a right sidebar with profile summary, quick actions, and branch health breakdown.
> - Pan and zoom: trackpad and mouse wheel support plus toolbar buttons for zoom in, zoom out, reset, and jump to root.
> - Search: typeahead by name or NPN. Pressing Enter centers the node, expands ancestors, pulses connectors, and scrolls the inspector to the summary tab.
> - Export: current viewport to PNG or SVG, plus full-tree SVG export that respects density and theme. Include timestamp, density, and root node in file naming.
> - Theme: dark default with token-ready light theme. Background uses a subtle dotted grid reminiscent of NotebookLM.
> - Branch reordering: allow Ctrl+drag on collapsed branch pills to reorder siblings; show drop indicators and snap back animation.
> - Mini-map: optional inset mini-map in the lower-right that shows the entire tree and current viewport frame.
>
> **Design tokens**
>
> ```css
> :root {
>   --bg-canvas: #0e1117;
>   --bg-card: #151a1f;
>   --bg-card-hover: #1b212d;
>   --bg-card-focus: #1f2937;
>   --text-primary: #edf2ff;
>   --text-secondary: #9ba6bf;
>   --text-tertiary: #73829e;
>   --accent: #60f5a1;
>   --accent-soft: #26463b;
>   --spine: #2b3445;
>   --lane-guide: rgba(107, 114, 128, 0.2);
>   --edge: #32394a;
>   --edge-highlight: #7cf6c4;
>   --chip-active-bg: #064e3b;
>   --chip-active-text: #a7f3d0;
>   --chip-inactive-bg: #2d3341;
>   --chip-inactive-text: #cbd5f5;
>   --chip-pending-bg: #3f2f12;
>   --chip-pending-text: #fcd34d;
>   --ring: #7dd3fc;
>   --shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
>   --radius-lg: 18px;
>   --radius-sm: 10px;
>   --lane-gap-comfortable: 60px;
>   --lane-gap-cozy: 44px;
>   --lane-gap-compact: 32px;
>   --card-padding-comfortable: 16px 18px;
>   --card-padding-cozy: 14px 16px;
>   --card-padding-compact: 10px 14px;
> }
> ```
>
> **Node card structure**
>
> ```html
> <article class="node" role="treeitem" aria-expanded="true">
>   <button class="node-toggle" aria-label="Collapse branch"></button>
>   <div class="node-accent"></div>
>   <img class="node-avatar" alt="" />
>   <div class="node-body">
>     <header class="node-title-row">
>       <span class="node-name">Bianca Irwin</span>
>       <span class="node-chip node-chip--status node-chip--inactive">INACTIVE</span>
>       <span class="node-chip node-chip--summary">8 active / 2 pending</span>
>     </header>
>     <div class="node-meta">NPN 20599322 | Last seen 4h ago</div>
>   </div>
>   <button class="node-actions" aria-label="Open actions menu"></button>
> </article>
> ```
>
> ```css
> .node {
>   display: grid;
>   grid-template-columns: auto 6px auto 1fr auto;
>   align-items: center;
>   gap: 12px;
>   padding: var(--card-padding-cozy);
>   width: 340px;
>   background: var(--bg-card);
>   border-radius: var(--radius-lg);
>   box-shadow: var(--shadow);
>   color: var(--text-primary);
>   transition: background 140ms ease, transform 140ms ease, box-shadow 140ms ease;
> }
> .node[data-density="compact"] { padding: var(--card-padding-compact); width: 320px; }
> .node[data-density="comfortable"] { padding: var(--card-padding-comfortable); width: 360px; }
> .node:hover { background: var(--bg-card-hover); transform: translateY(-2px); }
> .node:focus-visible { outline: 2px solid var(--ring); outline-offset: 4px; background: var(--bg-card-focus); }
> .node-accent {
>   width: 6px;
>   height: 100%;
>   border-radius: 999px;
>   background: linear-gradient(180deg, var(--accent) 0%, rgba(96, 245, 161, 0.25) 100%);
> }
> .node-avatar {
>   width: 42px;
>   height: 42px;
>   border-radius: 50%;
>   background: #232a36;
> }
> .node-title-row {
>   display: flex;
>   align-items: center;
>   gap: 8px;
>   font-weight: 600;
> }
> .node-meta {
>   margin-top: 6px;
>   font-size: 12px;
>   color: var(--text-secondary);
> }
> .node-chip {
>   font-size: 11px;
>   padding: 2px 8px;
>   border-radius: 999px;
>   background: var(--chip-inactive-bg);
>   color: var(--chip-inactive-text);
> }
> .node-chip--status.node-chip--active {
>   background: var(--chip-active-bg);
>   color: var(--chip-active-text);
> }
> .node-chip--status.node-chip--pending {
>   background: var(--chip-pending-bg);
>   color: var(--chip-pending-text);
> }
> .node-actions {
>   width: 28px;
>   height: 28px;
>   border-radius: 50%;
>   border: 1px solid rgba(255, 255, 255, 0.12);
>   background: rgba(20, 24, 32, 0.8);
> }
> ```
>
> **Edges and rails**
>
> - Default stroke: var(--edge) at 1.6px with `vector-effect: non-scaling-stroke`.
> - On hover or selection pulse: 2.6px stroke, var(--edge-highlight), outer glow via SVG drop-shadow filter.
> - Branch rails: faint hairlines rendered behind edges to group siblings and mirror the NotebookLM scaffold.
> - Arrowheads: show only when zoom >= 0.7, hide at lower zoom for readability.
>
> **Canvas interactions and state**
>
> - Nodes are locked by default. Holding Ctrl (Cmd on macOS) + drag temporarily undocks a sub-branch for inspection, then snaps it back.
> - Selection highlights the spine path, updates the inspector, and keeps keyboard focus within the branch.
> - Keyboard: ArrowLeft/ArrowRight move across siblings, ArrowUp/ArrowDown climb hierarchy, Enter opens inspector, Space toggles focus lens, Cmd/Ctrl + Plus/Minus control zoom, Shift + E exports the current view.
> - Persist expand/collapse state per node in local storage so returning users keep their preferred open branches.
> - Provide a minimap toggle button and Shift + F to fit to the selected node.
>
> **Acceptance checks**
>
> 1. Selecting any node recenters it, highlights ancestors and descendants, and populates the inspector.
> 2. Density toggle changes card padding, typography, and lane spacing without breaking alignment.
> 3. Search finds partial matches, expands hidden branches, and keeps the focus ring visible on the target card.
> 4. Exported SVG and PNG keep the spine, accent bar, and glow treatments intact.
> 5. Keyboard traversal reaches every visible node and Escape clears selection without trapping focus.
>
> **Deliverables**
>
> - `HierarchyCanvas.tsx` (React Flow host), `useElkLayout.ts`, `NodeCard.tsx`, `nodeCard.css`, `tokens.css`.
> - `useHierarchyStore.ts` (Zustand or React Context) for selection, density, expand state, and inspector data.
> - Storybook stories for each density and theme, plus a scenario with 500 nodes for performance validation.
> - Visual regression baseline (Chromatic or Playwright screenshot test) covering default, focus, and export states.
>
> **Out of scope**
>
> - Backend contract changes. Consume the existing NPN/upline API and map to `PersonNode`.
> - Building full downstream profile pages; the inspector can link to existing routes or emit callbacks.

---

## 2) "Retool my existing view" prompt (when you already have components)

> **Refactor the current Visual Upline Hierarchy page to:**
>
> 1. Convert the layout to a vertical canvas with a central spine; keep the root and selected ancestors centered while children fan left and right.
> 2. Wrap each person row in the new NodeCard component (accent bar, avatar/initials, name, NPN, metadata, status chip, branch summary).
> 3. Replace straight connectors with curved bezier edges plus branch rails that visually group sibling clusters.
> 4. Add expand/collapse chevrons, hidden descendant counters, and smooth 180 ms transitions per branch.
> 5. Introduce Comfortable/Cozy/Compact density controls that update spacing tokens, card padding, and typography, then recompute layout.
> 6. Implement the focus lens: Space bar or search selection dims unrelated nodes and highlights the active path.
> 7. Add the right-side inspector panel that shows profile summary, actions, and branch health for the selected node.
> 8. Upgrade search to typeahead that recenters nodes, expands ancestors, and pulses connectors on selection.
> 9. Keep the toolbar actions (Expand All, Collapse All, Refresh, Export) and add zoom controls, fit-to-root, and minimap toggle.
> 10. Ship Storybook stories that capture density states, light/dark themes, and a large dataset smoke test.

---

## 3) Micro-prompts for iterative work

* **Spine alignment**
  "Anchor the root and selected ancestor nodes to the vertical spine while siblings stagger left/right within their lane. Maintain even offsets and smooth reposition animations when selection changes."

* **Branch rails**
  "Render faint branch rails behind nodes to group siblings. Each rail should align with the accent bar of its parent and inherit the branch summary gradient."

* **Focus lens**
  "Implement a focus lens that dims non-related nodes to 35% opacity, keeps spine nodes at full opacity, and adds a 2px glow to the active path. Toggle via Space bar or when search selects a node."

* **Inspector panel**
  "Build the right-hand inspector that slides in on selection, shows profile data, branch summary chips, and exposes action buttons (View profile, Copy NPN, Expand branch)."

* **Export polish**
  "Ensure SVG and PNG exports include the dotted background, spine, glow effects, and current density settings. Append timestamp and root node name to the file name."

---

## 4) Visual mapping from your screenshots to the new spec

- Current view (horizontal stacks) -> Target: vertical spine with staggered branches, curved connectors, and dark canvas.
- NotebookLM reference -> Borrow the dark canvas, floating cards with glow, spine-based navigation, and focus lens.
- Org chart references -> Use clear hierarchy lanes, avatar-forward cards, and branch summary chips similar to polished org charts.
- Example mind maps -> Adopt the soft bezier connectors, branch rails, and hover halos that gently guide the eye.

---

## 5) Library choices and why (include this rationale if your agent chooses tools)

- React Flow: battle-tested node/edge canvas with custom node renderers, pan/zoom, export hooks, and minimap support.
- ELK.js (elkjs): robust layered layout engine that honors lane spacing, reduces edge crossings, and supports mind-map offsets.
- Dagre: acceptable fallback for simpler layouts when ELK bundle size is a concern.
- Zustand (or Redux): lightweight global state for selection, density, and expand state without prop drilling.
- Headless UI or Radix: accessible primitives for the inspector panel, popovers, and menus.

---

## 6) Common pitfalls to avoid

- Re-rendering the entire graph on hover; memoize node renderers and lift selection state into a store.
- Forgetting `vector-effect: non-scaling-stroke`, which causes edges to get too thick while zooming.
- Letting lane spacing collapse at large depths; recompute ELK layout after density changes and enforce minimum gaps.
- Keyboard traps inside node actions menus; ensure focus returns to the node and Escape clears overlays.
- Exporting without inlining gradients or filters; use `inlineStyles: true` when serializing SVG to keep glow and accent bars.

---

## 7) Optional snippet (to anchor the look)

> Use only if helpful; your agent can expand the scaffolding.

```tsx
// HierarchyCanvas.tsx (sketch)
import React from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  applyEdgeChanges,
  applyNodeChanges,
  useReactFlow,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { useElkLayout } from './useElkLayout';
import { NodeCard } from './NodeCard';
import { useHierarchyStore } from './useHierarchyStore';

const nodeTypes = { person: NodeCard };

export function HierarchyCanvas({ people }: { people: PersonNode[] }) {
  const { density, setSelection } = useHierarchyStore();
  const { layout, onResize } = useElkLayout(people, { direction: 'TB', spine: true });
  const [nodes, setNodes] = React.useState(layout.nodes);
  const [edges, setEdges] = React.useState(layout.edges);
  const reactFlow = useReactFlow();

  React.useEffect(() => {
    layout.run().then((next) => {
      setNodes(next.nodes);
      setEdges(next.edges);
      requestAnimationFrame(() => reactFlow.fitView());
    });
  }, [people, density, layout, reactFlow]);

  return (
    <div className={`hierarchy-canvas density-${density}`}>
      <Toolbar />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        panOnScroll
        nodesDraggable={false}
        elementsSelectable
        onNodesChange={(changes) => setNodes((n) => applyNodeChanges(changes, n))}
        onEdgesChange={(changes) => setEdges((e) => applyEdgeChanges(changes, e))}
        onNodeClick={(_, node) => setSelection(node.id)}
        onResize={onResize}
      >
        <Background gap={24} color="#1f2532" />
        <Controls showInteractive={false} />
        <MiniMap pannable zoomable />
      </ReactFlow>
      <InspectorPanel />
    </div>
  );
}
```

---

### How to use this answer

1. Copy Section 1 into a single task when you want the full redesign in one go.
2. Use Section 2 when iterating on an existing branch and you want the agent to retrofit the new layout.
3. Drop the micro-prompts from Section 3 into follow-up tasks when you need to tweak specific elements.
4. Hand the snippet in Section 7 to jump-start implementation or to sanity check component boundaries.
