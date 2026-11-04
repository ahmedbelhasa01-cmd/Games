// Hand-rolled 2D point-mass physics. SI units: m, kg, s, N, m/s.
// Integrator: semi-implicit (symplectic) Euler at a fixed timestep.

export const DT = 1 / 120; // s

export interface Vec { x: number; y: number }

export interface Body {
  m: number; // kg
  p: Vec;    // m
  v: Vec;    // m/s
  f: Vec;    // N, net force accumulated for the current step
  a: Vec;    // m/s^2, acceleration used in the last step (for display)
}

export function body(m: number, x = 0, y = 0, vx = 0, vy = 0): Body {
  if (!(m > 0)) throw new Error('mass must be positive');
  return { m, p: { x, y }, v: { x: vx, y: vy }, f: { x: 0, y: 0 }, a: { x: 0, y: 0 } };
}

export function applyForce(b: Body, fx: number, fy: number): void {
  b.f.x += fx;
  b.f.y += fy;
}

/** Third law: A pushes B with (fx, fy); B pushes A with (-fx, -fy). */
export function interact(a: Body, b: Body, fx: number, fy: number): void {
  applyForce(b, fx, fy);
  applyForce(a, -fx, -fy);
}

/** Advance one body by dt. v first (from F/m), then p from the new v. Clears forces. */
export function step(b: Body, dt = DT): void {
  b.a.x = b.f.x / b.m;
  b.a.y = b.f.y / b.m;
  b.v.x += b.a.x * dt;
  b.v.y += b.a.y * dt;
  b.p.x += b.v.x * dt;
  b.p.y += b.v.y * dt;
  b.f.x = 0;
  b.f.y = 0;
}

export function momentum(bodies: Body[]): Vec {
  let x = 0, y = 0;
  for (const b of bodies) { x += b.m * b.v.x; y += b.m * b.v.y; }
  return { x, y };
}

export function speed(b: Body): number {
  return Math.hypot(b.v.x, b.v.y);
}

/** Fixed-timestep driver: feeds real frame time in, runs whole DT steps out. */
export class FixedStepper {
  private acc = 0;
  constructor(private readonly dt = DT, private readonly maxSteps = 12) {}
  advance(frameSeconds: number, stepFn: (dt: number) => void): number {
    this.acc += Math.min(frameSeconds, this.maxSteps * this.dt);
    let n = 0;
    while (this.acc >= this.dt) { stepFn(this.dt); this.acc -= this.dt; n++; }
    return n;
  }
  reset(): void { this.acc = 0; }
}

/**
 * One fixed step of a throw. The thrower pushes `obj` along unit direction (dx, dy) with force F,
 * and `obj` pushes back equally (3rd law), until obj's speed relative to the thrower reaches u.
 * The last step's force is trimmed so release is exactly at u. Returns true when released.
 * Caller must step() both bodies afterwards.
 */
export function throwStep(thrower: Body, obj: Body, dx: number, dy: number, u: number, F: number, dt = DT): boolean {
  const rel = (obj.v.x - thrower.v.x) * dx + (obj.v.y - thrower.v.y) * dy;
  const need = u - rel;
  if (need <= 0) return true;
  const gain = F * (1 / obj.m + 1 / thrower.m) * dt;
  const f = gain > need ? (F * need) / gain : F;
  interact(thrower, obj, f * dx, f * dy);
  return gain >= need;
}
