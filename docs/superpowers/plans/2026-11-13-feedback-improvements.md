# Office feedback improvements

**Goal:** Keep punch/hammer, replace only the paper stack action with a paper throw; add own/company boss ranks; correct chair sitting height; give the boss long seated work periods with occasional patrols. Monitor image uploads are explicitly deferred.

**Design:** Reuse the existing shared solo/multiplayer engine and animation pipeline. Keep the `fan` wire ID for compatibility. Rank values use a fixed Korean company hierarchy, defaulting to 사원/부장 for existing data. The room creator selects the common boss rank; joining colleagues select only their own rank. Preserve private feedback and existing room/member data through additive database migration.

- [x] Shared rank types, validation, migration, server-authoritative common boss identity and chat/poke display.
- [x] Solo/multi entry selectors, profile persistence, visible labels and room restoration.
- [x] Detached paper flight/flutter, reduced motion, cleanup, and seat-cushion alignment tests.
- [x] Boss seated work/brief patrol/return loop, interruptible interactions and multiplayer synchronization.
- [x] Integrated tests (277), type check, both production builds and independent integration review.
- [ ] Browser visual QA: unavailable this turn after the computer-use service stopped on an unverifiable browser URL. Do not claim screenshot or visual verification. Responsive entry overflow and specificity were statically reviewed; seat contact and paper trajectories were checked with Three.js geometry tests.
- [ ] Append the upcoming 04:00 announcement; deploy the same verified commit to GitHub Pages and Sites; verify the public version.

The requested feedback records were read through the owner-authorized Sites database connector after browser access stopped. Private record text is not copied into public release notes. The November 14 04:00 batch contains the completed changes; monitor images remain deferred.
