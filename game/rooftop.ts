import * as THREE from 'three';
import { box, cylinder, plant, plaque, sphere } from './models.ts';
import { ROOF_REST } from './layout.ts';

/** Uses simulation progress, so hidden tabs and paused games freeze the turn. */
export function transitionOrbit(transition: { remaining: number; duration: number } | null, reducedMotion: boolean) {
  if (!transition || reducedMotion) return 0;
  const progress = THREE.MathUtils.clamp(1 - transition.remaining / transition.duration, 0, 1);
  return THREE.MathUtils.smoothstep(progress, 0, 1) * Math.PI * 2;
}

/** Simulation time freezes the breeze together with the rest of the game. */
export function animateRooftop(roof: THREE.Group, elapsed: number, reducedMotion: boolean) {
  const ribbon = roof.getObjectByName('roof-wind-ribbon');
  if (!ribbon) return;
  ribbon.rotation.y = reducedMotion ? 0 : Math.sin(elapsed * .74) * .12;
  ribbon.rotation.z = reducedMotion ? -.06 : -.06 + Math.sin(elapsed * 1.1) * .09 + Math.sin(elapsed * 2.3) * .025;
}

/** Rooftop decoration stays outside the engine's clear walking rectangle. */
export function createRooftop(parent: THREE.Object3D) {
  const roof = new THREE.Group(); roof.name = 'rooftop'; parent.add(roof);
  box(roof, 18.4, .50, 12.4, '#a1a49b', 0, -.33, 0, .12);
  box(roof, 18.1, .10, 12.1, '#d1cbb9', 0, -.045, 0, .02).userData.ground = true;
  for (let x = 0; x < 9; x++) for (let z = 0; z < 6; z++) {
    const tile = box(roof, 1.985, .014, 1.985, ['#d9d3c1', '#d4cebb', '#ddd5c1'][(x + z * 2) % 3], -8 + x * 2, .012, -5 + z * 2, .005);
    tile.userData.ground = true;
  }
  // Low foreground parapets retain the readable miniature cutaway.
  for (const side of [-1, 1]) {
    box(roof, .18, .57, 12.1, '#e9e0cb', side * 9, .29, 0);
    box(roof, .28, .09, 12.2, '#bac4b4', side * 9, .62, 0, .025);
    for (let z = -5.6; z <= 5.6; z += 1.4) cylinder(roof, .028, .028, .43, '#6e8278', side * 9, .87, z);
    box(roof, .045, .055, 12, '#6e8278', side * 9, 1.08, 0);
  }
  box(roof, 18.1, .72, .18, '#e9e0cb', 0, .37, -6);
  box(roof, 18.2, .11, .30, '#bac4b4', 0, .78, -6);
  box(roof, 18.1, .30, .18, '#e9e0cb', 0, .16, 6);
  box(roof, 18.2, .09, .28, '#bac4b4', 0, .35, 6);
  // Stairwell and its door are outside the open strolling space.
  const stairs = new THREE.Group(); stairs.position.set(-7.8, 0, -4.85); roof.add(stairs);
  box(stairs, 1.65, 2.8, 1.60, '#ddd5c1', 0, 1.4, 0, .035);
  box(stairs, 1.78, .13, 1.74, '#a7b7a6', 0, 2.86, 0, .04);
  box(stairs, 1.03, 2.15, .05, '#64877c', 0, 1.1, .82, .02);
  box(stairs, .69, .46, .012, '#bbd6d0', 0, 1.63, .85, .02);
  box(stairs, .13, .045, .09, '#ddc896', .34, 1.02, .87, .01);
  plaque(stairs, '사무실', .82, .21, 0, 2.45, .835, '#ddd5c1', '#537064');
  // A sheltered wall continues the stairwell, leaving room to lean against it.
  const wallRest = ROOF_REST.wall;
  const wall = new THREE.Group(); wall.name = 'roof-rest-wall'; wall.userData.target = 'roofWall';
  wall.position.set(wallRest.center.x, 0, wallRest.center.z); roof.add(wall);
  box(wall, wallRest.width, wallRest.height, wallRest.depth, '#d9d1bc', 0, wallRest.height / 2, 0, .015);
  box(wall, wallRest.width + .08, .085, wallRest.depth + .06, '#a9b9a7', 0, wallRest.height + .025, 0, .018);
  const wallLeft = wallRest.center.x - wallRest.width / 2, stairsRight = -7.8 + 1.65 / 2;
  const connectorWidth = wallLeft - stairsRight + .02;
  box(wall, connectorWidth, wallRest.height, wallRest.depth, '#d9d1bc', (wallLeft + stairsRight) / 2 - wallRest.center.x, wallRest.height / 2, 0, .015);
  box(wall, connectorWidth, .085, wallRest.depth + .06, '#a9b9a7', (wallLeft + stairsRight) / 2 - wallRest.center.x, wallRest.height + .025, 0, .018);
  // One quiet cloth strip shows the breeze without filling the open roof.
  cylinder(wall, .018, .018, .65, '#718477', wallRest.width / 2 - .2, wallRest.height + .32, 0);
  const ribbon = new THREE.Group(); ribbon.name = 'roof-wind-ribbon'; ribbon.userData.dynamic = true;
  ribbon.position.set(wallRest.width / 2 - .2, wallRest.height + .55, 0); wall.add(ribbon);
  box(ribbon, .65, .12, .018, '#d4b183', .32, 0, 0, .012);
  box(ribbon, .10, .12, .020, '#eee0be', .54, 0, 0, .008);
  // A bench, candy tin and a folded jacket suggest somebody's quiet break.
  const bench = new THREE.Group(); bench.name = 'roof-rest-bench'; bench.userData.target = 'roofBench'; bench.position.set(ROOF_REST.bench.seat.x, 0, ROOF_REST.bench.seat.z); roof.add(bench);
  for (let i = 0; i < 4; i++) box(bench, 3.1, .075, .14, i % 2 ? '#b69067' : '#c6a377', 0, ROOF_REST.bench.seatTop - .0375, -.23 + i * .155, .015);
  for (let i = 0; i < 3; i++) box(bench, 3.1, .13, .07, '#b9966e', 0, .89 + i * .17, -.32, .015);
  for (const x of [-1.19, 1.19]) {
    box(bench, .075, .51, .63, '#627d70', x, .28, 0);
    box(bench, .075, 1.12, .07, '#627d70', x, .60, -.34);
  }
  cylinder(bench, .12, .12, .16, '#c28e7d', -.94, .70, .04);
  cylinder(bench, .125, .125, .035, '#e8d7b5', -.94, .795, .04);
  box(bench, .58, .07, .36, '#6e8597', .81, .66, .03, .035);
  const sign = plaque(roof, '잠깐, 숨 돌리는 곳', 2.50, .32, 4.5, .64, -5.895, '#e9e0cb', '#6e8271');
  sign.name = 'rooftop-sign';
  // Planters frame the space without occupying any navigable coordinates.
  for (const x of [-7.8, 7.8]) for (const z of [-1.3, 2.2, 4.8]) {
    box(roof, .83, .45, 1.03, '#bb9b76', x, .24, z, .045);
    box(roof, .76, .035, .96, '#554b35', x, .48, z, .015);
    const greenery = plant(roof, x, z, .90); greenery.position.y = .25;
  }
  // Small buildings below the roof line make this feel like a roof, not a room.
  const skyline = new THREE.Group(); skyline.name = 'distant-city'; roof.add(skyline);
  const buildings = [
    [-15, -14, 3.5, 6.5, 3.5], [-10.8, -18, 4, 8.8, 4], [-5.8, -16.4, 3.3, 5.8, 3.5],
    [-1.0, -20, 4.0, 10, 4], [4.3, -17, 3.3, 7.8, 3.7], [9.2, -19, 4.3, 9, 4.5],
    [14.5, -14.5, 3.5, 5.4, 4], [18.5, -8, 4, 7.6, 4], [19.8, 0, 4, 6.2, 4],
    [-18, -7, 4, 6.6, 4], [-19, 1, 3.2, 5.5, 4], [14, 16, 4, 5.6, 4], [-14, 15, 3.6, 6.8, 4],
  ];
  buildings.forEach(([x, z, w, h, d], index) => {
    const y = -8 + h / 2;
    const color = ['#b5c0bc', '#b7bcbc', '#b8c7c3', '#bcc3bd'][index % 4];
    box(skyline, w, h, d, color, x, y, z, .03);
    box(skyline, w + .14, .14, d + .14, '#c9cfc3', x, -8 + h, z, .02);
    for (let row = 0; row < Math.floor(h / 1.1); row++) for (let col = 0; col < 3; col++) {
      box(skyline, .37, .51, .015, index % 2 ? '#d1d6c9' : '#9cafa9', x - w * .29 + col * w * .29, -7.3 + row * 1.05, z + d / 2 + .015, 0);
    }
  });
  skyline.traverse(object => { if (object instanceof THREE.Mesh) { object.castShadow = false; object.receiveShadow = false; } });
  for (const [x, z, scale] of [[-12, -24, 1.3], [8, -25, 1.6]]) {
    const cloud = new THREE.Group(); cloud.position.set(x, 7.5, z); cloud.scale.setScalar(scale); roof.add(cloud);
    for (let i = 0; i < 3; i++) { const puff = sphere(cloud, .8, '#f4e6ce', (i - 1) * .8, i === 1 ? .25 : 0, 0, 1.3, .5, .6); puff.castShadow = false; }
  }
  return roof;
}
