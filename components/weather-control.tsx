'use client';

import { CloudSun, LocateFixed, RefreshCw, Sunrise, Sunset, X } from 'lucide-react';
import { useMemo } from 'react';
import { Dialog } from 'radix-ui';
import { DEFAULT_REGION, WEATHER_REGIONS, localDate, sunTimes, weatherLabel } from '@/game/environment';
import type { useLocalWeather } from '@/hooks/use-local-weather';
import './weather-control.css';

const regions = [DEFAULT_REGION, ...WEATHER_REGIONS.filter(city => city.name !== DEFAULT_REGION.name)];
const seasons = { spring: '봄', summer: '여름', autumn: '가을', winter: '겨울' };
const messages = {
  loading: '날씨를 불러오고 있어요.',
  live: '',
  cached: '마지막으로 받은 날씨를 표시하고 있어요.',
  unavailable: '지금은 날씨를 불러올 수 없어요. 하늘은 지역 시간에 따라 계속 바뀌어요.',
};

export function WeatherControl({ weather, onOpenChange }: {
  weather: ReturnType<typeof useLocalWeather>;
  onOpenChange: (open: boolean) => void;
}) {
  const { frame, region, forecast, status, error, locating, selectRegion, useCurrentLocation, refresh } = weather;
  const showForecast = forecast && (status === 'live' || status === 'cached');
  const timezone = forecast?.timezone ?? region.timezone;
  const { date, clock } = useMemo(() => ({
    date: new Intl.DateTimeFormat('ko-KR', { timeZone: timezone, year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }),
    clock: new Intl.DateTimeFormat('ko-KR', { timeZone: timezone, hour: 'numeric', minute: '2-digit' }),
  }), [timezone]);
  const today = useMemo(() => {
    const dateKey = localDate(frame.now, timezone);
    return forecast?.days.find(day => day.date === dateKey) ?? sunTimes({ ...region, timezone }, frame.now);
  }, [forecast, frame.now, region, timezone]);

  return <Dialog.Root onOpenChange={onOpenChange}>
    <Dialog.Trigger asChild>
      <button type="button" className="icon-button weather-trigger" aria-label="지역 시간과 날씨" title="지역 시간과 날씨">
        <CloudSun size={19}/>
      </button>
    </Dialog.Trigger>
    <Dialog.Portal>
      <Dialog.Overlay className="weather-overlay"/>
      <Dialog.Content className="weather-dialog" onKeyDown={event => event.stopPropagation()}>
        <header>
          <Dialog.Title>내 지역의 하늘</Dialog.Title>
          <Dialog.Close asChild><button type="button" className="icon-button" aria-label="날씨 닫기"><X size={18}/></button></Dialog.Close>
        </header>
        <Dialog.Description className="weather-time">
          {date.format(frame.now)} · {clock.format(frame.now)} · {seasons[frame.season]}
        </Dialog.Description>
        <div className="weather-summary">
          <CloudSun size={30} aria-hidden="true"/>
          <div>
            <strong>{region.name}{region.source === 'default' && ' (기본)'}</strong>
            {showForecast && <span>{weatherLabel(forecast.code)} · {Math.round(forecast.temperature)}°C</span>}
            {messages[status] && <span role="status">{messages[status]}</span>}
          </div>
        </div>
        <dl className="weather-sun">
          <div><dt><Sunrise size={16}/>일출</dt><dd>{today.sunrise === null ? '오늘 없음' : clock.format(today.sunrise)}</dd></div>
          <div><dt><Sunset size={16}/>일몰</dt><dd>{today.sunset === null ? '오늘 없음' : clock.format(today.sunset)}</dd></div>
        </dl>
        {showForecast && <p className="weather-note">날씨 업데이트 · {date.format(forecast.fetchedAt)} {clock.format(forecast.fetchedAt)}</p>}
        <div className="weather-settings">
          <label>날씨 지역
            <select value={region.source === 'location' ? '' : region.name} onChange={event => {
              const city = regions.find(option => option.name === event.currentTarget.value);
              if (city) selectRegion(city);
            }}>
              {region.source === 'location' && <option value="">현재 위치</option>}
              {regions.map(city => <option key={city.name} value={city.name}>{city.name}{city.source === 'default' && ' (기본)'}</option>)}
            </select>
          </label>
          <button type="button" className="weather-action" disabled={locating} onClick={useCurrentLocation}>
            <LocateFixed size={16}/>{locating ? '위치 확인 중…' : '현재 위치 사용'}
          </button>
        </div>
        <p className="weather-note">대략적인 위치로 Open-Meteo 날씨를 조회해요. 위치는 내 브라우저에만 기억하고 동료에게 공유하지 않아요.</p>
        {error && <p className="weather-error" role="alert">{error}</p>}
        <footer>
          <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">날씨 데이터 제공 · Open-Meteo</a>
          <button type="button" className="weather-action" disabled={status === 'loading'} onClick={refresh}><RefreshCw size={14}/>새로고침</button>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
