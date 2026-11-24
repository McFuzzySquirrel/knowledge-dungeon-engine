/**
 * The one player figure.
 *
 * The dungeon, the village street, and the fishing pond all draw the same
 * character: a rounded capsule body with a shade outline, a contact shadow when
 * grounded, a feet bar, and an eye on the facing edge. Keeping it in one module
 * means the pond cannot drift into a different-looking avatar again (the P4 pond
 * scene drew a rectangular torso with a separate circular head and no eye).
 *
 * Pure drawing: no state, no clock, no engine import. The caller supplies the
 * feet position and the body size, so world pixels (dungeon/surface) and screen
 * pixels (the fixed fishing viewport) share the same geometry.
 */

export const PLAYER_COLORS = {
  body: '#ffd479',
  shade: '#b98d3a',
  ink: '#20180a',
  shadow: 'rgba(5, 8, 14, 0.45)',
} as const;

export type PlayerPose = 'ground' | 'ladder' | 'air';

export interface PlayerFigure {
  /** Horizontal centre of the body, in the context's current space. */
  centreX: number;
  /** Bottom of the body (feet). */
  feetY: number;
  width: number;
  height: number;
  /** `-1` faces left, `1` faces right. */
  facing: -1 | 1;
  /** Defaults to `ground`. Ladder narrows the torso; air tucks the legs. */
  pose?: PlayerPose;
  /** Drop the falling streaks while airborne. */
  reducedMotion?: boolean;
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  radius: number,
): void {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  context.beginPath();
  context.moveTo(x + r, y);
  context.lineTo(x + w - r, y);
  context.quadraticCurveTo(x + w, y, x + w, y + r);
  context.lineTo(x + w, y + h - r);
  context.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  context.lineTo(x + r, y + h);
  context.quadraticCurveTo(x, y + h, x, y + h - r);
  context.lineTo(x, y + r);
  context.quadraticCurveTo(x, y, x + r, y);
  context.closePath();
}

/**
 * Draw the figure with its feet at `(centreX, feetY)`.
 *
 * The context is restored to its incoming state. Non-finite or zero sizes draw
 * nothing, so a bad camera or a mid-resize frame cannot produce negative fills.
 */
export function drawPlayerFigure(
  context: CanvasRenderingContext2D,
  figure: PlayerFigure,
): void {
  const { centreX, feetY, width, height, facing } = figure;
  const pose = figure.pose ?? 'ground';
  const reducedMotion = figure.reducedMotion ?? false;

  if (!(width > 0) || !(height > 0)) return;
  if (![centreX, feetY].every(Number.isFinite)) return;

  const top = feetY - height;
  const onLadder = pose === 'ladder';
  const airborne = pose === 'air';

  const bodyWidth = onLadder ? width * 0.68 : width;
  const left = centreX - bodyWidth / 2;
  const radius = Math.min(bodyWidth, height) * 0.3;
  const weight = Math.max(1, height * 0.05);

  context.save();
  context.lineJoin = 'round';
  context.lineCap = 'round';

  if (!airborne) {
    // Static contact shadow; reads as grounding without any animation.
    context.beginPath();
    context.ellipse(
      centreX,
      feetY,
      bodyWidth * 0.52,
      Math.max(1.5, height * 0.07),
      0,
      0,
      Math.PI * 2,
    );
    context.fillStyle = PLAYER_COLORS.shadow;
    context.fill();
  }

  if (onLadder) {
    // Arms reaching for the rails.
    const armY = top + height * 0.38;
    const armLength = width * 0.28;
    context.strokeStyle = PLAYER_COLORS.body;
    context.lineWidth = weight * 1.2;
    context.beginPath();
    context.moveTo(left - armLength, armY);
    context.lineTo(left, armY);
    context.moveTo(left + bodyWidth, armY);
    context.lineTo(left + bodyWidth + armLength, armY);
    context.stroke();
  } else if (airborne) {
    // Tucked legs: two short diagonals, visible below the torso.
    context.strokeStyle = PLAYER_COLORS.body;
    context.lineWidth = weight;
    context.beginPath();
    context.moveTo(left + bodyWidth * 0.3, top + height);
    context.lineTo(left + bodyWidth * 0.18, top + height + height * 0.16);
    context.moveTo(left + bodyWidth * 0.7, top + height);
    context.lineTo(left + bodyWidth * 0.82, top + height + height * 0.16);
    context.stroke();

    if (!reducedMotion) {
      // Falling streak: the only motion-flavoured cue, dropped for reduced motion.
      context.strokeStyle = 'rgba(255, 212, 121, 0.45)';
      context.lineWidth = Math.max(1, weight * 0.6);
      context.beginPath();
      context.moveTo(centreX - bodyWidth * 0.3, top - height * 0.2);
      context.lineTo(centreX - bodyWidth * 0.3, top - height * 0.42);
      context.moveTo(centreX + bodyWidth * 0.3, top - height * 0.16);
      context.lineTo(centreX + bodyWidth * 0.3, top - height * 0.34);
      context.stroke();
    }
  }

  roundedRectPath(context, left, top, bodyWidth, height, radius);
  context.fillStyle = PLAYER_COLORS.body;
  context.fill();
  context.strokeStyle = PLAYER_COLORS.shade;
  context.lineWidth = weight;
  context.stroke();

  if (!airborne && !onLadder) {
    // Feet bar: an extra ground-only silhouette cue under the torso.
    context.strokeStyle = PLAYER_COLORS.shade;
    context.lineWidth = weight * 1.2;
    context.beginPath();
    context.moveTo(left + bodyWidth * 0.22, top + height + weight * 0.5);
    context.lineTo(left + bodyWidth * 0.78, top + height + weight * 0.5);
    context.stroke();
  }

  // Eye on the leading edge; flips with facing, defaults to right when idle.
  const eyeRadius = Math.max(1.2, width * 0.075);
  const eyeX = centreX + facing * bodyWidth * 0.24;
  const eyeY = top + height * 0.3;
  context.beginPath();
  context.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
  context.fillStyle = PLAYER_COLORS.ink;
  context.fill();

  context.restore();
}
