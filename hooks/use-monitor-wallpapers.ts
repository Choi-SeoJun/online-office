'use client';
import { useEffect, useRef, useState } from 'react';
import type { RoomPlayer, RoomSession } from '@/game/multi-types';
import { fetchRoomWallpaper } from '@/game/wallpaper-client';
import { validWallpaperId } from '@/game/wallpaper';

export function useMonitorWallpapers(session: RoomSession, players: RoomPlayer[]) {
  const cache = useRef(new Map<string, string>());
  const [, refresh] = useState(0);
  const ids = JSON.stringify([...new Set(players.map(player => player.wallpaperId).filter(validWallpaperId))].sort());
  useEffect(() => {
    cache.current.clear(); refresh(value => value + 1);
  }, [session.code, session.token]);
  useEffect(() => {
    const wanted = JSON.parse(ids) as string[], abort = new AbortController(), pending = new Set<string>();
    for (const id of cache.current.keys()) if (!wanted.includes(id)) cache.current.delete(id);
    const load = () => {
      for (const id of wanted) {
        if (cache.current.has(id) || pending.has(id)) continue;
        pending.add(id);
        void fetchRoomWallpaper(session, id, abort.signal).then(image => {
          if (!abort.signal.aborted) { cache.current.set(id, image); refresh(value => value + 1); }
        }).catch(() => { /* Retry transient failures without interrupting play. */ }).finally(() => pending.delete(id));
      }
    };
    load(); const timer = window.setInterval(load, 5000);
    return () => { abort.abort(); window.clearInterval(timer); };
  }, [session.code, session.token, ids]);
  const screens = new Map<number, string>();
  for (const player of players) {
    const image = player.wallpaperId ? cache.current.get(player.wallpaperId) : undefined;
    if (image) screens.set(player.seatIndex, image);
  }
  return screens;
}
