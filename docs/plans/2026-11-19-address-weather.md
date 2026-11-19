# Address-name weather selection

Use the user's approved direction: legal address names and current administrative names both select a known weather region, with explicit choices when an address spans administrative neighborhoods. Keep the existing public URLs, local-only preferences, automatic refresh and private KMA key.

1. Generate a checked catalog from the MOIS 2026-11-11 legal/admin/mapping ZIP. Validate every legal 읍·면·동 and all current administrative entries; preserve KMA grids and legacy IDs.
2. Register address/admin pairs as stable allowlisted IDs. Add search and hierarchical selection, show administrative jurisdiction and representative-point fallbacks. Exclude aliases, retired entries and copied coordinates from GPS nearest-point candidates.
3. Verify ambiguous names, recent changes, nationwide coverage, saved preferences and server validation. Inspect desktop/mobile UI. Update the next 04:00 release batch and source attribution.
4. Review, build, synchronize one verified source SHA to Sites and GitHub, deploy backend before Pages, and confirm public selection and weather requests.

New administrative regions without their own published KMA point use an explicitly labelled existing representative point. No invented precise coordinates or boundary claims. Retired 고덕동 remains readable for old preferences, but new selections offer 고덕1동/고덕2동.
