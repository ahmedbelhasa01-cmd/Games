import { body, step, throwStep, type Body, type Vec } from '../physics';
import { arrow, label, ruler, ghost, offscreenMarker, C, type Camera } from '../view';
import type { Level, Phase, Outcome, Readout } from './level';
import { ASTRO_M, THROW_F, THROW_U, SLOWMO, drawAstronaut, drawItem, itemChips, type ItemDef } from './space';

// Finale — all three laws. Throw to start (3rd), coast without slowing (1st),
// throw to stop. The stop throw acts on a lighter you, so the same throw changes you more (2nd).
// Kit back then toolbox forward leaves 0.045 m/s: the only plan that docks gently.
const ITEMS: ItemDef[] = [
  { name: 'Kit', m: 12, kind: 'kit' },
  { name: 'Toolbox', m: 10, kind: 'toolbox' },
  { name: 'Wrench', m: 2, kind: 'wrench' },
];
const MAX_THROWS = 2;
const DOCK = { x0: 8, x1: 10 }; // station wall at x1
const BODY_R = 0.4;
const SAFE_V = 0.15;            // m/s: gentle contact
const AIR = 20;                 // s
const V_SCALE = 1.2;
const F_SCALE = 0.006;

interface Throw { x: number; item: number; dir: 1 | -1; reached: boolean; fired: boolean }

export class FinaleLevel implements Level {
  readonly title = '4 · Finale';
  readonly goal = 'Stop in the dock. Faster than 0.15 m/s is a crash.';
  readonly predictPrompt = 'Where will you stop? Tap the track.';
  readonly law = 'All three: inertia, a = F/m, equal and opposite pushes.';
  readonly bounds = { x0: -2, x1: 12.5, y0: -3.4, y1: 3.4 };

  private throws: Throw[] = [{ x: 0, item: 1, dir: -1, reached: false, fired: false }];
  private sel = 0;
  private you: Body = body(1);
  private flying: { b: Body; item: number }[] = [];
  private active: { t: Throw; obj: Body } | null = null;
  private prevX = 0;
  private t = 0;
  private settle = 0;
  private back = 0;
  private lastF = 0;
  private guess: number | null = null;
  private trail: Vec[] = [];
  private result: Outcome | null = null;
  private chipRow = itemChips(ITEMS, (i) => this.pick(i));
  private root?: HTMLElement;

  constructor() { this.reset(); }

  private carried(): number {
    return ITEMS.reduce((s, it, i) => s + (this.flying.some((f) => f.item === i) ? 0 : it.m), 0);
  }

  reset(): void {
    this.flying = [];
    this.you = body(ASTRO_M + this.carried(), 0, 0);
    for (const t of this.throws) { t.reached = false; t.fired = false; }
    this.active = null;
    this.prevX = 0; this.t = 0; this.settle = 0; this.back = 0; this.lastF = 0;
    this.guess = null; this.trail = []; this.result = null;
    this.refresh();
  }

  private pick(i: number): void {
    const t = this.throws[this.sel];
    if (t) t.item = i;
    this.refresh();
  }

  private refresh(): void {
    const used = ITEMS.map((_, i) => this.throws.some((t, k) => k !== this.sel && t.item === i));
    this.chipRow.set(this.throws[this.sel]?.item ?? -1, used.map((u) => u || !this.throws[this.sel]));
  }

  controls(): HTMLElement {
    if (!this.root) {
      this.root = document.createElement('div');
      this.root.className = 'chips';
      this.root.appendChild(this.chipRow.root);
      const rm = document.createElement('button');
      rm.type = 'button'; rm.className = 'chip ghostchip'; rm.textContent = 'Remove throw';
      rm.addEventListener('click', () => {
        if (this.throws.length) { this.throws.splice(this.sel, 1); this.sel = Math.max(0, this.throws.length - 1); this.refresh(); }
      });
      this.root.appendChild(rm);
    }
    this.refresh();
    return this.root;
  }

  pointer(phase: Phase, kind: 'down' | 'move' | 'up', w: Vec): void {
    if (kind !== 'down') return;
    if (phase === 'predict') { this.guess = Math.round(Math.min(this.bounds.x1, Math.max(this.bounds.x0, w.x)) * 4) / 4; return; }
    if (phase !== 'setup' || w.y > 2) return;
    const hit = this.throws.findIndex((t) => Math.abs(t.x - w.x) < 0.5);
    if (hit >= 0) {
      if (hit === this.sel) this.throws[hit].dir = this.throws[hit].dir === 1 ? -1 : 1;
      else this.sel = hit;
      this.refresh();
      return;
    }
    if (this.throws.length >= MAX_THROWS) return;
    const free = ITEMS.findIndex((_, i) => !this.throws.some((t) => t.item === i));
    const x = Math.round(Math.min(DOCK.x1 - 0.5, Math.max(0, w.x)) * 2) / 2;
    this.throws.push({ x, item: free, dir: -1, reached: false, fired: false });
    this.throws.sort((a, b) => a.x - b.x);
    this.sel = this.throws.findIndex((t) => t.x === x && t.item === free);
    this.refresh();
  }

  setupHint(): string {
    return `Throws left: ${MAX_THROWS - this.throws.length} · Tap track to add · Tap throw twice to flip`;
  }
  canGo(): boolean { return this.throws.length > 0; }
  hasPrediction(): boolean { return this.guess !== null; }
  start(): void { this.prevX = this.you.p.x; }
  timeScale(): number { return this.active ? SLOWMO : 1; }

  tick(dt: number): void {
    if (this.result) return;
    const y = this.you;
    const lo = Math.min(this.prevX, y.p.x) - 1e-9, hi = Math.max(this.prevX, y.p.x) + 1e-9;
    for (const t of this.throws) if (!t.fired && t.x >= lo && t.x <= hi) t.reached = true;
    if (!this.active) {
      const t = this.throws.find((k) => k.reached && !k.fired);
      if (t) {
        // Split the item off: same velocity, so momentum is unchanged by the split itself.
        const it = ITEMS[t.item];
        y.m -= it.m;
        const obj = body(it.m, y.p.x + t.dir * 0.5, 0.25, y.v.x, 0);
        this.flying.push({ b: obj, item: t.item });
        this.active = { t, obj };
        t.fired = true;
      }
    }
    this.lastF = 0;
    if (this.active) {
      const done = throwStep(y, this.active.obj, this.active.t.dir, 0, THROW_U, THROW_F, dt);
      this.lastF = THROW_F;
      if (done) this.active = null;
    }
    this.prevX = y.p.x;
    step(y, dt);
    for (const f of this.flying) step(f.b, dt);
    this.t += dt;
    if (Math.round(this.t / dt) % 8 === 0) this.trail.push({ x: y.p.x, y: 0 });

    const v = y.v.x;
    const pendingAhead = this.throws.some((t) => !t.fired && ((v > 0 && t.x > y.p.x) || (v < 0 && t.x < y.p.x)));
    if (y.p.x + BODY_R >= DOCK.x1) {
      if (Math.abs(v) < SAFE_V) this.win(); else this.crash();
      return;
    }
    const calm = !this.active && !pendingAhead;
    if (calm && y.p.x >= DOCK.x0 && Math.abs(v) < SAFE_V) { this.settle += dt; if (this.settle > 0.6) this.win(); return; }
    this.settle = 0;
    if (calm && v < -SAFE_V && this.throws.some((t) => t.fired && t.dir === 1)) { this.back += dt; if (this.back > 1.2) this.drifted(); return; }
    if (y.p.x < this.bounds.x0 - 1.5) { this.away(); return; }
    if (this.t >= AIR) this.out();
  }

  private win(): void {
    this.result = { kind: 'win', headline: `Docked at ${Math.abs(this.you.v.x).toFixed(2)} m/s.`, line: 'Throw back to go. Throw forward to stop.' };
  }
  private crash(): void {
    const v = this.you.v.x.toFixed(2);
    const braked = this.throws.some((t) => t.fired && t.dir === 1);
    this.result = braked
      ? { kind: 'fail', headline: `Crashed at ${v} m/s. Not enough braking.`, line: 'Bigger throw forward, bigger push back on you.' }
      : { kind: 'fail', headline: `Crashed into the station at ${v} m/s.`, line: 'Nothing slows you down. Throw something forward to stop.' };
  }
  private drifted(): void {
    this.result = { kind: 'fail', headline: `Overshot: drifting back at ${Math.abs(this.you.v.x).toFixed(2)} m/s.`, line: 'Braked too hard. Lighter you, same throw, bigger change.' };
  }
  private away(): void {
    this.result = { kind: 'fail', headline: 'You drifted away from the station.', line: 'You move opposite to what you throw.' };
  }
  private out(): void {
    this.result = { kind: 'fail', headline: `Out of air at ${this.you.p.x.toFixed(1)} m.`, line: 'Slow start. A heavier throw backward goes faster.' };
  }

  outcome(): Outcome | null { return this.result; }

  readouts(phase: Phase): Readout[] {
    const live = phase === 'sim' || phase === 'reveal';
    const F = live ? this.lastF : 0;
    return [
      { label: 'm you', value: `${this.you.m} kg` },
      { label: 'F', value: `${F} N`, hot: F > 0, tone: 'force' },
      { label: 'a you', value: `${(F / this.you.m).toFixed(2)} m/s²`, hot: F > 0, tone: 'force' },
      { label: 'v', value: `${this.you.v.x.toFixed(2)} m/s`, tone: 'vel', hot: live && this.you.v.x >= SAFE_V && this.you.p.x > DOCK.x0 - 2 },
      { label: 'x', value: `${this.you.p.x.toFixed(1)} m` },
      { label: 'air', value: `${Math.max(0, AIR - this.t).toFixed(0)} s` },
    ];
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, phase: Phase, now: number): void {
    const s = cam.scale, ty = cam.sy(0);
    const r = this.result;

    // Station: dock zone + wall
    const d0 = cam.sx(DOCK.x0), d1 = cam.sx(DOCK.x1);
    ctx.save();
    ctx.fillStyle = r?.kind === 'win' ? 'rgba(70,224,154,0.18)' : 'rgba(56,200,255,0.10)';
    ctx.fillRect(d0, ty - 1.4 * s, d1 - d0, 2.8 * s);
    ctx.fillStyle = r && r.kind === 'fail' && r.headline.startsWith('Crashed') ? '#4a1e2a' : '#1a2440';
    ctx.strokeStyle = r?.kind === 'win' ? C.vel : C.dock; ctx.lineWidth = 3; ctx.shadowColor = ctx.strokeStyle as string; ctx.shadowBlur = 16;
    ctx.fillRect(d1, ty - 2.4 * s, cam.w - d1 + 10, 4.8 * s);
    ctx.beginPath(); ctx.moveTo(d1, ty - 2.4 * s); ctx.lineTo(d1, ty + 2.4 * s); ctx.stroke();
    ctx.restore();
    label(ctx, 'DOCK', (d0 + d1) / 2, ty - 1.4 * s - 12, C.dock, 14, 'center', 'middle', 800);
    label(ctx, `stop here · < ${SAFE_V} m/s`, (d0 + d1) / 2, ty + 1.4 * s + 14, C.dim, 12, 'center', 'middle', 700);

    ruler(ctx, cam, this.bounds.x0 + 0.5, DOCK.x1, 'empty space, no friction');

    // Throw markers
    this.throws.forEach((t, i) => {
      const px = cam.sx(t.x), y0 = ty + Math.max(2.0 * s, 80);
      const sel = i === this.sel && phase === 'setup';
      ctx.save();
      ctx.globalAlpha = t.fired ? 0.3 : 1;
      ctx.setLineDash([3, 4]); ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, ty + 2); ctx.lineTo(px, y0 - 18); ctx.stroke(); ctx.setLineDash([]);
      if (sel) { ctx.strokeStyle = '#ffd27a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, y0, 22, 0, Math.PI * 2); ctx.stroke(); }
      ctx.restore();
      drawItem(ctx, cam, ITEMS[t.item].kind, t.x, cam.toWorld(0, y0).y, t.fired ? 0.3 : 1);
      label(ctx, `throw ${t.dir > 0 ? '→' : '←'} ${ITEMS[t.item].name} ${ITEMS[t.item].m} kg`, Math.min(cam.w - 70, Math.max(70, px)), y0 + 32, t.fired ? 'rgba(255,210,122,0.4)' : '#ffd27a', 12, 'center', 'middle', 700);
    });

    if (this.guess !== null) {
      const missed = !!r && r.kind === 'fail' && Math.abs(this.guess - this.you.p.x) > 1;
      ghost(ctx, cam, { x: this.guess, y: 0.3 }, 0.45 * s, missed);
    }

    ctx.fillStyle = 'rgba(70,224,154,0.35)';
    for (const p of this.trail) { ctx.beginPath(); ctx.arc(cam.sx(p.x), ty, 2, 0, Math.PI * 2); ctx.fill(); }

    for (const f of this.flying) {
      if (f.b.p.x > cam.worldLeft - 1 && f.b.p.x < cam.worldRight + 1) drawItem(ctx, cam, ITEMS[f.item].kind, f.b.p.x, f.b.p.y);
    }

    const y = this.you;
    if (y.p.x > cam.worldLeft) drawAstronaut(ctx, cam, y.p.x, 0.3, true, `${y.m} kg`);
    else offscreenMarker(ctx, cam, { x: y.p.x, y: 0 }, y.v, now);

    if (phase === 'sim' || phase === 'reveal') {
      if (this.active) {
        const dir = this.active.t.dir;
        arrow(ctx, cam, { x: this.active.obj.p.x, y: 1.2 }, { x: dir * THROW_F * F_SCALE, y: 0 }, C.force, `${THROW_F} N on item`, 'above', 6);
        arrow(ctx, cam, { x: y.p.x, y: -0.9 }, { x: -dir * THROW_F * F_SCALE, y: 0 }, C.force, `${THROW_F} N on you`, 'below', 6);
        label(ctx, 'slow motion', cam.w / 2, cam.sy(this.bounds.y1) + 6, C.dim, 14, 'center', 'middle', 700);
      } else if (Math.abs(y.v.x) > 0.1) {
        arrow(ctx, cam, { x: y.p.x, y: 1.5 }, { x: y.v.x * V_SCALE, y: 0 }, C.vel, `v ${y.v.x.toFixed(2)} m/s`, 'above');
        if (phase === 'sim') label(ctx, 'F = 0', cam.sx(y.p.x), cam.sy(-1.0), C.dim, 15, 'center', 'middle', 800);
      }
    }
  }
}
