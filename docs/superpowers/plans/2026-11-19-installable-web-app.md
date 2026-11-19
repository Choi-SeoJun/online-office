# Installable web app implementation plan

**Goal:** Install 온라인 회사 from its existing URL, with an Android install button and iPhone home-screen instructions.

**Spec:** The user's November 19 request: keep the existing address; add Android installation and iPhone instructions. Place the entry in both welcome cards and both in-game menus, respecting the collapsed mobile menu.

**Architecture:** One relative web manifest and existing-brand PNG icons serve both GitHub Pages (/online-office/) and Sites (/). A root React provider retains the browser's install event across solo/multiplayer navigation. A shared accessible dialog gives iOS, Android and desktop fallbacks. Use current browser install support without a service worker: offline gameplay is outside this request, and no additional cache should intercept multiplayer, private feedback, or new deployments.

**Tech stack:** Existing React, Radix Dialog, Vite Pages and Vinext Sites. No new runtime dependencies.

## Constraints and review focus

- Preserve the exact production URLs, local game storage and all backend access controls.
- Never prompt without a user gesture; consume a native install event once and permit retry after cancellation with a fresh event.
- Detect iPhone/iPad (including desktop-UA iPad); hide the entry in standalone display and after installation.
- A missing/unsupported native event must show useful instructions, not an inactive install button.
- No false installed message on prompt cancellation/error; mobile dialogs must fit and retain accessible focus.
- Manifest start URL/scope/icons must resolve under both deployment prefixes, without retaining invite codes.
- Include the change in the next 04:00 Asia/Seoul announcement batch.

## Task 1 — Installation lifecycle and metadata

- [ ] Write and run failing `game/app-install.test.ts` lifecycle tests (native prompt, cancellation, error, repeated clicks, standalone, iPad, cleanup).
- [ ] Implement `game/app-install.ts`: platform detection and an event-driven install controller, with synchronous prompt invocation from a click.
- [ ] Add `public/manifest.webmanifest`, PNG icons from the existing favicon, Pages HTML links and Sites metadata. Test relative asset/start URLs and PNG dimensions.

## Task 2 — Shared user interface

- [ ] Add `components/app-install.tsx` and CSS: root provider and dialog/trigger. Native install when available; manual Android instructions otherwise; iPhone Share → Add to Home Screen → Open as Web App; copy address for in-app browsers.
- [ ] Wrap `OfficeEntry` once; integrate `OfficeSupport` with dialog-open pause/auto-news guards.
- [ ] Add release note. Verify desktop/mobile entry and in-game menu via local preview; validate iOS/native lifecycle using controlled inputs without claiming a physical-phone install.

## Task 3 — Verify and deploy

- [ ] Run TypeScript, full Node suite, Pages and Sites builds.
- [ ] Fresh read-only code review; resolve material findings.
- [ ] Commit, fast-forward main, push same source to GitHub and Sites; verify Pages Action and Sites deployment.
- [ ] Check public manifest/icons and install UI; report physical-device verification limit.
