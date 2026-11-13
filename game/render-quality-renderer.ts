import type { DirectionalLight, WebGLRenderer } from 'three';
import type { RenderQuality } from './render-quality.ts';

type QualityRenderer = Pick<WebGLRenderer, 'getPixelRatio' | 'setPixelRatio'> & {
  shadowMap: { enabled: boolean; needsUpdate: boolean };
};

/** setPixelRatio already resizes the backing buffer without changing CSS size. */
export function createQualityApplicator(renderer: QualityRenderer, light: DirectionalLight) {
  let shadowSize = -1;
  return (profile: RenderQuality, deviceRatio: number) => {
    const ratio = Math.min(Number.isFinite(deviceRatio) && deviceRatio > 0 ? deviceRatio : 1, profile.dpr);
    if (renderer.getPixelRatio() !== ratio) renderer.setPixelRatio(ratio);
    if (shadowSize === profile.shadows) return;
    shadowSize = profile.shadows;
    // Changing mapSize alone does not resize Three's existing shadow target.
    if (light.shadow.map?.depthTexture) {
      light.shadow.map.depthTexture.dispose(); light.shadow.map.depthTexture = null;
    }
    light.shadow.dispose();
    light.shadow.map = null; light.shadow.mapPass = null;
    if (shadowSize) light.shadow.mapSize.set(shadowSize, shadowSize);
    renderer.shadowMap.enabled = shadowSize > 0;
    // The changed shadow-casting light count invalidates Three's cached shader
    // variants; toggling renderer.shadowMap.enabled alone does not do that.
    light.castShadow = shadowSize > 0;
    renderer.shadowMap.needsUpdate = true;
    light.shadow.needsUpdate = true;
  };
}
