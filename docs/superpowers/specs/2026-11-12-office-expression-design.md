# Shared office, rest, and expression

User-authorized update to the existing game and both public deployments.

## Behavior
- Remote chair spin and its seated avatar use one activity progress/rotation and finish together.
- Floating signs remain sharp and visible when orbiting the office and roof. They already billboard; they must not be hidden by walls or intercept movement clicks.
- Several pantry chairs and distinct roof bench places replace singleton seating. A server-enforced reservation prevents two members sitting in the same spot; release on leaving, movement, standing, floor change, or stale membership.
- A separate office bulletin board supports text information, colored sticky notes, and pointer/touch doodles. User chose same-room sharing and solo personal storage. Solo saves in the current browser; shared posts survive refresh for the room lifetime (24h), visible only to authenticated room participants. Author may remove own posts; host may remove room posts. No public global board or private feedback exposure.
- An explicit dance action stands the player up and shows a rotating mirrorball, gentle colored lights, and a spotlight around that player. Other members see it too. Stop/cancel/move/travel exits. Respect reduced motion; no new repeating sound.
- Working at the desk visibly types and occasionally pauses to slump/sigh at the monitor. Shared actor animation provides solo/remote parity and leaves personal To Dos private.

## Constraints
Preserve Korean UI, existing game actions, personal To Dos, private feedback authorization, room limits, existing sounds and audience. No new dependencies required. Use Three.js procedural assets and existing React dialog primitives. Cap room board storage and drawing size; parameterized SQL; server membership and ownership checks; exact-origin CORS. Accessible mobile modal and no movement while editing.

## Acceptance
Two clients show coherent chair spins, dance, typing, and separate occupied seats. Signs stay visible across rotation. Board text/sticky/drawing create, reload, delete and room privacy work; solo persists locally. Builds, regression suite, focused concurrency/auth tests and browser QA pass before publishing the same commit to GitHub and Sites.
