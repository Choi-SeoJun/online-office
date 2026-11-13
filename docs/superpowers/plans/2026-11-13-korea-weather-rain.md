# Korea region selection and quiet rain

**Goal:** Select only Republic of Korea administrative regions, with direct special/metropolitan cities and province → city/county selection, plus soft rain ambience.
**Architecture:** Bundled official KMA administrative points; region IDs and hierarchy over the existing browser-local weather preference; existing optional Web Audio mixer consumes personal precipitation state.
**Spec:** User's Korean request, including Chungcheongnam-do Asan and Gangwon Hwacheon (officially a county). Preserve opt-in location, map it to a nearby domestic administrative area, never share with room members. Overseas saved selections fall back to Seoul. Province selection must not silently apply the first city; apply only after city/county choice. Keep manual selection usable without network.

## Global Constraints

Retain existing weather endpoint/provider, no new paid services, account, or runtime geocoder. Domestic region names and representative coordinates use attributable government data. Rain is optional, quiet, unpitched and fading; office quieter than rooftop. Respect sound/volume, pause, hidden tabs, stale weather and disposal. No new recurring alarm or UI sound toggle. Same behavior in solo and multi. Update upcoming 04:00 announcement and publish existing URLs.

## Tasks

1. Root: acquire and document official dataset; implement domestic hierarchy, selection migration and GPS nearest domestic point; common weather UI; behavioral tests.
2. Audio implementer: own game/audio.ts and game/audio.test.ts; add sync(state, precipitation = 'none') and quiet seamless rain noise with muted/offline/stale behavior controlled by supplied precipitation. Root connects personal frame at existing audio sync sites.
3. Root: integrate, test, preview province/county and responsive flow, review, package and publish same SHA to Sites and GitHub main.

## Review Focus

Complete domestic hierarchy; accurate official names; no accidental wrong city on province change; legacy preference migration; no raw GPS stored/sent; no sound before gesture; muted/hidden/paused/disposed behavior and seamless low-volume rain.
