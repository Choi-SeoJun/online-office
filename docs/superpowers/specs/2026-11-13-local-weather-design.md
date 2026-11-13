# Personal local sky and weather

Implement real date/time, seasonal atmosphere, sunrise/sunset and current regional weather in both office and rooftop. Multiplayer uses each viewer's region, as explicitly chosen by the user. Preserve all room state and interactions.

Use a local astronomical sun calculation so day/night continues offline. Open-Meteo current forecast supplies weather, cloud cover and sunrise/sunset, fetched through a fixed-upstream public weather endpoint with bounded caching. Current location is opt-in via browser permission, rounded to two decimals before transmission/storage; region preferences remain browser-local and are never included in room messages. Default region is explicitly Seoul. Offer manual city selection without geolocation permission. Show unavailable/stale states honestly.

Office windows show changing sky and sunset floor light; retain readable indoor lighting at night. Rooftop shows sky gradient, dusk/night and bounded rain/snow outside only. Seasonal colors do not invent snowfall. Respect reduced motion and low quality. Data source attribution in weather panel.

Update the upcoming 04:00 KST announcement. Validate model boundaries, network failures, privacy, both scenes and responsive UI. Publish identical source to existing Sites and GitHub Pages.
