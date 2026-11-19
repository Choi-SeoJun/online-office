# Local weather operations

Each browser owns its region and forecast cache. The room protocol never includes location, forecast or environmental state. Geolocation is requested only from the explicit control, then resolved locally to a named Korean administrative region. Only that region's representative coordinates are stored or sent for weather; raw GPS coordinates are discarded. Default Seoul is labeled as a default, not detected location. See [Korean region data and migration](korea-weather-regions.md) for coverage and provenance.

The browser requests the fixed public Open-Meteo CORS endpoint first, using only the selected Korean region's rounded representative coordinates. Cookies and referrer are omitted. A valid result is saved in a five-minute browser cache; unavailable weather can use a valid cached result for up to two hours. Raw GPS, room membership and identity are never included.

While the game is visible and online, a 30-second clock checks whether the next five-minute weather refresh is due. Newly fetched weather immediately feeds both solo and multiplayer render loops and the audio controller: office window rain/snow, rooftop particles, lighting and rain ambience update without a page reload or changing floors. Roof puddles/snow retain their gradual drying/melting behavior. The weather API publishes modeled conditions on its own schedule, so this is automatic polling rather than instant local rainfall detection.

Hidden/offline tabs make no periodic requests. Visibility/focus catch up once when due, and an online event refreshes after reconnection. Transient failures retry after one minute, then two, four and up to five minutes; valid cached conditions stay available during failures. Requests never overlap, returning to a tab never replays missed intervals, and unmounting removes timers/listeners and aborts the active request.

If the direct connection fails, times out or returns unusable data, the browser tries `GET /api/weather?latitude=...&longitude=...` once. The direct attempt has a six-second budget and the server fallback seven seconds, within the hook's existing fifteen-second deadline. Changing region or leaving aborts the active request and prevents a fallback. A direct 429 stops immediately instead of retrying the visitor's provider limit through the server.

The fallback supports the existing Sites origin and GitHub Pages origin, does not read identity, cookies or room tokens, and uses no D1/R2 storage. Requests are deduplicated in each Worker isolate, cached for five minutes, bounded to 256 entries and 20 concurrent upstream calls; Cloudflare subrequest cache is enabled for five minutes. No coordinates are returned in its response. Failure diagnostics log only the stage and upstream HTTP status, never coordinates, headers or provider response bodies. Infrastructure request logs may include the rounded query.

## November 19, 2026 incident

Production `/api/weather` returned 503 for Asan and Seoul while the same URL parameters and Worker build returned 200 from the local network. Production diagnostics at 05:50 UTC confirmed an upstream response of 429. The public API returned 200 with CORS enabled from the browser's network. Relying exclusively on the hosting server made its provider quota failure affect every visitor; direct browser requests remove that shared point of failure while retaining the proxy as a bounded fallback. Open-Meteo documents rate limits per IP/application and Cloudflare Worker identification; this incident confirms a hosted upstream rate limit, not the exact traffic that consumed it.

The weather provider's current-model data is not a guarantee of conditions at a particular building. Day/night uses SunCalc astronomical calculations even if the weather provider is unavailable. Weather data is validated and stale precipitation is discarded. Neither winter nor missing weather automatically creates snow/rain.

Open-Meteo's free endpoint is for non-commercial use and has usage limits. The current free hobby deployment uses that endpoint with visible attribution. Before introducing monetization or exceeding provider quotas, arrange the appropriate provider plan and server-only credentials; never put provider secrets in the static Pages build.

References: [Open-Meteo forecast](https://open-meteo.com/en/docs), [terms and limits](https://open-meteo.com/en/pricing), [SunCalc](https://github.com/mourner/suncalc), [browser geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).
