# Rooftop rest, candy and wind

Approved scope: make the existing rooftop feel like a short break from work. Add separate bench sitting, wall leaning and persistent candy actions; use a small glossy round candy on a white stick and hide the sweet inside the mouth. Add gentle rooftop wind under existing sound controls. Keep the existing public URL and GitHub source workflow.

## Implementation

1. Share bench/wall anchors through `ROOF_REST`. Keep solid decorations outside the walking rectangle; approach the bench inside the rectangle and attach to the seat on arrival. Standing returns to its safe approach point.
2. Add `roofRest`, `candyInMouth`, `roof-bench` seat and `wallLean` pose. One-click rest buttons walk to each place. Candy insertion lasts 1.2 seconds and then persists independently of rest and walking. Candy toggles off, and clears on floor changes and consumption of food/drink. Rest cancels safely on movement/exit/reset.
3. Add real seat and wall contact poses, small hard candy insertion and mouth-attached stick with relaxed hands. Preserve office, cup, snack and weapon motion.
4. Make bench/wall pickable only on the rooftop. Add subtle breeze motion and improve rooftop framing. Use the same reduced-motion and pause settings.
5. Add one reusable filtered wind loop with gentle gusts; fade during transitions, pause, mute and hidden tabs. No downloads or new dependencies.
6. Add responsive rest controls and clear candy on/off wording. Test engine combinations, contact geometry, picking and audio lifecycle; run all existing tests/typecheck/build and inspect actual desktop/mobile interactions.
7. Review changes, push to the existing GitHub repository, package the exact source revision and publish publicly to the current site. Check anonymous access and the deployed rooftop.

## Acceptance

- Bench and wall actions are independent of candy; all four rest/candy combinations work.
- Candy stays at the mouth while sitting, leaning and walking; only the stick remains visible after insertion.
- Standing, floor transitions, pause and reset leave consistent state; office interactions still work.
- Wind is roof-only, respects existing volume/mute and does not create resources per frame or per visit.
- Public link opens without GPT login.
