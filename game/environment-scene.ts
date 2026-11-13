import * as THREE from 'three';
import { ROOF_BOUNDS } from './layout.ts';
import type { EnvironmentFrame, Precipitation } from './environment-types.ts';
import type { Settings } from './types.ts';
import { paintWindowPrecipitation } from './window-weather.ts';
import { createRoofSurfaceWeather } from './roof-surface-weather.ts';

const MAX_PARTICLES = 144;
const neutralFrame: EnvironmentFrame = {
  now: 0, daylight: 1, sunset: 0, cloud: .12, precipitation: 'none', season: 'summer', solarAltitude: .8, azimuth: 2.8,
};
const seasons = {
  spring: ['#638666', '#92a675'], summer: ['#55775d', '#78946b'],
  autumn: ['#917255', '#bd9865'], winter: ['#607973', '#86958a'],
};

export function outdoorParticleCount(kind: Precipitation, outdoors: boolean, quality: Settings['quality'], reducedMotion: boolean) {
  if (!outdoors || reducedMotion || kind === 'none') return 0;
  return quality === 'low' ? 32 : quality === 'auto' ? 88 : MAX_PARTICLES;
}

function canvasTexture(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return { context, texture };
}

const noise = (index: number) => ((Math.sin(index * 127.1 + 3) * 43758.5453) % 1 + 1) % 1;

function paintSky(context: CanvasRenderingContext2D, frame: EnvironmentFrame, city: boolean) {
  const { width, height } = context.canvas;
  const { daylight, sunset, cloud } = frame;
  const mix = (night: string, day: string, dusk: string, grey: string) => new THREE.Color(night)
    .lerp(new THREE.Color(day), daylight).lerp(new THREE.Color(dusk), sunset * .77)
    .lerp(new THREE.Color(grey), cloud * (.15 + daylight * .33)).getStyle();
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, mix('#18243e', '#83b8d6', '#676394', '#889eac'));
  gradient.addColorStop(.55, mix('#293c58', '#b9d6e0', '#cf9bb2', '#adbcc3'));
  gradient.addColorStop(1, mix('#47526a', '#e4e8d9', '#f7ba88', '#c7cfcc'));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  context.fillStyle = '#fff4dc';
  context.globalAlpha = (1 - daylight) * (1 - cloud) * .78;
  for (let i = 0; i < (city ? 24 : 54); i++) {
    context.beginPath();
    context.arc(noise(i) * width, noise(i + 50) * height * .65, .4 + noise(i + 100) * 1.25, 0, Math.PI * 2);
    context.fill();
  }
  const night = frame.solarAltitude < -.10;
  const x = width * (night ? .74 : .17 + .66 * ((frame.azimuth / (Math.PI * 2) + 1) % 1));
  const y = height * (night ? .27 : THREE.MathUtils.clamp(.56 - frame.solarAltitude * .34, .13, .62));
  const radius = height * (city ? .06 : .037);
  const glow = context.createRadialGradient(x, y, 0, x, y, radius * 3.8);
  glow.addColorStop(0, night ? '#d7e8ff88' : '#ffe6acbb');
  glow.addColorStop(1, '#fff0cf00');
  context.globalAlpha = 1 - cloud * .9;
  context.fillStyle = glow;
  context.fillRect(x - radius * 4, y - radius * 4, radius * 8, radius * 8);
  context.fillStyle = night ? '#ebeff7' : '#fff3c7';
  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  if (night) {
    context.moveTo(x + radius * 1.33, y - radius * .28);
    context.arc(x + radius * .45, y - radius * .28, radius * .88, 0, Math.PI * 2);
  }
  context.fill('evenodd');

  context.fillStyle = mix('#8995ad', '#f9f7eb', '#ffddcf', '#d2d9db');
  for (let i = 0; i < 9; i++) {
    const px = width * noise(i + 20), py = height * (.12 + noise(i + 31) * .45);
    context.globalAlpha = (.11 + cloud * .55) * (.36 + daylight * .64);
    context.beginPath();
    context.ellipse(px, py, width * (.05 + noise(i + 7) * .10), height * .027, -.03, 0, Math.PI * 2);
    context.ellipse(px + width * .02, py - height * .013, width * .048, height * .031, 0, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  if (!city) return;

  for (let layer = 0; layer < 2; layer++) {
    for (let i = 0; i < 15; i++) {
      const bw = width * (.044 + noise(i + layer * 15) * .023), bx = width * (i / 14) - bw * (layer ? .3 : .8);
      const by = height * (.68 + noise(i + 5 + layer * 15) * .17 + layer * .06);
      context.fillStyle = layer ? mix('#26384c', '#799da9', '#796b82', '#899ca5') : mix('#394961', '#a0bbc3', '#a18799', '#abb9bd');
      context.fillRect(bx, by, bw, height - by);
      if (!layer) continue;
      context.fillStyle = mix('#f6ca81', '#b2c8cb', '#edc4ab', '#bbc6c7');
      for (let row = 0; row < 6; row++) for (let col = 0; col < 3; col++) {
        if (by + 7 + row * 6 >= height || noise(i * 18 + row * 3 + col) < .37) continue;
        context.fillRect(bx + bw * (.16 + col * .27), by + 5 + row * 6, bw * .13, 2);
      }
    }
  }
}

export function createOfficeWeather() {
  const sky = canvasTexture(512, 320);
  sky.texture.generateMipmaps = false;
  sky.texture.minFilter = THREE.LinearFilter;
  // Cache the city backdrop on the CPU; only the composed pane uses a GPU map.
  const backdrop = document.createElement('canvas');
  backdrop.width = 512; backdrop.height = 320;
  const backdropContext = backdrop.getContext('2d')!;
  paintSky(backdropContext, neutralFrame, true);
  sky.context.drawImage(backdrop, 0, 0);
  const patches: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  const sunlight = new THREE.Color('#fff0bc'), sunsetLight = new THREE.Color('#ffb779');
  let last = -Infinity;
  let lastWeather = '';
  let lastControls = '', clock = 0, pending = 0;
  return {
    addWindow(parent: THREE.Group, x: number, y: number, z: number, width: number, height: number) {
      const surface = new THREE.Mesh(new THREE.PlaneGeometry(width, height), new THREE.MeshBasicMaterial({
        map: sky.texture, toneMapped: false, transparent: true,
      }));
      surface.position.set(x, y, z);
      surface.userData.cutawaySide = 'north';
      surface.userData.uniqueGeometry = true;
      surface.userData.weatherWindow = true;
      parent.add(surface);

      const patch = new THREE.Mesh(new THREE.PlaneGeometry(width * .86, 2.8), new THREE.MeshBasicMaterial({
        color: '#fff0bb', transparent: true, opacity: .08, depthWrite: false, toneMapped: false,
      }));
      patch.rotation.x = -Math.PI / 2;
      patch.position.set(x, .049, z + 1.8);
      patch.userData.pointerPassthrough = true;
      patch.userData.uniqueGeometry = true;
      patch.userData.uniqueMaterial = true;
      parent.add(patch);
      patches.push(patch);
    },
    update(frame: EnvironmentFrame, settings: Pick<Settings, 'quality' | 'reducedMotion'> = { quality: 'auto', reducedMotion: false }, dt = 0) {
      const weather = `${frame.cloud}/${frame.precipitation}/${frame.season}`;
      const controls = `${settings.quality}/${settings.reducedMotion}`;
      const skyChanged = Math.abs(frame.now - last) >= 10_000 || lastWeather !== weather;
      const animating = frame.precipitation !== 'none' && !settings.reducedMotion;
      if (animating) {
        const elapsed = Number.isFinite(dt) ? Math.min(.05, Math.max(0, dt)) : 0;
        clock += elapsed; pending += elapsed;
      }
      if (skyChanged) {
        paintSky(backdropContext, frame, true);
        last = frame.now;
        lastWeather = weather;
      }
      if (skyChanged || controls !== lastControls || (animating && pending >= 1 / (settings.quality === 'low' ? 12 : 24))) {
        sky.context.drawImage(backdrop, 0, 0);
        paintWindowPrecipitation(sky.context, frame, clock, settings.quality);
        sky.texture.needsUpdate = true;
        pending = 0; lastControls = controls;
      }
      for (const patch of patches) {
        patch.material.color.copy(sunlight).lerp(sunsetLight, frame.sunset);
        patch.material.opacity = (frame.daylight * .083 + frame.sunset * .19) * (1 - frame.cloud * .86);
        patch.visible = patch.material.opacity > .008;
        patch.rotation.z = Math.sin(frame.azimuth) * .22;
      }
    },
  };
}

export function prepareSeasonalPlant(plant: THREE.Group) {
  plant.userData.dynamic = true;
  plant.children.forEach((leaf, index) => {
    if (!(leaf instanceof THREE.Mesh) || index < 2) return;
    leaf.material = (leaf.material as THREE.MeshStandardMaterial).clone();
    leaf.userData.seasonalLeaf = index % 2;
  });
}

export function createEnvironmentScene(scene: THREE.Scene, roof: THREE.Group, ambient: THREE.HemisphereLight, sunlight: THREE.DirectionalLight, officeColor: THREE.Color, roofColor: THREE.Color, fill?: THREE.DirectionalLight) {
  const sky = canvasTexture(768, 512);
  const background = officeColor.clone();
  const initialAmbient = ambient.color.clone(), initialSun = sunlight.color.clone();
  const initialAmbientIntensity = ambient.intensity, initialSunIntensity = sunlight.intensity;
  const leaves: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>[] = [];
  roof.traverse(object => {
    if (object instanceof THREE.Mesh && typeof object.userData.seasonalLeaf === 'number') leaves.push(object);
  });

  const rainGeometry = new THREE.BufferGeometry(), snowGeometry = new THREE.BufferGeometry();
  const rainPoints = new Float32Array(MAX_PARTICLES * 6), snowPoints = new Float32Array(MAX_PARTICLES * 3);
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPoints, 3).setUsage(THREE.DynamicDrawUsage));
  snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPoints, 3).setUsage(THREE.DynamicDrawUsage));
  const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({ color: '#bce1f5', transparent: true, opacity: .56, depthWrite: false, toneMapped: false }));
  const snow = new THREE.Points(snowGeometry, new THREE.PointsMaterial({ color: '#f4fbff', size: 2.9, sizeAttenuation: false, transparent: true, opacity: .82, depthWrite: false, toneMapped: false }));
  for (const particleSystem of [rain, snow]) {
    particleSystem.frustumCulled = false;
    particleSystem.userData.pointerPassthrough = true;
    particleSystem.visible = false;
    roof.add(particleSystem);
  }
  const surfaces = createRoofSurfaceWeather(roof);

  const seeds = Array.from({ length: MAX_PARTICLES }, (_, i) => [noise(i * 3), noise(i * 3 + 1), noise(i * 3 + 2)]);
  let clock = 0, lastSky = -Infinity, lastCloud = -1, season = '';
  const nightOffice = new THREE.Color('#a9a8ba'), duskOffice = new THREE.Color('#e8c5ad');
  const roofFog = new THREE.Color('#abbcc7'), indoorWarm = new THREE.Color('#ffe4bb'), nightBlue = new THREE.Color('#a0b7ee');
  const fogColor = new THREE.Color(), nightFog = new THREE.Color('#47526a'), duskFog = new THREE.Color('#d2a394');
  const sunsetSun = new THREE.Color('#ffd0a0'), daylightSun = new THREE.Color('#fff4d9');
  return {
    update(frame: EnvironmentFrame | undefined, onRoof: boolean, settings: Settings, dt: number) {
      surfaces.update(frame?.precipitation ?? 'none', onRoof, settings, dt);
      const count = outdoorParticleCount(frame?.precipitation ?? 'none', onRoof, settings.quality, settings.reducedMotion);
      rain.visible = count > 0 && frame?.precipitation === 'rain';
      snow.visible = count > 0 && frame?.precipitation === 'snow';
      if (!frame) {
        scene.background = background.copy(onRoof ? roofColor : officeColor);
        if (scene.fog) scene.fog.color.copy(background);
        ambient.color.copy(initialAmbient);
        if (onRoof) ambient.color.set('#fff0d5');
        ambient.intensity = initialAmbientIntensity;
        sunlight.color.copy(initialSun);
        sunlight.intensity = initialSunIntensity;
        return;
      }

      if (season !== frame.season) {
        season = frame.season;
        for (const leaf of leaves) leaf.material.color.set(seasons[frame.season][leaf.userData.seasonalLeaf]);
      }
      if (onRoof && (Math.abs(frame.now - lastSky) >= 10_000 || frame.cloud !== lastCloud)) {
        paintSky(sky.context, frame, false);
        sky.texture.needsUpdate = true;
        lastSky = frame.now;
        lastCloud = frame.cloud;
      }
      background.copy(nightOffice).lerp(officeColor, frame.daylight).lerp(duskOffice, frame.sunset * .64);
      scene.background = onRoof ? sky.texture : background;
      if (scene.fog) scene.fog.color.copy(onRoof ? fogColor.copy(nightFog).lerp(roofFog, frame.daylight).lerp(duskFog, frame.sunset) : background);
      ambient.color.copy(onRoof ? nightBlue : indoorWarm).lerp(initialAmbient, frame.daylight);
      ambient.intensity = THREE.MathUtils.lerp(onRoof ? 1.55 : 2.12, initialAmbientIntensity, frame.daylight);
      sunlight.color.copy(onRoof ? nightBlue : indoorWarm).lerp(daylightSun, frame.daylight).lerp(sunsetSun, frame.sunset);
      sunlight.intensity = THREE.MathUtils.lerp(onRoof ? .85 : 1.85, initialSunIntensity, frame.daylight * (1 - frame.cloud * .3));
      if (fill) fill.color.copy(indoorWarm).lerp(nightBlue, onRoof ? 1 - frame.daylight * .52 : frame.daylight * .46);

      if (!count) return;
      clock += dt;
      for (let i = 0; i < count; i++) {
        const [sx, sy, sz] = seeds[i];
        const y = .13 + ((sy - clock * (rain.visible ? 1.7 : .27)) % 1 + 1) % 1 * 8.5;
        const x = THREE.MathUtils.lerp(ROOF_BOUNDS.minX + .35, ROOF_BOUNDS.maxX - .35, sx);
        const z = THREE.MathUtils.lerp(ROOF_BOUNDS.minZ + .35, ROOF_BOUNDS.maxZ - .35, sz);
        if (rain.visible) {
          const index = i * 6;
          rainPoints[index] = x;
          rainPoints[index + 1] = y;
          rainPoints[index + 2] = z;
          rainPoints[index + 3] = x - .12;
          rainPoints[index + 4] = y + .43;
          rainPoints[index + 5] = z + .045;
        } else {
          const index = i * 3;
          snowPoints[index] = x + Math.sin(clock * .82 + i) * .27;
          snowPoints[index + 1] = y;
          snowPoints[index + 2] = z + Math.cos(clock * .67 + i) * .21;
        }
      }
      if (rain.visible) {
        rainGeometry.setDrawRange(0, count * 2);
        rainGeometry.attributes.position.needsUpdate = true;
      } else {
        snowGeometry.setDrawRange(0, count);
        snowGeometry.attributes.position.needsUpdate = true;
      }
    },
    dispose() {
      surfaces.dispose();
      sky.texture.dispose();
      for (const particleSystem of [rain, snow]) {
        particleSystem.removeFromParent();
        particleSystem.geometry.dispose();
        particleSystem.material.dispose();
      }
    },
  };
}
