Visual Hierarchy Page Redesign: NotebookLM-Style Interface
Overview
Transform the current SVG-based zoom/pan hierarchy into a clean, NotebookLM-inspired collapsible tree interface that fits the entire structure on one page while maintaining readability and interactivity.

Key Design Changes
1. Layout Architecture
Replace the current SVG node positioning with a vertical tree layout:

Root level (Level 0): Firm/Agency - always visible at top
Level 1: Branches - show 2-3 initially, rest collapsed
Level 2+: Producers - collapse by default, expand on demand
Use CSS flexbox/grid instead of SVG coordinates for better responsiveness
Implement smooth CSS transitions for expand/collapse animations
2. Contact Card Component
Create a new compact card component (similar to NotebookLM's outline items):

Card structure: 
Left: Expand/collapse chevron (if has children)
Center: Name, NPN, Status badge
Right: Vendor badges (Equita/Quility colored dots or small pills)
Visual hierarchy: 
Use indentation (20-30px per level) to show depth
Connecting lines (subtle vertical lines on left) to show parent-child relationships
Different background colors/borders per level for quick scanning
Dimensions: ~60-80px height, full width minus indentation
Hover state: Subtle elevation/shadow, cursor pointer
3. Interactive Behavior
Expand/Collapse (Downline)
Click chevron icon to toggle children visibility
Animated height transition (300ms ease)
Rotate chevron icon 90° when expanded
Store expanded state in component state (Set of node IDs)
Lazy load children data if needed for performance
Detail Popup (Contact Information)
Click card body (not chevron) to open modal
Modal displays:
Header: Contact name, NPN, status
Sections: Group GHL fields by category (Onboarding, Upline, XCEL, etc.)
Display all fields from GHL_Custom_Fields_nEEiHT9n7OPxFnBZIycg.json
Show upline breadcrumb trail (e.g., "Root > Branch > Parent > This Contact")
Close button (X) and backdrop click to dismiss
Use existing GHLHierarchyNode data structure and raw field values
4. Fitting on One Page Strategy
Smart Collapsing
Default state: Show root + all branches collapsed
Auto-expand only the first 2-3 branches OR branches with most producers
Provide "Expand All" / "Collapse All" buttons in header
Remember expansion state during session
Compact Design
Remove the large analysis panel (move to separate tab/modal if needed)
Reduce header padding and stat card sizes
Use fixed header with sticky positioning
Make main content area scrollable with virtual scrolling for 100+ nodes
Visual Density Controls
Add density toggle: "Comfortable" (80px cards) vs "Compact" (60px cards)
Adjust font sizes and spacing based on density setting
5. Connection Lines
Implement subtle visual connection lines (like NotebookLM):

Vertical line down left side of each collapsed/expanded section
Small horizontal line connecting parent to child
Use CSS borders or pseudo-elements (:before, :after)
Color: light gray (#e0e0e0) for hierarchy lines, blue (#3b82f6) for selected path
File Changes Required
Components to Modify
src/pages/VisualHierarchyPage.tsx
Remove SVG rendering logic (layoutNodes, connections, zoom/pan handlers)
Replace with recursive tree rendering function
Add modal state management for detail popup
Implement expand/collapse state (Set<string>)
Add keyboard navigation (arrow keys, space to expand)
src/pages/VisualHierarchyPage.css
Remove SVG-specific styles
Add tree layout styles with indentation
Add card component styles
Add modal/popup styles
Add connection line styles using CSS borders
Add smooth animations for expand/collapse
New Components to Create
src/components/HierarchyCard.tsx
Reusable card component for each node
Props: node data, level, isExpanded, onToggle, onClick
Render: chevron, name, NPN, badges
Handle hover states and animations
src/components/ContactDetailModal.tsx
Modal overlay with backdrop
Display all GHL custom fields organized by category
Show upline breadcrumb
Responsive design for mobile
Close on backdrop click or Escape key
src/components/HierarchyTree.tsx (optional)
Separate recursive tree rendering logic
Handle virtual scrolling if needed for performance
Props: root node, expandedIds, onExpand, onCardClick
Implementation Steps
Phase 1: Structure & Layout
Create HierarchyCard component with basic structure
Implement recursive tree rendering in VisualHierarchyPage
Add indentation and connection line styles
Test with existing mock data
Phase 2: Interactions
Implement expand/collapse functionality
Add smooth animations
Persist expanded state during session
Add "Expand All" / "Collapse All" controls
Phase 3: Detail Modal
Create ContactDetailModal component
Parse and display all GHL custom fields from JSON
Implement upline breadcrumb trail
Add modal open/close animations
Phase 4: Optimization & Polish
Optimize for 100+ nodes (consider virtual scrolling)
Add density control toggle
Improve mobile responsiveness
Add keyboard navigation
Test with large datasets
Data Integration
GHL Custom Fields Display
Use the GHL_Custom_Fields_nEEiHT9n7OPxFnBZIycg.json file to:

Map field keys to display names
Group fields by parentId for organized sections
Handle different data types (TEXT, CHECKBOX, DATE, LARGE_TEXT)
Format values appropriately (dates, checkboxes as Yes/No)
Field Categories from JSON
Based on the custom fields, organize into sections:

Onboarding: Licensed, XCEL Account, Comp Level, etc.
Upline Information: Upline Email, Producer ID, Name, Stage
XCEL Training: Due Date, Enrollment, Status, Password
Vendor Configuration: Upline Code Equita/Quility
Custom Notes: Comp Level Notes
Success Criteria
✅ Entire hierarchy visible on one page (with reasonable dataset)
✅ Smooth expand/collapse interactions
✅ Quick access to contact details via modal
✅ Clean, NotebookLM-inspired visual design
✅ Responsive and performant with 100+ contacts
✅ All GHL custom fields displayed in detail modal

To-Dos
- Create HierarchyCard component with name, NPN, status, venfor badges, and expand chevron
- Create ContactDEtailModal component to display all GHL custom fields with organized sections
- replace SVG rendering with recursive tree rendering using HierarchyCard components
- Add CSS styles for tree layout, indentation, connection lines, and animations
- Add expand/collapse state management and interaction handlers
- Intergrate ContactDetailModal with card click handler and field data mapping
- Optimize for large datasets with virtual scrolling or pagination if needed
- Add expand All/Collapse All buttons and density toggle controls