import { body, applyForce, step, type Body, type Vec } from '../physics';
import { arrow, label, ruler, ghost, C, type Camera } from '../view';
import type { Level, Phase, Outcome, Readout } from './level';

// Level 2 — F = ma. Each crate's thruster fires +F for 1 s, then −F for 1 s (auto-brake).
// With semi-implicit Euler this travels exactly a·T² = (F/m)·1 s² metres.
const T_STEPS = 120;          // 1 s at DT = 1/120
const PAD = 10;               // m
const TOL = 0.3;              // m
const CRATES = [2, 4, 1];     // kg
const F_MIN = 1, F_MAX = 50;  // N
const V_SCALE = 0.5;          // m arrow per m/s
const F_SCALE = 0.06;         // m arrow per N

export class CargoLevel implements Level {
  readonly title = '2 · Force and mass';
  readonly goal = 'Land each crate on the 10 m pad.';
  readonly predictPrompt = 'Where will this crate stop? Tap the track.';
  readonly law = "Newton's 2nd Law: a = F/m. More mass, less acceleration.";
  readonly bounds = { x0: -2, x1: 23, y0: -3, y1: 3.6 };
  readonly stepButton = 'Next crate';

  private stage = 0;
  private F = 20;
  private crate: Body = body(CRATES[0]);
  private delivered: { m: number; F: number }[] = [];
  private guess: number | null = null;
  private n = 0;
  private lastF = 0;
  private trail: Vec[] = [];
  private result: Outcome | null = null;
  private ui?: { root: HTMLElement; input: HTMLInputElement; val: HTMLElement };

  constructor() { this.reset(); }

  private get m(): number { return CRATES[this.stage]; }

  reset(): void {
    this.crate = body(this.m, 0, 0);
    this.guess = null;
    this.n = 0;
    this.lastF = 0;
    this.trail = [];
    this.result = null;
  }

  nextStage(): void {
    this.stage = Math.min(this.stage + 1, CRATES.length - 1);
    this.reset();
  }

  controls(): HTMLElement {
    if (this.ui) return this.ui.root;
    const root = document.createElement('label');
    root.className = 'ctl';
    root.innerHTML = `<span>Thrust F</span><input id="thrust" type="range" min="${F_MIN}" max="${F_MAX}" step="1" value="${this.F}"><output>${this.F} N</output>`;
    const input = root.querySelector('input')!;
    const val = root.querySelector('output')!;
    input.addEventListener('input', () => { this.F = Number(input.value); val.textContent = `${this.F} N`; });
    this.ui = { root, input, val };
    return root;
  }

  pointer(phase: Phase, kind: 'down' | 'move' | 'up', w: Vec): void {
    if (phase === 'predict' && kind === 'down') {
      this.guess = Math.round(Math.min(this.bounds.x1, Math.max(0, w.x)) * 2) / 2;
    }
  }

  setupHint(): string { return `Crate ${this.stage + 1} of ${CRATES.length} · 1 s thrust, then 1 s brake`; }
  canGo(): boolean { return true; }
  hasPrediction(): boolean { return this.guess !== null; }
  start(): void { this.crate = body(this.m, 0, 0); this.n = 0; }

  tick(dt: number): void {
    if (this.result) return;
    const b = this.crate;
    const F = this.n < T_STEPS ? this.F : this.n < 2 * T_STEPS ? -this.F : 0;
    applyForce(b, F, 0);
    this.lastF = F;
    step(b, dt);
    this.n++;
    if (this.n % 6 === 0) this.trail.push({ x: b.p.x, y: 0 });
    if (this.n >= 2 * T_STEPS + 50) this.finish();
  }

  private finish(): void {
    const x = this.crate.p.x;
    const a = this.F / this.m;
    const prev = this.delivered[this.delivered.length - 1];
    const said = this.guess !== null ? `You said ${fmt(this.guess)} m. ` : '';
    if (Math.abs(x - PAD) <= TOL) {
      this.delivered.push({ m: this.m, F: this.F });
      if (this.stage === CRATES.length - 1) {
        this.result = { kind: 'win', headline: 'All crates delivered.', line: 'Twice the mass needs twice the force.' };
      } else if (this.stage === 0) {
        this.result = { kind: 'step', headline: `Delivered at ${fmt(x)} m.`, line: `Thrust stays at ${this.F} N for the next crate.` };
      } else {
        this.result = { kind: 'step', headline: `Delivered at ${fmt(x)} m.`, line: `${this.F} N ÷ ${this.m} kg = ${fmt(a)} m/s². One left.` };
      }
      return;
    }
    let line = `a = ${this.F} N ÷ ${this.m} kg = ${fmt(a)} m/s².`;
    if (prev && prev.F === this.F) {
      const r = this.m / prev.m;
      if (r === 2) line = 'Same push, double mass, half the acceleration.';
      else if (r === 4) line = 'Same push, four times the mass, quarter the acceleration.';
      else if (r === 0.25) line = 'Same push, quarter the mass, four times the acceleration.';
      else if (r === 0.5) line = 'Same push, half the mass, double the acceleration.';
    }
    this.result = { kind: 'fail', headline: `${said}It stopped at ${fmt(x)} m.`, line };
  }

  outcome(): Outcome | null { return this.result; }

  readouts(phase: Phase): Readout[] {
    const live = phase === 'sim' || phase === 'reveal';
    const F = live ? this.lastF : this.F;
    const a = F / this.m;
    return [
      { label: 'F', value: `${F.toFixed(0)} N`, hot: live && F !== 0, tone: 'force' },
      { label: 'm', value: `${this.m} kg` },
      { label: 'a', value: `${live ? a.toFixed(1) : '?'} m/s²`, hot: live && F !== 0, tone: 'force' },
      { label: 'v', value: `${Math.abs(this.crate.v.x) < 1e-6 ? '0.00' : this.crate.v.x.toFixed(2)} m/s`, tone: 'vel' },
      { label: 'x', value: `${this.crate.p.x.toFixed(1)} m` },
    ];
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, phase: Phase, now: number): void {
    const s = cam.scale, ty = cam.sy(0);
    const won = this.result && this.result.kind !== 'fail';

    // Landing pad
    const p0 = cam.sx(PAD - TOL), p1 = cam.sx(PAD + TOL);
    ctx.save();
    ctx.fillStyle = won ? 'rgba(70,224,154,0.25)' : 'rgba(56,200,255,0.16)';
    ctx.strokeStyle = won ? C.vel : C.dock; ctx.lineWidth = 2; ctx.shadowColor = ctx.strokeStyle as string; ctx.shadowBlur = 14;
    ctx.fillRect(p0, ty - 2.6 * s, p1 - p0, 2.6 * s);
    ctx.strokeRect(p0, ty - 2.6 * s, p1 - p0, 2.6 * s);
    ctx.restore();
    label(ctx, 'PAD 10 m', (p0 + p1) / 2, ty - 2.6 * s - 12, won ? C.vel : C.dock, 14, 'center', 'middle', 800);

    ruler(ctx, cam, this.bounds.x0 + 1, this.bounds.x1 - 0.5, 'frictionless rail');

    // Delivered crates, stacked beside the pad
    this.delivered.forEach((d, i) => {
      const side = crateSide(d.m) * 0.6;
      drawCrate(ctx, cam, PAD + 1.2 + i * 0.9, side, `${d.m}`, 0.5);
    });

    if (this.guess !== null) {
      const missed = !!this.result && this.result.kind === 'fail' && Math.abs(this.guess - this.crate.p.x) > 0.6;
      ghost(ctx, cam, { x: this.guess, y: crateSide(this.m) / 2 }, (crateSide(this.m) / 2) * s, missed);
    }

    ctx.fillStyle = 'rgba(70,224,154,0.35)';
    for (const p of this.trail) { ctx.beginPath(); ctx.arc(cam.sx(p.x), ty, 2, 0, Math.PI * 2); ctx.fill(); }

    // Crate + thruster flame
    const b = this.crate, side = crateSide(this.m);
    const F = phase === 'sim' || phase === 'reveal' ? this.lastF : 0;
    if (F !== 0) {
      const dir = Math.sign(F);
      const fx = cam.sx(b.p.x - dir * (side / 2)), fy = cam.sy(side / 2);
      const len = (14 + Math.abs(F) * 0.9) * (0.85 + 0.15 * Math.sin(now / 30));
      const g = ctx.createLinearGradient(fx, fy, fx - dir * len, fy);
      g.addColorStop(0, 'rgba(255,220,150,0.95)'); g.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(fx, fy - 7); ctx.lineTo(fx - dir * len, fy); ctx.lineTo(fx, fy + 7); ctx.closePath(); ctx.fill();
    }
    drawCrate(ctx, cam, b.p.x, side, `${this.m} kg`, 1);

    if (phase === 'sim' || phase === 'reveal') {
      if (Math.abs(b.v.x) > 1e-3) arrow(ctx, cam, { x: b.p.x, y: side + 0.5 }, { x: b.v.x * V_SCALE, y: 0 }, C.vel, `v ${b.v.x.toFixed(1)} m/s`, 'above');
      if (F !== 0) arrow(ctx, cam, { x: b.p.x, y: -0.9 }, { x: F * F_SCALE, y: 0 }, C.force, `F ${Math.abs(F)} N → a ${(Math.abs(F) / this.m).toFixed(1)} m/s²`, 'below', 6);
    } else {
      label(ctx, `${this.F} N`, cam.sx(b.p.x), cam.sy(-0.9), C.force, 16, 'center', 'middle', 800);
    }
  }
}

function crateSide(m: number): number { return 0.55 * Math.sqrt(m) + 0.25; }

function drawCrate(ctx: CanvasRenderingContext2D, cam: Camera, x: number, side: number, text: string, alpha: number): void {
  const px = cam.sx(x - side / 2), py = cam.sy(side), w = side * cam.scale;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#b98a4e'; ctx.strokeStyle = '#6b4a22'; ctx.lineWidth = 2;
  ctx.shadowColor = 'rgba(255,190,110,0.35)'; ctx.shadowBlur = 10;
  ctx.fillRect(px, py, w, w);
  ctx.shadowBlur = 0;
  ctx.strokeRect(px, py, w, w);
  ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + w, py + w); ctx.moveTo(px + w, py); ctx.lineTo(px, py + w); ctx.stroke();
  ctx.restore();
  ctx.save(); ctx.globalAlpha = alpha;
  const fs = Math.max(11, Math.min(18, w * 0.32));
  ctx.fillStyle = '#1b1206';
  ctx.fillRect(px + w / 2 - fs * 1.6, py + w / 2 - fs * 0.7, fs * 3.2, fs * 1.4);
  label(ctx, text, px + w / 2, py + w / 2, '#ffd9a0', fs, 'center', 'middle', 800);
  ctx.restore();
}

function fmt(x: number): string { return (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
