# Online Office Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use checkbox tracking.

**Goal:** Ship the approved single-player office playground with four activities and a private playable deployment.

**Architecture:** A browser-only simulation owns movement, activities, NPC schedules, inventory and persistence. A procedural Three.js scene renders that state; React provides responsive Korean controls and monitor content. The supplied Vinext/Sites starter owns build and deployment, without a game backend.

**Tech Stack:** TypeScript, React, Three.js, Vinext, Node native test runner, Sites hosting.

**Spec:** ../specs/2026-11-09-office-playground-design.md and https://chatgpt.com/space/page_a2ad4a657dc881919d1417f6273b7e60 (approved 2026-11-09).

## Global Constraints

- Solo player, one boss, three coworkers; no real-time players, chat, account database, payment or outside AI calls.
- Desk modes work, shopping, game, sleep; 2-second observation grace, at least 30 seconds between observations; no inventory loss on detection.
- Punch 0.3s, hammer 0.7s, paper fan 0.5s; all unlocked; hit wins over observation; boss recovers after 2 seconds without hits, then at least 10 seconds observation immunity.
- Coffee brew 3 seconds, 3 sips; cookie/choco/cracker total capacity 6; cancellation produces no item; consuming commits once on completion.
- Target selection approaches only. Action buttons execute after arrival. E uses the visible default action, but never attacks. Space switches to work while seated.
- Persist name, selected weapon, settings and snacks only. No coffee, transient action or NPC position persistence. Hidden tab pauses simulation and sound.
- Tilted fixed-angle 3D, zoom, desktop keyboard/click and mobile tap, Korean UI, reduced motion, sound off initially.
- First deploy owner-private on a default URL. No domain or paid services.

## Review Focus

1. Repeated action/cancel input must not duplicate snacks or coffee; reducer tests in Task 2.
2. Corrupt/blocked storage must not prevent starting; persistence tests in Task 2.
3. Boss hit during observation must cancel detection, and collisions must keep actors reachable; tests in Task 2 and browser check Task 4.
4. Background tab and typing in input must not continue detection or move actors; pause tests Task 2 and browser check Task 4.
5. Narrow mobile layout and failed WebGL must preserve usable controls and a clear recovery message; responsive/failure browser checks Task 4.

## Files and interfaces

Project directory: `office-playground/` (new isolated folder; no existing Git project).

- `game/types.ts`: shared GameState, actor, command, target, weapon and settings contracts.
- `game/layout.ts`: floor bounds, six desk centers, collision rectangles and target approach points; shared by simulation and renderer.
- `game/engine.ts`: `createGameEngine(initial?: PersistedState): GameEngine`, exposing state, `dispatch(command)`, `step(dtSeconds)`, `subscribe(listener)`, `getSnapshot()` and `dispose()`.
- `game/storage.ts`: validated browser persistence with safe read/write; `game/engine.test.ts`, `game/storage.test.ts`.
- `game/scene.ts`: `createOfficeScene(host, callbacks)` returning dispose/zoom; callbacks getState, onFrame, onGround, onTarget, onReady, onError.
- `game/models.ts`: original procedural furniture and actor assets for the scene.
- `game/audio.ts`: local generated sound, paused/muted lifecycle, no external media.
- `components/office-game.tsx`: scene host, game lifecycle, HUD, activity controls, monitor mini-experiences, accessible settings and mobile location shortcuts.
- `app/page.tsx`, `app/layout.tsx`, `app/globals.css`: entry and responsive styling, metadata.
- `docs/validation.md`: actual verification outcomes, performance measurements and limits.

### Task 1: Project and contracts

Owner: primary. Create project with supplied Sites setup, add Three.js and type dependency before one installation, register once and persist Site identity. Establish shared types/layout and implementation ledger. Use a dedicated feature branch when initializing Git; Sites source helper owns later remote synchronization.

- [ ] Bootstrap and record Site ID without exposing credential.
- [ ] Write shared types/layout and task briefs before parallel renderer/simulation work.
- [ ] Start one dependency installation and record its result.

### Task 2: Simulation and saved state

Owner: bounded simulation agent. Own engine/storage and their tests only; shared contracts require coordination.

Consumes types/layout; produces GameEngine and storage helpers for the UI/renderer.

- [ ] Write native Node tests first: no auto action on target select, proximity gating, capacity 6, brew 3s/3 sips, cancellation, repeat clicks, observation grace and cooldown, hit interrupt/recovery, collision movement, pause, malformed storage.
- [ ] Run `node --test game/*.test.ts`; observe missing behavior fail.
- [ ] Implement deterministic simulation, pathfinding around furniture, three different coworker routines, harmless boss reaction and safe persistence.
- [ ] Run the suite and type check. Record evidence in task report.

### Task 3: Office scene and character reactions

Owner: bounded scene agent in disjoint files, while primary owns UI. Consumes shared state/layout only.

- [ ] Build procedural furnished cutaway 3D office with warm light, carpet, windows, pantry, plants, desks, monitors, chairs, copier, ceiling fixtures and clear targets.
- [ ] Build five recognizable stylized office characters with walk, sit, type, sleep, drink and weapon reactions driven by state.
- [ ] Wire raycast target/ground selection and fixed-angle follow camera, zoom, quality/reduced motion, resize, disposal, failed-renderer callback.
- [ ] Verify with type checking and browser scene inspection after integration. No snapshot tests mirroring decorative geometry.

### Task 4: Complete interactive experience

Owner: primary. Consumes engine/scene public interfaces.

- [ ] Create concise entry overlay with default nickname, live office preview and enter button.
- [ ] Create contextual controls and monitor shopping/cards, click-target mini-game, sleeping/work views; typing must suppress shortcuts.
- [ ] Add coffee, snack selection and inventory, boss weapons, desk/lounging, settings/reset/help, first-visit hints and small NPC message bubbles.
- [ ] Add original generated sound and persist changes, visibility pause, cleanup on re-entry, low-quality mode and error recovery.
- [ ] Run whole test suite, TypeScript and production build.
- [ ] Serve local preview; verify desktop journey and mobile portrait/landscape through supported browser UI. Inspect screenshot, keyboard, pause, persistence, error state and actual bundle size. Fix evidenced gaps.

### Task 5: Review and deployment

- [ ] Fresh independent whole-project review against spec and input edge cases; fix substantive issues with focused tests.
- [ ] Record verified behavior and remaining device/measurement limits in docs/validation.md.
- [ ] Run required changed checks/build, synchronize source through Sites helper, package exact source and deploy owner-private.
- [ ] Confirm terminal deployment success and open returned URL. Return playable URL, controls, verification and material limitations.

## Execution decisions

The user approved proceeding with the design and end-to-end work; no additional process approval is necessary. Independent simulation and rendering work may run concurrently because ownership is disjoint and shared contracts are fixed first. This overrides the skill's generic sequential-worker preference under the session's proactive delegation instruction. Presentation and integration remain with the primary agent.
