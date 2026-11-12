# Office Expression Implementation Plan

> **For agentic workers:** Use subagent-driven-development for independent domains; coordinate shared files before editing.

**Goal:** Fix shared seating/animation/readability and add a useful board and expressive office actions.
**Architecture:** Retain shared game engine and actor renderer; explicit activity progress drives all viewers. Reuse authenticated room membership for board and seat validation; solo board uses local storage.
**Tech Stack:** React, Three.js, TypeScript, Cloudflare D1, Node tests, existing Sites and GitHub Pages builds.
**Spec:** docs/superpowers/specs/2026-11-12-office-expression-design.md

## Global constraints
Preserve existing public deployments and private feedback access. No dependencies or credentials in source. Existing clean checkout and focused feature branch isolate work from the original OneDrive workspace.

## Review focus
- Concurrent seat requests cannot both succeed or leave local overlapping avatars.
- Board authorization rejects nonmembers, other rooms and unauthorized deletes.
- Remote animation expiry and rotations agree after delayed packets.
- Text/board editing does not trigger avatar movement; mobile controls fit.
- New state defaults tolerate pre-update players and stored data.

## Tasks
- [x] Seat/readability: shared seat definitions, multi occupancy protocol and server atomic claims; engine/scene geometry. Regress stale/released seats and concurrent requests in room tests. Shared billboard text depth handled with animation/model task.
- [x] Animation: reproduce spin drift, implement one shared progress rotation for chairs/actors, dance activity/effects and work typing/sigh; meaningful remote expiry/model tests.
- [x] Board backend: bounded shared schema, isolated POST API using room membership, validated text/drawing payloads, author/host deletion, idempotence, rate/storage limits, migration and auth/concurrency tests; shared client types and client transport/local persistence.
- [x] Board UI/integration: accessible responsive cork board dialog with three creation modes, draw/undo/clear, card rendering/deletion, pending/error/draft handling, shared polling, solo persistence. Integrate entry points and input guards in both modes. Add dance controls.
- [x] Verify: typecheck, full tests, both builds, local mobile/desktop browser QA and two-client smoke. Independent branch review; resolve findings.
- [ ] Publish: supported Sites helper package/push/save/deploy; fast-forward GitHub main same commit; verify Actions and live smoke. Report player link and persistence semantics.
