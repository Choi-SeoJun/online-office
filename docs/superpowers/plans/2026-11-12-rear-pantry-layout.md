# Rear pantry layout

**Goal:** Match the user's sketch: boss upper-left, then printer, opaque divider, snacks, coffee and lounge across the rear; staff work area stays in front. Apply to solo and multiplayer, retaining all actions and shared seating.
**Design decision:** Keep solo room bounds and move its first staff row slightly forward (z=-.8, second row z=2.6). Rear solo furniture anchors: boss(-6.3,-4.7), copier(-3.3,-4.7), snacks(0,-4.7), coffee(2.8,-4.7), lounge(6.7,-3.8). Opaque 2.35-high divider x=-1.7 spans z=-5.8..-2.7, closing the rear but leaving the front walking route. Pantry is the warm rear-right floor zone. Multi uses the same arrangement translated +2.4x/-1.4z, with its existing stable desk grid; minimum right bound10.96 fits rear amenities even at two people. Four lounge seat IDs and cardinal approach offsets stay stable.
**Shared contract:** game/office-plan.ts is a dependency leaf containing SOLO_OFFICE_PLAN and MULTI_OFFICE_PLAN with furniture footprints, targets, partition and loungeOffset. Renderers, collision layouts and rest-seat data consume it. No roof changes.
**Compatibility:** New/restored clients repair stale obstructed office positions, re-anchor seated actors by stable IDs and preserve valid positions. Server snapshots normalize old coordinates before exposing them. Old open builds must be told to refresh instead of submitting old furniture coordinates indefinitely; keep existing room data and sessions where possible.

## Tasks
- [x] Add geometry/navigation regression tests first, then implement shared plan, targets, obstacles, rear pantry positions and stable 2–16 desk layout.
- [x] Render continuous opaque partition, rear furniture, warm pantry floor and readable labels in both scenes; all cabinet fronts face south.
- [x] Update engine/controller facing, coworker/patrol paths and restored position repair; test interactions and standing/return paths.
- [x] Normalize persisted multiplayer actors and add bounded refresh compatibility for old layout clients; verify no shared-seat overlap.
- [x] Review full diff; tests/typecheck and both builds; browser-test solo, multi small/large, pantry movement, rest and camera rotations.
- [ ] Add next04:00 release notes, publish same verified source to Sites and GitHub Pages, verify public view.

## Validation before publication
257 tests passed; TypeScript and diff checks passed; both Sites and Pages production builds succeeded. Independent review found no actionable defects and checked 5,140 unobstructed navigation routes across capacities 2–16. Browser QA covered solo coffee/rest interactions, multiplayer 2→16 capacity changes, lounge sitting/standing and the divider under camera rotation. The upcoming November 13 04:00 release batch includes this layout change.
