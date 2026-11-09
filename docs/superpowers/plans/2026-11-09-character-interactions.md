# Character interaction visibility plan

> For agentic workers: use focused parallel implementation with disjoint file ownership, followed by integration review.

**Goal:** Separate the player from the boss during approach/attacks and make pantry actions visibly performed by the character.

**Architecture:** Keep the deterministic engine and procedural Three.js rigs. The engine chooses a reachable offset beside the boss and owns facing, activity duration and completion; the rig derives animated poses and held props from the existing activity progress and lastHit. Preserve browser-local inventory transactions and pause behavior.

**Tech Stack:** Existing React, TypeScript, Three.js and Vinext. No new packages or external assets.

**Spec:** User's 2026-11-09 request in this chat plus the existing office-playground design. The user authorized the corrections and requested GitHub as the ongoing source of truth.

## Design decisions

The reproduced approach closes the player/boss center distance to 0.037 units. Change the destination to a furniture-safe offset with visible lateral separation in the fixed camera, keep both facing the encounter, and stop stale approach movement during attacks. Keep the current camera instead of introducing a disruptive cutscene.

Use existing action buttons. Brewing shows reaching toward the machine and a cup; taking shows the selected snack moving toward the body; drinking/eating show the item at the face; lounge leaning changes seated posture. Different weapons have readable wind-up, strike and recovery phases. Reduced motion retains clear poses and props with restrained secondary movement. Completion, cancellation and pause remain authoritative in the engine.

## Tasks

- [ ] Reproduce/test boss overlap and regression cases (stationary, moving, near furniture, repeated attacks, cancel). Fix navigation, facing, minimum separation and weapon timing in engine/layout/tests.
- [ ] Add pantry action phases and visible props, seated leaning, and distinct weapon swings in models. Add meaningful pose lifecycle checks and verify reset/cancellation leaves no props or transforms behind.
- [ ] Integrate and review. Run the full test suite, typecheck, production build; inspect attack and pantry actions at desktop and mobile viewport sizes.
- [ ] Commit and push to Choi-SeoJun/online-office, update main without force, synchronize the same source to the existing private Site, and verify deployment.

## Review focus

- A moving boss must not walk through the attacking character or leave a stale path causing overlap.
- Offset selection must stay outside desks/walls and allow a reachable attack in all patrol areas.
- Cancelling or urgently returning to work must stop item animations without spending/granting unfinished inventory.
- Eating/drinking while seated must keep legs seated; leaning must not make the character stand through the chair.
- Pause/reduced motion must preserve a stable, readable pose and not keep effects moving on wall-clock time.

## Workflow

GitHub main was fetched and matched the deployed source. Work uses a dedicated fix branch in the clean existing checkout, preserving installed dependencies. GitHub remains the source of truth; Sites is the publication destination. Current authorization covers the edit, verification, GitHub update and private redeployment without another approval question.
