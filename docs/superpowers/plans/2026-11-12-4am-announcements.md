# 04:00 update announcements

**Goal:** Unread published news opens once on arrival, remains manually accessible, and daily notices release at 04:00 Asia/Seoul.
**Design:** Keep the existing date-keyed data and read key. Each key now means its announcement date: changes in [previous day 04:00, release day 04:00) join that release. Thus Nov 12 23:00 and Nov 13 03:00 both belong to Nov 13 04:00. An edit exactly at the cutoff starts the next batch. Published entries stay stable; new work goes into the next batch. Old Nov 12 notice remains released and existing readers stay acknowledged.
**Implementation choice:** Filter bundled notices by explicit KST release instants on the client, with a boundary timer and visibility recheck. No scheduled rebuild, backend job or personal reminder is needed. Already loaded pages cannot acquire code/data from later deployments without reload, as before. Browser-local read history is retained; a memory fallback prevents repeated openings during one visit if storage is blocked.
**UI:** Controlled shared Radix dialog, auto-open only in visible tabs after room restoration/loading completes and other dialogs close. Manual access uses only released entries. Opening acknowledges only the newest displayed published date. Existing pause/input guards and feedback dialog stay in use; unmount releases the parent pause flag. Add a short Korean 04:00 schedule note.

## Steps
- [x] Add failing tests for exact 03:59:59.999/04:00 boundary, user example, year/month rollover, future filtering and monotonic once-only read state; implement pure helpers in game/updates.ts.
- [x] Wire controlled auto-open, readiness, release timer, storage/visibility changes and modal deferral into components/update-news.tsx and its callers; verify desktop/mobile, repeat visits, mode changes and manual reopening.
- [x] Add this release under 2026-11-13, preserve existing released entry; update AGENTS.md and README.md to use next 04:00 batch rule.
- [ ] Run full tests/typecheck, independent review, both builds; publish matching source to Sites and GitHub Pages and verify live page.

## Verification before publication
- 241 tests pass; typecheck and both Sites/Pages builds pass.
- Independent review's graphics-recovery finding resolved with `!sceneError` readiness guard.
- Browser: unread first arrival opens once, reload/mode change/room restoration stay closed, manual opening and nested feedback work; mobile 390x667 remains scrollable.
- Ignored local harness runs the actual component with visible clock controls: 03:59:59 hides the next batch; 04:00 releases it. Another dialog, hidden visibility or incomplete readiness defers opening without consuming read state. Returning/closing/completing readiness opens once and pauses the parent. An old notice straddling 04:00 stays stable and leaves the next batch unread until displayed; remount releases parent pause and does not reopen read news.
