import * as THREE from 'three';

type LoadImage = (source: string, done: (image: HTMLImageElement) => void, failed: () => void) => void;
const loadImage: LoadImage = (source, done, failed) => { const image = new Image(); image.onload = () => done(image); image.onerror = failed; image.src = source; };

/** Own only the replacement; the desk still owns its original material/texture. */
export function createMonitorScreen(screen: THREE.Mesh, load: LoadImage = loadImage) {
  const original = screen.material;
  let source: string | null = null, generation = 0, disposed = false;
  let material: THREE.MeshBasicMaterial | null = null, texture: THREE.Texture | null = null;
  const clear = () => { screen.material = original; material?.dispose(); texture?.dispose(); material = null; texture = null; };
  return {
    set(image: string | null) {
      if (disposed || source === image) return;
      source = image; const version = ++generation; clear();
      if (!image) return;
      load(image, decoded => {
        if (disposed || version !== generation) return;
        texture = new THREE.Texture(decoded); texture.colorSpace = THREE.SRGBColorSpace; texture.needsUpdate = true;
        material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }); screen.material = material;
      }, () => { if (version === generation) clear(); });
    },
    dispose() { if (disposed) return; disposed = true; generation++; clear(); },
  };
}
