# Continuous wall rest and clear text

User scope: readable bubble text, leaning anywhere along all four rooftop edges, a contextual nearby lean action, and automatic nearest-wall leaning when the action is used farther away.

- Make character labels sufficiently large, high contrast and unaffected by scene tone mapping/fog. Increase DOM bubble text size/weight and use opaque backgrounds. Preserve the visual style and name changes.
- Replace four fixed rest positions with projection onto the continuous inner wall lines. Choose the nearest valid wall point by current position; an actual wall click preserves its tangential coordinate. Clamp safely at corners and avoid obstacles. Keep independent candy and existing poses.
- Move perimeter furniture slightly inward using shared geometry/navigation constants so a continuous walkway and all four leaning lines remain accessible. Keep bench, bin and stairwell.
- New `getRoofLean(point, preferredWall?)` returns wall, projected point and distance. `ROOF_LEAN_DISTANCE=.9` drives a contextual button. `roofLeanPoint` carries the chosen destination to arrival and selection ring. Generic wall rest command finds nearest wall; the old four-direction picker is removed. Near-wall interaction is also available with E.
- Test multiple positions per side, nearest-wall choices, corners, invalid inputs, clicked coordinates, arrival/cancel/pause/candy, and complete route access around moved furniture. Run full tests/typecheck/build and independent review; inspect native and narrow/large screens.
- Push the exact verified commit to existing GitHub main and publish to the same public anonymous-play URL. No dependencies or audience changes.
