'use client';
import { useEffect, useRef, useState } from 'react';
import type { RoomSession } from '@/game/multi-types';
import { adoptRoomWallpaper, readWallpaperPreference, WALLPAPER_CHANGE_EVENT, WALLPAPER_STORAGE_KEY } from '@/game/wallpaper';
import { saveRoomWallpaper } from '@/game/wallpaper-client';
import { createWallpaperSync } from '@/game/wallpaper-sync';

export function usePersonalWallpaper() {
  const [image, setImage] = useState(() => readWallpaperPreference());
  useEffect(() => {
    const refresh = () => setImage(readWallpaperPreference());
    const storage = (event: StorageEvent) => { if (event.key === WALLPAPER_STORAGE_KEY || event.key === null) refresh(); };
    window.addEventListener('storage', storage); window.addEventListener(WALLPAPER_CHANGE_EVENT, refresh);
    refresh();
    return () => { window.removeEventListener('storage', storage); window.removeEventListener(WALLPAPER_CHANGE_EVENT, refresh); };
  }, []);
  return image;
}

export function usePersonalWallpaperInRoom(session: RoomSession, remoteId: string | null, remoteImage: string | null, onShared: () => void) {
  const personal = usePersonalWallpaper();
  const [status, setStatus] = useState<'saved' | 'syncing' | 'retrying'>('saved');
  const queue = useRef<ReturnType<typeof createWallpaperSync> | null>(null), callback = useRef(onShared); callback.current = onShared;
  const initial = useRef({ remoteId, remoteImage });
  initial.current = { remoteId, remoteImage };
  useEffect(() => {
    const sync = createWallpaperSync({
      initialImage: initial.current.remoteId ? initial.current.remoteImage ?? undefined : null,
      save: (image, signal) => saveRoomWallpaper(session, image, signal),
      onSaved: () => callback.current(), onStatus: setStatus,
    });
    queue.current = sync; sync.set(readWallpaperPreference());
    const online = () => sync.retry(); window.addEventListener('online', online);
    return () => { sync.dispose(); queue.current = null; window.removeEventListener('online', online); };
  }, [session.code, session.token]);
  useEffect(() => { queue.current?.set(personal); }, [personal]);
  // Bring forward an image set in an older, room-only version. Never resurrect a reset
  // or overwrite a newer choice made while the room image was being fetched.
  useEffect(() => {
    if (personal === undefined && remoteId && remoteImage) adoptRoomWallpaper(remoteImage);
  }, [personal, remoteId, remoteImage]);
  return { image: personal === undefined ? remoteImage : personal, status };
}
