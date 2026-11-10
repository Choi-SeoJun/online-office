import type { Point } from './types.ts';
import type { RoomPlayer } from './multi-types.ts';
import { createMultiLayout, isMultiWalkable, multiPath } from './multi-layout.ts';

/** Local movement stays responsive; only the resulting pose is synchronized. */
export function createMultiController(initial: RoomPlayer, capacity: number) {
  const player:RoomPlayer = { ...initial, pose:initial.pose==='drink'?'idle':initial.pose };
  let layout = createMultiLayout(capacity), path: Point[] = [], axis = { x: 0, z: 0 };
  let arrival: 'sit' | 'type' | 'drink' | null = null, drinkTime = 0;
  const stop = () => { path = []; arrival = null; axis = { x: 0, z: 0 }; drinkTime = 0; player.moving = false; };
  const move = (point: Point) => {
    stop(); player.pose = 'idle'; path = multiPath(layout, player, point);
  };
  const approach = (point: Point, pose: 'sit' | 'type' | 'drink') => {
    move(point);
    if (path.length || Math.hypot(player.x-point.x, player.z-point.z) < .1) arrival = pose;
  };
  return {
    player,
    get layout() { return layout; },
    setLayout(capacity: number, seatIndex: number) {
      player.seatIndex = seatIndex;
      if (layout.capacity === capacity) return;
      stop(); layout = createMultiLayout(capacity);
      if (!isMultiWalkable(layout, player)) Object.assign(player, layout.spawn, { pose: 'idle' });
    },
    move,
    sit(work = false) { const desk = layout.desks[player.seatIndex]; if (desk) approach(desk.seat, work ? 'type' : 'sit'); },
    stand() { stop(); player.pose = 'idle'; },
    coffee() { approach(layout.coffee, 'drink'); },
    rest() { move(layout.lounge); },
    setAxis(next: Point) {
      axis = next;
      if (axis.x || axis.z) { path = []; arrival = null; drinkTime = 0; player.pose = 'idle'; }
    },
    step(dt: number) {
      dt = Math.max(0, Math.min(.05, dt));
      let moving = false;
      if (axis.x || axis.z) {
        const length = Math.hypot(axis.x, axis.z), dx = axis.x / length * 3.2 * dt, dz = axis.z / length * 3.2 * dt;
        const next = {x: player.x + dx, z: player.z + dz};
        if (isMultiWalkable(layout, next)) { Object.assign(player, next); moving = true; }
        else {
          if (isMultiWalkable(layout, {x:next.x,z:player.z})) { player.x=next.x; moving=Math.abs(dx)>0; }
          if (isMultiWalkable(layout, {x:player.x,z:next.z})) { player.z=next.z; moving ||= Math.abs(dz)>0; }
        }
        if (moving) player.angle = Math.atan2(axis.x, axis.z);
      } else if (path.length) {
        const point=path[0], dx=point.x-player.x, dz=point.z-player.z, distance=Math.hypot(dx,dz), step=3.2*dt;
        if (distance <= step) { Object.assign(player, point); path.shift(); }
        else { player.x += dx/distance*step; player.z += dz/distance*step; }
        if(distance>.0001) player.angle=Math.atan2(dx,dz);
        moving = true;
      }
      player.moving=moving;
      if (moving) player.pose='walk';
      else if (player.pose==='walk') player.pose='idle';
      if (!path.length && arrival && !axis.x && !axis.z) {
        player.pose=arrival; player.moving=false;
        if (arrival==='drink') { player.angle=Math.PI/2; drinkTime=3; }
        else player.angle=layout.desks[player.seatIndex].angle;
        arrival=null;
      }
      if(drinkTime>0) { drinkTime-=dt; if(drinkTime<=0) player.pose='idle'; }
    },
  };
}
