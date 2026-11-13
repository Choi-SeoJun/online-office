'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { DEFAULT_REGION, environmentFrame } from '../game/environment.ts';
import { nearestKoreaRegion } from '../game/korea-regions.ts';
import type { WeatherForecast, WeatherRegion, WeatherStatus } from '../game/environment-types.ts';
import { normalizeRegion, readForecast, readRegion, regionKey, requestForecast, saveForecast, saveRegion, usableForecast, WEATHER_CACHE_AGE } from '../game/weather-client.ts';

const WEATHER_ERROR = '날씨 정보를 가져오지 못했어요. 잠시 후 다시 시도해 주세요.';
const LOCATION_ERROR = '현재 위치를 확인할 수 없어요. 지역을 직접 선택해 주세요.';

export function useLocalWeather() {
  const [region, setRegion] = useState(DEFAULT_REGION);
  const [weather, setWeather] = useState<{ forecast: WeatherForecast | null; status: WeatherStatus }>({ forecast: null, status: 'loading' });
  const [now, setNow] = useState(Date.now);
  const [error, setError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [locating, setLocating] = useState(false);
  const selected = useRef(DEFAULT_REGION);
  const active = useRef<AbortController | null>(null);
  const lastAttempt = useRef(0);
  const locationChoice = useRef(0);
  const lastForecast = useRef<{ region: string; forecast: WeatherForecast } | null>(null);

  const load = useCallback(async (next: WeatherRegion, force = false) => {
    active.current?.abort();
    active.current = null;
    const timestamp = Date.now();
    const key = regionKey(next);
    const memory = lastForecast.current?.region === key ? usableForecast(lastForecast.current.forecast, timestamp) : null;
    const cached = memory ?? readForecast(next, timestamp);
    setNow(timestamp);
    setError('');
    function resolveTimezone(forecast: WeatherForecast) {
      if (next.source !== 'location' || selected.current.timezone === forecast.timezone) return;
      const resolved = { ...next, timezone: forecast.timezone };
      selected.current = resolved;
      setRegion(resolved);
      saveRegion(resolved);
    }
    if (cached) resolveTimezone(cached);
    if (!force && cached && timestamp - cached.fetchedAt < WEATHER_CACHE_AGE) {
      lastAttempt.current = cached.fetchedAt;
      setWeather(previous => previous.forecast === cached && previous.status === 'live' ? previous : { forecast: cached, status: 'cached' });
      return;
    }
    setWeather({ forecast: cached, status: cached ? 'cached' : 'loading' });
    lastAttempt.current = timestamp;
    const controller = new AbortController();
    active.current = controller;
    const timer = window.setTimeout(() => controller.abort(), 15000);
    try {
      const forecast = await requestForecast(next, controller.signal);
      if (active.current !== controller) return;
      if (controller.signal.aborted) throw new Error('Weather request timed out');
      resolveTimezone(forecast);
      lastForecast.current = { region: key, forecast };
      saveForecast(next, forecast);
      setWeather({ forecast, status: 'live' });
      setNow(Date.now());
    } catch {
      if (active.current !== controller) return;
      const timestamp = Date.now();
      const fallback = usableForecast(cached, timestamp);
      setWeather({ forecast: fallback, status: fallback ? 'cached' : 'unavailable' });
      setNow(timestamp);
      setError(WEATHER_ERROR);
    } finally {
      window.clearTimeout(timer);
      if (active.current === controller) active.current = null;
    }
  }, []);

  const selectRegion = useCallback((value: WeatherRegion) => {
    const next = normalizeRegion(value);
    if (!next) return;
    locationChoice.current++;
    setLocating(false);
    setLocationError('');
    selected.current = next;
    setRegion(next);
    saveRegion(next);
    void load(next);
  }, [load]);

  const useCurrentLocation = useCallback(() => {
    const choice = ++locationChoice.current;
    setLocationError('');
    if (!navigator.geolocation) {
      setLocating(false);
      setLocationError(LOCATION_ERROR);
      return;
    }
    setLocating(true);
    function fail() {
      if (locationChoice.current !== choice) return;
      setLocating(false);
      setLocationError(LOCATION_ERROR);
    }
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      if (locationChoice.current !== choice) return;
      const next = nearestKoreaRegion(coords.latitude, coords.longitude);
      if (next) selectRegion({ ...next, source: 'location' });
      else { setLocating(false); setLocationError('가까운 대한민국 지역을 찾지 못했어요. 시·도를 직접 선택해 주세요.'); }
    }, fail, { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 });
  }, [selectRegion]);

  const refresh = useCallback(() => { void load(selected.current, true); }, [load]);
  const cancelLocation = useCallback(() => { locationChoice.current++; setLocating(false); setLocationError(''); }, []);

  useEffect(() => {
    const initial = readRegion();
    selected.current = initial;
    setRegion(initial);
    saveRegion(initial);
    void load(initial);

    function tick() {
      const timestamp = Date.now();
      setNow(timestamp);
      if (!document.hidden && timestamp - lastAttempt.current >= WEATHER_CACHE_AGE && !active.current) {
        void load(selected.current);
      }
    }
    function onOnline() {
      void load(selected.current, true);
    }
    function onVisibility() {
      if (document.hidden) return;
      tick();
      if (!active.current && Date.now() - lastAttempt.current >= 60000 && !readForecast(selected.current, Date.now())) onOnline();
    }
    const timer = window.setInterval(tick, 30000);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisibility);
      locationChoice.current++;
      const request = active.current;
      active.current = null;
      request?.abort();
    };
  }, [load]);

  const forecast = usableForecast(weather.forecast, now);
  const status = !forecast && (weather.status === 'live' || weather.status === 'cached') ? 'unavailable' : weather.status;
  const frame = environmentFrame(region, forecast, now);
  return { frame, region, forecast, status, error: locationError || error, locating, selectRegion, useCurrentLocation, cancelLocation, refresh };
}
