'use client';

import { CloudSun, LocateFixed, RefreshCw, Sunrise, Sunset, X } from 'lucide-react';
import { useMemo } from 'react';
import { Dialog } from 'radix-ui';
import { localDate, sunTimes, forecastLabel } from '@/game/environment';
import { KOREA_PROVINCES, koreaRegionById, koreaRegionPath, koreaRegionChildren, koreaChildLabel } from '@/game/korea-regions';
import type { useLocalWeather } from '@/hooks/use-local-weather';
import './weather-control.css';
import { restoreCollapsedMenuFocus } from './office-dialog-focus';

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
  const applied = koreaRegionById(region.id) ?? KOREA_PROVINCES[0].regions[0];
  const path = koreaRegionPath(applied.id);
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
      <Dialog.Content className="weather-dialog" onCloseAutoFocus={restoreCollapsedMenuFocus} onKeyDown={event => event.stopPropagation()}>
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
            {showForecast && <span>{forecastLabel(forecast)} · {Math.round(forecast.temperature)}°C</span>}
            {showForecast && <span>{forecast.source === 'kma' ? '기상청 초단기실황' : '보조 예보 · Open-Meteo'}</span>}
            {messages[status] && <span role="status">{messages[status]}</span>}
          </div>
        </div>
        <dl className="weather-sun">
          <div><dt><Sunrise size={16}/>일출</dt><dd>{today.sunrise === null ? '오늘 없음' : clock.format(today.sunrise)}</dd></div>
          <div><dt><Sunset size={16}/>일몰</dt><dd>{today.sunset === null ? '오늘 없음' : clock.format(today.sunset)}</dd></div>
        </dl>
        {showForecast && <p className="weather-note">날씨 자료 기준 · {date.format(forecast.observedAt)} {clock.format(forecast.observedAt)}<br/>마지막 확인 · {clock.format(forecast.fetchedAt)}</p>}
        <p className="weather-note">약 5분마다 새 날씨를 확인해요. 비·눈과 빗소리도 자동으로 바뀌어요.</p>
        <div className="weather-settings">
          <div className="weather-region-fields">
          <label>시·도
            <select value={applied.provinceId} onChange={event => {
              const next = koreaRegionById(event.currentTarget.value);
              if (next) selectRegion(next);
            }}>
              {KOREA_PROVINCES.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          {path.map((parent, index) => {
            const options = koreaRegionChildren(parent.id);
            if (!options.length) return null;
            return <label key={parent.id}>{koreaChildLabel(options)}
              <select value={path[index + 1]?.id ?? ''} onChange={event => {
                const next = koreaRegionById(event.currentTarget.value || parent.id);
                if (next) selectRegion(next);
              }}>
                <option value="">{parent.label} 대표 지점</option>
                {options.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>;
          })}
          </div>
          <button type="button" className="weather-action" disabled={locating} onClick={useCurrentLocation}>
            <LocateFixed size={16}/>{locating ? '위치 확인 중…' : '현재 위치 사용'}
          </button>
        </div>
        <p className="weather-note">{forecast?.source === 'kma'
          ? `비·눈과 기온은 기상청 관측 자료예요. ${forecast.skyKnown ? '구름 상태는 초단기예보로 보완해요.' : '구름 상태는 잠시 확인할 수 없어요.'} 관측·발표 시차와 동네별 차이가 있을 수 있어요.`
          : '기상청 연결이 어려우면 보조 예보를 표시해요. 예보 모델 자료라 실제 동네의 비·눈과 차이가 날 수 있어요.'}</p>
        <p className="weather-note">현재 위치를 사용하면 가장 가까운 읍·면·동 지점의 기상청 격자 날씨를 적용해요. 약 5km 격자라 이웃 동네는 같은 날씨일 수 있어요. 선택한 지역은 내 브라우저에만 기억하고 동료에게 공유하지 않아요.</p>
        {error && <p className="weather-error" role="alert">{error}</p>}
        <footer>
          <div className="weather-sources"><a href="https://www.data.go.kr/data/15084084/openapi.do" target="_blank" rel="noreferrer">날씨·지역 · 기상청</a>{forecast?.source !== 'kma' && <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">보조 예보 · Open-Meteo</a>}</div>
          <button type="button" className="weather-action" disabled={status === 'loading'} onClick={refresh}><RefreshCw size={14}/>새로고침</button>
        </footer>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
