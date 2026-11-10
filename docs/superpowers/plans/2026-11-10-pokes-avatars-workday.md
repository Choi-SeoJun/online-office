# Pokes, avatar choice and personal work tools

User requests: recipient-only coworker poke notifications in multiplayer; female ponytail avatar alongside the existing male avatar; a clock with configured start/end times and live remaining time; replace spreadsheet work UI with a larger usable To Do List.

## Implementation choices and interfaces
- Add `AvatarStyle = 'short' | 'ponytail'` and optional `Actor.avatar`. Entry selectors label male/short and female/ponytail. Persist solo preference and multiplayer member choice; old records/requests default short. Reuse existing Three geometry and animate the ponytail with the head.
- Room API accepts `poke {targetId}` and `readNotifications {throughId}` authenticated actions. Return only the caller's `notifications` in snapshots: `{id, senderId, senderName, createdAt, readAt}`. Server owns identity/time, rejects self/other-room/stale targets, atomic sender cooldown 5 seconds, keep latest 100 per recipient. Bell unread count, incoming in-page toast and private notification list. Additive D1 migration only; existing SQL history immutable.
- New shared `WorkClock` opens settings on first use and live countdown afterward. Personal browser storage, editable start/end, overnight shifts and before/after-work labels. Current browser-local wall-clock time updates when open/visible. Inputs must not send game movement keys.
- New shared `TodoBoard` replaces rendered worksheet in both modes; desktop large readable panel and responsive mobile sheet. Add/edit/complete/delete, filters and completion count, bounded validated browser storage with honest save state and reload persistence. Keep old spreadsheet data intact. Optional onType callback retains keyboard sound.
- Shared UI stays in the existing Korean muted-green style. Personal work data is never sent through room sync.

## Tasks and checks
1. Avatar model/type/persistence with geometry and regression checks; root integrates selectors.
2. Notification/appearance server schema, migration, DTO and endpoint tests for isolation, invalid recipients, races, cooldown, reads and old-client defaults; root integrates bell/poke controls.
3. Personal work components/storage and time tests (overnight, pre/post shift, corrupt storage); root integrates both modes and large work view.
4. Full tests/typecheck/build, independent review and actual two-session poke test. Check avatar from multiple angles, saved work list and real countdown in browser. Publish same verified commit to GitHub main and existing public Site, confirm anonymous production flow.

## Verification record
- 145 automated tests passed, including notification privacy/read races/rate limits, additive migration preservation, avatar geometry/persistence, overnight workday boundaries and task storage. TypeScript passed.
- Browser: solo female entry and reload restoration; work clock configuration/edit/live countdown and persisted schedule; task add/edit/complete/filter and persistence into multiplayer after reload.
- Two independent multiplayer tabs: male/female appearances, direct actor selection, poke from member list and actor card, recipient toast/badge/history, read status, Escape and focus restoration.
- Responsive: 390px header fits without horizontal overflow; task and chat switch without overlap; desktop task panel is 720px wide. No browser console errors.
- Independent review fixed notification focus containment and mobile task/chat overlap. Personal work data stays local and existing worksheet data is retained.
