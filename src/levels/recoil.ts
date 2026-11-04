import { body, step, throwStep, momentum, speed, type Body, type Vec } from '../physics';
import { arrow, label, ghost, offscreenMarker, C, type Camera } from '../view';
import type { Level, Phase, Outcome, Readout } from './level';
import { ASTRO_M, THROW_F, THROW_U, SLOWMO, drawAstronaut, drawItem, itemChips, type ItemDef } from './space';

// Level 3 — Action/reaction. No thruster. Throw one item; you recoil the opposite way.
// Recoil speed = m_item · u / (m_you + m_item). Only the 20 kg tank gets you there before air runs out.
const ITEMS: ItemDef[] = [
  { name: 'Wrench', m: 2, kind: 'wrench' },
  { name: 'Toolbox', m: 10, kind: 'toolbox' },
  { name: 'Tank', m: 20, kind: 'tank' },
];
const AIRLOCK: Vec = { x: 7, y: 3 };
const CATCH_R = 1.0;   // m
const AIR = 6;         // s of air
const V_SCALE = 0.5; // same scale for you and the item, so the contrast is honest
const F_SCALE = 0.004;

export class RecoilLevel implements Level {
  readonly title = '3 · Push back';
  readonly goal = 'No jetpack. Reach the airlock before your air runs out.';
  readonly predictPrompt = 'Where will you drift? Tap.';
  readonly law = "Newton's 3rd Law: every push gets an equal push back.";
  readonly bounds = { x0: -4, x1: 11, y0: -3.2, y1: 5.2 };

  private sel = 0;
  private aim: Vec = norm({ x: AIRLOCK.x, y: AIRLOCK.y }); // preset: toward the airlock
  private you: Body = body(ASTRO_M + ITEMS[0].m);
  private item: Body = body(ITEMS[0].m);
  private throwing = false;
  private released = false;
  private t = 0;
  private lastF = 0;
  private guess: Vec | null = null;
  private trail: Vec[] = [];
  private result: Outcome | null = null;
  private dragging = false;
  private chips = itemChips(ITEMS, (i) => { this.sel = i; this.refresh(); });

  constructor() { this.reset(); }

  private get def(): ItemDef { return ITEMS[this.sel]; }

  reset(): void {
    // While holding the item, you and it move together: model as one body until the throw starts.
    this.you = body(ASTRO_M, 0, 0);
    this.item = body(this.def.m, this.aim.x * 0.6, this.aim.y * 0.6);
    this.throwing = false;
    this.released = false;
    this.t = 0;
    this.lastF = 0;
    this.guess = null;
    this.trail = [];
    this.result = null;
    this.refresh();
  }

  private refresh(): void {
    this.chips.set(this.sel, ITEMS.map(() => false));
    this.item = body(this.def.m, this.aim.x * 0.6, this.aim.y * 0.6);
  }

  controls(): HTMLElement { this.refresh(); return this.chips.root; }

  pointer(phase: Phase, kind: 'down' | 'move' | 'up', w: Vec): void {
    if (phase === 'predict' && kind === 'down') { this.guess = { x: w.x, y: w.y }; return; }
    if (phase !== 'setup') return;
    if (kind === 'down') this.dragging = true;
    if (kind === 'up') this.dragging = false;
    if (this.dragging && Math.hypot(w.x, w.y) > 0.3) { this.aim = norm(w); this.refresh(); }
  }

  setupHint(): string { return 'Drag to aim the throw · Pick what to throw'; }
  canGo(): boolean { return true; }
  hasPrediction(): boolean { return this.guess !== null; }
  start(): void { this.throwing = true; }
  timeScale(): number { return this.throwing && !this.released ? SLOWMO : 1; }

  tick(dt: number): void {
    if (this.result) return;
    this.lastF = 0;
    if (this.throwing && !this.released) {
      this.released = throwStep(this.you, this.item, this.aim.x, this.aim.y, THROW_U, THROW_F, dt);
      this.lastF = THROW_F;
    }
    step(this.you, dt);
    step(this.item, dt);
    this.t += dt;
    if (Math.round(this.t / dt) % 8 === 0) this.trail.push({ ...this.you.p });

    const d = Math.hypot(this.you.p.x - AIRLOCK.x, this.you.p.y - AIRLOCK.y);
    if (d <= CATCH_R) this.finish(true);
    else if (this.t >= AIR) this.finish(false);
  }

  private finish(made: boolean): void {
    const v = speed(this.you).toFixed(2);
    if (made) { this.result = { kind: 'win', headline: `Made it, drifting at ${v} m/s.`, line: 'Heavy throw backward, big push forward.' }; return; }
    const toTarget = norm(AIRLOCK);
    const along = (this.you.v.x * toTarget.x + this.you.v.y * toTarget.y) / (speed(this.you) || 1);
    if (along < 0) {
      this.result = { kind: 'fail', headline: `You threw it forward. You drifted backward.`, line: `You push the ${this.def.name.toLowerCase()}; it pushes you back.` };
    } else if (along < 0.97) {
      this.result = { kind: 'fail', headline: 'Out of air. Missed the airlock.', line: 'You move exactly opposite your throw.' };
    } else {
      this.result = { kind: 'fail', headline: `Right way, only ${v} m/s. Out of air.`, line: `Light ${this.def.name.toLowerCase()}, small push back. Heavier throw, faster you.` };
    }
  }

  outcome(): Outcome | null { return this.result; }

  readouts(phase: Phase): Readout[] {
    const live = phase === 'sim' || phase === 'reveal';
    const p = momentum([this.you, this.item]);
    return [
      { label: 'F', value: `${live ? this.lastF : 0} N`, hot: live && this.lastF > 0, tone: 'force' },
      { label: 'you', value: `${ASTRO_M} kg` },
      { label: this.def.name.toLowerCase(), value: `${this.def.m} kg` },
      { label: 'v you', value: `${speed(this.you).toFixed(2)} m/s`, tone: 'vel' },
      { label: 'Σp', value: `${Math.hypot(p.x, p.y).toFixed(2)} kg·m/s` },
      { label: 'air', value: `${Math.max(0, AIR - this.t).toFixed(1)} s`, hot: live && AIR - this.t < 2 },
    ];
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, phase: Phase, now: number): void {
    const s = cam.scale;
    const won = this.result?.kind === 'win';

    // Station hull + airlock
    const ax = cam.sx(AIRLOCK.x), ay = cam.sy(AIRLOCK.y);
    ctx.save();
    ctx.fillStyle = '#1a2440'; ctx.strokeStyle = '#3a4a78'; ctx.lineWidth = 2;
    ctx.fillRect(ax + 0.6 * s, ay - 2.2 * s, 6 * s, 4.4 * s);
    ctx.strokeRect(ax + 0.6 * s, ay - 2.2 * s, 6 * s, 4.4 * s);
    ctx.strokeStyle = won ? C.vel : C.dock; ctx.shadowColor = ctx.strokeStyle as string; ctx.shadowBlur = 18; ctx.lineWidth = 3;
    ctx.fillStyle = won ? 'rgba(70,224,154,0.18)' : 'rgba(56,200,255,0.12)';
    ctx.beginPath(); ctx.arc(ax, ay, CATCH_R * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.restore();
    label(ctx, 'AIRLOCK', ax, ay - CATCH_R * s - 14, won ? C.vel : C.dock, 14, 'center', 'middle', 800);

    if (this.guess) ghost(ctx, cam, this.guess, 0.45 * s, !!this.result && Math.hypot(this.guess.x - this.you.p.x, this.guess.y - this.you.p.y) > 1.5);

    ctx.fillStyle = 'rgba(70,224,154,0.35)';
    for (const p of this.trail) { ctx.beginPath(); ctx.arc(cam.sx(p.x), cam.sy(p.y), 2, 0, Math.PI * 2); ctx.fill(); }

    const live = phase === 'sim' || phase === 'reveal';
    if (!live) {
      // Aim line: where the ITEM goes (not where you go — that's the prediction)
      const tip = { x: this.aim.x * 2.6, y: this.aim.y * 2.6 };
      ctx.save(); ctx.setLineDash([7, 7]); ctx.strokeStyle = 'rgba(255,210,122,0.7)'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cam.sx(0), cam.sy(0)); ctx.lineTo(cam.sx(tip.x), cam.sy(tip.y)); ctx.stroke(); ctx.restore();
      drawItem(ctx, cam, this.def.kind, tip.x, tip.y, 0.45);
      label(ctx, `throw ${this.def.name.toLowerCase()} here`, cam.sx(tip.x), cam.sy(tip.y) - 26, '#ffd27a', 13, 'center', 'middle', 700);
    }

    // Item
    const it = this.item;
    if (it.p.x > cam.worldLeft - 1 && it.p.x < cam.worldRight + 1) drawItem(ctx, cam, this.def.kind, it.p.x, it.p.y);

    // You
    const y = this.you;
    const onScreen = y.p.x > cam.worldLeft && y.p.x < cam.worldRight && cam.sy(y.p.y) > 0 && cam.sy(y.p.y) < cam.h;
    if (onScreen) drawAstronaut(ctx, cam, y.p.x, y.p.y, this.aim.x >= 0, `${ASTRO_M} kg`);
    else offscreenMarker(ctx, cam, y.p, y.v, now);

    if (live) {
      if (this.lastF > 0) {
        // Equal and opposite: same length, opposite direction, on both bodies.
        const fv = { x: this.aim.x * THROW_F * F_SCALE * 3, y: this.aim.y * THROW_F * F_SCALE * 3 };
        arrow(ctx, cam, it.p, fv, C.force, `${THROW_F} N on ${this.def.name.toLowerCase()}`, 'above', 6);
        arrow(ctx, cam, y.p, { x: -fv.x, y: -fv.y }, C.force, `${THROW_F} N on you`, 'below', 6);
        label(ctx, 'slow motion', cam.w / 2, cam.sy(this.bounds.y0) - 10, C.dim, 14, 'center', 'middle', 700);
      } else if (this.released) {
        if (speed(y) > 0.005) arrow(ctx, cam, y.p, { x: y.v.x * V_SCALE, y: y.v.y * V_SCALE }, C.vel, `v ${speed(y).toFixed(2)} m/s`, 'below');
        if (it.p.x > cam.worldLeft && it.p.x < cam.worldRight) arrow(ctx, cam, it.p, { x: it.v.x * V_SCALE, y: it.v.y * V_SCALE }, C.vel, `${speed(it).toFixed(1)} m/s`, 'above', 3);
      }
    }
  }
}

function norm(v: Vec): Vec { const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l }; }
