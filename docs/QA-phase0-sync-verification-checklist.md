# Phase 0 Sync Hotfix — Two-Tab Manual Verification Checklist

**Version**: Phase 0 (P0.1 + P0.2 + P0.3)
**Gate**: All items must pass before commit + Docker deployment.
**Reference**: `docs/FE-phase0-sync-fix-summary.md`, `docs/discussions/2026-04-28-sync-mechanism-evaluation.md`

---

## Section 0 — Pre-flight Environment Check

### 0.1 Stack Startup (same-host dev mode)

- [ ] Start MCP server: run `cd mcp-server && npm run dev` and confirm console output `SSE listening on :3333`
- [ ] Start frontend: run `npm run dev` (separate terminal) and confirm Vite output `Local: http://localhost:5173`
- [ ] Open **Tab A**: navigate to `http://localhost:5173`
- [ ] Open **Tab B**: navigate to `http://localhost:5173` in a **new tab** (same browser, same origin is fine; what matters is a distinct `sessionStorage` so each tab gets its own `clientId`)
  - To verify each tab has a distinct `clientId`: open DevTools console in each tab, run `sessionStorage.getItem('es-client-id')` — values must differ

### 0.2 DevTools Configuration (required for all sections)

Set up the following in **both** Tab A and Tab B before proceeding:

- [ ] **Console tab**: open and leave visible; filter nothing (all levels)
- [ ] **Network tab**: open, filter by `EventStream` or type `events` in the filter bar; confirm one persistent SSE connection appears as a request to `/api/events?clientId=...` with status `200` and type `eventsource`
- [ ] **Network tab**: also confirm that each local edit you make eventually shows a `POST /api/board` request (status `200`, response `{"ok":true}`)
- [ ] Confirm no `[apiSync] Unknown broadcast action:` warnings appear in either console at startup

### 0.3 Baseline Board State

- [ ] Confirm both tabs show the same board content (same notes, same layout)
- [ ] If the board is empty, add one DomainEvent note via Tab A and confirm Tab B shows it (this is your baseline sync sanity check before the detailed scenarios)

---

## Section 1 — Basic Sync Verification (P0.3 dispatch coverage)

These scenarios exercise all 7 previously-missing dispatch cases. Each must be triggered **from Tab A via the MCP server** (e.g. via Claude Code MCP tool) **or** via the UI if the action is available there. The goal is to confirm Tab B receives and renders the broadcast correctly.

### 1.1 add_remodel — Remodel creation sync

- [ ] In Tab A: create a new Remodel card (Sidebar palette → ReadModel / Remodel, or via MCP `es_add_remodel`)
- [ ] Observe Tab B console — no `Unknown broadcast action` warning should appear
- [ ] Observe Tab B board — the new Remodel card appears without a manual refresh

**Expected**: Tab B renders the Remodel in the same position as Tab A.
**Failure diagnosis**: If Tab B does not update → P0.3 `add_remodel` case is missing or store `addRemodel` is not called correctly.

### 1.2 update_remodel — Remodel content sync

- [ ] In Tab A: edit an existing Remodel's Query name (center cell) or Parameters
- [ ] Observe Tab B — the Remodel content updates within ~1 second of Tab A's edit

**Expected**: Tab B reflects the same text without refresh.
**Failure diagnosis**: P0.3 `update_remodel` dispatch case not wired, or `store.updateRemodel` shallow merge is not applying the field.

### 1.3 delete_remodel — Remodel deletion sync

- [ ] In Tab A: delete the Remodel created in 1.1 (right-click → delete, or Detail Panel delete button)
- [ ] Observe Tab B — the Remodel disappears from the board

**Expected**: Tab B no longer shows the deleted Remodel.
**Failure diagnosis**: P0.3 `delete_remodel` dispatch case missing.

### 1.4 add_flow_path — FlowPath creation sync

- [ ] In Tab A: create a new FlowPath (PathBar "+" button or MCP `es_add_flow_path`)
- [ ] Observe Tab B PathBar — the new FlowPath dot/chip appears

**Expected**: Tab B PathBar shows the new FlowPath with the same name and color.
**Failure diagnosis**: P0.3 `add_flow_path` dispatch case missing or `store.addFlowPath` not called.

### 1.5 delete_flow_path — FlowPath deletion sync

- [ ] In Tab A: delete the FlowPath created in 1.4
- [ ] Observe Tab B PathBar — the FlowPath disappears

**Expected**: Tab B PathBar no longer shows the deleted FlowPath.
**Failure diagnosis**: P0.3 `delete_flow_path` dispatch case missing.

### 1.6 set_event_paths — Batch path assignment sync

- [ ] Ensure at least 2 notes and 1 FlowPath exist on the board
- [ ] Via MCP tool `es_set_event_paths`: assign those notes to the FlowPath (or use Tab A UI if available)
- [ ] Observe Tab B — the targeted notes become visually associated with the FlowPath (color accent, dot indicators)

**Expected**: Tab B reflects the path assignment on all targeted notes/remodels.
**Failure diagnosis**: P0.3 `set_event_paths` dispatch case missing, or `applyBatchFieldUpdate` is not finding elements in the active board. Check whether `store.project.activeBoardId` in Tab B matches the board where the notes live.

### 1.7 set_event_phase — Batch phase assignment sync

- [ ] Ensure at least 2 notes exist on the board
- [ ] Via MCP tool `es_set_event_phase`: assign a phase label to those notes
- [ ] Observe Tab B — the notes show the phase label

**Expected**: Tab B renders the phase label on the same notes.
**Failure diagnosis**: P0.3 `set_event_phase` dispatch case missing, or `applyBatchFieldUpdate` is routing to the wrong store action.

---

## Section 2 — Echo-Loop Regression Tests (P0.2 guard)

These tests verify that the core bug is gone: a client's own edit must not cause a state revert.

> **Note on the corrected Phase 0 design (2026-04-29)**: BE retains
> `broadcastExcept('sync_project', state, senderClientId)` after `POST /api/board`
> — this is the only channel propagating React UI edits cross-tab. The original
> P0.1 plan to remove this broadcast was reverted because it broke cross-tab
> sync entirely. The echo loop is now closed by the FE `isApplyingRemoteRef`
> guard alone (P0.2): when a tab applies a received `sync_project`, the guard
> blocks its `[project]` useEffect from firing another POST.

### 2.1 Tab A self-revert regression (original symptom)

- [ ] In Tab A: create a new DomainEvent note with a distinct label (e.g. "PaymentProcessed")
- [ ] Wait 2 seconds
- [ ] Observe Tab A — the note is still present with the same label
- [ ] Observe Tab A SSE EventStream — Tab A should NOT receive its own `sync_project` (sender is excluded via `excludeClientId`); only Tab B should receive it

**Expected**: Tab A's note persists unchanged. No revert to pre-edit state.
**Failure diagnosis**:
- If Tab A receives its own `sync_project` → BE `broadcastExcept` is not honoring `excludeClientId`; check the `X-Client-Id` header is being sent and matches the SSE clientId
- If Tab A reverts only when Tab B is open → P0.2 `isApplyingRemoteRef` guard is not blocking the POST after applying Tab B's broadcast (the loop closes when B re-broadcasts a stale state back to A)

### 2.2 Tab A inflight edit not overwritten by Tab B's subsequent POST

- [ ] In Tab A: type a new label on a note but do NOT wait (act within the 500ms debounce window)
- [ ] Simultaneously in Tab B: make a different edit to a different note
- [ ] Wait 2 seconds for both debounce timers to fire
- [ ] Observe Tab A — its edit (the first label) is still present

**Expected**: Both edits survive. Neither tab's edit is rolled back by the other's POST.
**Failure diagnosis**: If Tab A's edit is lost after Tab B's POST → this is the whole-project last-write-wins limitation. **Known Phase 1 limitation** — document if seen, not a Phase 0 blocker unless both edits consistently fail together. Phase 1's per-entity `_rev` will resolve this.

### 2.3 No ping-pong POST storm after receiving a remote broadcast

- [ ] Watch Network tab in Tab B (filter `api/board`)
- [ ] In Tab A: perform one edit (e.g. move a note)
- [ ] Observe Tab B Network — Tab B should receive the `sync_project` SSE frame, apply it, but should NOT trigger its own `POST /api/board` from that application

**Expected**: Tab B receives the SSE event, dispatches `sync_project` (loadProject), but does NOT fire a `POST /api/board` back. The `isApplyingRemoteRef` guard must block it. (Tab B's screen updates to show Tab A's edit.)
**Failure diagnosis**: If Tab B shows a POST after receiving an SSE event → P0.2 guard is not being set before `dispatch()` or the `setTimeout(0)` reset is firing too early. Check `apiSync.ts` lines 107–113.

### 2.4 Guard clears correctly for next genuine local edit

- [ ] In Tab B: after step 2.3 (confirm no echo POST), immediately make a local edit in Tab B (e.g. move a note)
- [ ] Observe Tab B Network — this edit SHOULD trigger a POST /api/board

**Expected**: After the guard is cleared (setTimeout 0 fires after commit), Tab B's own local edits resume posting normally.
**Failure diagnosis**: If Tab B's local edits no longer POST → the `isApplyingRemoteRef` flag is getting stuck at `true`. Check the `finally` block in `apiSync.ts` and confirm `setTimeout(() => { isApplyingRemoteRef.current = false; }, 0)` is present and firing.

### 2.5 SSE console — confirm no Unknown broadcast action warnings in normal flow

- [ ] After performing all above steps, review both Tab A and Tab B consoles
- [ ] No `[apiSync] Unknown broadcast action:` warning should have appeared for any of the actions exercised in Sections 1–2

**Expected**: Zero unknown action warnings. Any warning here means a server broadcast action has no client handler — it must be investigated before shipping.
**Failure diagnosis**: Note the action name in the warning. Cross-check against the dispatch switch in `apiSync.ts` and the broadcast call sites in `mcp-server/src/index.ts`.

---

## Section 3 — Spec Bundle Routing Tests (P0.3 update_note / update_remodel spec paths)

All spec bundle MCP tools broadcast as `update_note` or `update_remodel`. These tests confirm Tab B correctly renders spec fields added via MCP.

### 3.1 Invariant sync via update_note (add_invariant path)

- [ ] Ensure an Aggregate note exists on the board
- [ ] Via MCP tool `es_add_invariant`: add a business invariant to the Aggregate note
- [ ] Observe Tab B — open the Aggregate note's Detail Panel

**Expected**: Tab B's Detail Panel for that note shows the new invariant (name, title, status).
**Failure diagnosis**: If missing → the `update_note` dispatch case is not applying the `invariants` array. Confirm `store.updateNote(p.id, p as Partial<StickyNote>)` uses `Object.assign` (shallow merge), which replaces the `invariants` array wholesale.

### 3.2 Invariant status change via update_note (set_invariant_status path)

- [ ] Using the invariant created in 3.1 (which should be `provenance: "assumption"`, `status: "needs_review"`)
- [ ] Via MCP tool `es_set_invariant_status` with `status: "confirmed"`: confirm the invariant
- [ ] Observe Tab B Detail Panel — the invariant status should change to `confirmed` and provenance to `ui`

**Expected**: Tab B shows `confirmed` and `ui` provenance without refresh. The server performs the provenance promotion before broadcasting; the client receives the already-promoted payload via `update_note`.
**Failure diagnosis**: If Tab B shows stale `needs_review` → `update_note` dispatch is not applying the `invariants` field. If Tab B shows `confirmed` but provenance still shows `assumption` → the server-side promotion is not happening before broadcast (this would be a server bug, not a client dispatch bug).

### 3.3 aggregateIdentity sync via update_note

- [ ] Via MCP tool `es_update_aggregate_identity` on the Aggregate note
- [ ] Observe Tab B Detail Panel for that note

**Expected**: Tab B shows the identity field name and type immediately.
**Failure diagnosis**: `update_note` dispatch case not merging `aggregateIdentity` field. This is a shallow merge issue — check that `Object.assign` in `boardStore.ts updateNote` does not deep-clone and override the whole note.

### 3.4 stateProperties sync via update_note

- [ ] Via MCP tool `es_update_state_properties` on the Aggregate note
- [ ] Observe Tab B

**Expected**: Tab B Detail Panel shows the updated state property list.
**Failure diagnosis**: Same as 3.3 — shallow merge must replace `stateProperties` array wholesale.

### 3.5 dtoFields sync via update_note (Dto note path)

- [ ] Ensure a Dto note exists (or create one: `es_add_note` with `type: "Dto"`)
- [ ] Via MCP tool `es_update_dto_fields` on the Dto note
- [ ] Observe Tab B Detail Panel for that Dto note

**Expected**: Tab B shows the new field definitions.
**Failure diagnosis**: `update_note` not applying `dtoFields` array.

### 3.6 Remodel behavior sync via update_remodel

- [ ] Via MCP tool `es_update_remodel_behavior` on an existing Remodel
- [ ] Observe Tab B — the Remodel card should reflect the updated behavior description

**Expected**: Tab B updates the Remodel's behavior text.
**Failure diagnosis**: `update_remodel` dispatch case not calling `store.updateRemodel(id, { behavior })`.

### 3.7 Remodel parameters sync via update_remodel

- [ ] Via MCP tool `es_update_remodel_parameters` on the same Remodel
- [ ] Observe Tab B — the Remodel's Parameters cell updates

**Expected**: Tab B shows the new parameter list in the Remodel card.
**Failure diagnosis**: `update_remodel` not merging `parameters` array.

### 3.8 Remodel returnType sync via update_remodel

- [ ] Via MCP tool `es_update_remodel_return_type` on the same Remodel
- [ ] Observe Tab B — the Remodel's Return Type cell updates

**Expected**: Tab B shows the new return type spec (shape + fields).
**Failure diagnosis**: `update_remodel` not merging `returnType` object.

---

## Section 4 — Cross-Host Verification (Docker Compose deployment)

This section covers the user's actual production scenario: two machines connecting through nginx to the same Docker stack.

### 4.1 Docker Stack Startup

- [ ] On Host B: run `docker compose up -d` (or the equivalent deployment command)
- [ ] Confirm containers are up: `docker compose ps` shows frontend (nginx), mcp-server both healthy
- [ ] From Host A browser: navigate to `http://<HostB-IP>/` (nginx port 80 or configured port)
- [ ] From Host B browser: navigate to `http://localhost/` (or same nginx URL)
- [ ] Confirm both browsers show the same board state

### 4.2 Confirm SSE connection through nginx

- [ ] In Host A browser Network tab: confirm SSE connection to `/api/events?clientId=...` shows status `200` and type `eventsource` with no `proxy_buffering` interruptions
- [ ] Leave both SSE connections open for at least 60 seconds; confirm heartbeat `: heartbeat` comments appear every 30s in the Network SSE stream (they won't show in the UI but are visible in DevTools → Network → EventStream tab as comment frames)

**Expected**: Persistent SSE connections with 30s heartbeats; no reconnects during idle periods.
**Failure diagnosis**: If SSE drops: check nginx `proxy_buffering off` and `proxy_read_timeout` settings. Per the architecture discussion, `proxy_buffering off` must be set for SSE to work through nginx.

### 4.3 Cross-host basic sync (note creation)

- [ ] From Host A: create a new DomainEvent note
- [ ] Observe Host B — the note appears

**Expected**: Note appears on Host B within ~1 second.
**Failure diagnosis**: If Host B doesn't update → SSE is not delivering to the Host B client. Check nginx upstream config (ensure requests proxy to the correct mcp-server port, typically 3333). Also confirm the SSE stream is connected (Section 4.2).

### 4.4 Cross-host echo-loop regression

- [ ] From Host A: make a series of 5 rapid edits (move notes, rename them)
- [ ] Watch Host A board — none of the edits should revert
- [ ] Watch Host B — edits should appear incrementally

**Expected**: All 5 edits are stable on Host A. Host B reflects them progressively.
**Failure diagnosis**: If Host A reverts → the `isApplyingRemoteRef` guard (P0.2) is not firing in the cross-host environment. Verify the deployed FE bundle is built from the patched `src/utils/apiSync.ts` (confirm the `isApplyingRemoteRef` symbol is in the deployed JS bundle via `docker exec <container> grep -c isApplyingRemoteRef /usr/share/nginx/html/assets/*.js`).

### 4.5 Cross-host Remodel sync

- [ ] From Host A: create a Remodel, then edit its parameters
- [ ] Observe Host B — Remodel appears and parameters update

**Expected**: Both the `add_remodel` and `update_remodel` actions propagate through the nginx → mcp-server → SSE chain.
**Failure diagnosis**: Same as Section 1.1–1.2 but in the cross-host context. If same-host works but cross-host fails → suspect nginx buffering or relay mode misconfiguration.

### 4.6 Cross-host FlowPath sync

- [ ] From Host A: create a FlowPath and assign 2 notes to it via `es_set_event_paths`
- [ ] Observe Host B PathBar and note styling

**Expected**: Host B shows the FlowPath and the note styling update.
**Failure diagnosis**: If FlowPath appears but note styling doesn't update → `set_event_paths` dispatch is not finding the notes in `applyBatchFieldUpdate` (check whether `activeBoardId` is the same on both hosts — it should be, since the board state is synced via GET /api/board on load).

### 4.7 Relay mode check (if Host A Claude Code connects to Host B's Docker stack)

This applies only if Claude Code on Host A uses the relay MCP config (`ES_RELAY_MODE=true`, `ES_RELAY_BASE=http://<HostB-IP>:3333`):

- [ ] Confirm Host A Claude Code MCP tool (e.g. `es_add_note`) writes to Host B's `project.json`
- [ ] Confirm the resulting `add_note` broadcast reaches both Host A and Host B browsers
- [ ] No duplicate broadcasts (the relay path goes through `/api/broadcast` endpoint, not the direct `broadcastExcept` in-process — confirm only one SSE event fires per action)

**Expected**: Single broadcast per MCP action; all connected clients receive it.
**Failure diagnosis**: If duplicate events → the relay mode `broadcast()` function is being called in a context where `expressReady` is unexpectedly `true`. Check `FORCE_RELAY` env var and `expressReady` flag logic in `mcp-server/src/index.ts` lines 383–396.

---

## Section 5 — Failure Diagnosis Reference

Use this section when a test item fails to locate the root cause.

### 5.1 Diagnosing by SSE event stream

Open DevTools → Network → click the `/api/events` request → EventStream tab.

Each frame should be a JSON line: `data: {"action":"...","payload":{...}}`

| Observation | Likely cause |
|---|---|
| No frames arriving after Tab A action | SSE connection dropped or nginx buffering; check `proxy_buffering off` |
| Frame arrives but Tab B doesn't update | Client dispatch case missing or store action throwing silently |
| `sync_project` frame arrives in OTHER tab after Tab A POST | Expected — this is how cross-tab sync works |
| `sync_project` frame arrives in Tab A's OWN stream after its own POST | BE `excludeClientId` not honoring `X-Client-Id` header — check FE sets header and BE matches |
| Multiple identical frames for one action | Duplicate broadcast; check relay mode `expressReady` flag |
| `[apiSync] Unknown broadcast action` in console | Server added a new broadcast action without a matching client dispatch case; must add before shipping |

### 5.2 Diagnosing the BE broadcast / sender exclusion

The BE broadcasts `sync_project` after every `POST /api/board`, excluding the sender via `X-Client-Id`. To verify:

- [ ] In Tab A Network tab, filter `api/board`
- [ ] Make any local edit and wait 500ms (debounce)
- [ ] One `POST /api/board` appears — this is Tab A's own POST. Confirm the request headers include `X-Client-Id: <Tab A's clientId>`
- [ ] In Tab A SSE EventStream: confirm NO `sync_project` frame arrives in Tab A after that POST (sender excluded)
- [ ] In Tab B SSE EventStream: confirm a `sync_project` frame DOES arrive (cross-tab sync working)

If Tab A receives its own broadcast → the `excludeClientId` mechanism is not working. Check:
1. FE sends `X-Client-Id` header on every POST (`apiSync.ts` line ~73)
2. BE reads it (`mcp-server/src/index.ts` `POST /api/board` handler) and passes to `broadcastExcept`
3. The clientId on the SSE subscription matches the one on the POST

### 5.3 Diagnosing P0.2 (isApplyingRemoteRef guard)

- [ ] Add a temporary `console.log('[guard]', isApplyingRemoteRef.current)` in the POST `useEffect` (around line 88 of `apiSync.ts`) during dev only — remove before commit
- [ ] Trigger a remote SSE event (Tab A action → observe Tab B)
- [ ] In Tab B console: the guard log should print `true` once (blocking the POST), then `false` on the next local edit

If it prints `false` when handling an SSE-triggered state change → the `isApplyingRemoteRef.current = true` assignment is not happening before `dispatch()`. Check lines 107–109 of `apiSync.ts`.

### 5.4 Diagnosing P0.3 (dispatch case coverage)

For each missing sync symptom (Tab B doesn't update for a specific action):

1. In Tab B SSE EventStream: confirm the action frame is arriving (e.g. `"action":"add_remodel"`)
2. If frame arrives but UI doesn't update → the dispatch case exists but the store call is wrong
3. If frame arrives with `[apiSync] Unknown broadcast action` → the dispatch case is missing entirely
4. If no frame arrives → the server is not broadcasting for that action (grep `mcp-server/src/index.ts` for `broadcast('add_remodel'` etc.)

### 5.5 Diagnosing applyBatchFieldUpdate (set_event_paths / set_event_phase)

These two actions use `applyBatchFieldUpdate()` which looks up elements in `store.project.activeBoardId`. If Tab B's `activeBoardId` is different from where the notes were created, the lookup will silently skip all IDs.

- [ ] Confirm both tabs show the same active board tab selected
- [ ] If boards differ: switch Tab B to the same board as Tab A, then retry the test

---

## Pass / Fail Summary

Fill in after completing all sections:

| Section | Items | Pass | Fail | Notes |
|---|---|---|---|---|
| 0 — Pre-flight | 6 | | | |
| 1 — Basic sync (P0.3) | 7 | | | |
| 2 — Echo-loop regression (P0.1 + P0.2) | 5 | | | |
| 3 — Spec Bundle routing | 8 | | | |
| 4 — Cross-host (Docker) | 7 | | | |
| **Total** | **33** | | | |

**Ship gate**: All 33 items must be checkmarked Pass with zero open failures before commit + Docker deployment.

If any item in Section 2 fails: treat as a **blocker** (echo-loop is the original critical bug).
If any item in Section 1 or 3 fails: treat as a **blocker** (dispatch coverage regression).
If Section 4 items fail due to infra config (nginx): fix nginx config first, re-run Section 4 only.
