# Installed app updates and weather investigation

**Goal:** Preserve the existing URL/install identity and eliminate reinstall requirements, including detection of newer deployments in a long-running game. Explain the reported Cheonan weather discrepancy with actual API evidence.

**Spec:** User requests automatic installed-app updates without reinstalling and investigation of snow in Cheonan being shown as cloudy.

**Architecture:** Emit a per-build version JSON and compile the same ID into each frontend with a shared Vite plugin. A root watcher checks immediately, every five visible minutes and on returning online/foreground (throttled). At fresh boot only, a newer deployment may reload before any interaction; while playing, show an apply button to preserve unfinished input. Cache-busting navigation preserves room/mode parameters and guards against reload loops. Do not introduce service-worker caches or change manifest identity. Weather UI distinguishes model valid time from fetch time and explains representative-point model limitations; no unsupported conversion of clouds to snow or provider replacement.

**Tech stack:** Existing React/Vite/Vinext, browser fetch and Node tests; no new dependencies.

## Review focus

- New-build ID must match the emitted JSON separately on Pages and Sites.
- Offline, bad JSON, HTTP errors, hidden tabs and overlapping focus/online events must not interrupt gameplay.
- An initial stale page may refresh once; an active page must never be forced to discard input.
- Preserve invite parameters and prevent a stale CDN response causing infinite reloads.
- Weather reference time must use the API valid time, not the time it was downloaded; keep rain/snow code mapping unchanged.

## Steps

- [x] Test version comparison, interval/foreground scheduling, cancellation, failures, boot-only reload policy and cache-busting URL preservation.
- [x] Add shared build plugin, version watcher, root update notice and integration.
- [x] Add weather valid-time/source wording and document the actual Cheonan API sample.
- [x] Typecheck, all 395 tests, Pages/Sites builds and local old/new version UI checks.
- [ ] Read-only reviewer, fix material findings, publish same source to GitHub and Sites.
- [ ] Verify version JSON matches deployed bundles, public notice/metadata and explain physical-device verification limit.
