import type { EnvironmentFrame } from './environment-types.ts';
import type { Settings } from './types.ts';

const seed = (index: number) => ((Math.sin(index * 127.1 + 3) * 43758.5453) % 1 + 1) % 1;
const wrap = (value: number) => (value % 1 + 1) % 1;

/** Distant falling weather and close glass beads, clipped by the window plane.
 * The existing window depth and cutaways keep every mark behind indoor objects.
 */
export function paintWindowPrecipitation(context: CanvasRenderingContext2D, frame: EnvironmentFrame, clock: number, quality: Settings['quality']) {
  const { precipitation, daylight } = frame;
  if (precipitation === 'none') return;
  const { width, height } = context.canvas;
  const low = quality === 'low';
  context.save();
  context.fillStyle = precipitation === 'rain' ? 'rgba(30,51,70,.19)' : 'rgba(51,70,89,.12)';
  context.fillRect(0, 0, width, height);
  if (precipitation === 'snow') {
    for (let i = 0; i < (low ? 30 : 60); i++) {
      const near = seed(i + 120), speed = .025 + near * .065;
      const x = wrap(seed(i + 20) + Math.sin(clock * .45 + i * 2.1) * (.012 + near * .018)) * width;
      const y = wrap(seed(i + 60) + clock * speed) * height;
      context.globalAlpha = .4 + near * .5;
      context.fillStyle = '#f5fbff';
      context.beginPath();
      context.arc(x, y, 2 + near * 3.2, 0, Math.PI * 2);
      context.fill();
    }
    context.restore();
    return;
  }

  // Fine slanted streaks fall behind the glass at varying depths.
  context.strokeStyle = daylight < .3 ? '#d8eaff' : '#e0f2fb';
  context.lineCap = 'round';
  for (let i = 0; i < (low ? 55 : 110); i++) {
    const near = seed(i + 180), speed = .65 + near * .55;
    const x = wrap(seed(i + 40) - clock * speed * .08) * width;
    const y = wrap(seed(i + 90) + clock * speed) * (height + 25) - 25;
    const length = 9 + near * 17;
    context.globalAlpha = .38 + near * .35;
    context.lineWidth = 1.8 + near * 1.1;
    context.beginPath();
    context.moveTo(x, y);
    context.lineTo(x - length * .24, y + length);
    context.stroke();
  }

  // Most beads cling to the glass. A few gather weight, then slide down slowly.
  context.globalAlpha = 1;
  for (let i = 0; i < (low ? 16 : 28); i++) {
    const sliding = i % 5 === 0;
    const phase = wrap(seed(i + 400) + clock * (.025 + seed(i + 800) * .012));
    const travel = sliding ? Math.pow(Math.max(0, phase - .45) / .55, 2) * .6 : 0;
    const x = (seed(i + 300) * .94 + .03) * width;
    const y = wrap(seed(i + 500) + travel) * height;
    const radius = 4 + seed(i + 600) * 3.8;
    const ry = radius * (sliding ? 1.6 : 1.12);
    if (sliding && travel > .005) {
      const trail = Math.min(travel * height, 55);
      const wash = context.createLinearGradient(x, y - trail, x, y);
      wash.addColorStop(0, 'rgba(227,246,255,0)');
      wash.addColorStop(1, 'rgba(227,246,255,.25)');
      context.strokeStyle = wash;
      context.lineWidth = radius * .8;
      context.beginPath();
      context.moveTo(x, y - trail);
      context.lineTo(x, y);
      context.stroke();
    }
    const bead = context.createRadialGradient(x - radius * .3, y - ry * .3, .3, x, y, ry);
    bead.addColorStop(0, 'rgba(240,253,255,.48)');
    bead.addColorStop(.4, 'rgba(197,225,237,.07)');
    bead.addColorStop(.82, 'rgba(39,70,88,.18)');
    bead.addColorStop(1, 'rgba(235,250,255,.44)');
    context.fillStyle = bead;
    context.beginPath();
    context.ellipse(x, y, radius, ry, 0, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = 'rgba(28,56,73,.24)';
    context.lineWidth = .65;
    context.stroke();
    context.fillStyle = 'rgba(248,255,255,.8)';
    context.beginPath();
    context.ellipse(x - radius * .32, y - ry * .34, radius * .23, radius * .14, -.6, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}
