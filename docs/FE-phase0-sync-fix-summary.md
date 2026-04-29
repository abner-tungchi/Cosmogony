# FE Phase 0 — Sync mechanism hotfix (P0.2 + P0.3)

**Status**: ✅ Implementation complete; awaiting two-tab manual verification

**Reference**: `docs/discussions/2026-04-28-sync-mechanism-evaluation.md`

## Goal

Fix the cross-host multi-user "operations revert to initial state" echo-loop bug
in the React ↔ MCP server sync layer. This is the frontend half of Phase 0;
backend (P0.1, removing the redundant `sync_project` echo broadcast after `POST
/api/board`) is handled separately.

## Scope of this task

- **P0.2** — `isApplyingRemoteRef` guard so applying a remote SSE event does not
  re-trigger a full-project POST back to the server.
- **P0.3** — Add the 7 missing dispatch cases that the server broadcasts but the
  client previously ignored, plus delete 7 dead-code dispatch cases that the
  server never broadcasts.
- **Diagnostic** — `console.warn` for unknown action types (helps catch future
  drift between server broadcast vocabulary and client dispatch coverage).

Out of scope: any backend changes; Phase 1 versioning / per-entity `_rev`;
rewriting store actions.

## Files changed

- `src/utils/apiSync.ts` — single-file change, ~80 lines added / ~35 removed.
  - Added `isApplyingRemoteRef` and the macrotask-based reset pattern in the
    SSE `onmessage` handler.
  - Added early-return guard at the top of the `[project]` POST `useEffect`.
  - Replaced the dispatch `switch` body: added 7 cases, removed 7 dead-code
    cases, added `default: console.warn(...)`.
  - Added helper `applyBatchFieldUpdate()` for `set_event_paths` /
    `set_event_phase`, which target a mixed list of note + remodel IDs.

No type changes (`src/types/board.ts`, `src/types/elements.ts` untouched).
No store changes (`src/store/boardStore.ts` untouched).

## Dispatch coverage after this change (1:1 with server broadcasts)

Server broadcasts (18 unique action names, grep'd from `mcp-server/src/index.ts`):

```
add_board, add_flow_path, add_link, add_note, add_remodel,
clear_board, delete_board, delete_flow_path, delete_link, delete_note,
delete_remodel, rename_board, set_active_board, set_event_paths,
set_event_phase, set_project_name, update_note, update_remodel
```

Client `dispatch()` cases (18 above + `sync_project` for full-snapshot bootstrap
or relay sync). 1:1 alignment confirmed by grep.

**Removed dead-code dispatch cases** (server never broadcasts these — they were
legacy from earlier iterations):
`add_command_for_event`, `update_command_information`, `update_event_properties`,
`link_entity_to_event`, `set_board_name`, `close_board`, `open_board`.

## Spec Bundle routing

All 11 spec-bundle MCP tools (addInvariant, approveInvariant, updateDtoFields,
updateAggregateIdentity, updateStateProperties, updateRemodelBehavior, etc.)
broadcast as either `update_note` or `update_remodel` carrying the **full new
array** for the affected field, e.g.:

```js
broadcast('update_note', { id: noteId, invariants: note.invariants });
broadcast('update_remodel', { id: remodelId, parameters });
```

The store's `updateNote` / `updateRemodel` use `Object.assign(target, updates)`
which correctly replaces array fields wholesale (verified by reading
`boardStore.ts` lines 156–177 and 531–542).

**Known limitation**: applying a remote `update_note` with new invariants
bypasses helper-action side effects such as `approveInvariant`'s auto-promotion
of `provenance: "assumption"` → `"ui"`. This is **acceptable** because the
server already performs the promotion before broadcasting, so the payload
arriving at the client already has the correct provenance value. Documented
inline in the dispatch JSDoc.

## Echo-loop guard mechanism

```ts
// SSE handler
isApplyingRemoteRef.current = true;
try {
  dispatch(action, payload, store);
} finally {
  setTimeout(() => { isApplyingRemoteRef.current = false; }, 0);
}

// POST useEffect
if (isApplyingRemoteRef.current) return;
```

Why `setTimeout(0)` and not `queueMicrotask`: React commits the Zustand state
change scheduled by `dispatch()` either synchronously or via a microtask flush.
The `[project]` `useEffect` runs after that commit. A microtask reset would
clear the flag too early; a macrotask reset (`setTimeout 0`) is guaranteed to
fire after React's commit phase from this event-handler task, so the POST
useEffect still sees `true` and skips the echo. After that, the flag is cleared
in time for genuine local edits.

## Verification (automated)

- `npx tsc --noEmit` — 0 errors
- `npm run build` — succeeds, bundle 435 kB
- `npx eslint src/utils/apiSync.ts` — clean
- Vite dev server smoke test — module loads, HTTP 200 served

## Verification (manual, REQUIRED before considering ship-ready)

Open two browser tabs against a running stack (`npm run dev` for FE,
`cd mcp-server && npm run dev` for BE):

1. **Remodel sync**: Tab A creates a Remodel → Tab B sees it appear.
2. **Remodel update sync**: Tab A edits Remodel parameters → Tab B reflects the
   change.
3. **FlowPath sync**: Tab A creates a FlowPath → Tab B sees it.
4. **Spec field sync**: Tab A adds an invariant on an Aggregate note → Tab B
   shows the new invariant.
5. **Echo-loop regression**: Tab A makes any edit → Tab A should NOT see its
   own change "revert to initial state" (this is the original symptom that
   motivated Phase 0).
6. **DevTools console**: confirm no `[apiSync] Unknown broadcast action` warnings
   for normal flows. If any appear, that's a server-side broadcast that needs a
   matching dispatch case added.

## Caveats / follow-up

- **Manual two-tab test requires running stack** — couldn't be performed from
  the implementation environment. Hand off to QA / user.
- **Phase 1 (versioning / `_rev`)** — separate task, not blocked by this one.
  Phase 0's guard handles the echo loop but does not handle concurrent edits to
  the same field; per-entity optimistic locking will address that.

## Update 2026-04-29 — P0.1 reversed

The original Phase 0 design proposed three pieces: P0.1 (BE removes the
`broadcastExcept('sync_project', ...)` after `POST /api/board`), P0.2 (FE
guard), P0.3 (FE dispatch coverage).

During verification we discovered that **P0.1 broke cross-tab sync for React
UI edits**. The `sync_project` broadcast was the *only* mechanism propagating
React UI mutations to other tabs (React UI talks to the BE only via full-
project `POST /api/board`; it does not call per-action endpoints). Removing it
left other tabs with no way to learn about UI-driven edits.

**Corrected Phase 0 design:**

- **BE keeps** the `broadcastExcept('sync_project', state, senderClientId)`
  call after `POST /api/board`. This is cross-tab sync's only channel for
  React UI edits.
- **P0.2 alone** is sufficient to break the echo loop: when a tab applies a
  remote `sync_project`, the `isApplyingRemoteRef` guard prevents the
  resulting `[project]` state change from triggering its own `POST /api/board`
  back to the server. No POST → no broadcast back → no ping-pong.
- **P0.3 unchanged** — dispatch coverage and dead-code cleanup stand as
  originally designed.

The `excludeClientId` arg already prevented the sender from receiving its
own broadcast; the residual echo loop the discussion identified was the
B-applies → B-posts-back → A-receives-stale path, which P0.2 now closes from
the FE side.

Verified end-to-end (curl + browser):
- Cross-client `POST /api/board` → other client receives `sync_project` ✅
- Same-client `POST /api/board` → sender excluded from broadcast ✅
- Tab A creates note in UI → Tab B sees it without refresh ✅
- Tab A's own edit does not "revert to initial state" ✅

[READY TO COMMIT]
