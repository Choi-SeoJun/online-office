# Office feel and rooftop implementation plan

> Implement the user's concrete requested fixes first, then the rooftop extension. Ongoing implementation and GitHub/public publishing are authorized in this chat.

**Goal:** Convincing toy-weapon and mouth-contact motions, editable work cells with keyboard sound, and a peaceful rooftop candy break with a turning scene transition.

**Architecture:** Keep the existing React/Three.js engine and public Sites deployment. Add explicit office/rooftop state and a simulation-clock transition; retain one renderer and switch architecture groups at the midpoint of a camera turn. No new dependencies or server data.

**Design decisions:** Keep the miniature visual style. Use a peach afternoon sky, distant city silhouettes, planters, a bench and a stairwell on the roof. The roof is solo and has a repeatable lollipop break, with a brief Korean thought bubble about letting work go. Existing inventory survives travel; unfinished consumption is cancelled without spending an item. Office NPCs pause while away. The user confirmed an Excel-like editable sheet. Cells are local browser data, not uploaded.

## 1. Requested corrections
- [x] models.ts + motion.test.ts: reproduce mouth offset; define mouth/prop contact landmarks; test rim/bite contact across headings and seated poses. Correct hand/arm and prop placement. Make an actual pleated paper fan and ridged toy hammer; test diagonal swing and contact.
- [x] audio.ts + new worksheet component: replace repetitive electronic beep with synthesized key click/body/release, short irregular typing bursts only at the working desk, plus direct-input sounds. Respect mute, volume, visibility, pauses and dispose.
- [x] office-game.tsx: embed editable cells, preserve text across mode changes, no movement shortcuts while editing. Reset clears worksheet data.
- [x] Run the regression suite and type check before adding roof behavior.

## 2. Roof extension
- [x] types.ts + engine.ts: Floor='office'|'rooftop'; transition={from,to,remaining,duration}; travel command; candy activity/pose. Block world interactions during travel, swap floor at halfway, allow settings/pause, restore safe office return point, cap roof walking inside railings. Reset/exit clear transition. Test repeat travel, blocked commands, paused transition, cancellation and inventory.
- [x] rooftop.ts + scene.ts: separate architecture group and player root; office NPCs hidden on roof; pick only visible floor. Rotate camera horizontally with smooth easing and a brief fade at midpoint; reduced motion uses short fade without rotation. Reuse same renderer/resources, dispose both groups.
- [x] UI: show '옥상으로' only in office and '사무실로' only on roof; roof action dock offers '사탕 빨기'. Transition overlay/input lock, floor label, unobscured mobile controls and accessible status.
- [x] models.ts: candy stick/head brought to mouth, held with relaxed shoulders, removed on cancel/return. Geometry contact test.

## Verification and publication
- [x] Independent review; engine/audio/motion/worksheet tests, type check, production build.
- [x] Browser desktop/mobile-width checks: hammer, visible fan, cup/snack mouth alignment, typing/editing Korean cells, roof round trip/candy, reduced-motion and mute behavior. Test anonymous asset loading after publish.
- [ ] Commit/push exact source to GitHub main and hosting source; keep public audience and deploy existing Site. Record practical verification limits and publish link.

**Review focus:** No phantom office interactions from roof; no lost inventory on travel; no teleport during paused/duplicate travel; no WASD/Space gameplay while typing Korean; no unbounded audio scheduling or hidden props after cancel.

## Progress

Implementation, independent review, 54 regression checks, type check, production build and browser checks complete. Publication remains the final step. The work used a clean dedicated branch in the existing checkout; no user changes were present. Existing user authorization covers implementation and GitHub/public deployment.
