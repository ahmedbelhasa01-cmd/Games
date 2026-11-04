import { label, C, type Camera } from '../view';

export const THROW_U = 8;     // m/s, release speed relative to the astronaut
export const THROW_F = 300;   // N, arm force during the throw
export const ASTRO_M = 70;    // kg incl. suit
export const SLOWMO = 0.2;    // sim-time scale while the throw happens

export interface ItemDef { name: string; m: number; kind: 'wrench' | 'toolbox' | 'tank' | 'kit' }

export function drawAstronaut(ctx: CanvasRenderingContext2D, cam: Camera, x: number, y: number, faceRight: boolean, massLabel: string): void {
  const s = cam.scale;
  const px = cam.sx(x), py = cam.sy(y);
  const r = Math.max(10, 0.32 * s);
  ctx.save();
  ctx.shadowColor = '#9fb4ff'; ctx.shadowBlur = 14;
  // backpack
  ctx.fillStyle = '#8a95b8';
  ctx.fillRect(px + (faceRight ? -r * 1.35 : r * 0.55), py - r * 0.2, r * 0.8, r * 1.6);
  // body
  ctx.fillStyle = '#e9edf8';
  roundRect(ctx, px - r * 0.75, py + r * 0.1, r * 1.5, r * 2.1, r * 0.4); ctx.fill();
  // helmet
  ctx.beginPath(); ctx.arc(px, py - r * 0.35, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#20345e';
  ctx.beginPath(); ctx.ellipse(px + (faceRight ? r * 0.3 : -r * 0.3), py - r * 0.4, r * 0.6, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(160,220,255,0.6)';
  ctx.beginPath(); ctx.arc(px + (faceRight ? r * 0.45 : -r * 0.15), py - r * 0.6, r * 0.15, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  label(ctx, massLabel, px, py + r * 2.75, C.ink, 13, 'center', 'middle', 800);
}

export function drawItem(ctx: CanvasRenderingContext2D, cam: Camera, kind: ItemDef['kind'], x: number, y: number, alpha = 1): void {
  const px = cam.sx(x), py = cam.sy(y), u = Math.max(7, cam.scale * 0.18);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.shadowColor = '#ffd27a'; ctx.shadowBlur = 8;
  if (kind === 'wrench') {
    ctx.strokeStyle = '#c9d2e6'; ctx.lineWidth = u * 0.45; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(px - u, py + u * 0.6); ctx.lineTo(px + u, py - u * 0.6); ctx.stroke();
    ctx.beginPath(); ctx.arc(px + u, py - u * 0.6, u * 0.45, 0, Math.PI * 2); ctx.stroke();
  } else if (kind === 'toolbox') {
    ctx.fillStyle = '#e0483d';
    ctx.fillRect(px - u * 1.3, py - u * 0.7, u * 2.6, u * 1.5);
    ctx.strokeStyle = '#e0483d'; ctx.lineWidth = u * 0.25;
    ctx.strokeRect(px - u * 0.5, py - u * 1.1, u, u * 0.45);
  } else if (kind === 'kit') {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(px - u * 1.4, py - u * 0.9, u * 2.8, u * 1.8);
    ctx.fillStyle = '#e0483d';
    ctx.fillRect(px - u * 0.18, py - u * 0.65, u * 0.36, u * 1.3);
    ctx.fillRect(px - u * 0.65, py - u * 0.18, u * 1.3, u * 0.36);
  } else {
    ctx.fillStyle = '#5fb8e6';
    roundRect(ctx, px - u * 0.75, py - u * 1.8, u * 1.5, u * 3.6, u * 0.7); ctx.fill();
    ctx.fillStyle = '#2b5c7a';
    ctx.fillRect(px - u * 0.3, py - u * 2.2, u * 0.6, u * 0.45);
  }
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Footer chip row for picking an item. */
export function itemChips(items: ItemDef[], onPick: (i: number) => void): { root: HTMLElement; set: (sel: number, disabled: boolean[]) => void } {
  const root = document.createElement('div');
  root.className = 'chips';
  const btns = items.map((it, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip';
    b.textContent = `${it.name} ${it.m} kg`;
    b.addEventListener('click', () => onPick(i));
    root.appendChild(b);
    return b;
  });
  return {
    root,
    set(sel, disabled) {
      btns.forEach((b, i) => { b.classList.toggle('on', i === sel); b.disabled = disabled[i]; });
    },
  };
}
