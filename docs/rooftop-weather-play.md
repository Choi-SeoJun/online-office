# Rooftop weather play

The shared solo/multiplayer controls use each player's current precipitation. Snow enables snowman, snow duck and snowball actions; rain enables puddle splashing. Weather changes are applied even while a menu pauses the game, and incompatible actions are cancelled cleanly. These are cosmetic activities, not measurements of real snow depth or flooding.

Snow and wet surfaces begin visibly covered when arriving in that weather, then retain the existing gradual accumulation/melting/drying. Snowman and duck crafting take 3.2 and 2.4 seconds; throwing and splashing take 1.6 and 1.5 seconds. Creations are limited to six per player and expire after 120 seconds of active simulation or when the player's weather stops being snowy. The game supports cancellation, floor travel, sitting-to-standing transitions, reduced motion and low visual quality.

The room protocol validates activity, effects and bounded creations. Other players see the action and objects, while their own local weather stays private and unchanged. Craft placement avoids roof obstacles, local creations and peer creations/previews. Stable participant priority resolves simultaneous active preview conflicts after room snapshots arrive; this is visual placement rather than a transactional game-world lock.

The solo welcome company-name field uses the existing saved profile and in-room settings. On mobile, a hidden rooftop guide can be restored inside the collapsible game menu; it has no floating restore control outside that menu.
