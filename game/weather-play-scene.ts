import * as THREE from 'three';
import type { GameState, Settings, WeatherCreation } from './types.ts';
import { isWeatherPlayPoint, weatherCraftPoint, WEATHER_CREATION_LIMIT } from './weather-play.ts';

/** Shared geometry, bounded per-person props; never participates in navigation. */
export function createWeatherPlayScene(roof: THREE.Group) {
  const root = new THREE.Group(); root.name = 'weather-play'; root.userData.pointerPassthrough = true; root.userData.dynamic = true; roof.add(root);
  const sphere = new THREE.SphereGeometry(1, 12, 8), cone = new THREE.ConeGeometry(1, 1, 8), box = new THREE.BoxGeometry(1, 1, 1), ring = new THREE.RingGeometry(.87, 1, 24), circle = new THREE.CircleGeometry(1, 32);
  const snow = new THREE.MeshStandardMaterial({ color: '#f6fbff', roughness: .92 }), dark = new THREE.MeshStandardMaterial({ color: '#263b42', roughness: .75 });
  const orange = new THREE.MeshStandardMaterial({ color: '#ed9b45' }), scarf = new THREE.MeshStandardMaterial({ color: '#d16a5e' });
  const water = new THREE.MeshStandardMaterial({ color: '#86bdcf', roughness: .17, metalness: .1, transparent: true, opacity: .56, depthWrite: false });
  const glint = new THREE.MeshBasicMaterial({ color: '#d8f4ff', transparent: true, opacity: .75, depthWrite: false });
  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number, sx: number, sy = sx, sz = sx) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  };
  const sculpture = (kind: WeatherCreation['kind']) => {
    const group = new THREE.Group();
    if (kind === 'snowman') {
      add(group, sphere, snow, 0, .32, 0, .38, .33, .35); add(group, sphere, snow, 0, .76, 0, .27);
      add(group, sphere, dark, -.09, .81, .235, .027); add(group, sphere, dark, .09, .81, .235, .027);
      const nose = add(group, cone, orange, 0, .75, .31, .055, .22, .055); nose.rotation.x = Math.PI / 2;
      add(group, box, scarf, 0, .56, 0, .5, .09, .43); add(group, box, scarf, .16, .44, .27, .09, .28, .06);
      for (const y of [.2, .34, .45]) add(group, sphere, dark, 0, y, .32, .025);
      for (const side of [-1, 1]) { const arm = add(group, box, dark, side * .42, .49, 0, .34, .035, .035); arm.rotation.z = side * .32; }
    } else {
      add(group, sphere, snow, 0, .17, 0, .28, .18, .34); add(group, sphere, snow, 0, .39, .13, .18);
      add(group, sphere, orange, 0, .37, .31, .13, .045, .14);
      add(group, sphere, dark, -.125, .43, .24, .021); add(group, sphere, dark, .125, .43, .24, .021);
      add(group, sphere, snow, -.24, .2, -.03, .055, .11, .18); add(group, sphere, snow, .24, .2, -.03, .055, .11, .18);
      const tail = add(group, cone, snow, 0, .22, -.3, .13, .23, .13); tail.rotation.x = -.7;
    }
    return group;
  };
  const actors = new Map<string, { group: THREE.Group; creations: Map<number, THREE.Group>; preview: THREE.Group | null; previewKind: string; ball: THREE.Mesh; splash: THREE.Group; droplets: THREE.Group; rings: THREE.Mesh[] }>();
  let disposed = false;
  const actorProps = (id: string) => {
    let entry = actors.get(id); if (entry) return entry;
    const group = new THREE.Group(); root.add(group);
    const ball = add(group, sphere, snow, 0, 0, 0, .14); ball.name = 'weather-snowball'; ball.visible = false;
    const splash = new THREE.Group(); splash.name = 'weather-splash'; group.add(splash); splash.visible = false;
    const puddle = add(splash, circle, water, 0, .027, 0, .65, .45, 1); puddle.rotation.x = -Math.PI / 2;
    const rings = Array.from({ length: 3 }, (_, i) => { const mesh = add(splash, ring, glint, 0, .032 + i * .002, 0, .2); mesh.name = `splash-ring-${i}`; mesh.rotation.x = -Math.PI / 2; return mesh; });
    const droplets = new THREE.Group(); droplets.name = 'splash-droplets'; splash.add(droplets);
    for (let i = 0; i < 10; i++) add(droplets, sphere, water, 0, 0, 0, .028, .065, .028);
    entry = { group, creations: new Map(), preview: null, previewKind: '', ball, splash, droplets, rings }; actors.set(id, entry); return entry;
  };
  return {
    update(states: readonly GameState[], settings: Pick<Settings, 'quality' | 'reducedMotion'>) {
      if (disposed) return;
      const limited = states.slice(0, 16), ids = new Set(limited.map(state => state.player.id));
      for (const [id, entry] of actors) if (!ids.has(id)) { entry.group.removeFromParent(); actors.delete(id); }
      for (const state of limited) {
        const craft = state.floor === 'rooftop' && !state.transition && (state.activity?.kind === 'snowman' || state.activity?.kind === 'snowduck') ? state.activity : null;
        if (!actors.has(state.player.id) && !craft && !state.weatherCreations.length && !state.weatherEffect) continue;
        const entry = actorProps(state.player.id), creations = state.weatherCreations.filter(creation => creation.remaining > 0).slice(-WEATHER_CREATION_LIMIT);
        const current = new Set(creations.map(creation => creation.id));
        for (const [id, prop] of entry.creations) if (!current.has(id)) { prop.removeFromParent(); entry.creations.delete(id); }
        for (const creation of creations) {
          let prop = entry.creations.get(creation.id);
          if (!prop) { prop = sculpture(creation.kind); prop.name = `${creation.kind}-${creation.id}`; entry.group.add(prop); entry.creations.set(creation.id, prop); }
          prop.position.set(creation.x, .035, creation.z); prop.rotation.y = creation.angle;
          prop.scale.setScalar(settings.reducedMotion ? 1 : Math.min(1, creation.remaining / 3));
        }
        if (entry.preview) entry.preview.visible = false;
        if (craft) {
          const point = craft.craftPoint ?? weatherCraftPoint(state.player, state.weatherCreations);
          if (point) {
            if (entry.previewKind !== craft.kind) { entry.preview?.removeFromParent(); entry.preview = sculpture(craft.kind as WeatherCreation['kind']); entry.previewKind = craft.kind; entry.preview.name = 'weather-play-preview'; entry.group.add(entry.preview); }
            entry.preview!.visible = true; entry.preview!.position.set(point.x, .035, point.z); entry.preview!.rotation.y = state.player.angle;
            entry.preview!.scale.setScalar(settings.reducedMotion ? .65 : .15 + .85 * (1 - craft.remaining / craft.duration));
          }
        }
        entry.ball.visible = entry.splash.visible = false;
        const effect = state.floor === 'rooftop' && !state.transition ? state.weatherEffect : null;
        if (!effect || effect.remaining <= 0) continue;
        const phase = THREE.MathUtils.clamp(1 - effect.remaining / effect.duration, 0, 1);
        if (effect.kind === 'snowball') {
          let reach = .4;
          for (let d = .4; d <= 3.4; d += .1) { if (!isWeatherPlayPoint({ x: effect.x + Math.sin(effect.angle) * d, z: effect.z + Math.cos(effect.angle) * d })) break; reach = d; }
          const travel = settings.reducedMotion ? 1 : phase;
          entry.ball.visible = true; entry.ball.position.set(effect.x + Math.sin(effect.angle) * reach * travel,
            settings.reducedMotion ? .12 : .12 + 1.1 * (1 - phase) + Math.sin(phase * Math.PI) * 1.1, effect.z + Math.cos(effect.angle) * reach * travel);
          entry.ball.scale.setScalar(settings.reducedMotion ? .2 : .14);
        } else {
          entry.splash.visible = true; entry.splash.position.set(effect.x, 0, effect.z);
          entry.rings.forEach((mesh, i) => { mesh.visible = settings.quality !== 'low' || i < 2; mesh.scale.setScalar(settings.reducedMotion ? .28 + i * .14 : .14 + ((phase + i / 3) % 1) * .68); });
          entry.droplets.visible = !settings.reducedMotion;
          entry.droplets.children.forEach((drop, i) => {
            drop.visible = phase < .85 && (settings.quality !== 'low' || i < 4);
            const angle = i * Math.PI * 2 / 10, spread = .15 + phase * (.55 + i % 3 * .1);
            drop.position.set(Math.sin(angle) * spread, .04 + Math.sin(phase * Math.PI) * (.3 + i % 3 * .12), Math.cos(angle) * spread);
          });
        }
      }
    },
    dispose() {
      if (disposed) return; disposed = true; root.removeFromParent(); actors.clear();
      for (const geometry of [sphere, cone, box, ring, circle]) geometry.dispose();
      for (const material of [snow, dark, orange, scarf, water, glint]) material.dispose();
    },
  };
}
