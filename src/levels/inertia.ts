import { body, applyForce, step, type Body, type Vec } from '../physics';
import { arrow, label, font, C, type Camera } from '../view';
import type { Level, Phase, Outcome, Readout } from './level';

// Level 1 — Inertia. Frictionless track. The puck only changes speed while a pulse pushes it.
const MASS = 1;           // kg
const PULSE_F = 6;        // N
const PULSE_STEPS = 60;   // 0.5 s at DT = 1/120  → impulse 3 N·s → Δv = 3 m/s
const MAX_PULSES = 2;
const DOCK = { x0: 12, x1: 14 }; // m
const TRACK = { x0: -1, x1: 17 };
const PUCK_R = 0.45;      // m (visual)
const V_SCALE = 0.75;     // m of arrow per m/s
const F_SCALE = 0.3;      // m of arrow per N

interface Pulse { x: number; dir: 1 | -1; fired: boolean; left: number }

export class InertiaLevel implements Level {
  readonly title = '1 · Inertia';
  readonly goal = 'Stop the puck inside the dock.';
  readonly predictPrompt = 'Where will the puck stop? Tap the track.';
  readonly law = "Newton's 1st Law: motion continues unless a force acts.";
  readonly bounds = { x0: -2, x1: 18, y0: -3.2, y1: 3.2 };

  private puck: Body = body(MASS);
  private pulses: Pulse[] = [{ x: 0, dir: 1, fired: false, left: 0 }];
  private guess: number | null = null;
  private prevX = 0;
  private t = 0;
  private rest = 0;
  private offscreen = 0;
  private trail: Vec[] = [];
  private passedGuessAt = -1;
  private flash = { text: '', until: 0 };
  private result: Outcome | null = null;
  private lastF = 0;

  constructor() { this.reset(); }

  reset(): void {
    this.puck = body(MASS, 0, 0);
    for (const p of this.pulses) { p.fired = false; p.left = 0; }
    this.guess = null;
    this.prevX = 0;
    this.t = 0;
    this.rest = 0;
    this.offscreen = 0;
    this.trail = [];
    this.passedGuessAt = -1;
    this.result = null;
    this.lastF = 0;
  }

  pointer(phase: Phase, kind: 'down' | 'move' | 'up', w: Vec): void {
    if (kind !== 'down') return;
    if (phase === 'predict') {
      this.guess = Math.round(Math.min(this.bounds.x1, Math.max(this.bounds.x0, w.x)) * 2) / 2;
      return;
    }
    if (phase !== 'setup' || Math.abs(w.y) > 2) return;
    const hit = this.pulses.findIndex((p) => Math.abs(p.x - w.x) < 0.6);
    if (hit >= 0) {
      const p = this.pulses[hit];
      if (p.dir === 1) p.dir = -1; else this.pulses.splice(hit, 1);
      return;
    }
    if (this.pulses.length >= MAX_PULSES) { this.say('No pulses left. Tap one to change it.'); return; }
    const x = Math.round(Math.min(TRACK.x1, Math.max(TRACK.x0, w.x)) * 2) / 2;
    this.pulses.push({ x, dir: 1, fired: false, left: 0 });
    this.pulses.sort((a, b) => a.x - b.x);
  }

  private say(text: string): void { this.flash = { text, until: performance.now() + 1600 }; }

  setupHint(): string {
    const left = MAX_PULSES - this.pulses.length;
    return `Pulses left: ${left} · Tap track to add · Tap pulse to flip/remove`;
  }

  canGo(): boolean { return true; }
  hasPrediction(): boolean { return this.guess !== null; }

  start(): void { this.prevX = this.puck.p.x; }

  tick(dt: number): void {
    if (this.result) return;
    const b = this.puck;
    // Fire any pulse the puck reached during the last step (or is sitting on at t = 0).
    const lo = Math.min(this.prevX, b.p.x) - 1e-9, hi = Math.max(this.prevX, b.p.x) + 1e-9;
    for (const p of this.pulses) if (!p.fired && p.x >= lo && p.x <= hi) { p.fired = true; p.left = PULSE_STEPS; }
    let F = 0;
    for (const p of this.pulses) if (p.left > 0) { F += p.dir * PULSE_F; p.left--; }
    applyForce(b, F, 0);
    this.lastF = F;
    this.prevX = b.p.x;
    step(b, dt);
    this.t += dt;
    if (Math.round(this.t / dt) % 6 === 0) this.trail.push({ x: b.p.x, y: 0 });

    if (this.guess !== null && this.passedGuessAt < 0 && Math.abs(b.v.x) > 1e-6) {
      const g = this.guess;
      // Flag only a clear overshoot: well past the guess and still moving.
      if (Math.abs(b.p.x - g) > 1.5 && Math.sign(b.p.x - g) === Math.sign(b.v.x)) this.passedGuessAt = this.t;
    }

    const pushing = this.pulses.some((p) => p.left > 0);
    const out = b.p.x > this.bounds.x1 + 0.3 || b.p.x < this.bounds.x0 - 0.3;
    if (out) this.offscreen += dt;
    if (!pushing && Math.abs(b.v.x) < 1e-6) this.rest += dt; else this.rest = 0;

    if (this.offscreen > 2.5) this.finishFlown();
    else if (this.rest > 0.8) this.finishRest();
    else if (this.t > 20) this.finishRest();
  }

  private finishFlown(): void {
    const v = Math.abs(this.puck.v.x).toFixed(2);
    this.result = {
      win: false,
      headline: this.guess !== null ? `You said ${fmt(this.guess)} m. It never stopped.` : 'It never stopped.',
      line: `Force was zero, so speed stayed ${v} m/s.`,
    };
  }

  private finishRest(): void {
    const x = this.puck.p.x;
    if (x >= DOCK.x0 && x <= DOCK.x1) {
      this.result = { win: true, headline: `Docked at ${fmt(x)} m.`, line: 'Starting took a push. Stopping took a push back.' };
    } else if (Math.abs(x) < 1e-6 && !this.pulses.some((p) => p.fired)) {
      this.result = { win: false, headline: 'It never moved.', line: 'No force, no change. Rest stays rest.' };
    } else {
      this.result = { win: false, headline: `Stopped at ${fmt(x)} m. Missed the dock.`, line: 'It stopped only where you pushed back.' };
    }
  }

  outcome(): Outcome | null { return this.result; }

  readouts(phase: Phase): Readout[] {
    const b = this.puck;
    const live = phase === 'sim' || phase === 'reveal';
    const F = live ? this.lastF : 0;
    return [
      { label: 'm', value: `${MASS.toFixed(1)} kg` },
      { label: 'F', value: `${F.toFixed(1)} N`, hot: F !== 0 },
      { label: 'v', value: `${Math.abs(b.v.x) < 5e-7 ? '0.00' : b.v.x.toFixed(2)} m/s` },
      { label: 'x', value: `${b.p.x.toFixed(1)} m` },
    ];
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, phase: Phase, now: number): void {
    const s = cam.scale;
    const ty = cam.sy(0);
    const rpx = Math.max(PUCK_R * s, 13);

    // Dock
    const dx0 = cam.sx(DOCK.x0), dx1 = cam.sx(DOCK.x1);
    const dh = 1.3 * s;
    const won = this.result?.win;
    ctx.save();
    ctx.fillStyle = won ? 'rgba(70,224,154,0.18)' : 'rgba(56,200,255,0.10)';
    ctx.strokeStyle = won ? C.vel : C.dock;
    ctx.lineWidth = 2;
    ctx.shadowColor = ctx.strokeStyle as string; ctx.shadowBlur = 16;
    ctx.fillRect(dx0, ty - dh, dx1 - dx0, dh * 2);
    ctx.strokeRect(dx0, ty - dh, dx1 - dx0, dh * 2);
    ctx.restore();
    label(ctx, 'DOCK', (dx0 + dx1) / 2, ty - dh - 12, won ? C.vel : C.dock, 14, 'center', 'middle', 800);

    // Track + ruler
    ctx.strokeStyle = 'rgba(160,180,230,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(cam.sx(this.bounds.x0), ty); ctx.lineTo(cam.sx(this.bounds.x1), ty); ctx.stroke();
    ctx.lineWidth = 1;
    for (let x = 0; x <= this.bounds.x1; x++) {
      const px = cam.sx(x), big = x % 2 === 0;
      ctx.strokeStyle = 'rgba(160,180,230,0.35)';
      ctx.beginPath(); ctx.moveTo(px, ty + 4); ctx.lineTo(px, ty + (big ? 14 : 9)); ctx.stroke();
      if (big) label(ctx, x === 0 ? '0 m' : `${x}`, px, ty + 26, C.dim, 12, 'center', 'middle', 500);
    }
    label(ctx, 'frictionless track', cam.sx(this.bounds.x0) + 4, ty - 14, 'rgba(125,139,176,0.6)', 12, 'left', 'middle', 500);

    // Pulses (thruster pads on the track)
    for (const p of this.pulses) {
      const px = cam.sx(p.x);
      const active = p.left > 0;
      const used = p.fired && !active;
      const glow = active ? 1 : used ? 0.25 : 0.85;
      ctx.save();
      ctx.globalAlpha = glow;
      ctx.fillStyle = C.force; ctx.shadowColor = C.force; ctx.shadowBlur = active ? 24 : 8;
      const w = 14, hgt = 11, y = ty + 104;
      ctx.beginPath();
      ctx.moveTo(px + p.dir * w, y);
      ctx.lineTo(px - p.dir * w * 0.6, y - hgt);
      ctx.lineTo(px - p.dir * w * 0.6, y + hgt);
      ctx.closePath(); ctx.fill();
      ctx.setLineDash([3, 4]); ctx.strokeStyle = C.force; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(px, ty + 2); ctx.lineTo(px, y - hgt - 2); ctx.stroke();
      ctx.restore();
      label(ctx, `${p.dir > 0 ? '→' : '←'} ${PULSE_F} N · 0.5 s`, px, ty + 130, used ? 'rgba(255,157,60,0.4)' : C.force, 12, 'center', 'middle', 700);
    }

    // Ghost prediction
    if (this.guess !== null) {
      const gx = cam.sx(this.guess);
      const passed = this.passedGuessAt >= 0;
      ctx.save();
      ctx.setLineDash([6, 7]);
      ctx.strokeStyle = C.ghost; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(cam.sx(0), ty - rpx - 8); ctx.lineTo(gx, ty - rpx - 8); ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = passed ? C.bad : '#dfe6ff'; ctx.lineWidth = 2;
      ctx.fillStyle = passed ? 'rgba(255,93,108,0.18)' : 'rgba(223,230,255,0.12)';
      ctx.beginPath(); ctx.arc(gx, ty, rpx, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
      label(ctx, passed ? 'passed your guess' : 'your guess', gx, ty - rpx - 22, passed ? C.bad : C.ghost, 13, 'center', 'middle', 700);
    }

    // Trail of the real path
    ctx.fillStyle = 'rgba(70,224,154,0.35)';
    for (const p of this.trail) {
      if (p.x < this.bounds.x0 - 1 || p.x > this.bounds.x1 + 1) continue;
      ctx.beginPath(); ctx.arc(cam.sx(p.x), ty, 2, 0, Math.PI * 2); ctx.fill();
    }

    // Puck
    const b = this.puck;
    const onScreen = b.p.x <= cam.worldRight + PUCK_R && b.p.x >= cam.worldLeft - PUCK_R;
    if (onScreen) {
      const px = cam.sx(b.p.x);
      ctx.save();
      const g = ctx.createRadialGradient(px - rpx * 0.3, ty - rpx * 0.3, rpx * 0.1, px, ty, rpx);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.5, '#c6d2f5'); g.addColorStop(1, '#6f7fae');
      ctx.fillStyle = g; ctx.shadowColor = '#9fb4ff'; ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(px, ty, rpx, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      label(ctx, `${MASS} kg`, px, ty, '#1a2340', Math.max(10, rpx * 0.6), 'center', 'middle', 800);

      if (phase === 'sim' || phase === 'reveal') {
        const vx = b.v.x;
        if (Math.abs(vx) > 1e-3) {
          arrow(ctx, cam, { x: b.p.x, y: PUCK_R + 0.55 }, { x: vx * V_SCALE, y: 0 }, C.vel, `v ${vx.toFixed(2)} m/s`, 'above');
        }
        if (this.lastF !== 0) {
          arrow(ctx, cam, { x: b.p.x, y: -PUCK_R - 0.55 }, { x: this.lastF * F_SCALE, y: 0 }, C.force, `F ${this.lastF.toFixed(0)} N`, 'below', 6);
        } else if (phase === 'sim') {
          label(ctx, 'F = 0', px, cam.sy(-PUCK_R - 0.75), C.dim, 15, 'center', 'middle', 800);
        }
      }
    } else {
      // Off-screen indicator: it is still going.
      const right = b.p.x > cam.worldRight;
      const ex = right ? cam.w - 16 : 16;
      ctx.save();
      const pulse = 0.6 + 0.4 * Math.sin(now / 120);
      ctx.globalAlpha = pulse;
      ctx.fillStyle = C.vel;
      ctx.beginPath();
      const d = right ? 1 : -1;
      ctx.moveTo(ex, ty); ctx.lineTo(ex - d * 18, ty - 13); ctx.lineTo(ex - d * 18, ty + 13); ctx.closePath(); ctx.fill();
      ctx.restore();
      label(ctx, `x = ${b.p.x.toFixed(1)} m`, ex - d * 28, ty - 12, C.ink, 16, right ? 'right' : 'left', 'middle', 800);
      label(ctx, `v = ${Math.abs(b.v.x).toFixed(2)} m/s, still going`, ex - d * 28, ty + 12, C.vel, 14, right ? 'right' : 'left', 'middle', 700);
    }

    if (now < this.flash.until) {
      ctx.save();
      ctx.font = font(15, 700);
      label(ctx, this.flash.text, cam.w / 2, ty - 2.4 * s, C.bad, 15, 'center', 'middle', 700);
      ctx.restore();
    }
  }
}

function fmt(x: number): string { return (Math.round(x * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
