# KMA live weather implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Use KMA ultra-short observations for current rain/snow in both game modes, with the user's key stored only as a hosted runtime secret.

**Architecture:** The existing server weather endpoint calls KMA with `KMA_SERVICE_KEY`. The browser prefers that endpoint and uses explicitly labelled Open-Meteo fallback only on failure. KMA PTY overrides sky forecasts. Existing local solar calculations, region preferences and five-minute refresh remain intact.

**Tech stack:** TypeScript, React, Cloudflare Workers, Node test runner, Sites and GitHub Pages.

**Spec:** The user approved KMA ultra-short observations, server-private key registration, and preserving installed apps/the existing URL. Prior requirements retain local weather per player, Korean region selection and live effects without refresh.

## Global constraints
- No secret in source, URLs sent to the browser, build output or logs. Runtime Sites secret only.
- Keep existing owner-only feedback authorization unchanged.
- Accept only supported Korean regions/representative coordinates; bound cache, concurrency, response sizes and upstream deadlines.
- Preserve source/timestamp provenance across browser cache and mark model fallback clearly.
- Publish the same source commit to GitHub and Sites; append next 04:00 KST release batch.

## Review focus
- Snow/mixed precipitation must not be masked by cloudy sky or zero hourly precipitation.
- Missing, delayed, malformed or stale observations must not silently become clear weather.
- Midnight in KST must select a valid previous observation/forecast cycle.
- Many users selecting one city must share calls; arbitrary coordinates must not exhaust secret quota.
- Key-bearing provider redirects/errors must never appear in public responses or client bundles.

## Tasks
1. Secure credential intake and server adapter (`lib/kma-weather.ts`, tests).
   - Read official current guide; verify supported timestamps and codes.
   - Write failing tests for grid conversion, KST cycle rollover, PTY/sky mapping, missing values, data freshness and sanitization.
   - Implement bounded calls to fixed KMA endpoints; retry a previous cycle only for absent data; compute solar times locally.
2. Wire server/client (`lib/weather-http.ts`, route/types, `game/weather-client.ts`, provenance parser/cache).
   - Test server-first flow, fallback labels, cache deduplication, quota protection, cancellation and no key leakage.
   - Add runtime binding; expose only normalized weather values plus provenance. Preserve automatic refresh/render behavior.
3. UI, release and validation.
   - Show KMA source/observation time or explicit fallback; preserve existing controls.
   - Update docs and next daily release note.
   - Run full tests, TypeScript, both production builds, fresh independent review, live API and browser QA.
   - Commit, synchronize both hosts, verify public weather and same-source deployment.

## Progress
- Baseline: 398/398 tests passed. Clean checkout on focused `feat/kma-live-weather` branch.
- Ruling: use the existing Sites-managed isolated checkout with a focused branch, avoiding duplicate installation/runtime copies; no unrelated user changes present.
- Tasks 1–2 complete: adapter/routing tests RED → GREEN; live KMA credential validated and registered as a Sites secret (temporary protected input deleted). Live sky base normalization regression reproduced, then fixed and tested.
- Task 3 validation: 414/414 tests, TypeScript and both production builds passed. The existing scene refresh test now supplies browser location and exercises KMA-attributed rain/snow/cessation without scene recreation.
- Fresh read-only review found conflicting duplicate PTY rows and the KMA SKY 3 label. Both reproduced RED, then corrected: contradictory required observations are rejected regardless of order, SKY 3 displays 구름많음. Treat the label as accuracy within the user's request, not optional copy polish.
- Reviewer exclusions: deployment is verified by the owning session; cross-isolate quota is constrained by supported regions and per-isolate bounded cycle caches but remains subject to the provider allocation; installed-app update behavior is unchanged from the previously verified update watcher.
- Production verification caught a Workers-only incompatibility: `redirect:error` throws synchronously. Official Workers docs confirm only `manual`/`follow`; use manual with existing non-2xx rejection. Reproduced request contract RED before the fix. Public fallback remained available during repair.
- Final verification: 416/416 tests and TypeScript passed; actual local Workers runtime with provider HTTP fixtures returned 200, KMA snow and valid sky. Rebuilt the server after the compatibility fix; frontend build inputs are unchanged.
