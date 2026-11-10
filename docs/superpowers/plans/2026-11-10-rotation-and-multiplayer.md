# Rotation and multiplayer implementation plan

**Goal:** First add manual camera rotation; then ship a distinct solo mode and an anonymous invitation-only multiplayer office for 2–16 colleagues with text chat and character speech bubbles.

**Authorized requirements:** Keep existing solo activities. Share a room by code or URL, choose capacity up to 16, arrange partitioned facing desk rows from the user's reference and grow the floor to fit. GitHub main and the same anonymous public URL remain the delivery targets.

**Implementation choices:** Keep Three.js/Vinext. Use the hosting platform's supported D1 binding for room membership, seat assignment, presence and bounded recent chat. Short HTTP synchronization with interpolation avoids relying on process-local state. Durable Objects would suit faster worlds but have no documented Sites provisioning; external services would require new accounts. This relaxed office uses the existing hosting and no external service. Room credentials stay private to the browser tab; invite code grants room entry, never host privileges. Treat names/chat as plain text.

## Ordered deliverables
- [x] Camera: left/right rotation, reset, drag gesture without accidental walking, smooth motion honoring reduced-motion, interaction raycasts and foreground walls at all angles. Preserve floor transition orbit.
- [x] Multiplayer model: capacity 2–16, paired partition rows and reachable seats; layout grows with capacity. Shared deterministic layout/state types and input validation.
- [x] Backend: D1 schema and generated migration, atomic capacity/seat reservation, random room codes and private session tokens, bounded chat and presence, host-only resize, expiry/reconnect/leave, request validation and throttling. No login required.
- [x] Experience: solo/multi welcome, create/join/code/link copy, live participants, own assigned desk, movement and seat actions, text chat and timed bubbles, reconnect feedback, leave/mode switch. Keep solo storage isolated.
- [ ] Verify: full existing tests plus navigation/camera/layout/server invariants, local D1 API integration including capacity races and cross-room isolation; two-browser participant chat/movement and responsive layout. Fresh independent review, production build, matching GitHub/source commit, same public deploy and anonymous smoke test.

## Review focus
1. Simultaneous joins must not exceed room capacity or duplicate seats.
2. Session tokens never appear in room snapshots, chat, invitation URL, logs or Git.
3. Stale connections, tab reload, leave and capacity reduction must not corrupt memberships or strand players.
4. UI typing must not move the avatar; pointer rotation must not issue movement clicks.
5. Enlarged desk layouts need unobstructed aisles and camera bounds; solo behavior must remain intact.

Validation: camera completed before multiplayer implementation; two browser sessions confirmed invitations, seats, chat and 8-to-16 expansion. Desktop 1280x800 and narrow 390x844 inspected. Fresh independent review found transient coffee restoration; fixed with regression coverage. Existing suite plus new server/navigation tests pass. Publication uses the same verified commit on GitHub and Sites.
