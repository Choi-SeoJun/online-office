# Rooftop weather play

The shared solo/multiplayer controls use each player's current precipitation. Snow enables snowman, snow duck and snowball actions; rain enables puddle splashing. Weather changes are applied even while a menu pauses the game, and incompatible actions are cancelled cleanly. These are cosmetic activities, not measurements of real snow depth or flooding.

Snow and wet surfaces begin visibly covered when arriving in that weather, then retain gradual accumulation/melting/drying. Snow also covers all parapets, the stairwell and nearby building roofs, planter soil and leaf tops. Receiver footprints survive architecture batching; foreground parapet caps follow the wall's transparency. Low quality reduces leaf detail, and caps never participate in navigation.

Snowman and duck crafting take 3.2 and 2.4 seconds. Duck-mold grips are held by both hands. Making a snowball takes 1.8 seconds and sets a single session-only held ball; only then does the bottom dock offer throwing. Throwing takes 1.6 seconds and consumes the ball at release (55% progress). Cancelling before release and walking/resting retain it. Ending snow, floor travel and exiting clear it. Splashing takes 2.7 seconds with three hops and synchronized footfall bursts; reduced motion removes the bounce. Creations are limited to six per player and expire after 120 seconds of active simulation or when the player's weather stops being snowy.

The room protocol validates activity, effects and bounded creations. Other players see the action and objects, while their own local weather stays private and unchanged. Craft placement avoids roof obstacles, local creations and peer creations/previews. Stable participant priority resolves simultaneous active preview conflicts after room snapshots arrive; this is visual placement rather than a transactional game-world lock.

The solo welcome company-name field uses the existing saved profile and in-room settings. On mobile, a hidden rooftop guide can be restored inside the collapsible game menu; it has no floating restore control outside that menu.
