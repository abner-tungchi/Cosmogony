# FE-004 Phase Lane — Task Summary

Completed: 2026-03-21

## Overview

Implemented Phase Lane (階段泳道) as a visual-only background layer on the Event Storming canvas. Phase lanes are derived dynamically from the `phase` field on `StickyNote` and `Bundle` elements; no new data model changes were required.

## Files Changed

### New
- `src/components/Board/PhaseLane.tsx` — standalone component that computes phase ranges and renders lanes

### Modified
- `src/components/Board/BoardCanvas.tsx` — imports `PhaseLane` and renders it as the first child of the transform div (bottom layer)

## Implementation Details

### PhaseLane component (`PhaseLane.tsx`)

**Phase range computation** (`computePhaseRanges`):
- Iterates all `notes` and `bundles` on the active board
- Skips elements with empty or missing `phase`
- Builds a `Map<phaseName, { minX, maxX }>` — each element's right edge accounts for its width:
  - Notes: uses `note.size.width` (respects actual size field)
  - Bundles: uses `BUNDLE_EXPANDED_W = 496` or `BUNDLE_COLLAPSED_W = 200` based on `bundle.collapsed`
- Sorts resulting ranges by `minX` (left-to-right spatial order)

**Divider placement**:
- Divider X between adjacent phases = midpoint of `leftPhase.maxX` and `rightPhase.minX`
- If phases overlap or touch, divider is placed at `rightPhase.minX` (avoids rendering divider inside a card)

**Rendering** (three layers, all `pointerEvents: none`):
1. **Background stripes** — alternating `rgba(0,0,0,0.015)` / transparent columns; very subtle, won't obscure cards
2. **Vertical dashed dividers** — `1px dashed rgba(0,0,0,0.1)`, `zIndex: 0`
3. **Pill labels** — centered horizontally in each lane, `top: 16px`, semi-transparent white background, uppercase small caps, `zIndex: 1`

**No-data guard**: returns `null` immediately when `phases.length === 0`.

### Integration in BoardCanvas

`<PhaseLane>` is the first child of the 10000×10000 transform div — rendered before Bundles, Notes, and the LinkLayer. All cards continue to render above it via their own `zIndex` values; drag-and-drop freedom is completely unaffected.

## Acceptance Criteria Checklist

- [x] Reads `phase` from both `bundles` and `notes` on the active board
- [x] Collects all unique non-empty phase values
- [x] Computes X range per phase (minX ~ maxX+width)
- [x] Vertical dashed divider between adjacent phases (1px dashed, rgba(0,0,0,0.1))
- [x] Divider X = midpoint of the two adjacent phase boundaries
- [x] Phase label at top of each lane (pill style, semi-transparent background)
- [x] Rendered inside transform div as the bottommost layer (zIndex 0/1)
- [x] Returns null when no phase data present
- [x] pointerEvents: none throughout — zero impact on card drag freedom

## Notes / Known Limitations

- The outer lane boundaries (first lane left edge, last lane right edge) are padded by 80px beyond the outermost element's edge. This is an aesthetic choice that can be tuned via the `80` constant in `PhaseLane.tsx`.
- Phase names are rendered as-is (uppercased via CSS `text-transform: uppercase`). If phase names are very long, the pill label will overflow horizontally on narrow lanes — acceptable given current use cases.
- Labels use `zIndex: 1` relative to the transform div's stacking context. Bundles and Notes use their own `zIndex` (which will be higher), so labels will correctly sit behind card content.
