'use client';

import { CloudSun, LocateFixed, RefreshCw, Sunrise, Sunset, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Dialog } from 'radix-ui';
import { localDate, sunTimes, weatherLabel } from '@/game/environment';
import { KOREA_PROVINCES, koreaRegionById } from '@/game/korea-regions';
import type { useLocalWeather } from '@/hooks/use-local-weather';
import './weather-control.css';

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
  const { frame, region, forecast, status, error, locating, selectRegion, useCurrentLocation, cancelLocation, refresh } = weather;
  const [draft, setDraft] = useState<{ provinceId: string; regionId: string | undefined } | null>(null);
  const applied = koreaRegionById(region.id) ?? KOREA_PROVINCES[0].regions[0];
  const provinceId = draft && draft.regionId === region.id ? draft.provinceId : applied.provinceId;
  const province = KOREA_PROVINCES.find(item => item.id === provinceId) ?? KOREA_PROVINCES[0];
  const needsDistrict = province.regions.length > 1;
  const districtValue = applied.provinceId === province.id ? applied.id : '';
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

  return <Dialog.Root onOpenChange={open => { setDraft(null); onOpenChange(open); }}>
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
          <div className="weather-region-fields">
          <label>시·도
            <select value={province.id} onChange={event => {
              cancelLocation();
              const next = KOREA_PROVINCES.find(option => option.id === event.currentTarget.value);
              if (!next) return;
              if (next.direct) { setDraft(null); selectRegion(next.regions[0]); }
              else setDraft({ provinceId: next.id, regionId: region.id });
            }}>
              {KOREA_PROVINCES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {needsDistrict && <label>{province.direct ? '시·군·구 (선택)' : '시·군'}
            <select value={districtValue} onChange={event => {
              const next = province.regions.find(item => item.id === event.currentTarget.value);
              if (next) { setDraft(null); selectRegion(next); }
            }}>
              <option value="" disabled>시·군을 선택해 주세요</option>
              {province.regions.map(item => <option key={item.id} value={item.id}>{item.district ?? '대표 지역'}</option>)}
            </select>
          </label>}
          </div>
          <button type="button" className="weather-action" disabled={locating} onClick={() => { setDraft(null); useCurrentLocation(); }}>
            <LocateFixed size={16}/>{locating ? '위치 확인 중…' : '현재 위치 사용'}
          </button>
        </div>
        {needsDistrict && !districtValue && <p className="weather-note" role="status">시·군을 선택하면 날씨가 적용돼요.</p>}
        <p className="weather-note">선택한 지역의 대표 지점 날씨예요. 현재 위치를 사용하면 가까운 국내 지역을 찾아요. 선택한 지역은 내 브라우저에만 기억하고 동료에게 공유하지 않아요.</p>
        {error && <p className="weather-error" role="alert">{error}</p>}
        <footer>
          <div className="weather-sources"><a href="https://open-meteo.com/" target="_blank" rel="noreferrer">날씨 · Open-Meteo</a><a href="https://www.data.go.kr/data/15084084/openapi.do" target="_blank" rel="noreferrer">지역 자료 · 기상청</a></div>
          <button type="button" className="weather-action" disabled={status === 'loading'} onClick={refresh}><RefreshCw size={14}/>새로고침</button>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
