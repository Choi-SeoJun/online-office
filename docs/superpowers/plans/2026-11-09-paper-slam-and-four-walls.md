# Paper slam and four rooftop walls

Goal: make the office prank feel like slamming a stack of paperwork in frustration; make all four rooftop walls usable resting places and add one trashcan. Preserve existing solo play, independent candy, GitHub and public URL.

## Decisions
- Keep persisted weapon key `fan`; show `서류 뭉치`. Use visible stacked rectangular pages and an overhead downward strike lasting .9 seconds. Shared `WEAPON_IMPACT=.43` synchronizes actual contact, boss reaction and distinct synthesized punch/hammer/paper sounds.
- Reuse actual perimeter at x±9, z±6. Each wall has a reachable resting position, inward actor angle and click target. Expand rooftop walking bounds and reuse collision-safe routes around the existing stairs, bench, planters and new bin. Avoid teleporting from the old inset walking area.
- Keep high physical walls, with cutaway upper foreground panels so they do not hide the player. Remove the obsolete interior leaning wall. Add one gray trashcan near the stairwell, outside rest anchors.
- `roofWallSide` records the chosen side independently of `roofRest` and candy. Wall clicks walk and lean automatically; a compact four-wall picker also provides accessible controls. Existing `벽에 기대기` opens the picker; candy remains separate.

## Tasks and checks
- [x] Models/motion: layered stack, overhead windup, downward contact and loose-sheet flutter; tests assert actual paper surface reaches the boss at .43 in both motion modes and all angles, plus reset/idle readability. Wall contact follows actor orientation.
- [x] Audio: one cue per lastHit at impact, distinct short bounded synthesis per tool; no timers or stale playback on mute/pause/hidden/floor change/reset. Test lifecycle and timing with fake audio context.
- [x] Geometry: four physical contact planes and target tags, foreground cutaway, trashcan and relocated wind detail. Test rays, clearance and existing bench/breeze behavior.
- [x] Engine/UI: floor-aware routing, roof obstacles and four independent lean anchors; tests traverse every pair without entering obstacles, preserve candy, detach safely and reject office access. Rename tool/icon/action caption; add wall picker with responsive layout.
- [ ] Run full tests/typecheck/build; independent review and actual small/large browser checks. Commit and push to GitHub, package exact source, publish to existing public site, verify anonymous access and final screen.

No dependencies, external assets, accounts or changes to audience are needed.

Review correction: rooftop navigation uses its own .2 grid with edge rows at x±8.66 and z±5.66, so slim outside planter corridors reconnect to the main space. Added manual-command regressions; independent review checked 848 valid perimeter positions with zero routing failures.
