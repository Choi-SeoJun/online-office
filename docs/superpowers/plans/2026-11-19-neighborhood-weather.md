# Neighborhood weather implementation plan

> **For agentic workers:** Use superpowers:executing-plans for inline implementation and a fresh whole-branch review.

**Goal:** Select Korean districts and neighborhoods, and resolve opt-in device location to the nearest official neighborhood weather point.

**Architecture:** Extend the existing KMA catalogue with the official September 30, 2026 administrative grid workbook. Keep legacy city selections and coordinates compatible, use authoritative region IDs and grid coordinates for new requests, and render only applicable hierarchy levels.

**Tech Stack:** TypeScript, React, Cloudflare Worker, Python/openpyxl for reproducible data generation.

**Spec:** User request of November 19: 시·군 다음 구·동 선택, current-location nearest point; existing domestic-only, local preference and five-minute refresh requirements remain.

## Constraints and review focus

- Preserve both public URLs, solo/multiplayer, private server key, and the existing app update mechanism.
- Province/city/district changes must discard stale child selections; metros and Sejong must skip redundant levels.
- Legacy city preferences and requests from older installed clients must still work.
- Precise coordinates near grid boundaries must use the workbook grid, not rounded city coordinates.
- Nearest-point lookup must use neighborhood points, never city/province centers. Raw GPS stays in the browser.
- Distinct nearby neighborhoods must not reuse the wrong local forecast cache; same KMA grid requests may share upstream work.

## Steps

- [x] Add failing hierarchy, nearest-point, cache separation and region-ID API tests.
- [x] Generate a compact full administrative-point catalogue with a checked source hash; preserve existing city IDs and add parent/level/grid metadata. Add hierarchy helpers and nearest-neighborhood lookup.
- [x] Send known IDs to the server, resolve authoritative grids, retain legacy-coordinate requests, and partition browser caches by region ID.
- [x] Render province → city/county → district → neighborhood as applicable, with optional representative selections and current-location selection reflected in every field. Use high-accuracy opt-in GPS.
- [x] Update attribution/data documentation and the November 20 04:00 announcement.
- [ ] Run tests, TypeScript, both builds, responsive browser QA and fresh review. Commit, integrate main, push GitHub, publish the same source to Sites, and verify live neighborhood weather.

## Verification before publication

423 tests passed; TypeScript and both builds passed. Browser QA confirmed Cheonan's four levels, Seoul's district path, Sejong's direct neighborhood selection, clearing descendants on province changes, 390px mobile scrolling, and restoring a selected neighborhood after reload. Fresh review found one legacy-cache migration issue; a failing offline-upgrade regression test was added and the fix passed the full suite. No deferred review findings. Deployment status is verified in the task's final response.
