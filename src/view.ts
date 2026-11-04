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
