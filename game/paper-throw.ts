import * as THREE from 'three';
import { WEAPON_IMPACT } from './layout.ts';
import type { Actor, Point } from './types.ts';

export const PAPER_RELEASE = .27;
const releaseRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-1.7, 0, -.10));
// Center of the held bundle when the arm completes its forward release.
const releasePoint = new THREE.Vector3(0, -.70, .04).applyQuaternion(releaseRotation).add(new THREE.Vector3(.33, 1.16, 0));
const bundleRotation = releaseRotation.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI));
export type PaperFlight = { group: THREE.Group; stack: THREE.Group; pages: THREE.Group[] };

export function createPaperFlight(parent: THREE.Object3D, held: THREE.Group, loose: THREE.Group[]): PaperFlight {
  const group = new THREE.Group(); group.name = 'paper-flight'; group.visible = false; group.userData.pointerPassthrough = true; parent.add(group);
  const stack = held.clone(true); stack.name = 'thrown-paper-stack'; stack.position.y = -.30; stack.rotation.set(0, 0, 0); group.add(stack);
  const pages = Array.from({ length: 7 }, (_, index) => {
    const page = new THREE.Group(); page.name = `flying-paper-${index}`;
    const sheet = loose[index % loose.length].clone(true); sheet.position.set(0, -.375, 0); sheet.rotation.set(0, 0, 0); page.add(sheet); group.add(page);
    return page;
  });
  return { group, stack, pages };
}

/** Stateless flight also reconstructs correctly for a newly received colleague snapshot. */
export function animatePaperFlight(flight: PaperFlight, actor: Actor, boss: Point, progress: number, reduced: boolean) {
  const { group, stack, pages } = flight;
  group.visible = progress >= PAPER_RELEASE && progress < .995;
  if (!group.visible) return;
  const target = new THREE.Vector3(boss.x - actor.x, 0, boss.z - actor.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), -actor.angle);
  const direction = target.clone().normalize(); if (!direction.lengthSq()) direction.z = 1;
  target.addScaledVector(direction, -.26); target.y = 1.48;
  const travel = THREE.MathUtils.clamp((progress - PAPER_RELEASE) / (WEAPON_IMPACT - PAPER_RELEASE), 0, 1);
  const scatter = THREE.MathUtils.smoothstep(progress, WEAPON_IMPACT, .83);
  const fall = THREE.MathUtils.clamp((progress - WEAPON_IMPACT) / (1 - WEAPON_IMPACT), 0, 1);
  group.position.copy(releasePoint).lerp(target, travel);
  group.position.y += Math.sin(travel * Math.PI) * (reduced ? .04 : .14) - fall * fall * (reduced ? .35 : .65);
  group.position.addScaledVector(direction, fall * .18);
  const facing = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(direction.x, direction.z));
  group.quaternion.copy(reduced ? facing : bundleRotation.clone().slerp(facing, travel));
  stack.visible = progress < WEAPON_IMPACT + .08;
  const fade = 1 - THREE.MathUtils.smoothstep(progress, .82, .995);
  pages.forEach((page, index) => {
    page.visible = progress >= WEAPON_IMPACT && (!reduced || index < 3);
    const angle = index * 2.4, spread = scatter * (reduced ? .55 : 1);
    page.position.set(Math.sin(angle) * (.55 + index * .025) * spread,
      Math.cos(angle) * .32 * spread + Math.sin(fall * Math.PI) * .14,
      Math.cos(angle * 1.3) * .42 * spread);
    page.rotation.set(reduced ? 0 : (.35 + index * .17) * scatter + Math.sin(fall * 11 + index) * scatter * .22,
      reduced ? 0 : Math.sin(angle) * scatter * .55, reduced ? 0 : (index - 3) * .14 * scatter);
    page.scale.setScalar(fade);
  });
}
