import { fishingState } from '@/index';
import { DEFAULT_TILE_SIZE } from '../level/model';
import { bodyDimensions } from '../physics';
import { drawPlayerFigure } from '../render/playerFigure';

/**
 * Canvas 2D fishing scene.
 *
 * A pure projection of the engine's fishing machine: it reads a
 * `FishingMachineState` and draws one frame. It never calls a command, mutates
 * machine state, or owns a timer — the host ticks the machine and this module
 * only shows the result. Placeholder shapes only; there are no image assets and
 * no audio (assumption S-04).
 */

const COLORS = {
  skyTop: '#0d1424',
  skyBottom: '#263957',
  moon: '#e8ecf6',
  hillFar: '#16223a',
  hillNear: '#1c2b45',
  waterTop: '#1f3b57',
  waterBottom: '#102338',
  ripple: 'rgba(160, 209, 214, 0.22)',
  shoreline: '#c8b78a',
  shorelineDark: '#8e7f5b',
  shore: '#33405a',
  shoreEdge: '#26324a',
  rod: '#c9a066',
  line: 'rgba(232, 236, 246, 0.55)',
  bobber: '#ff8f8f',
  bobberCap: '#e8ecf6',
  fish: '#7fd1b9',
  fishFin: 'rgba(127, 209, 185, 0.65)',
  fishEye: '#101725',
  meterBack: 'rgba(11, 13, 19, 0.72)',
  meterFrame: '#3a4a6d',
  meterFill: '#7fd1b9',
  meterLow: '#ffd479',
  text: '#e8ecf6',
  textMuted: '#a8b3c9',
  panel: 'rgba(11, 13, 19, 0.78)',
  accent: '#7fd1b9',
  danger: '#ff9a9a',
} as const;

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

export interface FishingSceneInput {
  readonly state: fishingState.FishingMachineState;
  readonly reducedMotion: boolean;
  /** P8: `large` scales the canvas labels with the DOM text scale. */
  readonly textScale?: 'normal' | 'large';
}

function phaseLabel(phase: fishingState.FishingStateName): string {
  switch (phase) {
    case 'idle':
      return 'Ready to cast';
    case 'powering':
      return 'Charging the cast';
    case 'casting':
      return 'Casting';
    case 'waiting':
      return 'Waiting for a bite';
    case 'biting':
      return 'Bite!';
    case 'reeling':
      return 'Reeling in';
    case 'caught':
      return 'Fish caught';
    case 'missed':
      return 'It got away';
    default:
      return '';
  }
}

/** The host-facing instruction line, matched to keyboard input. */
export function fishingControlHint(phase: fishingState.FishingStateName): string {
  switch (phase) {
    case 'idle':
      return 'Hold Space to charge the cast, then release. A and D walk the shore.';
    case 'powering':
      return 'Release Space to cast.';
    case 'casting':
      return 'The line is in the air.';
    case 'waiting':
      return 'Wait for the bobber to dip.';
    case 'biting':
      return 'Press Space to reel in before the window closes.';
    case 'reeling':
      return 'Reeling…';
    case 'caught':
      return 'Choose Keep fish or Release fish in the dialog.';
    case 'missed':
      return 'Press Space to reset for the next cast, or Escape to leave the pond.';
    default:
      return '';
  }
}

function drawSky(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  horizonY: number,
): void {
  const sky = context.createLinearGradient(0, 0, 0, horizonY);
  sky.addColorStop(0, COLORS.skyTop);
  sky.addColorStop(1, COLORS.skyBottom);
  context.fillStyle = sky;
  context.fillRect(0, 0, width, horizonY + 1);

  context.fillStyle = COLORS.moon;
  context.globalAlpha = 0.85;
  context.beginPath();
  context.arc(width * 0.82, height * 0.09, Math.max(8, height * 0.028), 0, Math.PI * 2);
  context.fill();
  context.globalAlpha = 1;

  // Two distant ridgelines, deterministic and screen-space only.
  context.fillStyle = COLORS.hillFar;
  context.beginPath();
  context.moveTo(0, horizonY);
  for (let x = 0; x <= width; x += width / 8) {
    const y = horizonY - 10 - Math.abs(Math.sin(x / (width / 3))) * height * 0.06;
    context.lineTo(x, y);
  }
  context.lineTo(width, horizonY);
  context.closePath();
  context.fill();

  context.fillStyle = COLORS.hillNear;
  context.beginPath();
  context.moveTo(0, horizonY);
  for (let x = 0; x <= width; x += width / 6) {
    const y = horizonY - 4 - Math.abs(Math.cos(x / (width / 2))) * height * 0.035;
    context.lineTo(x, y);
  }
  context.lineTo(width, horizonY);
  context.closePath();
  context.fill();
}

function drawWater(
  context: CanvasRenderingContext2D,
  width: number,
  horizonY: number,
  shoreY: number,
  state: fishingState.FishingMachineState,
  reducedMotion: boolean,
): void {
  const water = context.createLinearGradient(0, horizonY, 0, shoreY);
  water.addColorStop(0, COLORS.waterTop);
  water.addColorStop(1, COLORS.waterBottom);
  context.fillStyle = water;
  context.fillRect(0, horizonY, width, shoreY - horizonY);

  context.strokeStyle = COLORS.ripple;
  context.lineWidth = 1;
  const rows = 7;
  const phase = reducedMotion ? 0 : (state.lastNowMs / 1400) % 1;
  for (let row = 0; row < rows; row += 1) {
    const t = (row + 0.5) / rows;
    const y = horizonY + (shoreY - horizonY) * t;
    const wobble = Math.sin((row + phase) * Math.PI) * 10;
    context.beginPath();
    context.moveTo(width * 0.12 + wobble, y);
    context.lineTo(width * 0.38 + wobble, y);
    context.moveTo(width * 0.56 - wobble, y);
    context.lineTo(width * 0.86 - wobble, y);
    context.stroke();
  }
}

function drawShore(
  context: CanvasRenderingContext2D,
  width: number,
  height: number,
  shoreY: number,
): void {
  context.fillStyle = COLORS.shoreline;
  context.fillRect(0, shoreY - 4, width, 4);
  context.fillStyle = COLORS.shorelineDark;
  context.fillRect(0, shoreY, width, 2);

  const bank = context.createLinearGradient(0, shoreY, 0, height);
  bank.addColorStop(0, COLORS.shore);
  bank.addColorStop(1, COLORS.shoreEdge);
  context.fillStyle = bank;
  context.fillRect(0, shoreY + 2, width, height - shoreY - 2);

  // Paving stones, a fixed pattern so the frame stays reproducible.
  context.fillStyle = 'rgba(11, 13, 19, 0.16)';
  for (let x = 18; x < width; x += 64) {
    context.fillRect(x, shoreY + 12, 34, 3);
    context.fillRect(x + 22, shoreY + 34, 26, 3);
  }
}

/**
 * The pond uses the same figure as the dungeon and the street: one capsule
 * body, shade outline, contact shadow, feet bar, and a facing eye. The body is
 * the world's player size, so walking from the shore into a dungeon does not
 * change the character (P5 follow-up).
 */
function drawPlayer(
  context: CanvasRenderingContext2D,
  state: fishingState.FishingMachineState,
): void {
  const playerY = fishingState.fishingPlayerY(state.viewport);
  const x = state.playerX;
  const facing = state.facing === 'left' ? -1 : 1;
  const { w: width, h: height } = bodyDimensions(DEFAULT_TILE_SIZE);

  drawPlayerFigure(context, {
    centreX: x,
    feetY: playerY,
    width,
    height,
    facing,
    pose: 'ground',
  });

  // The rod, held toward the water. The tip stays engine-authored.
  const tip = fishingState.fishingRodTip(state.playerX, state.viewport);
  context.strokeStyle = COLORS.rod;
  context.lineWidth = 3;
  context.lineCap = 'round';
  context.beginPath();
  context.moveTo(x + facing * width * 0.18, playerY - height * 0.55);
  context.lineTo(tip.x, tip.y);
  context.stroke();
}

function drawLineAndBobber(
  context: CanvasRenderingContext2D,
  state: fishingState.FishingMachineState,
  reducedMotion: boolean,
): void {
  if (!state.bobber.visible) return;
  const tip = fishingState.fishingRodTip(state.playerX, state.viewport);
  const bob = reducedMotion || state.phase !== 'waiting'
    ? 0
    : Math.sin(state.lastNowMs / 320) * 1.5;
  const bobberY = state.bobber.y + bob;

  context.strokeStyle = COLORS.line;
  context.lineWidth = 1;
  context.beginPath();
  context.moveTo(tip.x, tip.y);
  context.quadraticCurveTo(
    (tip.x + state.bobber.x) / 2,
    Math.min(tip.y, bobberY) - 12,
    state.bobber.x,
    bobberY,
  );
  context.stroke();

  context.fillStyle = COLORS.bobber;
  context.beginPath();
  context.arc(state.bobber.x, bobberY, 6, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = COLORS.bobberCap;
  context.beginPath();
  context.arc(state.bobber.x, bobberY - 2, 3, Math.PI, Math.PI * 2);
  context.fill();
}

function drawFish(
  context: CanvasRenderingContext2D,
  state: fishingState.FishingMachineState,
): void {
  if (!state.fish.visible || state.candidate === null) return;

  const { x, y } = state.fish;
  const facing = state.fishDirection === 'right' ? -1 : 1;
  const caught = state.phase === 'caught';
  const scale = caught ? 1.5 : 1;

  context.save();
  context.translate(x, y);
  context.scale(facing, 1);

  context.fillStyle = COLORS.fish;
  context.beginPath();
  context.ellipse(0, 0, 14 * scale, 7 * scale, 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = COLORS.fishFin;
  context.beginPath();
  context.moveTo(-13 * scale, 0);
  context.lineTo(-22 * scale, -8 * scale);
  context.lineTo(-22 * scale, 8 * scale);
  context.closePath();
  context.fill();

  context.fillStyle = COLORS.fishEye;
  context.beginPath();
  context.arc(6 * scale, -1 * scale, 1.6 * scale, 0, Math.PI * 2);
  context.fill();
  context.restore();
}

function drawPowerMeter(
  context: CanvasRenderingContext2D,
  state: fishingState.FishingMachineState,
  labelScale: number,
): void {
  if (state.phase !== 'powering') return;
  const width = 180;
  const x = 24;
  const y = state.viewport.height - 46;

  context.fillStyle = COLORS.meterBack;
  context.fillRect(x - 8, y - 10, width + 16, 30);
  context.strokeStyle = COLORS.meterFrame;
  context.lineWidth = 1;
  context.strokeRect(x - 8, y - 10, width + 16, 30);

  context.fillStyle = state.power > 0.85 ? COLORS.meterLow : COLORS.meterFill;
  context.fillRect(x, y, Math.max(2, width * Math.min(1, Math.max(0, state.power))), 10);

  context.fillStyle = COLORS.textMuted;
  context.font = `${12 * labelScale}px ${FONT_STACK}`;
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.fillText('Cast power', x, y - 14);
}

function drawStatus(
  context: CanvasRenderingContext2D,
  state: fishingState.FishingMachineState,
  labelScale: number,
): void {
  const label = phaseLabel(state.phase);
  if (label.length === 0) return;
  const width = Math.min(420, state.viewport.width - 32);

  context.font = `600 ${16 * labelScale}px ${FONT_STACK}`;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const textWidth = Math.min(width - 24, context.measureText(label).width);
  const boxX = (state.viewport.width - textWidth) / 2 - 14;
  const boxY = state.viewport.height * 0.11;
  const boxHeight = 34 * labelScale;

  context.fillStyle = COLORS.panel;
  context.fillRect(boxX, boxY, textWidth + 28, boxHeight);
  context.strokeStyle = state.phase === 'biting' ? COLORS.danger : COLORS.meterFrame;
  context.lineWidth = 1;
  context.strokeRect(boxX, boxY, textWidth + 28, boxHeight);

  context.fillStyle = state.phase === 'biting' ? COLORS.danger : COLORS.text;
  context.fillText(label, state.viewport.width / 2, boxY + boxHeight / 2);
}

/**
 * Draw one fishing frame in CSS pixels.
 *
 * The context is expected to already carry the device-pixel-ratio transform
 * applied by `prepareCanvas`.
 */
export function renderFishingScene(
  context: CanvasRenderingContext2D,
  input: FishingSceneInput,
): void {
  const state = input.state;
  const width = Math.max(1, state.viewport.width);
  const height = Math.max(1, state.viewport.height);
  const horizonY = fishingState.fishingHorizonY(state.viewport);
  const shoreY = fishingState.fishingShoreY(state.viewport);
  const labelScale = input.textScale === 'large' ? 1.3 : 1;

  context.clearRect(0, 0, width, height);
  drawSky(context, width, height, horizonY);
  drawWater(context, width, horizonY, shoreY, state, input.reducedMotion);
  drawShore(context, width, height, shoreY);

  drawFish(context, state);
  drawLineAndBobber(context, state, input.reducedMotion);
  drawPlayer(context, state);
  drawPowerMeter(context, state, labelScale);
  drawStatus(context, state, labelScale);
}
