import type { Vec } from './physics';

export interface Bounds { x0: number; x1: number; y0: number; y1: number }

/** World (m, y up) <-> screen (CSS px, y down). */
export class Camera {
  scale = 40; // px per metre
  ox = 0;
  oy = 0;
  w = 0;
  h = 0;
  fit(b: Bounds, w: number, h: number, padTop: number, padBottom: number): void {
    this.w = w; this.h = h;
    const ah = Math.max(50, h - padTop - padBottom);
    this.scale = Math.min((w - 24) / (b.x1 - b.x0), ah / (b.y1 - b.y0));
    this.ox = w / 2 - ((b.x0 + b.x1) / 2) * this.scale;
    this.oy = padTop + ah / 2 + ((b.y0 + b.y1) / 2) * this.scale;
  }
  sx(x: number): number { return this.ox + x * this.scale; }
  sy(y: number): number { return this.oy - y * this.scale; }
  toWorld(px: number, py: number): Vec { return { x: (px - this.ox) / this.scale, y: (this.oy - py) / this.scale }; }
  /** Leftmost / rightmost world x visible on screen. */
  get worldLeft(): number { return -this.ox / this.scale; }
  get worldRight(): number { return (this.w - this.ox) / this.scale; }
}

export const C = {
  bg: '#070b16',
  grid: 'rgba(120,150,220,0.07)',
  ink: '#e8eefc',
  dim: '#7d8bb0',
  force: '#ff9d3c',
  vel: '#46e09a',
  ghost: 'rgba(200,215,255,0.55)',
  dock: '#38c8ff',
  bad: '#ff5d6c',
};

let stars: { x: number; y: number; r: number; a: number }[] = [];
let starsFor = '';
export function drawBackground(ctx: CanvasRenderingContext2D, cam: Camera): void {
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, cam.w, cam.h);
  const key = `${cam.w}x${cam.h}`;
  if (key !== starsFor) {
    starsFor = key;
    let s = 1234567;
    const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    const n = Math.round((cam.w * cam.h) / 5000);
    stars = Array.from({ length: n }, () => ({ x: rnd() * cam.w, y: rnd() * cam.h, r: rnd() * 1.3 + 0.2, a: rnd() * 0.6 + 0.15 }));
  }
  for (const st of stars) {
    ctx.globalAlpha = st.a;
    ctx.fillStyle = '#cfd8ff';
    ctx.fillRect(st.x, st.y, st.r, st.r);
  }
  ctx.globalAlpha = 1;
}

export function font(px: number, weight = 600): string {
  return `${weight} ${px}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
}

/** Arrow from world point `from` along world vector `vec` (already scaled to metres). */
export function arrow(
  ctx: CanvasRenderingContext2D, cam: Camera, from: Vec, vec: Vec, color: string,
  label?: string, labelSide: 'above' | 'below' = 'above', width = 5,
): void {
  const len = Math.hypot(vec.x, vec.y) * cam.scale;
  if (len < 2) return;
  const x0 = cam.sx(from.x), y0 = cam.sy(from.y);
  const x1 = cam.sx(from.x + vec.x), y1 = cam.sy(from.y + vec.y);
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const head = Math.min(18, len * 0.5);
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round';
  ctx.shadowColor = color; ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1 - Math.cos(ang) * head * 0.8, y1 - Math.sin(ang) * head * 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x1 - Math.cos(ang - 0.45) * head, y1 - Math.sin(ang - 0.45) * head);
  ctx.lineTo(x1 - Math.cos(ang + 0.45) * head, y1 - Math.sin(ang + 0.45) * head);
  ctx.closePath();
  ctx.fill();
  if (label) {
    ctx.shadowBlur = 0;
    ctx.font = font(15, 700);
    ctx.textAlign = 'center';
    ctx.textBaseline = labelSide === 'above' ? 'bottom' : 'top';
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2 + (labelSide === 'above' ? -10 : 10);
    ctx.fillText(label, mx, my);
  }
  ctx.restore();
}

export function label(
  ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string,
  px = 14, align: CanvasTextAlign = 'center', base: CanvasTextBaseline = 'middle', weight = 600,
): void {
  ctx.font = font(px, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = base;
  ctx.fillText(text, x, y);
}

/** Metre ruler along y = 0 from x0..x1 (ticks every 1 m, labels every 2 m). */
export function ruler(ctx: CanvasRenderingContext2D, cam: Camera, x0: number, x1: number, note?: string): void {
  const ty = cam.sy(0);
  ctx.strokeStyle = 'rgba(160,180,230,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(cam.sx(x0), ty); ctx.lineTo(cam.sx(x1), ty); ctx.stroke();
  ctx.lineWidth = 1;
  for (let x = Math.ceil(Math.max(0, x0)); x <= x1; x++) {
    const px = cam.sx(x), big = x % 2 === 0;
    ctx.beginPath(); ctx.moveTo(px, ty + 4); ctx.lineTo(px, ty + (big ? 14 : 9)); ctx.stroke();
    if (big) label(ctx, x === 0 ? '0 m' : `${x}`, px, ty + 26, C.dim, 12, 'center', 'middle', 500);
  }
  if (note) label(ctx, note, cam.sx(x0) + 4, ty + 46, 'rgba(125,139,176,0.6)', 12, 'left', 'middle', 500);
}

/** Pulsing edge marker for a body that has left the screen. */
export function offscreenMarker(ctx: CanvasRenderingContext2D, cam: Camera, p: Vec, v: Vec, now: number, padTop = 110, padBottom = 90): void {
  const sx = cam.sx(p.x), sy = cam.sy(p.y);
  const ex = Math.min(cam.w - 16, Math.max(16, sx));
  const ey = Math.min(cam.h - padBottom, Math.max(padTop, sy));
  const ang = Math.atan2(sy - ey || 0.0001, sx - ex || 0.0001);
  ctx.save();
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now / 120);
  ctx.fillStyle = C.vel;
  ctx.translate(ex, ey); ctx.rotate(ang);
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-18, -12); ctx.lineTo(-18, 12); ctx.closePath(); ctx.fill();
  ctx.restore();
  const right = ex > cam.w / 2;
  const tx = ex + (right ? -28 : 28);
  const ty = Math.min(cam.h - padBottom - 16, Math.max(padTop + 16, ey));
  const sp = Math.hypot(v.x, v.y);
  label(ctx, 'still going', tx, ty - 11, C.ink, 15, right ? 'right' : 'left', 'middle', 800);
  label(ctx, `v = ${sp.toFixed(2)} m/s`, tx, ty + 10, C.vel, 14, right ? 'right' : 'left', 'middle', 700);
}

/** Translucent "your guess" marker. */
export function ghost(ctx: CanvasRenderingContext2D, cam: Camera, p: Vec, r: number, missed: boolean): void {
  const gx = cam.sx(p.x), gy = cam.sy(p.y);
  ctx.save();
  ctx.globalAlpha = 0.55;
  ctx.setLineDash([5, 5]);
  ctx.strokeStyle = missed ? C.bad : '#dfe6ff'; ctx.lineWidth = 2;
  ctx.fillStyle = missed ? 'rgba(255,93,108,0.18)' : 'rgba(223,230,255,0.10)';
  ctx.beginPath(); ctx.arc(gx, gy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.restore();
  label(ctx, missed ? 'your guess: wrong' : 'your guess', gx, gy - r - 12, missed ? C.bad : C.ghost, 13, 'center', 'middle', 700);
}
