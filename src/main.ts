import './style.css';
import { FixedStepper } from './physics';
import { Camera, drawBackground } from './view';
import type { Level, Phase } from './levels/level';
import { InertiaLevel } from './levels/inertia';

const makers: (() => Level)[] = [() => new InertiaLevel()];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>('c');
const ctx = canvas.getContext('2d')!;
const ui = {
  title: $('title'), goal: $('goal'), readouts: $('readouts'), hint: $('hint'),
  go: $<HTMLButtonElement>('go'), card: $('card'), head: $('card-head'), line: $('card-line'), law: $('card-law'),
  retry: $<HTMLButtonElement>('retry'), next: $<HTMLButtonElement>('next'),
};

const cam = new Camera();
const stepper = new FixedStepper();
let idx = 0;
let level: Level = makers[0]();
let phase: Phase = 'setup';
let predictedAt = 0;
let revealAt = 0;

function setPhase(p: Phase): void {
  phase = p;
  ui.goal.classList.toggle('predict', p === 'predict');
  ui.goal.textContent = p === 'predict' ? level.predictPrompt : level.goal;
  ui.go.hidden = p !== 'setup';
  ui.card.hidden = true;
  if (p === 'sim') { stepper.reset(); level.start(); }
}

function loadLevel(i: number): void {
  idx = i;
  level = makers[i]();
  ui.title.textContent = level.title;
  setPhase('setup');
  resize();
}

function showCard(): void {
  const o = level.outcome()!;
  ui.card.className = o.win ? 'win' : 'lose';
  ui.head.textContent = o.headline;
  ui.line.textContent = o.line;
  ui.law.textContent = level.law;
  ui.next.hidden = !o.win || makers.length === 1;
  ui.next.textContent = idx + 1 < makers.length ? 'Next level' : 'Play again';
  ui.retry.textContent = o.win ? 'Replay' : 'Try again';
  ui.card.hidden = false;
}

function retry(): void { level.reset(); setPhase('setup'); }
function next(): void { loadLevel((idx + 1) % makers.length); }
function go(): void { if (phase === 'setup' && level.canGo()) setPhase('predict'); }

ui.go.addEventListener('click', go);
ui.retry.addEventListener('click', retry);
ui.next.addEventListener('click', next);
window.addEventListener('keydown', (e) => {
  if (e.key === ' ' || e.key === 'Enter') {
    e.preventDefault();
    if (phase === 'setup') go();
    else if (phase === 'reveal' && !ui.card.hidden) (level.outcome()?.win ? next : retry)();
  } else if (e.key === 'r' || e.key === 'R') retry();
  else if (e.key === 'n' || e.key === 'N') next();
});

function pointer(kind: 'down' | 'move' | 'up', e: PointerEvent): void {
  const r = canvas.getBoundingClientRect();
  const w = cam.toWorld(e.clientX - r.left, e.clientY - r.top);
  level.pointer(phase, kind, w);
  if (phase === 'predict' && kind === 'down' && level.hasPrediction() && !predictedAt) predictedAt = performance.now();
}
canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pointer('down', e); });
canvas.addEventListener('pointermove', (e) => pointer('move', e));
canvas.addEventListener('pointerup', (e) => pointer('up', e));

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const narrow = w < 640;
  cam.fit(level.bounds, w, h, narrow ? 150 : 120, narrow ? 90 : 96);
}
window.addEventListener('resize', resize);

let last = performance.now();
let lastRo = '';
function frame(now: number): void {
  const dt = (now - last) / 1000;
  last = now;

  if (phase === 'predict' && predictedAt && now - predictedAt > 450) { predictedAt = 0; setPhase('sim'); }
  if (phase === 'sim') {
    stepper.advance(dt, (h) => level.tick(h));
    if (level.outcome()) { phase = 'reveal'; revealAt = now; }
  }
  if (phase === 'reveal' && ui.card.hidden && now - revealAt > 350) showCard();

  ui.hint.textContent = phase === 'setup' ? level.setupHint() : phase === 'sim' ? 'Watch F and v.' : '';
  const ro = level.readouts(phase);
  const html = ro.map((r) => `<div class="ro${r.hot ? ' hot' : ''}${r.label === 'v' ? ' v' : ''}"><b>${r.label}</b>${r.value}</div>`).join('');
  if (html !== lastRo) { ui.readouts.innerHTML = html; lastRo = html; }

  drawBackground(ctx, cam);
  level.draw(ctx, cam, phase, now);
  requestAnimationFrame(frame);
}

loadLevel(0);
requestAnimationFrame(frame);
