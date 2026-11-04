import { describe, it, expect } from 'vitest';
import { body, applyForce, interact, step, momentum, DT, FixedStepper } from '../src/physics';

describe('physics', () => {
  it('constant force F on mass m gives a = F/m', () => {
    for (const [F, m] of [[6, 1], [6, 2], [10, 4], [3.5, 0.7]]) {
      const b = body(m);
      const steps = 240; // 2 s
      for (let i = 0; i < steps; i++) { applyForce(b, F, 0); step(b); }
      const T = steps * DT;
      const aMeasured = b.v.x / T;
      expect(aMeasured).toBeCloseTo(F / m, 9);
      expect(b.a.x).toBeCloseTo(F / m, 12);
      // position converges to ½at² (semi-implicit Euler error is O(dt))
      expect(Math.abs(b.p.x - 0.5 * (F / m) * T * T)).toBeLessThan((F / m) * T * DT);
    }
  });

  it('momentum is conserved in a throw', () => {
    const astronaut = body(80, 0, 0, 0.3, -0.1);
    const wrench = body(2, 0.5, 0, 0.3, -0.1);
    const before = momentum([astronaut, wrench]);
    for (let i = 0; i < 30; i++) { interact(astronaut, wrench, 40, 15); step(astronaut); step(wrench); }
    for (let i = 0; i < 600; i++) { step(astronaut); step(wrench); }
    const after = momentum([astronaut, wrench]);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
    // the throw did something, in opposite directions
    expect(wrench.v.x).toBeGreaterThan(0.3);
    expect(astronaut.v.x).toBeLessThan(0.3);
    // and recoil speed change scales with 1/m
    expect((wrench.v.x - 0.3) * 2).toBeCloseTo(-(astronaut.v.x - 0.3) * 80, 9);
  });

  it('a body with no force keeps constant velocity over 10,000 steps', () => {
    const b = body(1, 0, 0, 3, -1.25);
    for (let i = 0; i < 10_000; i++) step(b);
    expect(b.v.x).toBe(3);
    expect(b.v.y).toBe(-1.25);
    expect(b.p.x).toBeCloseTo(3 * 10_000 * DT, 6);
    expect(b.p.y).toBeCloseTo(-1.25 * 10_000 * DT, 6);
  });

  it('impulse = F·t: 6 N for 0.5 s on 1 kg gives exactly 3 m/s', () => {
    const b = body(1);
    for (let i = 0; i < 60; i++) { applyForce(b, 6, 0); step(b); }
    expect(b.v.x).toBeCloseTo(3, 12);
    for (let i = 0; i < 60; i++) { applyForce(b, -6, 0); step(b); }
    expect(Math.abs(b.v.x)).toBeLessThan(1e-12);
  });

  it('fixed stepper runs whole steps regardless of frame time', () => {
    const s = new FixedStepper();
    let n = 0;
    for (let i = 0; i < 60; i++) s.advance(1 / 60, () => n++);
    expect(n).toBeGreaterThanOrEqual(119);
    expect(n).toBeLessThanOrEqual(120);
  });

  it('rejects non-positive mass', () => {
    expect(() => body(0)).toThrow();
  });
});

import { throwStep } from '../src/physics';
describe('throw', () => {
  it('releases at relative speed u, recoil = m·u/(M+m), momentum zero', () => {
    const you = body(70), tank = body(20, 0.5, 0);
    let released = false, n = 0;
    while (!released && n < 10_000) { released = throwStep(you, tank, -1, 0, 8, 300); step(you); step(tank); n++; }
    expect(released).toBe(true);
    expect(tank.v.x - you.v.x).toBeCloseTo(-8, 10);
    expect(you.v.x).toBeCloseTo((20 * 8) / 90, 10);
    const p = momentum([you, tank]);
    expect(p.x).toBeCloseTo(0, 10);
    expect(p.y).toBeCloseTo(0, 10);
  });
  it('heavier object gives bigger recoil at the same throw speed', () => {
    const recoil = (m: number) => {
      const you = body(70), o = body(m);
      while (!throwStep(you, o, 1, 0, 8, 300)) { step(you); step(o); }
      step(you); step(o);
      return -you.v.x;
    };
    expect(recoil(20)).toBeGreaterThan(recoil(10));
    expect(recoil(10)).toBeGreaterThan(recoil(2));
  });
  it('accelerate F for T then brake F for T travels exactly (F/m)·T²', () => {
    for (const [F, m] of [[20, 2], [20, 4], [40, 4], [10, 1]]) {
      const b = body(m);
      for (let i = 0; i < 120; i++) { applyForce(b, F, 0); step(b); }
      for (let i = 0; i < 120; i++) { applyForce(b, -F, 0); step(b); }
      expect(b.p.x).toBeCloseTo(F / m, 9);
      expect(Math.abs(b.v.x)).toBeLessThan(1e-9);
    }
  });
});
