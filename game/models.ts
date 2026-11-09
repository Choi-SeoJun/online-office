import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Actor, GameState, Weapon } from './types.ts';

const mats = new Map<string, THREE.MeshStandardMaterial>();
const geos = new Map<string, THREE.BufferGeometry>();
export function material(color: string, roughness = .8, metalness = 0) {
  const key = `${color}/${roughness}/${metalness}`;
  if (!mats.has(key)) mats.set(key, new THREE.MeshStandardMaterial({ color, roughness, metalness }));
  return mats.get(key)!;
}
export function box(parent: THREE.Object3D, w: number, h: number, d: number, color: string, x = 0, y = 0, z = 0, round = .025) {
  const key = `b/${w}/${h}/${d}/${round}`;
  if (!geos.has(key)) geos.set(key, round ? new RoundedBoxGeometry(w, h, d, 1, Math.min(round, w / 3, h / 3, d / 3)) : new THREE.BoxGeometry(w, h, d));
  const mesh = new THREE.Mesh(geos.get(key), material(color));
  mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function sphere(parent: THREE.Object3D, r: number, color: string, x = 0, y = 0, z = 0, sx = 1, sy = 1, sz = 1) {
  const key = `s/${r}`;
  if (!geos.has(key)) geos.set(key, new THREE.SphereGeometry(r, 16, 12));
  const m = new THREE.Mesh(geos.get(key), material(color)); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; parent.add(m); return m;
}
export function cylinder(parent: THREE.Object3D, rt: number, rb: number, h: number, color: string, x = 0, y = 0, z = 0) {
  const key = `c/${rt}/${rb}/${h}`;
  if (!geos.has(key)) geos.set(key, new THREE.CylinderGeometry(rt, rb, h, 16));
  const mesh = new THREE.Mesh(geos.get(key), material(color)); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}
export function labelTexture(text: string, bg: string, color: string, width = 512, height = 128) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, width, height, 24); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${height * .39}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`; ctx.fillText(text, width / 2, height / 2 + 2, width - 32);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
export function plaque(parent: THREE.Object3D, text: string, w: number, h: number, x: number, y: number, z: number, bg = '#284c4a', fg = '#fff9e9') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: labelTexture(text, bg, fg), transparent: true })); m.position.set(x, y, z); parent.add(m); return m;
}
export function spriteLabel(parent: THREE.Object3D, text: string, color = '#274b49', w = 1.1) {
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(text, '#fffbee', color), transparent: true, depthTest: true, opacity: .95 })); sprite.scale.set(w, w / 4, 1); parent.add(sprite); return sprite;
}
export function plant(parent: THREE.Object3D, x: number, z: number, size = 1) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(size); parent.add(g);
  cylinder(g, .25, .19, .44, '#d5a477', 0, .22); cylinder(g, .225, .225, .035, '#493e2d', 0, .45);
  for (let i = 0; i < 7; i++) { const a = i * 2.4; const leaf = sphere(g, .24, i % 2 ? '#55775d' : '#78946b', Math.sin(a) * .19, .78 + i * .055, Math.cos(a) * .18, .48, 1.9, .85); leaf.rotation.z = Math.sin(a) * .6; }
  return g;
}
export function mug(parent: THREE.Object3D, x = 0, y = 0, z = 0, color = '#e4a76f') {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  cylinder(g, .075, .065, .14, color, 0, .07); cylinder(g, .061, .061, .009, '#493529', 0, .143);
  const handle = new THREE.Mesh(new THREE.TorusGeometry(.044, .014, 6, 12), material(color)); handle.position.set(.081, .075, 0); g.add(handle); return g;
}
export function chair(parent: THREE.Object3D, x: number, z: number, color = '#526769', direction = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = direction; parent.add(g);
  cylinder(g, .055, .065, .42, '#4a5356', 0, .29);
  for (let i = 0; i < 5; i++) { const a = i * Math.PI * .4; const leg = box(g, .07, .055, .43, '#414b4c', Math.sin(a) * .17, .10, Math.cos(a) * .17); leg.rotation.y = a; sphere(g, .052, '#323c3b', Math.sin(a) * .37, .065, Math.cos(a) * .37); }
  box(g, .66, .16, .62, color, 0, .57, 0, .07); box(g, .65, .64, .14, color, 0, .94, .30, .06);
  box(g, .08, .42, .09, '#4a5356', -.35, .70, .13); box(g, .08, .42, .09, '#4a5356', .35, .70, .13);
  box(g, .11, .07, .40, '#3b4647', -.35, .90, .02); box(g, .11, .07, .40, '#3b4647', .35, .90, .02); return g;
}
export function desk(parent: THREE.Object3D, x: number, z: number, index: number, boss = false) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  const width = boss ? 3 : 2.55;
  box(g, width, .14, 1.2, boss ? '#a67c55' : '#cfad83', 0, 1.03);
  box(g, width - .08, .035, 1.12, '#dbc09a', 0, 1.116, 0);
  for (const side of [-1, 1]) { box(g, .07, .94, 1.02, '#e5e5db', side * (width / 2 - .15), .5, 0); box(g, .12, .04, 1.06, '#87928e', side * (width / 2 - .15), .06); }
  box(g, .60, .69, .68, '#dbdbd0', width / 2 - .49, .60, -.12);
  for (let i = 0; i < 3; i++) { box(g, .55, .018, .005, '#b4b8ae', width / 2 - .49, .43 + i * .19, .226); box(g, .15, .025, .022, '#7f8983', width / 2 - .49, .48 + i * .19, .242); }
  box(g, .91, .025, .42, '#647777', -.16, 1.145, .29);
  box(g, .34, .035, .20, '#6e7775', -.15, 1.145, -.17); cylinder(g, .035, .035, .18, '#727e7b', -.15, 1.23, -.18);
  box(g, 1.00, .61, .08, '#344340', -.15, 1.61, -.24, .025);
  const screen = box(g, .89, .50, .012, '#d5e2dc', -.15, 1.61, -.192, .008);
  const screenTex = document.createElement('canvas'); screenTex.width = 256; screenTex.height = 144; const c = screenTex.getContext('2d')!;
  c.fillStyle = index === 5 ? '#234f5b' : '#e5efeb'; c.fillRect(0, 0, 256, 144); c.fillStyle = index === 5 ? '#47bdac' : '#354f5c'; c.fillRect(0, 0, 56, 144); c.fillStyle = '#6cbab2'; c.fillRect(72, 19, 112, 10); c.fillStyle = '#b3c6c0';
  for (let i = 0; i < 5; i++) c.fillRect(72, 43 + i * 17, 100 + (i % 2) * 40, 5);
  const texture = new THREE.CanvasTexture(screenTex); texture.colorSpace = THREE.SRGBColorSpace; screen.material = new THREE.MeshStandardMaterial({ map: texture, emissive: '#ffffff', emissiveMap: texture, emissiveIntensity: .23, roughness: .8 });
  box(g, .58, .035, .19, '#e3e5dc', -.17, 1.18, .28, .01);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 10; j++) box(g, .037, .009, .031, '#9ba6a0', -.42 + j * .055, 1.202, .23 + i * .047, .003);
  sphere(g, .06, '#e5e5d9', .32, 1.19, .30, .7, .4, 1.1);
  mug(g, -.94, 1.14, .24, ['#e8bd7b', '#b3d2ca', '#a5bed2'][index % 3]);
  for (let i = 0; i < 3; i++) box(g, .35, .04, .44, ['#aa6457', '#e9dfc5', '#4f7471'][i], .84, 1.16 + i * .04, -.22, .007);
  cylinder(g, .065, .06, .12, '#c5bca4', -.98, 1.21, -.30);
  for (let i = 0; i < 3; i++) { const p = cylinder(g, .008, .008, .20, ['#b97559', '#426b7c', '#d2a652'][i], -1 + i * .025, 1.32, -.30); p.rotation.z = .1 * (i - 1); }
  const ch = chair(parent, x, z + 1.05, boss ? '#354c55' : index === 5 ? '#4d7d74' : '#64777a');
  return { group: g, chair: ch, screen };
}

type Rig = { root: THREE.Group; body: THREE.Group; head: THREE.Group; leftArm: THREE.Group; rightArm: THREE.Group; legs: THREE.Group[]; calves: THREE.Group[]; hand: THREE.Group; weapons: Record<Weapon, THREE.Group>; mug: THREE.Group; label: THREE.Sprite; effect: THREE.Group; stars: THREE.Mesh[]; isBoss: boolean; lastName: string };
export function createActor(parent: THREE.Object3D, role: number, name: string): Rig {
  const root = new THREE.Group(); parent.add(root); const body = new THREE.Group(); root.add(body);
  const boss = role === 1; const shirt = ['#4e8a7e', '#2f4355', '#c48d6b', '#7e8da5', '#bbab78'][role] ?? '#9fa8b4'; const skin = ['#f0c5a2', '#e7ba94', '#eec09c', '#e5b692', '#f0cbad'][role] ?? '#edc3a0';
  const legs: THREE.Group[] = [], calves: THREE.Group[] = [];
  for (const side of [-1, 1]) { const leg = new THREE.Group(); leg.position.set(side * .115, .66, 0); body.add(leg); box(leg, .18, .30, .19, boss ? '#35424d' : '#3c5058', 0, -.15, 0, .04); const calf = new THREE.Group(); calf.position.y = -.30; leg.add(calf); box(calf, .16, .28, .17, boss ? '#35424d' : '#3c5058', 0, -.14, 0, .04); box(calf, .20, .12, .32, '#34413f', 0, -.29, .055, .04); legs.push(leg); calves.push(calf); }
  box(body, .53, .57, .34, shirt, 0, .94, 0, .11); box(body, .19, .49, .035, '#f8f1df', 0, .94, .178, .01);
  if (boss) { const tie = box(body, .065, .28, .028, '#bb6759', 0, .99, .206, .005); tie.rotation.z = -.05; }
  else { const a = box(body, .018, .34, .022, '#d5b85b', -.062, 1.07, .207, .003); a.rotation.z = .19; const b = box(body, .018, .34, .022, '#d5b85b', .062, 1.07, .207, .003); b.rotation.z = -.19; box(body, .12, .14, .025, '#e1e7dc', 0, .89, .212, .005); }
  const head = new THREE.Group(); head.position.y = 1.48; body.add(head);
  sphere(head, .34, skin, 0, 0, 0, 1, 1.05, .93); sphere(head, .075, skin, -.33, -.025); sphere(head, .075, skin, .33, -.025);
  const hair = ['#4c3930', '#2b2b2b', '#594033', '#302f32', '#73513b'][role] ?? '#3c302a';
  sphere(head, .345, hair, 0, .10, -.055, 1.025, .84, .96);
  for (let i = 0; i < 4; i++) sphere(head, .105, hair, -.23 + i * .14, .195 + Math.sin(i) * .02, .20, 1.13, .60, .85);
  if (role === 3) sphere(head, .18, hair, 0, .04, -.31);
  for (const side of [-1, 1]) { sphere(head, .025, '#343e39', side * .115, -.015, .292, .85, 1.15, .5); sphere(head, .047, '#df9b83', side * .215, -.095, .264, 1, .45, .25); }
  sphere(head, .042, skin, 0, -.06, .31, .7, .6, .8);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.062, .009, 5, 12, Math.PI * .7), material('#805945')); smile.rotation.z = Math.PI * 1.15; smile.position.set(.028, -.10, .294); head.add(smile);
  if (boss) { for (const side of [-1, 1]) { const glasses = new THREE.Mesh(new THREE.TorusGeometry(.074, .009, 5, 14), material('#5d5d4f')); glasses.position.set(side * .116, -.01, .312); head.add(glasses); } box(head, .08, .012, .012, '#5d5d4f', 0, -.005, .314, 0); }
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(side * .33, 1.16, 0); body.add(arm); box(arm, .16, .37, .18, shirt, 0, -.16, 0, .06); sphere(arm, .092, skin, 0, -.37, .015, .85, 1, .85); arms.push(arm); }
  const hand = new THREE.Group(); hand.position.set(0, -.40, .04); arms[1].add(hand);
  const weapons = { punch: new THREE.Group(), hammer: new THREE.Group(), fan: new THREE.Group() }; Object.values(weapons).forEach(g => hand.add(g));
  sphere(weapons.punch, .13, '#eeb48a', 0, 0, 0, 1.08, .9, 1.1);
  cylinder(weapons.hammer, .028, .028, .42, '#ad7b4d', 0, .12); const hammer = cylinder(weapons.hammer, .17, .17, .40, '#e8aa61', 0, .39); hammer.rotation.z = Math.PI / 2;
  cylinder(weapons.fan, .018, .018, .29, '#b49365', 0, .10); for (let i = 0; i < 6; i++) { const p = box(weapons.fan, .12, .37, .025, i % 2 ? '#f0e5cb' : '#fff8e6', 0, .31, i * .004, .005); p.rotation.z = (i - 2.5) * .20; }
  const actorMug = mug(arms[1], 0, -.33, .10, '#e6b77e'); actorMug.visible = false;
  const label = spriteLabel(root, name, boss ? '#795349' : '#325852', boss ? .82 : .86); label.position.y = 2.04;
  const effect = new THREE.Group(); effect.position.y = 1.90; root.add(effect); const stars: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) { const star = box(effect, .13, .13, .035, i % 2 ? '#f5c35a' : '#fff5cf', 0, 0, 0, .01); star.rotation.z = Math.PI / 4; stars.push(star); }
  effect.visible = false;
  return { root, body, head, leftArm: arms[0], rightArm: arms[1], legs, calves, hand, weapons, mug: actorMug, label, effect, stars, isBoss: boss, lastName: name };
}
export function animateActor(r: Rig, a: Actor, state: GameState, time: number) {
  const reduced = state.settings.reducedMotion; const walk = a.moving || a.pose === 'walk'; const seated = ['sit', 'type', 'sleep', 'spin', 'drink', 'eat'].includes(a.pose) && (!['drink', 'eat'].includes(a.pose) || (a.id === 'player' && state.seat !== null));
  r.root.position.set(a.x, 0, a.z); r.root.rotation.y = a.angle;
  const wave = Math.sin(time * 9 + (a.id.length % 3)); r.body.position.y = seated ? -.17 : walk && !reduced ? Math.abs(wave) * .035 : 0;
  r.body.rotation.set(0, 0, 0); r.head.rotation.set(0, Math.sin(time * .7) * .025, 0); r.leftArm.rotation.set(0, 0, .07); r.rightArm.rotation.set(0, 0, -.07);
  r.legs.forEach((leg, i) => { leg.rotation.x = seated ? -1.42 : walk ? wave * .42 * (i ? -1 : 1) : 0; r.calves[i].rotation.x = seated ? 1.44 : 0; });
  if (walk) { r.leftArm.rotation.x = -wave * .32; r.rightArm.rotation.x = wave * .32; }
  if (a.pose === 'type') { r.leftArm.rotation.x = -1.0 + Math.sin(time * 13) * .08; r.rightArm.rotation.x = -1.0 + Math.cos(time * 13) * .08; r.head.rotation.x = .13; }
  if (a.pose === 'sleep') { r.head.rotation.x = .36 + Math.sin(time * 1.5) * .05; r.body.rotation.x = .15; r.leftArm.rotation.x = -.7; r.rightArm.rotation.x = -.7; }
  if (a.pose === 'drink') { r.rightArm.rotation.x = -2.12 + Math.sin(time * 2) * .06; r.head.rotation.x = -.12; }
  if (a.pose === 'eat') r.rightArm.rotation.x = -1.85 + Math.sin(time * 4) * .14;
  if (['take', 'brew'].includes(a.pose)) r.rightArm.rotation.x = -1.3;
  if (a.pose === 'watch' || a.pose === 'scold') { r.rightArm.rotation.x = -.8; r.rightArm.rotation.z = -.8; }
  if (a.pose === 'spin' && !reduced) r.body.rotation.y = time * 6;
  const carryingCoffee = a.id === 'player' && state.inventory.coffee > 0 && ['idle', 'walk', 'sit', 'lean'].includes(a.pose);
  r.mug.visible = a.pose === 'drink' || carryingCoffee;
  if (carryingCoffee) r.rightArm.rotation.x = -.72;
  Object.values(r.weapons).forEach(w => { w.visible = false; });
  const hitAge = state.lastHit ? state.elapsed - state.lastHit.at : 10;
  const hit = hitAge >= 0 && hitAge < 2;
  if (a.id === 'player' && hit && hitAge < .27) { r.rightArm.rotation.x = -1.3 - Math.sin(hitAge / .27 * Math.PI) * .8; r.rightArm.rotation.z = -.3; r.weapons[state.lastHit!.weapon].visible = true; }
  r.body.scale.set(1, 1, 1); r.effect.visible = r.isBoss && hit;
  if (r.isBoss && hit) {
    const amount = Math.exp(-hitAge * 2.6); const weapon = state.lastHit!.weapon;
    if (weapon === 'punch') { r.head.rotation.z = Math.sin(hitAge * 27) * amount * (reduced ? .08 : .38); r.body.rotation.x = -.12 * amount; }
    if (weapon === 'hammer') { const squash = Math.sin(Math.min(hitAge * 8, Math.PI)) * amount; r.body.scale.set(1 + squash * .15, 1 - squash * .18, 1 + squash * .15); r.body.position.y += Math.max(0, Math.sin(hitAge * 12)) * amount * (reduced ? .04 : .20); }
    if (weapon === 'fan') { r.head.rotation.y = reduced ? .18 * amount : Math.sin(hitAge * 17) * amount * .9; r.body.rotation.z = Math.sin(hitAge * 15) * amount * .08; }
    r.stars.forEach((s, i) => { const a = i / r.stars.length * Math.PI * 2 + (reduced ? 0 : hitAge * 3); s.position.set(Math.cos(a) * .49, Math.sin(a * 2) * .10, Math.sin(a) * .49); const size = Math.max(.1, amount * 1.5); s.scale.set(size, weapon === 'fan' ? size * 1.55 : size, weapon === 'fan' ? .45 : 1); s.rotation.z = a; s.rotation.x = weapon === 'fan' && !reduced ? hitAge * 9 + i : 0; });
  }
  if (a.name !== r.lastName) { r.label.material.map?.dispose(); r.label.material.map = labelTexture(a.name, '#fffbee', '#325852'); r.label.material.needsUpdate = true; r.lastName = a.name; }
}
export function disposeModelCaches() { mats.forEach(m => m.dispose()); geos.forEach(g => g.dispose()); mats.clear(); geos.clear(); }
