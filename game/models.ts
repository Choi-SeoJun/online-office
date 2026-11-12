import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Actor, AvatarStyle, GameState, Snack, Weapon } from './types.ts';
import { DESKS, ROOF_REST, WEAPONS, WEAPON_IMPACT } from './layout.ts';
import { chairSpinAngle, workExpression } from './expression.ts';
import { animateDanceEffects, createDanceEffects, type DanceEffects } from './dance-effects.ts';

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
export function labelTexture(text: string, bg: string, color: string, width = 512, height = 128, fontScale = .39) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d')!; ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(0, 0, width, height, 24); ctx.fill();
  ctx.fillStyle = color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = `700 ${height * fontScale}px "Malgun Gothic", "Apple SD Gothic Neo", sans-serif`; ctx.fillText(text, width / 2, height / 2 + 2, width - 32);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; return texture;
}
export function plaque(parent: THREE.Object3D, text: string, w: number, h: number, x: number, y: number, z: number, bg = '#284c4a', fg = '#fff9e9') {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: labelTexture(text, bg, fg), transparent: true })); m.position.set(x, y, z); parent.add(m); return m;
}
function updateSpriteLabel(sprite: THREE.Sprite, text: string, color: string) {
  // Keep letters large even for a ten-character name: grow the tag instead of
  // squeezing the glyphs into the old, tiny four-to-one name plate.
  const width = Math.max(512, Array.from(text).length * 88 + 48), baseWidth = sprite.userData.labelWidth as number;
  sprite.material.map?.dispose();
  sprite.material.map = labelTexture(text, '#fffdf5', color, width, 160, .55);
  sprite.material.needsUpdate = true; sprite.scale.set(baseWidth * width / 512, baseWidth * 160 / 512, 1);
}
export function spriteLabel(parent: THREE.Object3D, text: string, color = '#243e35', w = 1.2) {
  // Labels are UI: scenic fog and filmic exposure must not wash out their ink.
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false, toneMapped: false, fog: false }));
  sprite.renderOrder = 1000; sprite.userData.pointerPassthrough = true;
  sprite.userData.labelWidth = w; updateSpriteLabel(sprite, text, color); parent.add(sprite); return sprite;
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

type Rig = { root: THREE.Group; body: THREE.Group; head: THREE.Group; hairStyles: Record<AvatarStyle, THREE.Group>; ponytail: THREE.Group; lastAvatar: AvatarStyle; mouth: THREE.Object3D; leftArm: THREE.Group; rightArm: THREE.Group; legs: THREE.Group[]; calves: THREE.Group[]; hand: THREE.Group; weapons: Record<Weapon, THREE.Group>; loosePages: THREE.Group[]; snacks: Record<Snack, THREE.Group>; candy: THREE.Group; wrapper: THREE.Group; mouthCandy: THREE.Group; mug: THREE.Group; steam: THREE.Group; crumbs: THREE.Group; label: THREE.Sprite; effect: THREE.Group; stars: THREE.Mesh[]; dance: DanceEffects; isBoss: boolean; lastName: string };
export function createActor(parent: THREE.Object3D, role: number, name: string, avatar: AvatarStyle = 'short'): Rig {
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
  const hairStyles = { short: new THREE.Group(), ponytail: new THREE.Group() };
  for (const [style, group] of Object.entries(hairStyles)) { group.name = `${style}-hair`; group.visible = style === avatar; group.scale.setScalar(group.visible ? 1 : 0); head.add(group); }
  for (let i = 0; i < 4; i++) sphere(hairStyles.short, .105, hair, -.23 + i * .14, .195 + Math.sin(i) * .02, .20, 1.13, .60, .85);
  if (role === 3) sphere(hairStyles.short, .18, hair, 0, .04, -.31);
  // The tied tail is attached to the head, so its outline stays recognizable
  // while typing, drinking, leaning or turning. Both styles reuse their meshes.
  for (const side of [-1, 1]) {
    const swept = sphere(hairStyles.ponytail, .15, hair, side * .18, .18, .20, 1.12, .55, .65); swept.rotation.z = side * .30;
    sphere(hairStyles.ponytail, .09, hair, side * .295, .015, -.04, .58, 1.65, 1);
  }
  const ponytail = new THREE.Group(); ponytail.position.set(0, .12, -.26); hairStyles.ponytail.add(ponytail);
  sphere(ponytail, .135, hair, 0, .02, -.08, 1, 1, 1.15);
  const hairTie = cylinder(ponytail, .095, .095, .07, '#c79a68', 0, -.02, -.17);
  hairTie.name = 'ponytail-tie'; hairTie.rotation.x = Math.PI / 2;
  sphere(ponytail, .145, hair, 0, -.215, -.22, .9, 1.65, .95);
  sphere(ponytail, .115, hair, .025, -.43, -.27, .85, 1.55, .85);
  const tailTip = sphere(ponytail, .08, hair, .05, -.59, -.26, .70, 1.25, .72);
  tailTip.name = 'ponytail-tip'; tailTip.rotation.z = -.20;
  for (const side of [-1, 1]) { sphere(head, .025, '#343e39', side * .115, -.015, .292, .85, 1.15, .5); sphere(head, .047, '#df9b83', side * .215, -.095, .264, 1, .45, .25); }
  sphere(head, .042, skin, 0, -.06, .31, .7, .6, .8);
  const smile = new THREE.Mesh(new THREE.TorusGeometry(.062, .009, 5, 12, Math.PI * .7), material('#805945')); smile.rotation.z = Math.PI * 1.15; smile.position.set(.028, -.10, .294); head.add(smile);
  const mouth = new THREE.Object3D(); mouth.name = 'mouth-contact'; mouth.position.set(0, -.12, .304); head.add(mouth);
  if (boss) { for (const side of [-1, 1]) { const glasses = new THREE.Mesh(new THREE.TorusGeometry(.074, .009, 5, 14), material('#5d5d4f')); glasses.position.set(side * .116, -.01, .312); head.add(glasses); } box(head, .08, .012, .012, '#5d5d4f', 0, -.005, .314, 0); }
  const arms: THREE.Group[] = [];
  for (const side of [-1, 1]) { const arm = new THREE.Group(); arm.position.set(side * .33, 1.16, 0); body.add(arm); box(arm, .16, .37, .18, shirt, 0, -.16, 0, .06); sphere(arm, .092, skin, 0, -.37, .015, .85, 1, .85); arms.push(arm); }
  const hand = new THREE.Group(); hand.position.set(0, -.40, .04); arms[1].add(hand);
  const weapons = { punch: new THREE.Group(), hammer: new THREE.Group(), fan: new THREE.Group() }; Object.values(weapons).forEach(g => hand.add(g));
  sphere(weapons.punch, .13, '#eeb48a', 0, 0, 0, 1.08, .9, 1.1);
  cylinder(weapons.hammer, .036, .045, .48, '#cf825d', 0, .14);
  for (let i = 0; i < 4; i++) cylinder(weapons.hammer, .048, .048, .022, '#efbb83', 0, -.03 + i * .045);
  const hammer = new THREE.Group(); hammer.name = 'hammer-head'; hammer.position.y = .43; weapons.hammer.add(hammer);
  const center = cylinder(hammer, .135, .135, .44, '#e9a14f'); center.rotation.z = Math.PI / 2;
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) { const ridge = cylinder(hammer, .19 + i * .012, .19 + i * .012, .035, i % 2 ? '#edb459' : '#f5c76d', side * (.12 + i * .043)); ridge.rotation.z = Math.PI / 2; }
    const cap = cylinder(hammer, .218, .218, .045, '#efb35d', side * .25); cap.rotation.z = Math.PI / 2;
  }
  // Keep the saved "fan" identifier while replacing the object with a thick
  // sheaf of office reports. Slight offsets expose the layered paper edges.
  weapons.fan.name = 'held-paper-stack';
  const stack = box(weapons.fan, .54, .75, .11, '#e4dfd1', 0, .30, 0, .008); stack.name = 'paper-stack-core';
  for (let i = 0; i < 8; i++) {
    const paper = box(weapons.fan, .55, .75, .009, i % 2 ? '#f9f7ed' : '#dedbcf', (i % 3 - 1) * .009, .30 + (i % 2) * .006, -.052 + i * .015, .003);
    paper.name = `paper-layer-${i}`;
  }
  const loosePages: THREE.Group[] = [];
  for (let i = 0; i < 2; i++) {
    const page = new THREE.Group(); page.name = `loose-paper-${i}`; page.position.set(i * .009, -.065, .068 + i * .012); weapons.fan.add(page); loosePages.push(page);
    box(page, .55, .75, .009, '#fffdf4', 0, .375, 0, .003);
    box(page, .32, .035, .004, '#8baca8', -.035, .64, .007, 0);
    for (let line = 0; line < 5; line++) box(page, line === 4 ? .20 : .37, .009, .004, '#b4b9ad', line === 4 ? -.085 : 0, .54 - line * .066, .007, 0);
    box(page, .09, .055, .004, '#c78c7b', .16, .13, .007, .002);
  }
  weapons.hammer.rotation.z = Math.PI; weapons.fan.rotation.z = Math.PI;
  const snacks = { cookie: new THREE.Group(), choco: new THREE.Group(), cracker: new THREE.Group() };
  for (const [kind, item] of Object.entries(snacks)) { item.name = `held-${kind}`; item.visible = false; hand.add(item); }
  const cookie = cylinder(snacks.cookie, .135, .135, .045, '#d8a058'); cookie.rotation.x = Math.PI / 2;
  for (let i = 0; i < 7; i++) { const angle = i * 2.4; sphere(snacks.cookie, .017, '#654532', Math.sin(angle) * .087, Math.cos(angle) * .087, .026, 1, 1, .35); }
  box(snacks.choco, .14, .27, .055, '#694535', 0, 0, 0, .015);
  box(snacks.choco, .153, .14, .065, '#b17a87', 0, -.065, 0, .012);
  for (let i = 0; i < 2; i++) box(snacks.choco, .12, .006, .003, '#a07550', 0, .04 + i * .065, .029, 0);
  box(snacks.cracker, .23, .23, .045, '#e2c183', 0, 0, 0, .023);
  for (const x of [-.055, .055]) for (const y of [-.055, .055]) sphere(snacks.cracker, .012, '#ad8b50', x, y, .024, 1, 1, .25);
  const candy = new THREE.Group(); candy.name = 'held-candy'; candy.visible = false; hand.add(candy);
  cylinder(candy, .010, .010, .32, '#fff8e9', 0, -.005);
  const sweet = sphere(candy, .075, '#e2a16e', 0, .16, 0, 1, 1, .94); sweet.name = 'candy-sweet';
  sweet.material = material('#e2a16e', .13);
  sphere(candy, .018, '#fff3d6', -.024, .192, .052, 1, .45, .35).material = material('#fff3d6', .1);
  const wrapper = new THREE.Group(); wrapper.name = 'candy-wrapper'; wrapper.visible = false; candy.add(wrapper);
  const film = sphere(wrapper, .093, '#f9edc8', 0, .16, 0, 1, 1.12, .95);
  film.material = new THREE.MeshStandardMaterial({ color: '#f7edcf', transparent: true, opacity: .48, roughness: .35, depthWrite: false });
  for (const side of [-1, 1]) { const twist = box(wrapper, .058, .045, .036, '#f0d9b6', 0, .16 + side * .116, 0, .006); twist.rotation.z = side * .5; }
  // Once inserted, the sweet is inside the mouth. A separate lip-mounted stem
  // lets the hands relax and follows the head through sitting, leaning or walking.
  const mouthCandy = new THREE.Group(); mouthCandy.name = 'mouth-candy-stick'; mouthCandy.visible = false; mouth.add(mouthCandy);
  const stickDirection = new THREE.Vector3(.08, -.14, 1).normalize();
  const stem = cylinder(mouthCandy, .010, .010, .29, '#fff8e9'); stem.name = 'mouth-candy-stem';
  stem.position.copy(stickDirection).multiplyScalar(.145);
  stem.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), stickDirection);
  const actorMug = mug(arms[1], 0, -.33, .10, '#e6b77e'); actorMug.visible = false;
  actorMug.name = 'held-coffee'; actorMug.scale.setScalar(1.2);
  const steam = new THREE.Group(); steam.name = 'coffee-steam'; actorMug.add(steam);
  for (let i = 0; i < 3; i++) sphere(steam, .025, '#faf5df', (i - 1) * .035, .22 + i * .05, 0, .7, 1.8, .7);
  steam.visible = false;
  const crumbs = new THREE.Group(); crumbs.name = 'snack-crumbs'; body.add(crumbs); crumbs.visible = false;
  for (let i = 0; i < 4; i++) box(crumbs, .025, .026, .021, i % 2 ? '#b88147' : '#edc98a', (i - 1.5) * .04, 1.2, .36, .003);
  const label = spriteLabel(root, name, boss ? '#51372d' : '#243e35', 1.2); label.position.y = 2.16;
  const effect = new THREE.Group(); effect.position.y = 1.90; root.add(effect); const stars: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) { const star = box(effect, .13, .13, .035, i % 2 ? '#f5c35a' : '#fff5cf', 0, 0, 0, .01); star.rotation.z = Math.PI / 4; stars.push(star); }
  effect.visible = false;
  const dance = createDanceEffects(root);
  return { root, body, head, hairStyles, ponytail, lastAvatar: avatar, mouth, leftArm: arms[0], rightArm: arms[1], legs, calves, hand, weapons, loosePages, snacks, candy, wrapper, mouthCandy, mug: actorMug, steam, crumbs, label, effect, stars, dance, isBoss: boss, lastName: name };
}

// Aim the wrist at the prop's grip and its actual rim/bite edge at the lips.
// Everything is solved in the body frame, so turning, sitting and head tilt work
// identically without hand-tuned world-space offsets.
function bringToMouth(r: Rig, item: THREE.Object3D, contact: THREE.Vector3, grip: THREE.Vector3, amount: number, size: number, tilt = 0) {
  r.root.updateMatrixWorld(true);
  const bodyRotation = r.body.getWorldQuaternion(new THREE.Quaternion());
  const startPosition = r.body.worldToLocal(item.getWorldPosition(new THREE.Vector3()));
  const startRotation = bodyRotation.clone().invert().multiply(item.getWorldQuaternion(new THREE.Quaternion()));
  const rotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0));
  const mouth = r.body.worldToLocal(r.mouth.getWorldPosition(new THREE.Vector3()));
  const endPosition = mouth.sub(contact.clone().multiplyScalar(size).applyQuaternion(rotation));
  const itemPosition = startPosition.lerp(endPosition, amount);
  const itemRotation = startRotation.slerp(rotation, amount);
  const wrist = grip.clone().multiplyScalar(size).applyQuaternion(itemRotation).add(itemPosition);
  const direction = wrist.sub(r.rightArm.position);
  const handVector = r.hand.position.clone();
  const reach = direction.length() / handVector.length();
  r.rightArm.scale.setScalar(reach);
  r.rightArm.quaternion.setFromUnitVectors(handVector.normalize(), direction.normalize());
  r.root.updateMatrixWorld(true);
  item.position.copy(item.parent!.worldToLocal(r.body.localToWorld(itemPosition)));
  item.quaternion.copy(item.parent!.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(bodyRotation).multiply(itemRotation));
  item.scale.setScalar(size / reach);
}
export function animateActor(r: Rig, a: Actor, state: GameState, time: number) {
  const avatar = a.avatar === 'ponytail' ? 'ponytail' : 'short';
  if (avatar !== r.lastAvatar) {
    for (const [style, group] of Object.entries(r.hairStyles)) { group.visible = style === avatar; group.scale.setScalar(group.visible ? 1 : 0); }
    r.lastAvatar = avatar;
  }
  const reduced = state.settings.reducedMotion; const player = a.id === state.player.id; const walk = a.moving || a.pose === 'walk';
  animateDanceEffects(r.dance, a.pose === 'dance' && state.floor === 'office' && !state.transition && !walk, time, reduced);
  const roofRest = player && state.floor === 'rooftop' && !walk ? state.roofRest : null;
  // A long tail rests to one side of the shoulder when the back meets a wall.
  r.ponytail.rotation.y = roofRest === 'wall' ? 1.5 : 0;
  const atDesk = !player && DESKS.some(d => d.owner === a.id && Math.hypot(a.x - d.x, a.z - d.z - 1.05) < .2);
  const seated = !walk && (player ? state.seat !== null : ['sit', 'type', 'sleep', 'lean'].includes(a.pose) || (atDesk && ['drink', 'eat'].includes(a.pose)));
  const activity = player && state.activity?.kind === a.pose ? state.activity : null;
  const progress = activity ? THREE.MathUtils.clamp(1 - activity.remaining / activity.duration, 0, 1) : .5;
  const ease = (start: number, end: number) => THREE.MathUtils.smoothstep(progress, start, end);
  const lift = ease(.02, .3) * (1 - ease(.75, 1));
  r.root.position.set(a.x, 0, a.z); r.root.rotation.y = a.angle;
  const wave = Math.sin(time * 9 + (a.id.length % 3));
  r.body.position.y = roofRest === 'bench' ? ROOF_REST.bench.seatTop + .095 - .66 : seated ? -.17 : walk && !reduced ? Math.abs(wave) * .035 : 0;
  r.body.position.x = r.body.position.z = 0; r.body.scale.set(1, 1, 1);
  r.body.rotation.set(0, 0, 0); r.head.position.z = 0; r.head.rotation.set(0, reduced ? 0 : Math.sin(time * .7) * .025, 0); r.leftArm.rotation.set(0, 0, .07); r.rightArm.rotation.set(0, 0, -.07);
  r.leftArm.scale.set(1, 1, 1); r.rightArm.scale.set(1, 1, 1); r.hand.rotation.set(0, 0, 0);
  r.mug.position.set(0, -.33, .10); r.mug.rotation.set(0, 0, 0); r.mug.scale.setScalar(1.2); r.steam.visible = r.crumbs.visible = false;
  Object.values(r.snacks).forEach(item => { item.visible = false; item.position.set(0, 0, 0); item.scale.setScalar(1); item.rotation.set(0, 0, 0); });
  r.candy.visible = r.wrapper.visible = false; r.candy.position.set(0, 0, 0); r.candy.rotation.set(0, 0, 0); r.candy.scale.setScalar(1); r.wrapper.scale.setScalar(1);
  r.mouthCandy.visible = player && state.floor === 'rooftop' && !state.transition && state.candyInMouth && !['drink', 'eat'].includes(a.pose);
  Object.entries(r.weapons).forEach(([kind, item]) => { item.visible = false; item.rotation.set(0, 0, kind === 'punch' ? 0 : Math.PI); });
  r.loosePages.forEach(page => { page.rotation.set(0, 0, 0); });
  r.legs.forEach((leg, i) => { leg.rotation.x = seated ? -1.42 : walk ? wave * .42 * (i ? -1 : 1) : 0; r.calves[i].rotation.x = seated ? 1.44 : 0; });
  if (roofRest === 'bench') r.legs.forEach((leg, i) => { leg.rotation.x = -Math.PI / 2; r.calves[i].rotation.x = Math.PI / 2; });
  if (roofRest === 'wall') {
    r.body.rotation.x = -.12; r.body.position.set(0, .015, -.095);
    // The stylised head is wider than the torso; a relaxed forward neck keeps
    // its back clear of the wall while the upper back makes contact.
    r.head.position.z = .265; r.head.rotation.x = .12;
    r.legs[0].rotation.x = .12; r.calves[0].rotation.x = 0;
    r.legs[1].rotation.x = -.33; r.calves[1].rotation.x = 1.95;
  }
  if (walk) { r.leftArm.rotation.x = -wave * .32; r.rightArm.rotation.x = wave * .32; }
  if (a.pose === 'type') {
    const work = workExpression(time), sigh = player && state.deskMode !== 'work' ? 0 : work.sigh;
    const taps = reduced || sigh > .05 ? 0 : 1;
    r.leftArm.rotation.x = -1.08 + Math.sin(time * 15) * .13 * taps + sigh * .32;
    r.rightArm.rotation.x = -1.08 + Math.cos(time * 17) * .13 * taps + sigh * .32;
    r.leftArm.rotation.y = -.10; r.rightArm.rotation.y = .10;
    r.body.rotation.x = .035 + sigh * .14;
    r.body.position.y -= sigh * (reduced ? .015 : .055);
    r.head.rotation.x = .13 + sigh * .25;
    r.head.rotation.y = reduced ? 0 : Math.sin(time * .7) * .035 * (1 - sigh);
  }
  if (a.pose === 'sleep') { r.head.rotation.x = .36 + Math.sin(time * 1.5) * .05; r.body.rotation.x = .15; r.leftArm.rotation.x = -.7; r.rightArm.rotation.x = -.7; }
  if (a.pose === 'lean') {
    r.body.rotation.x = -.16; r.body.position.z = .14; r.head.rotation.x = -.1;
    r.leftArm.rotation.set(-2.45, -.15, .45); r.rightArm.rotation.set(-2.45, .15, -.45);
  }
  if (a.pose === 'watch' || a.pose === 'scold') { r.rightArm.rotation.x = -.8; r.rightArm.rotation.z = -.8; }
  if (a.pose === 'spin') r.body.rotation.y = chairSpinAngle(state);
  if (a.pose === 'dance') {
    const beat = reduced ? 0 : Math.sin(time * Math.PI * 3), sway = reduced ? 0 : Math.sin(time * Math.PI * 1.5);
    r.body.position.y = reduced ? 0 : .035 + Math.abs(beat) * .07;
    r.body.position.x = sway * .12; r.body.rotation.z = sway * .10;
    r.body.rotation.y = sway * .20;
    r.head.rotation.z = -sway * .10; r.head.rotation.x = -.07;
    r.leftArm.rotation.set(-1.25 - beat * .60, -.20, .75 + sway * .25);
    r.rightArm.rotation.set(-1.25 + beat * .60, .20, -.75 + sway * .25);
    r.legs[0].rotation.x = .12 + beat * .24; r.legs[1].rotation.x = .12 - beat * .24;
    r.calves[0].rotation.x = .18 + Math.max(0, beat) * .30;
    r.calves[1].rotation.x = .18 + Math.max(0, -beat) * .30;
  }
  const carryingCoffee = player && !state.candyInMouth && state.inventory.coffee > 0 && ['idle', 'walk', 'sit', 'lean'].includes(a.pose);
  r.mug.visible = carryingCoffee || a.pose === 'drink';
  if (carryingCoffee) { r.rightArm.rotation.set(-.85, 0, -.07); }
  if (a.pose === 'brew' && activity) {
    const reach = ease(.04, .28) * (1 - ease(.69, .93));
    r.rightArm.rotation.set(-.35 - reach * 1.13, 0, -.08);
    r.rightArm.scale.y = 1 + reach * .12; r.body.rotation.x = reach * .09;
    r.leftArm.rotation.x = -.4 - reach * .55; r.head.rotation.x = .1 * reach;
    r.mug.visible = progress > .18;
    // The cup remains upright while the arm reaches under the machine and returns.
    r.steam.visible = progress > .5 && !reduced;
    if (progress > .93) r.rightArm.rotation.x = -.85;
  }
  if (a.pose === 'take' && activity?.snack) {
    const reach = ease(.02, .3) * (1 - ease(.56, .95));
    r.rightArm.rotation.set(-.2 - reach * 1.35, 0, -.12 - .15 * ease(.6, .95));
    r.rightArm.scale.y = 1 + reach * .14; r.body.rotation.x = reach * .12;
    r.head.rotation.x = .14; r.leftArm.rotation.x = -.35;
    const snack = r.snacks[activity.snack]; snack.visible = progress >= .28 && progress < .97;
    snack.scale.setScalar(1 - ease(.82, 1) * .9);
    r.mug.visible = false;
  }
  if (a.pose === 'drink') {
    const amount = activity ? lift : .9;
    r.rightArm.rotation.set(-.85, 0, -.07);
    r.head.rotation.x = -.1 * amount; r.leftArm.rotation.x = -.3;
    if (!reduced && amount > .9) r.head.rotation.x += Math.sin(progress * Math.PI * 8) * .025;
  }
  if (a.pose === 'eat' && activity?.snack) {
    r.rightArm.rotation.set(-.4, 0, -.07);
    r.leftArm.rotation.x = -.25; r.head.rotation.x = lift * .04;
    const snack = r.snacks[activity.snack]; snack.visible = progress < .96;
    snack.scale.setScalar(progress > .54 ? .68 : 1);
    r.crumbs.visible = !reduced && progress > .36 && progress < .76;
    r.crumbs.children.forEach((crumb, i) => { const fall = (progress * 3 + i * .22) % 1; crumb.position.set((i - 1.5) * .055, 1.34 - fall * .28, .35 + fall * .08); });
    r.mug.visible = false;
  }
  if (a.pose === 'candy' && activity) {
    const unwrap = 1 - ease(.10, .24);
    r.candy.visible = progress < .68; r.wrapper.visible = progress < .20; r.wrapper.scale.setScalar(1 + ease(.10, .20) * .18);
    r.mouthCandy.visible = progress >= .68;
    r.rightArm.rotation.set(-.75, 0, -.12);
    r.leftArm.rotation.set(-unwrap * .95, 0, .07 + unwrap * .43);
    r.head.rotation.x -= .045 * ease(.24, .4) * (1 - ease(.68, .98));
    r.mug.visible = false;
  }
  r.mug.quaternion.copy(r.rightArm.quaternion).invert();
  if (a.pose === 'drink') bringToMouth(r, r.mug, new THREE.Vector3(0, .143, -.061), new THREE.Vector3(.09, .075, 0), activity ? lift : 1, 1.2, .28);
  if (a.pose === 'eat' && activity?.snack) {
    const snack = r.snacks[activity.snack];
    bringToMouth(r, snack, new THREE.Vector3(0, activity.snack === 'cracker' ? .115 : .135, 0), new THREE.Vector3(0, -.045, 0), lift, progress > .54 ? .68 : 1);
  }
  if (a.pose === 'candy' && activity) {
    const contact = new THREE.Vector3(0, .235 - .075 * ease(.52, .66), 0);
    bringToMouth(r, r.candy, contact, new THREE.Vector3(0, -.06, 0), ease(.16, .5), 1, -Math.PI / 2 + .14);
    const release = ease(.68, .98);
    r.rightArm.quaternion.slerp(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -.07)), release);
    r.rightArm.scale.lerp(new THREE.Vector3(1, 1, 1), release);
  }
  r.steam.children.forEach((puff, i) => { const rise = (progress * 2 + i / 3) % 1; puff.position.y = .20 + rise * .22; puff.scale.setScalar(.65 + rise * .5); });
  const presentingTool = player && state.entered && state.floor === 'office' && state.target === 'boss' && state.ready && !state.transition && !state.activity && !seated && !walk && a.pose === 'idle' && state.weapon !== 'punch';
  if (presentingTool) {
    const tool = r.weapons[state.weapon]; tool.visible = true; r.mug.visible = false;
    r.rightArm.rotation.set(-.65, 0, .45);
    r.root.updateMatrixWorld(true);
    // The office camera has this fixed isometric direction. Keep the broad
    // paper face visible while waiting on either side of the boss.
    const presentation = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(16, 20, 24), new THREE.Vector3(), new THREE.Vector3(0, 1, 0)));
    tool.quaternion.copy(r.hand.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(presentation));
  }
  const visualHit = r.isBoss ? state.bossHit ?? state.lastHit : state.lastHit;
  const hitAge = visualHit ? state.elapsed - visualHit.at : 10;
  const swingDuration = visualHit ? WEAPONS[visualHit.weapon].interval : .55;
  if (player && a.pose === 'hit' && hitAge >= 0 && hitAge < swingDuration && state.lastHit) {
    const p = hitAge / swingDuration, windup = THREE.MathUtils.smoothstep(p, 0, .23), strike = THREE.MathUtils.smoothstep(p, .23, WEAPON_IMPACT), recover = THREE.MathUtils.smoothstep(p, .62, 1);
    const weapon = state.lastHit.weapon; const finish = 1 - recover;
    const gap = Math.hypot(state.boss.x - a.x, state.boss.z - a.z);
    r.weapons[weapon].visible = true; r.mug.visible = false;
    r.leftArm.rotation.set(-.8, 0, .3); r.body.position.z = reduced ? 0 : Math.sin(p * Math.PI) * .12;
    if (weapon === 'punch') {
      r.rightArm.rotation.set(THREE.MathUtils.lerp(-.55 - .3 * windup, -1.55, strike) * finish, -.35 * (1 - strike), -.5 * (1 - strike) - .05);
      r.rightArm.scale.y = 1 + .38 * strike * finish;
      r.body.rotation.y = (reduced ? .05 : .17) * (windup - 2 * strike) * finish;
      r.body.position.z = THREE.MathUtils.clamp(gap - 1.05, .05, .55) * strike * finish;
      if (!seated) { r.legs[0].rotation.x = -.35 * strike * finish; r.calves[0].rotation.x = .25 * strike * finish; }
    } else if (weapon === 'hammer') {
      r.rightArm.rotation.set(THREE.MathUtils.lerp(-1.1 - 1.55 * windup, -1.75, strike) * finish, THREE.MathUtils.lerp(-.65 * windup, .25, strike) * finish, THREE.MathUtils.lerp(-.9 * windup, -.06, strike) * finish);
      r.leftArm.rotation.x = -.8 - .65 * windup * finish;
      r.body.rotation.x = (reduced ? .04 : .13) * strike * finish;
      r.body.rotation.y = (.18 * windup - .3 * strike) * finish;
      // Keep functional reach when reduced motion removes the extra body sway.
      r.body.position.z = THREE.MathUtils.clamp(gap - 1.2, 0, .3) * strike * finish;
    } else {
      // One overhead lift and a firm downward smack: the long end of the
      // sheaf follows the hand, without turning into the former side-to-side fan.
      r.rightArm.rotation.set(THREE.MathUtils.lerp(-.75 - 2.20 * windup, -1.82, strike) * finish, 0, -.10);
      r.rightArm.scale.y = 1 + (.18 * windup * (1 - strike) + .08 * strike) * finish;
      r.leftArm.rotation.set(-.7 - .6 * windup * (1 - strike), 0, .22);
      r.body.position.z = THREE.MathUtils.clamp(gap - 1.15, .08, .35) * strike * finish;
      r.body.rotation.x = (reduced ? .02 : .08) * strike * finish;
      if (!seated) { r.legs[0].rotation.x = -.22 * strike * finish; r.calves[0].rotation.x = .16 * strike * finish; }
      const flutter = reduced ? 0 : Math.sin(THREE.MathUtils.clamp((p - WEAPON_IMPACT) / .30, 0, 1) * Math.PI) * finish;
      r.loosePages.forEach((page, i) => { page.rotation.x = (.14 + i * .10) * flutter; page.rotation.z = (i ? .04 : -.035) * flutter; });
    }
  }
  const reactionAge = hitAge - swingDuration * WEAPON_IMPACT;
  const hit = reactionAge >= 0 && hitAge < 2;
  r.effect.visible = r.isBoss && hit;
  if (r.isBoss && hit) {
    const amount = THREE.MathUtils.smoothstep(reactionAge, 0, .07) * Math.exp(-reactionAge * 2.6); const weapon = visualHit!.weapon;
    if (weapon === 'punch') { r.head.rotation.z = Math.sin(reactionAge * 27) * amount * (reduced ? .08 : .38); r.body.rotation.x = -.12 * amount; }
    if (weapon === 'hammer') { const squash = Math.sin(Math.min(reactionAge * 8, Math.PI)) * amount; r.body.scale.set(1 + squash * .15, 1 - squash * .18, 1 + squash * .15); r.body.position.y += Math.max(0, Math.sin(reactionAge * 12)) * amount * (reduced ? .04 : .20); }
    if (weapon === 'fan') { r.head.rotation.x = (reduced ? .08 : .25) * amount; r.body.position.y -= (reduced ? .025 : .09) * amount; r.body.rotation.x = .06 * amount; }
    r.stars.forEach((s, i) => { const a = i / r.stars.length * Math.PI * 2 + (reduced ? 0 : reactionAge * 3); s.position.set(Math.cos(a) * .49, Math.sin(a * 2) * .10, Math.sin(a) * .49); const size = Math.max(.1, amount * 1.5); s.scale.set(size, weapon === 'fan' ? size * 1.55 : size, weapon === 'fan' ? .45 : 1); s.rotation.z = a; s.rotation.x = weapon === 'fan' && !reduced ? reactionAge * 9 + i : 0; });
  }
  if (a.name !== r.lastName) { updateSpriteLabel(r.label, a.name, r.isBoss ? '#51372d' : '#243e35'); r.lastName = a.name; }
}
export function disposeModelCaches() { mats.forEach(m => m.dispose()); geos.forEach(g => g.dispose()); mats.clear(); geos.clear(); }
