# Office feel and rooftop verification — 2026-11-09

## Delivered behavior

- Ridged toy hammer with diagonal wind-up/strike/recovery; connected pleated paper fan with printed details. Selected tools remain visible beside the boss.
- Cup rim, snack bite edge and candy contact target the lips in the body coordinate frame, including seated actors and rotated headings. The hand remains on the grip.
- Work desk keyboard ASMR uses synthesized click/body/release sounds and irregular typing bursts. Direct worksheet input also triggers keys. Sound is optional and honors mute, volume, visibility and pause; office hum/typing stop on the rooftop.
- Editable 5×3 text worksheet with Korean input, formula-bar editing, Enter navigation, bounded browser storage and in-memory fallback across ordinary mode/floor changes. It does not evaluate formulas or upload contents.
- Rooftop has stairwell, bench, planters, railings and city silhouettes. Office/roof buttons switch with a clockwise camera orbit and midpoint fade; reduced motion uses a short fade. Candy unwraps, reaches the mouth, is held and lowered. Travel preserves inventory and cancels unfinished consumption without spending it.

## Checks

- Final `node --test game/*.test.ts`: **54 passed, 0 failed**.
- Final TypeScript check: **passed**.
- Official Sites production build: **passed**. Existing large Three.js chunk advisory remains; no new dependency was added.
- Independent review: approved after fixing worksheet edits lost with blocked storage and actual reduced-motion fan contact. Tests use real Three geometry; the fan regression checks triangle/head intersection rather than only bounding boxes.
- Browser QA: fresh load; worksheet Korean text, Space/W inside cells and Enter navigation; edits survive changing desk modes; sound toggle; hammer swing and held fan; coffee and cookie mouth positioning; rooftop round trip, candy pose, location-specific buttons and reduced-motion transition.
- Layouts inspected at native narrow viewport, 390×844, and 1280×800. Temporary viewport override cleared. Browser warning/error log was empty after fresh load and interaction.

## Limits

Actual mobile hardware/FPS, thermal behavior and speaker/headphone sound quality were not measured. Audio scheduling and muting are covered by tests; sound is procedurally synthesized. Worksheet formulas are plain text.

## Publishing contract

GitHub main and the existing Sites source receive the same verified commit. Retain public anonymous access at the existing URL; the GitHub repository audience stays unchanged. Final hosting publication and anonymous page/assets checks are performed after this source commit.
