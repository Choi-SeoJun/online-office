# Office window weather implementation plan

> Use superpowers:executing-plans for implementation and a fresh final reviewer.

**Goal:** Show local rain/snow beyond office windows and beads/trickles on glass when raining, in both solo and multiplayer.

**Architecture:** Extend the existing window CanvasTexture with a cached sky layer and animated precipitation/glass layer. The texture remains on the window plane, naturally clipped by its edges, mullions, geometry depth and camera cutaways. This fits existing flat city views better than freestanding particles and avoids indoor rain or additional per-window draw calls.

**Tech stack:** Existing TypeScript, Three.js, Canvas 2D; no new dependencies.

**Spec:** User's explicit request in this chat. Keep existing per-browser local weather, rain audio, season/daylight behavior and graphics controls. Do not invent precipitation when forecast is absent. Reduced motion keeps a static weather illustration. Low quality throttles refresh. Existing architecture disposal owns the one shared window texture.

## Tasks

- [x] Add regression tests: rainy/snowy textures animate, clear weather stops, reduced motion freezes, settings/weather changes render immediately, throttling and cutaways remain intact.
- [x] Implement `paintWindowPrecipitation` in `game/window-weather.ts`; cache base sky in `createOfficeWeather`, throttle texture uploads, pass settings/dt from solo and multiplayer scenes.
- [x] Verify tests/typecheck, fixture previews of rain/snow/clear, rotation, reduced motion and multi; append next 04:00 announcement.
- [x] Fresh read-only review and production builds. Publication results belong in the ignored execution ledger after the release commit.

Verification: 350 tests, TypeScript and both production builds passed. Browser fixtures verified rain/snow/clear, camera rotation, reduced motion and multiplayer at narrow/desktop sizes. Reviewer found no actionable issues and verified shared texture disposal across capacities 2/8/16.

## Review focus

- Rain must remain inside window panes while rotating and must not obscure indoor objects.
- A switch to dry/snow must remove glass rain without waiting ten seconds.
- Motion/quality settings must work in both modes and not recreate textures per frame.
- Room resizing must still dispose the prior architecture's shared texture.
- Paused/hidden or rooftop time must not cause a large animation jump on returning.
