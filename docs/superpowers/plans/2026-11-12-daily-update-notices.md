# Daily update notices

**Goal:** Publish readable Korean player notices grouped by Asia/Seoul calendar date, rather than deployment.
**Design:** A shared Recent updates dialog lists newest dates first, each with added features and fixes. Today starts with the two verified November 12 releases plus this notice feature. No invented older entries. Date-keyed source records make same-day accumulation explicit. A quiet unread-date marker uses local browser storage; no forced popup. The footer uses the user's invitation to leave feedback and opens the existing private feedback form. Solo and multiplayer entry/gameplay both expose the dialog. Existing headers stay compact; gameplay uses the right-side activity tools and entry uses a card link.
**Constraints:** No new backend/storage table, dependencies, global board or sensitive data. Existing feedback owner authorization and anonymous submissions unchanged. Modal blocks movement and pauses local simulation; keyboard and focus restore correctly through nested feedback dialog. Korean dates independent of execution host timezone.

## Steps
- [x] Add date-keyed updates data and helpers; test newest-date ordering and per-day read marker with unavailable storage.
- [x] Add accessible responsive dialog, dated cards, added/fixed sections, feedback invitation and nested feedback trigger.
- [x] Integrate solo/multi entry/game controls and pause/input guards without squeezing mobile headers.
- [x] Document future release practice in AGENTS.md and README.md: append same KST date, newest first, user-facing completed changes only.
- [x] Typecheck, focused tests, required full regression suite, both builds; mobile/desktop dialog, unread marker and feedback flow browser QA.
- [ ] Supported Sites source/package/save/deploy and same commit GitHub main/Pages verification.
