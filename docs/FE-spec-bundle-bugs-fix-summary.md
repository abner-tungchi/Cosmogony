# FE — Spec Bundle UI Bug Fixes

**Status**: Partially fixed (Bug 1 has a root-cause fix; Bugs 2 and 3 appear to be HMR/browser-cache staleness since the code paths are already correct)

**Related**:
- `docs/UX-004-spec-bundle-ui.md`
- `docs/FE-spec-bundle-ui-summary.md`

---

## Bug 1 — Aggregate note shows NotePanel instead of AggregatePanel

### Root cause

When `setEntityAsAggregateRoot` converts an Entity to an Aggregate, it **keeps `groupEventId` intact** so the Aggregate continues to travel/scale with its originating DomainEvent group (this is intentional — see `unsetEntityAsAggregateRoot`'s reliance on `note.groupEventId` to locate the "original group").

But `StickyNote.handleClick` treats any note with a non-null `groupEventId` as a **group satellite**:

```ts
if (isGroupSatellite && !isGroupDomainEventSelected) {
  // First click selects the DomainEvent anchor, not the note itself
  onSelect(note.groupEventId!, ...);
  onDetailClick?.(note.groupEventId!);
}
```

So the first click on an Aggregate selects the **DomainEvent**, and the DetailPanel dispatcher correctly renders the `GroupPanel` for that DomainEvent. The user sees GroupPanel fields (which include path/notes/phase-like rows) and mistakes it for a generic NotePanel because the Aggregate visually still has its gold border (that border is always-on for `type === 'Aggregate'`, independent of selection).

### Fix

`src/components/StickyNote/StickyNote.tsx`

1. **`handleClick`** — exempt Aggregate from the group-first rule. Clicking an Aggregate now always selects the Aggregate itself, so `DetailPanel` dispatches to `AggregatePanel` immediately.

2. **`handleDoubleClick`** — also exempt Aggregate from the "edit only via sidebar" rule, so the Aggregate label stays inline-editable on the canvas (matching how it behaved before AR marking).

The Aggregate's `groupEventId` stays intact, so group-drag (moving the DomainEvent moves the Aggregate with it) and `unsetEntityAsAggregateRoot` (which looks up the original group) continue to work.

### Verification

- Build Entity → Mark as AR → click Aggregate once → DetailPanel shows AggregatePanel (identity / state / invariants).
- Drag the DomainEvent → Aggregate still moves with the group.
- Unmark Aggregate Root → Aggregate converts back to Entity as before.

---

## Bug 2 — Dto note shows NotePanel instead of DtoPanel

### Diagnostic

Checked systematically:
- `SidebarPalette.handleToolClick` creates the note with `type: 'Dto'` (exactly the string the dispatcher compares against).
- `DetailPanel`'s dispatcher correctly routes `note.type === 'Dto'` to `DtoPanel`.
- `DtoPanel` renders badge + name input + description + fields editor unconditionally; no internal guards bypass content.
- `DtoPanel`, `DtoFieldsEditor`, `DtoPicker`, `panelStyles` all type-check and build cleanly.
- Dto notes don't carry `groupEventId`, so they're never treated as satellites — a click always selects the Dto note itself.

There is no code path in the current working tree that would render NotePanel for a Dto note.

### Hardening

Refactored the dispatcher in `DetailPanel.tsx` from a chain of `&&` expressions to an explicit `switch` so the routing is easier to reason about and the "fall-through to NotePanel" case is visibly the `default` branch. No behavior change.

### Recommendation to the user

Please **hard-reload the browser (⌘⇧R)** or stop+restart Vite (the dev server has been up through many refactors; stale HMR modules can drift from disk). Then:

1. Add a DTO note from the sidebar.
2. Click it to open the Detail Panel.
3. Check the Detail Panel **subtitle** (just under the title at the top): it should read `Dto · <first6chars>`. If it says `Dto · …`, DtoPanel _is_ rendering. If it says something else, report that subtitle and we can pinpoint the cause.

---

## Bug 3 — Remodel Return Type sub-note not wrapping

### Diagnostic

- `deriveReturnTypeContent` produces strings with real `\n` separators (verified by running the function directly: `"id: string\nname: string"`, length 23, contains `\n`).
- `SubNote` renders content inside a `<div>` with `whiteSpace: 'pre-wrap'`. CSS-wise, real newlines should wrap.
- `RemodelPanel` uses `ReturnTypeEditor` (structured: shape selector + per-field rows). It **does not** render a textarea for return type in the current working tree.

The user's description — "Detail Panel has a RETURN TYPE **textarea** that shows `id: string\nname: string` with correct line breaks, but the canvas sub-note shows them joined by a space" — describes behavior that is impossible with the current code:

- If `returnType.fields` is non-empty, the canvas content comes from `deriveReturnTypeContent`, which always uses `'\n'` as the separator.
- If `returnType.fields` is empty/undefined, derive returns `null`, content becomes `''`, and the sub-note shows the `"請補欄位"` placeholder — not a space-joined string.
- There is no textarea for return type in the Detail Panel — only structured input rows.

The only explanation is that the **user's browser is still running an older bundle** (old `RemodelPanel` with `EditableColorBlock` textarea, old `Remodel` sub-note that reads `returnTypeNote.content` directly).

### Recommendation to the user

Stop Vite, delete the Vite cache, hard-reload:

```bash
# Stop vite (Ctrl+C in the Vite terminal)
rm -rf node_modules/.vite
npm run dev
# Then in the browser: ⌘⇧R (hard reload)
```

After reload:
1. Open a Remodel's Detail Panel.
2. The Return Type block should show a **Shape selector + Add Field rows**, not a textarea.
3. Add two fields (e.g. `id: string`, `name: string`).
4. The canvas sub-note should show two lines.

If the Detail Panel still shows a textarea after the hard reload, that tells us `RemodelPanel` code really isn't what's being served — please capture a screenshot so we can investigate further.

---

## Files changed

- `src/components/StickyNote/StickyNote.tsx` — Aggregate exempt from group-satellite click/double-click rules.
- `src/components/DetailPanel/DetailPanel.tsx` — Refactored note-type dispatch to an explicit `switch` (no behavior change).

## Verification

- `npx tsc --noEmit` → 0 errors
- `npm run build` → succeeded (431.32 kB / 117.29 kB gzip)

## Files and artifacts preserved

No files deleted. Data model and store actions unchanged.

## Open questions for user

1. After hard-reload, does the Detail Panel for a DTO note show the green **[DTO]** badge + name input + Fields section? (If yes, Bug 2 was HMR cache.)
2. After hard-reload, does the Return Type block in the Remodel Detail Panel show a **Shape selector** and per-field rows (name/type/nullable/ref), not a textarea? (If yes, Bug 3 was HMR cache.)
3. For Bug 1: after marking an Entity as AR, a single click on the Aggregate should now open AggregatePanel. Please confirm.
