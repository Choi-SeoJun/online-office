# Wall board and room settings

**Goal:** Make the shared/personal board a visible wall fixture with movable notes and direct pen/fill tools; remove fixture bubbles, paint the roof phrase on the wall, and allow identity/company editing after entry.

**Architecture:** Keep Three.js and the existing React board dialog, personal local storage and room-scoped D1 data. A shared board renderer paints both the wall texture and enlarged editing surface. Existing posts receive deterministic positions; new normalized placements are stored separately. Existing drawings remain readable. No accounts or new dependencies.

**Design choices:** The blank left office wall receives the board, avoiding the rear windows. Click the fixture or walk near it for an accessible open action. Enlarged board drawing uses the same visible board coordinates, with pen colors, thickness, bucket fill, undo and explicit save. Notes can be moved by active members, while deletion stays author/host only. Personal profile changes belong to each player; room name, capacity and common boss rank belong to the current host. Solo settings persist independently from multiplayer company settings. Boss labels use 직급님; ranks add 인턴, 팀장, 대표.

## Tasks
- [x] Board data/editor: optional normalized placement, pen/fill strokes, backwards parsing, shared renderer; move persistence, direct drawing, accessible note movement and wall content callbacks.
- [x] Server and profile: additive board position migration; validated authorized move; profile and host room settings actions; rank/name updates and engine state without teleporting/resetting inventory.
- [x] World fixtures: remove requested labels in both modes; left-wall interactive board, shared texture refresh/disposal and stable nearby access point; roof text as wall surface.
- [x] Integration: settings forms, controlled board open/content plumbing, near-board action, pause/input guards, responsive layout and upcoming 04:00 notes.
- [ ] Verification: old board data survival, fill region algorithm, move bounds/permissions, settings validation/authority/session preservation, full tests/typecheck/builds, browser QA if available, independent review and same-commit publication.

## Contracts
- BoardPlacement = { x, y, width, height } normalized 0..1, fully within board; BoardDraft.placement optional. BoardStroke.tool optional pen/fill (legacy pen), width optional in board pixels. Fill uses a single seed point.
- Board API action move: { id, placement }; only position changes. Shared room action profile: { name, rank, avatar }; roomSettings: { roomName, bossRank, capacity } host-only.
- OfficeBulletinBoard gains openRequest?: number and onEntriesChange?: (entries) => void; onOpenChange remains. Poll content while closed to update wall.
- Scene options gain getBoardEntries?: () => BoardEntry[] and onBoard?: () => void. Scene exports boardApproachPoint(bounds) for near-board access, renders with drawBoard(ctx, entries, width, height).
- Solo engine profile command value contains name/rank/avatar/bossRank/companyName; multiplayer snapshot updates personal name/avatar/rank and common boss state.

## Review focus
Old drawings/notes survive; real closed-region fill works after reload; concurrent members never overwrite whole board; guests cannot change company settings; keyboard/touch editing cannot move the game camera.

## Verification record

- 303 automated tests pass; TypeScript passes. Both production builds passed; rebuilding after the final small-screen near-board button spacing fix.
- Browser QA on the narrow in-app viewport confirmed new ranks, live personal/company settings, persisted profile, note create/drag, direct four-line drawing and bounded bucket fill, saved wall texture, physical board click and nearby button. Solo exit/re-entry no longer replays the previous open request.
- Independent review found stale openRequest replay on re-entry; fixed by consuming the initial prop value. Drawing cache and preservation/authority review found no further blockers.
- Publication verification follows on the same source commit; runtime API checks use a temporary synthetic room and remove its test entries.
