# Automatic regions, welcome fixes and rooftop weather play

User-approved scope: keep administrative/address names current without repeated omission reports; restore the solo company-name field; move mobile hidden rooftop-guide restore control into the menu; make snow visibly settled on snowy days and add snowman/snow duck/snowball and rain-puddle play. Preserve solo/multiplayer parity and per-player local weather, existing URLs, private feedback and KMA key.

## Tasks and interfaces

1. UI: restore a controlled company name in solo welcome, use profile command before enter and existing persistence; settings must update the welcome draft. Hidden rooftop guide has no floating mobile restore button; restore lives inside the existing mobile menu. Add weather play actions in shared controls. Consume `state.weatherKind` and command `{type:'weather-play',kind:'snowman'|'snowduck'|'snowball'|'splash'}`. Parent solo/multi components send `{type:'weather',precipitation: weather.frame.precipitation}` when weather changes.
2. Game: weather-conditioned activities, distinct character motions and props; snowman/duck creations are temporary and bounded, snowball has a visible arc and splash has ripples. Standing, interruption, floor travel, reduced motion, low quality and disposal must work. Extend multiplayer sanitized visual state so others see the action/creations; local weather still determines the player's available actions. Existing surface renderer starts snowy/rainy conditions with visible cosmetic coverage, not a measurement claim.
3. Regions: a cached public-data updater reads official MOIS releases and maintains a validated last-known-good catalog in existing server storage. Browser and weather backend use the same catalog; future aliases must be server-allowlisted. Poll daily in a hosted cloud task, plus refresh when used if overdue; source failures keep the last good catalog and retries bounded. Never ask players to supply codes or share precise location. New names lacking published KMA points explicitly use representative fallback points. Verify the unattended updater and saved schedule; no app-open-only reminder.
4. Integrate: meaningful engine/protocol/data tests, desktop/mobile UI QA, independent code review, next 04:00 Korean release notes, same checked source commit to GitHub and Sites. Confirm deployments and public weather/search/play UI.

## Review focus

- Official release discovery, changing code/date layouts, malformed/truncated upstream data: never replace valid data with incomplete regions.
- New saved region on a fresh browser/server, stale data and offline state: no silent reset to Seoul, no arbitrary client region/grid acceptance.
- Multiple administrative jurisdictions and future renamed/retired records: legal paths and old selections remain explainable.
- Weather changing during play, seats/travel/cancel and multiplayer desync: no stuck poses, invalid room payloads, or unbounded objects.
- Mobile collapsed controls and keyboard focus: restore controls remain reachable in the menu without overlay clutter.
