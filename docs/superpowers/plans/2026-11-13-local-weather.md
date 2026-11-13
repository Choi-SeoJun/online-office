# Personal weather implementation plan

**Goal:** Give each player a real local day/night, sunset, season and weather atmosphere.
**Architecture:** Pure environment model and browser-local hook; fixed Open-Meteo HTTP adapter; reusable Three.js environment renderer; common weather settings UI in both modes.
**Tech Stack:** React, Three.js, TypeScript, SunCalc, existing Cloudflare Worker and GitHub Pages.
**Spec:** ../specs/2026-11-13-local-weather-design.md

## Global Constraints

No precise location persistence or multiplayer synchronization. No automatic location permission prompt. No invented live weather. Preserve cutaway materials, resource disposal, room capacity rebuilds and modal pause guards. Do not change private admin access. Existing authorization covers publication.

## Tasks

1. Data model/hook: implement game/environment.ts, hooks/use-local-weather.ts and behavioral tests against environment-types.ts. Add SunCalc pinned dependency. Cache 15 minutes, bounded stale weather, abort region races, current real clock.
2. Scene rendering: game/environment-scene.ts and integrate scene.ts, multi-scene.ts, types.ts, rooftop.ts. Consume optional callbacks.getEnvironment(): EnvironmentFrame. Keep all GL resources owned/disposed and weather outside.
3. Common WeatherControl UI and solo/multi integration: consume hook; responsive dialog and compact trigger; manual regions and explicit location; include modal guards. Files components/weather-control.tsx, office-game.tsx, multiplayer-room.tsx and scoped CSS.
4. Owner: public fixed weather endpoint, validation/cache/CORS tests, release note, integration checks, visual QA, review and publish.

## Review Focus

Time zones, midnight/polar sun, stale/current labels, permission and latest-region races, no location in room payloads, renderer resource ownership, mobile layout, night readability, low-quality/reduced-motion particles.
