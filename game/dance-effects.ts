import * as THREE from 'three';

export type DanceEffects = { group: THREE.Group; ball: THREE.Group; spots: THREE.Group };

/** A little personal stage, made from inexpensive geometry instead of 16 shadow lights. */
export function createDanceEffects(parent: THREE.Object3D): DanceEffects {
  const group = new THREE.Group(); group.name = 'dance-stage'; group.visible = false;
  group.userData.pointerPassthrough = true; group.userData.dynamic = true; parent.add(group);
  const ball = new THREE.Group(); ball.name = 'dance-mirrorball'; ball.position.y = 3.35; group.add(ball);
  const silver = new THREE.MeshStandardMaterial({ color: '#dce7e3', metalness: .8, roughness: .19, flatShading: true });
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(.28, 2), silver); ball.add(core);
  const facets = new THREE.InstancedMesh(new THREE.PlaneGeometry(.063, .063), new THREE.MeshBasicMaterial({ toneMapped: false }), 50);
  const facetColors = ['#fff9dc', '#b8e9df', '#e0c2e9', '#a5cbdc'].map(color => new THREE.Color(color));
  const transform = new THREE.Object3D(); ball.add(facets);
  for (let row = 0; row < 5; row++) for (let column = 0; column < 10; column++) {
    const latitude = (row + .5) / 5 * Math.PI, longitude = column / 10 * Math.PI * 2;
    transform.position.set(Math.sin(latitude) * Math.cos(longitude), Math.cos(latitude), Math.sin(latitude) * Math.sin(longitude)).multiplyScalar(.282);
    transform.lookAt(transform.position.clone().multiplyScalar(2)); transform.updateMatrix();
    facets.setMatrixAt(row * 10 + column, transform.matrix); facets.setColorAt(row * 10 + column, facetColors[(row + column) % facetColors.length]);
  }
  facets.instanceMatrix.needsUpdate = true; facets.instanceColor!.needsUpdate = true;
  const string = new THREE.Mesh(new THREE.CylinderGeometry(.009, .009, .32, 5), new THREE.MeshBasicMaterial({ color: '#798e89' }));
  string.position.y = 3.78; group.add(string);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.04, 3.1, 32, 1, true), new THREE.MeshBasicMaterial({ color: '#fff4c9', transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }));
  cone.name = 'dance-spotlight'; cone.position.y = 1.59; group.add(cone);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1.04, 40), new THREE.MeshBasicMaterial({ color: '#ffedac', transparent: true, opacity: .28, depthWrite: false, toneMapped: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = .035; group.add(pool);
  const spots = new THREE.Group(); spots.position.y = .045; group.add(spots);
  const dots = new THREE.InstancedMesh(new THREE.CircleGeometry(.11, 14), new THREE.MeshBasicMaterial({ transparent: true, opacity: .72, depthWrite: false, toneMapped: false }), 12);
  const spotColors = ['#d7b4df', '#acd8cb', '#efc88e', '#aecfdd'].map(color => new THREE.Color(color));
  spots.add(dots);
  for (let i = 0; i < 12; i++) {
    const angle = i * Math.PI / 6, radius = i % 2 ? .79 : 1.18;
    transform.position.set(Math.sin(angle) * radius, 0, Math.cos(angle) * radius); transform.rotation.set(-Math.PI / 2, 0, 0); transform.scale.set(1, .65, 1); transform.updateMatrix();
    dots.setMatrixAt(i, transform.matrix); dots.setColorAt(i, spotColors[i % spotColors.length]);
  }
  dots.instanceMatrix.needsUpdate = true; dots.instanceColor!.needsUpdate = true;
  return { group, ball, spots };
}

export function animateDanceEffects(effect: DanceEffects, active: boolean, time: number, reducedMotion: boolean) {
  effect.group.visible = active;
  if (!active) return;
  effect.ball.rotation.y = reducedMotion ? 0 : time * .8;
  effect.spots.rotation.y = reducedMotion ? 0 : -time * .38;
}
