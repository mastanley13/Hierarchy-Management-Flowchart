<!-- 5425a281-195c-4f54-bb83-bafa374c3e92 ed771a36-bf12-4cb4-8233-9dad7b8e3138 -->
# NotebookLM-Style Contact Card Redesign

## Overview

Transform the contact cards to match the NotebookLM-style design with profile picture avatars, role/title information, and improved visual hierarchy with color coding.

## Implementation Plan

### 1. Update HierarchyCard Component (`src/components/HierarchyCard.tsx`)

- Add avatar/initials generation function
- Extract first letters from name (handle multi-word names)
- Create circular avatar with initials and background color
- Position avatar in semi-circular cutout on left side of card
- Update card layout structure:
- Avatar on left with semi-circular cutout
- Name prominently displayed
- Role/title section showing both `compLevel` and `companyName` (if available)
- NPN and status badges on right
- Color accent bar on right side of card
- Implement color coding logic:
- Base color by hierarchy level (0, 1, 2, 3+)
- Overlay/variant by vendor status (Equita, Quility, Both, None)
- Use CSS custom properties for dynamic colors

### 2. Update HierarchyCard Styles (`src/components/HierarchyCard.css`)

- Redesign card structure:
- Remove current gradient backgrounds
- Add white/light background with border
- Implement semi-circular cutout for avatar on left
- Add color accent bar on right side (matching level + vendor)
- Improve spacing and typography
- Avatar styling:
- Circular avatar (40-48px diameter)
- Semi-circular cutout using clip-path or border-radius
- Color-coded background based on name initials
- White text for initials
- Color scheme:
- Level 0: Dark brown-grey (#8B7355 or similar)
- Level 1: Orange-red (#E97451 or similar)
- Level 2: Green (#22C55E or similar)
- Level 3+: Purple/Blue variants
- Vendor overlays: Subtle tints (Equita: blue tint, Quility: purple tint)
- Typography:
- Name: Larger, bold (14-16px)
- Role/title: Smaller, secondary color (12px)
- NPN: Small, muted (11px)

### 3. Helper Functions

- Create `getInitials(name: string): string` function
- Create `getAvatarColor(name: string): string` function (consistent color from name)
- Create `getCardAccentColor(level: number, vendorFlags: object): string` function
- Create `formatRoleTitle(compLevel: string | null, companyName: string | null): string` function

### 4. Update Tree Layout Styles (`src/pages/VisualHierarchyPage.css`)

- Adjust hierarchy tree connection lines to work with new card design
- Ensure proper spacing for avatar cutout
- Update compact mode styling to maintain proportions

### 5. Handle Edge Cases

- Missing compLevel/companyName: Show "Producer" or empty
- Long names: Truncate with ellipsis
- Missing NPN: Hide NPN display
- Avatar colors: Ensure good contrast for all name combinations

## Files to Modify

- `src/components/HierarchyCard.tsx` - Component logic and structure
- `src/components/HierarchyCard.css` - Card styling and layout
- `src/pages/VisualHierarchyPage.css` - Tree layout adjustments

## Design Specifications

- Card dimensions: Comfortable mode ~80px height, Compact mode ~60px height
- Avatar size: 40px (comfortable), 32px (compact)
- Semi-circular cutout: 50% of card height on left side
- Color accent bar: 4-6px wide on right side
- Border radius: 12px overall, semi-circle cutout on left