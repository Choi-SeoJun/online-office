# Local weather operations

Each browser owns its region and forecast cache. The room protocol never includes location, forecast or environmental state. Geolocation is requested only from the explicit control, then resolved locally to a named Korean administrative region. Only that region's representative coordinates are stored or sent for weather; raw GPS coordinates are discarded. Default Seoul is labeled as a default, not detected location. See [Korean region data and migration](korea-weather-regions.md) for coverage and provenance.

`GET /api/weather?latitude=...&longitude=...` uses a fixed Open-Meteo forecast URL. It supports the existing Sites origin and GitHub Pages origin, does not read identity, cookies or room tokens, and uses no D1/R2 storage. Requests are deduplicated in each Worker isolate, cached for 15 minutes, bounded to 256 entries and 20 concurrent upstream calls; Cloudflare subrequest cache is enabled for 15 minutes. No coordinates are returned in its response. Application code does not log coordinates. Infrastructure request logs may include the rounded query.

The weather provider's current-model data is not a guarantee of conditions at a particular building. Day/night uses SunCalc astronomical calculations even if the weather provider is unavailable. Weather data is validated and stale precipitation is discarded. Neither winter nor missing weather automatically creates snow/rain.

Open-Meteo's free endpoint is for non-commercial use and has usage limits. The current free hobby deployment uses that endpoint with visible attribution. Before introducing monetization or exceeding provider quotas, arrange the appropriate provider plan and server-only credentials; never put provider secrets in the static Pages build.

References: [Open-Meteo forecast](https://open-meteo.com/en/docs), [terms and limits](https://open-meteo.com/en/pricing), [SunCalc](https://github.com/mourner/suncalc), [browser geolocation](https://developer.mozilla.org/en-US/docs/Web/API/Geolocation/getCurrentPosition).
