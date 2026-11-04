import type { Vec } from '../physics';
import type { Bounds, Camera } from '../view';

export type Phase = 'setup' | 'predict' | 'sim' | 'reveal';

export interface Readout { label: string; value: string; hot?: boolean }

export interface Outcome {
  win: boolean;
  headline: string; // what happened, ≤12 words
  line: string;     // why, ≤12 words
}

export interface Level {
  readonly title: string;
  readonly goal: string;          // shown during setup, ≤12 words
  readonly predictPrompt: string; // ≤12 words
  readonly law: string;           // revealed only after the result, ≤12 words
  readonly bounds: Bounds;
  /** Back to setup, keeping the player's setup. */
  reset(): void;
  pointer(phase: Phase, kind: 'down' | 'move' | 'up', w: Vec): void;
  setupHint(): string;
  canGo(): boolean;
  hasPrediction(): boolean;
  start(): void;
  tick(dt: number): void;
  outcome(): Outcome | null;
  readouts(phase: Phase): Readout[];
  draw(ctx: CanvasRenderingContext2D, cam: Camera, phase: Phase, now: number): void;
}
