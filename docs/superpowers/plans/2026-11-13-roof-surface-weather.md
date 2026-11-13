# Rooftop surface weather implementation plan

> Use superpowers:executing-plans and a final read-only reviewer.

**Goal:** Let local snowfall gradually leave a shallow covering on the roof floor and bench; rain gradually wets those surfaces and leaves modest puddles.

**Architecture:** A dedicated `roof-surface-weather.ts` controller owns bounded cosmetic snow/wetness state, instanced shallow snow patches, bench caps, wet overlays, puddles and a few rain ripples. Create it after architecture batching inside the existing environment controller, shared by solo/multiplayer. No shared furniture materials or collision geometry are changed. Dispose its GPU resources before generic scene teardown.

**Tech stack:** Existing Three.js/TypeScript. No dependencies, textures or external assets needed.

**Spec:** User's explicit rooftop accumulation request. Rain is interpreted as gradual wetting/puddles; never physical flood water. Snow remains shallow enough for existing seats/shoes. Accumulation is an atmospheric animation from observed precipitation, not a measurement or historical weather simulation. Clear conditions gradually melt/dry; missing weather never starts accumulation. Slow accumulation can progress while inside the office; render work is skipped off-roof. Reduced motion hides ripples. Low graphics uses fewer ripples. Bound elapsed time to prevent hidden-tab jumps.

## Tasks

- [x] Tests: growth/caps, dry recovery, snow/rain transition, invalid dt; pointer transparency, bench cap heights, roof bounds, resource cleanup and reduced motion.
- [x] Implement surface controller and connect to environment lifecycle without changing seats/navigation.
- [x] Visual fixtures: early/settled snow and rain, clearing, shared roof with seated actor, actual multiplayer roof and camera rotation. Added upcoming 04:00 release note.
- [x] Full tests/typecheck and production builds; fresh read-only review. Publication results recorded in the ignored execution ledger after the release commit.

Verification: 353 tests, TypeScript, Sites and Pages builds passed. Review exposed transparent layer sorting and marker occlusion; regression tests observed failures then passes after ordering effects from -5 to -1. Visual QA replaced the regular grid with scattered, overlapping patches and a thin floor coating; seated pose, props and actual multiplayer location marker remain visible.

## Review focus

- New effects must not intercept walking, bench selection, or leaning.
- Shared model materials and unrelated office furniture must remain unchanged.
- Snow caps must not bury seated players or cover the bench props.
- Surfaces stay within the roof; wetness is shallow and leaves readable tiles.
- Switching weather, reduced motion, disposal and hidden/off-roof updates must remain bounded.
