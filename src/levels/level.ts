import type { Vec } from '../physics';
import type { Bounds, Camera } from '../view';

export type Phase = 'setup' | 'predict' | 'sim' | 'reveal';

export interface Readout { label: string; value: string; hot?: boolean; tone?: 'vel' | 'force' }

export interface Outcome {
  kind: 'win' | 'fail' | 'step'; // step = this part done, more to go in the same level
  headline: string; // what happened, ≤12 words
  line: string;     // why, ≤12 words
}

export interface Level {
  readonly title: string;
  readonly goal: string;          // shown during setup, ≤12 words
  readonly predictPrompt: string; // ≤12 words
  readonly law: string;           // revealed only after a result, ≤12 words
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
  /** Optional setup controls shown in the footer. */
  controls?(): HTMLElement;
  /** Called by the shell after a 'step' outcome. */
  nextStage?(): void;
  /** Sim-time multiplier for slow motion (display only; physics step is unchanged). */
  timeScale?(): number;
  /** Label for the button that follows a 'step' outcome. */
  stepButton?: string;
}
