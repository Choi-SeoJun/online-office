# Adaptive rendering implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and a fresh whole-branch review.

**Goal:** Automatically adjust both office renderers to measured foreground frame rate, including Chrome.

**Architecture:** Share a pure frame-time controller and a small Three renderer adapter. Keep the saved auto/low/high preference separate from the transient resolved profile. Feed resolved effect quality to the existing weather systems; leave gameplay, networking, sound and UI resolution unchanged.

**Tech stack:** TypeScript, Three.js, Node tests, existing Vite/Pages/Sites builds. No new dependencies.

**Spec / design decisions:** The user explicitly requested FPS-based automatic quality. Browser sniffing would not reflect actual performance; a fixed lower preset would lose quality even on fast devices. Choose measured RAF intervals with a 60 FPS target, 2-second warmup, 1-second windows, sustained downgrade below 50 FPS (immediate window below 30), and 20-second healthy recovery above 57 FPS. Four auto tiers use DPR caps .75/1/1.25/1.5, shadows off/off/512/1024, and low/low/auto/auto weather. Start at 1.25. Retry failed upward probes less frequently (60–120 seconds) to avoid repeated flicker. Preserve manual low (DPR 1, no shadows) and high (DPR 2, 2048 shadows).

**Constraints:** No browser-specific behavior or persisted automatic degradation. Ignore hidden tabs, floor transitions, resizing and isolated multi-second pauses. Measure raw time before simulation clamping. Preserve reduced motion and all effects' meaning. Reallocate shadow targets only on actual profile changes. Publish the same source commit to GitHub and the existing public Site; update the next 04:00 KST announcement.

**Review focus:** Background/resume timing; sustained very low FPS; oscillation/recovery; manual overrides and DPR changes; both scenes and shadow resource cleanup.

## Tasks

- [x] Add failing behavior tests for sustained slow/fast/unstable frame traces, pauses, transitions, manual choices and shadow allocation.
- [x] Implement pure controller and renderer adapter; run targeted tests.
- [x] Integrate raw-frame sampling, effective weather settings and visibility resets in both scenes. Add a short auto-quality explanation and release note.
- [x] Verify full tests, TypeScript, Pages and Sites builds; use actual-scene browser fixtures with timed CPU load to verify resolution adjustment, floor changes and controls.
- [ ] Fresh read-only review, fix supported findings, commit, synchronize GitHub and Sites, verify publication.

**Verification limit:** RAF observes delivered frame cadence, not an isolated GPU benchmark. Automatic adjustment cannot guarantee 60 FPS under software rendering or heavy external load. Do not claim measured Chrome-versus-Edge improvement without that comparison.

## Verification record

362 Node tests pass; TypeScript passes. Actual-scene IAB QA observed backing ratio 1 → .75 → 1 under a 12-second 45ms/frame CPU load then recovery in solo and 16-desk multiplayer fixtures. Manual low → high restored visible cast shadows; camera rotation, office/roof switches, snow/rain and reduced motion remained usable. No browser error logs. A fresh read-only reviewer identified a shadow shader-cache invalidation issue; toggling the directional light’s castShadow flag and a failing-then-passing regression test resolved it. Remaining review findings: none. This is behavior verification, not a Chrome-versus-Edge benchmark.
