# Korean weather region data

Source: Korea Meteorological Administration (기상청), **기상청41_단기예보 조회서비스_오픈API활용가이드_격자_위경도(2610).xlsx**, sheet `최종 업데이트 파일_20260930`, downloaded 2026-11-13 from the [official public data portal](https://www.data.go.kr/data/15084084/openapi.do). Portal attachment `FILE_000000007732424`, detail `1`, ZIP SHA-256 `9dfd7dc2d422318154d3484fb00142afa3c5271fc14d079adf997043a14b86ba`.

The portal permits reuse with source attribution (Public Nuri Type 1, as indicated on its listing). Visible attribution is included in the weather panel. These are **region representative points**, not surveyed boundaries or exact local observations. Actual weather continues to use Open-Meteo's model data.

The generated `game/korea-region-points.ts` selects `kor` rows, omits marine-only Ieodo, and uses province and second-level administrative rows. A city split into non-autonomous districts is combined into a single city; its coordinate is the arithmetic mean of those district representative points. Coordinates are rounded to two decimals. Seoul and ordinary metropolitan cities, plus Sejong, are direct choices. Jeju provides Jeju-si and Seogwipo-si.

The 2026 source includes **전남광주통합특별시**, established on 2026-07-01 ([official city site](https://www.jeonnam-gwangju.go.kr/)). It has a direct representative selection and optional constituent cities/counties/districts. Its broader area must not be silently collapsed to the former Gwangju footprint. Older Gwangju preference maps to the former city area's Seo-gu representative point. Other known old domestic choices migrate; foreign preferences fall back to Seoul.

Opt-in geolocation resolves locally to the nearest bundled domestic representative point. No raw device coordinates are stored or sent. A broad regional eligibility envelope prevents far-away foreign locations from selecting a Korean point; it is not a legal-border geofence. The selected domestic name is always visible, and manual selection is available. Only the representative point goes to the weather endpoint. Room payloads remain unchanged.
