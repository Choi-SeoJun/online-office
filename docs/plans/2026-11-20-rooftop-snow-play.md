# Rooftop snow and play refinement

**Goal:** Snow covers rooftop architecture and plants; splashing feels playful; duck molds use both hands; snowballs are made before being thrown from the bottom dock.

**Approach:** Extend the existing Three.js geometry and shared solo/multiplayer engine. Keep current precipitation rules, navigation, automatic quality and reduced-motion behavior. No new dependencies or image assets are needed.

**Design choices:** One held snowball per player. Making completes before the throw control appears. Walking and resting retain it; throwing consumes it at release; cancellation before release retains it. Leaving the rooftop, ending snow or exiting clears it. The hand-held state is shared with colleagues, but is not a persistent inventory item. Older room clients remain accepted.

## Plan

- [x] Engine and room protocol: add `make-snowball` activity and `snowballReady`; test creation, interruption, consumption, weather/travel cleanup and multiplayer round trips. Keep `snowball` as the existing throw activity identifier.
- [x] Controls: side menu offers making only; the bottom dock offers throwing only when a snowball is ready. Verify desktop and mobile behavior in the running app.
- [x] Animation: solve both hands onto the duck-mold handles; show shaping, carrying and throwing separately. Add three buoyant splash hops and synchronize water bursts with footfalls. Verify actual rig transforms and reduced motion.
- [x] Snow cover: capture roof/wall/planter/leaf surfaces before render batching; add shallow, shared-geometry snow caps that fade with existing accumulation. Preserve foreground wall transparency, navigation and resource disposal. Verify geometry and inspect the rendered scene.
- [x] Add the next 04:00 KST release batch, run full tests/typecheck/both builds and independent review.

Validation: 477 tests passed, TypeScript passed, GitHub Pages and Sites production builds passed. Browser checks covered snowfall on structures/plants, the duck pose, rain hopping, and the make/throw control at desktop and 390px mobile widths. Independent review also checked remote effects between room packets; regression tests cover all three splash bursts and immediate carried-ball visibility after crafting.

Publication: synchronize this verified source commit to Sites and GitHub Pages using the repository workflow.

## Review focus

- Interrupted crafting never creates a snowball; repeated throw clicks cannot duplicate it.
- Weather changes and floor travel clean up held objects, including paused games.
- Other players see the held ball and both-hand poses without inheriting local weather.
- Camera-facing snowy parapets remain transparent and never intercept movement clicks.
- Small screens retain an accessible lower throw control without opening the menu.
