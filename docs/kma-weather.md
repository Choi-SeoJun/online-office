# KMA current weather

The server uses the public data portal's [기상청_단기예보 조회서비스](https://www.data.go.kr/data/15084084/openapi.do), not the separate API Hub credential system.

- Set `KMA_SERVICE_KEY` as a **secret production runtime variable in Sites**, then deploy a saved version to apply its environment revision. Use the general Decoding key. Never put the value in Git, `.openai/hosting.json`, build definitions, browser storage or client requests.
- The existing `/api/weather` route reads `env.KMA_SERVICE_KEY`; only supported Korean representative coordinates are accepted. Anonymous game clients do not receive the key. Existing feedback secrets and authorization are independent.
- Source: October 19, 2026 official API guide in portal attachment `FILE_000000007732424`/`1`. `getUltraSrtNcst` supports ten-minute base times; allow ten minutes for publication, retry one preceding ten-minute cycle only when no data is available. KST dates are independent of the server timezone.
- PTY determines precipitation even when RN1 is zero. PTY 2/6 are labelled mixed precipitation and use the existing snow visual. PTY 0 stops precipitation; invalid/missing fields never become PTY 0. Temperature and wind come from T1H and WSD.
- `getUltraSrtFcst` supplies SKY only. Use the hourly :30 cycle after :45. Live validation on November 19 returned baseTime `1800` for a request for `1830`; accept up to thirty minutes of base normalization only for SKY. Select a valid forecast within one hour of current time. Missing SKY preserves valid observations and displays unknown sky rather than claiming clear weather.
- KMA observation source, PTY, sky availability and observation time survive local caching. Solar times use the existing local SunCalc calculation; KMA availability does not control day/night or seasons.
- Clients check approximately every five minutes and prefer the server. If it fails, use the existing public Open-Meteo model endpoint once, explicitly labelled **보조 예보 · Open-Meteo**. A server rate limit is respected. A successful response does not mean minute-by-minute exact weather at a user's address.
- Server results cache for five minutes; KMA calls also cache by operation/grid/base cycle and share in-flight requests. Bound all caches, concurrency, response size (64 KB) and upstream time (four seconds/call). Failures back off thirty seconds. Key-bearing redirects are refused; public errors/logs never include provider URLs, response bodies or keys.
- Cloudflare Workers does not support `redirect: 'error'`; use `manual` and reject all non-2xx responses before parsing. This keeps the key on the fixed provider origin without a runtime `TypeError`. See [Workers Request API](https://developers.cloudflare.com/workers/runtime-apis/request/).

## Verification

`node --test lib/kma-weather.test.ts lib/weather-http.test.ts game/weather-request.test.ts game/environment.test.ts`

Live pre-deploy verification: both KMA operations returned HTTP 200 / resultCode 00 for Cheonan grid 63,111 on 2026-11-19 at 18:48 KST. Observation 18:30 KST: PTY 0, T1H 1.7°C, WSD 3 m/s, SKY 4. This confirms credential/service compatibility, not local snowfall at another place or time.

The city representative is the mean of Dongnam-gu and Seobuk-gu points, matching the existing bundled selection. No raw geolocation is transmitted and multiplayer members retain independent region preferences.
