import type { LevelModel, LevelRoom, Rect } from '../level/model';
import type { Body } from '../physics';

/**
 * Canvas 2D renderer for the side-scroller example.
 *
 * The renderer is a pure projection of frozen inputs: it reads a `LevelModel`,
 * a physics `Body`, a `Camera` and room badges, and draws one frame. It never
 * touches engine state, never mutates its inputs and never uses randomness, so
 * the same input always produces the same pixels.
 *
 * Everything is drawn in "world pixels" (the unit of `LevelModel`). Screen
 * space is only used for the backdrop, the parallax slabs and the vignette,
 * which must not scroll with the world.
 */

export interface RoomBadge {
  cleared: boolean;
  label: string;
}

export interface Camera {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RenderInput {
  level: LevelModel;
  body: Body;
  camera: Camera;
  activeRoomId: string | null;
  badges: Readonly<Record<string, RoomBadge>>;
  reducedMotion: boolean;
}

const PALETTE = {
  /** Deep-earth backdrop seen outside the level's bounding box. */
  skyTop: '#0b0d13',
  skyBottom: '#161d2e',
  slabFar: 'rgba(29, 39, 64, 0.34)',
  slabNear: 'rgba(38, 52, 82, 0.26)',
  tunnel: '#101725',
  rock: '#1b2333',
  rockHighlight: '#2b3750',
  chamber: 'rgba(29, 39, 64, 0.78)',
  chamberBorder: 'rgba(127, 209, 185, 0.3)',
  ladder: '#7fd1b9',
  player: '#ffd479',
  playerShade: '#b98d3a',
  playerInk: '#20180a',
  text: '#a8b3c9',
  textBright: '#e6ecf7',
  accent: '#7fd1b9',
  shadow: 'rgba(5, 8, 14, 0.45)',
  labelBackdrop: 'rgba(7, 10, 18, 0.68)',
  vignette: 'rgba(4, 6, 10, 0.55)',
} as const;

const FONT_STACK = 'system-ui, -apple-system, "Segoe UI", sans-serif';

const DEFAULT_VIEW_WIDTH = 960;
const DEFAULT_VIEW_HEIGHT = 540;

/** Camera smoothing time constant in ms. Smaller is snappier. */
const CAMERA_SMOOTHING_MS = 90;
const MAX_CAMERA_STEP_MS = 100;
const MAX_DEVICE_PIXEL_RATIO = 3;

export function createCamera(): Camera {
  return { x: 0, y: 0, w: DEFAULT_VIEW_WIDTH, h: DEFAULT_VIEW_HEIGHT };
}

function clampDevicePixelRatio(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  return Math.min(Math.max(value, 1), MAX_DEVICE_PIXEL_RATIO);
}

function devicePixelRatio(): number {
  // Guarded so node-side imports of this module never touch `window`.
  return typeof window === 'undefined' ? 1 : window.devicePixelRatio;
}

function finiteOr(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

/**
 * Resize the backing store for device pixel ratio and return a ready 2D context.
 *
 * CSS size comes from `clientWidth` / `clientHeight`; when the element has no
 * layout size we fall back to the width/height attributes and skip the DPR
 * multiplication (the attributes are already backing-store pixels, so scaling
 * them again would grow the canvas on every call).
 */
export function prepareCanvas(
  canvas: HTMLCanvasElement,
  camera: Camera,
): CanvasRenderingContext2D | null {
  const context = canvas.getContext('2d');
  if (!context) return null;

  const layoutWidth = canvas.clientWidth;
  const layoutHeight = canvas.clientHeight;
  const hasLayout = layoutWidth > 0 && layoutHeight > 0;

  const cssWidth = hasLayout ? layoutWidth : canvas.width;
  const cssHeight = hasLayout ? layoutHeight : canvas.height;
  const ratio = hasLayout ? clampDevicePixelRatio(devicePixelRatio()) : 1;

  const backingWidth = Math.max(1, Math.round(cssWidth * ratio));
  const backingHeight = Math.max(1, Math.round(cssHeight * ratio));

  // Assigning width/height resets the context, so only do it on real changes
  // and always re-apply the transform afterwards.
  if (canvas.width !== backingWidth) canvas.width = backingWidth;
  if (canvas.height !== backingHeight) canvas.height = backingHeight;

  context.setTransform(ratio, 0, 0, ratio, 0, 0);

  camera.w = cssWidth;
  camera.h = cssHeight;
  return context;
}

/**
 * Clamp one camera axis to the level, or centre it when the world is smaller.
 *
 * `focusRatio` is where the focus point sits inside the viewport. Horizontally
 * it is 0.5 (centred); vertically it is 0.6, which shows more above the player
 * so a five-tile-tall room's upper content stays visible while standing on its
 * floor.
 */
function cameraAxisTarget(
  boundStart: number,
  boundSize: number,
  viewSize: number,
  focus: number,
  focusRatio: number,
): number {
  if (!(boundSize > viewSize)) {
    // The whole world fits: centre the shorter world inside the viewport.
    return boundStart + (boundSize - viewSize) / 2;
  }
  const raw = focus - viewSize * focusRatio;
  return Math.min(Math.max(raw, boundStart), boundStart + boundSize - viewSize);
}

/**
 * Follow the body centre with exponential smoothing and clamp to the level.
 *
 * `t = 1 - e^(-dt / tau)` is frame-rate independent: 90 ms of elapsed time
 * always covers the same fraction of the remaining distance, whether it
 * arrived as one frame or several. Reduced motion (and a zero delta) snaps.
 */
export function updateCamera(
  camera: Camera,
  body: Body,
  level: LevelModel,
  deltaMs: number,
  reducedMotion: boolean,
): void {
  if (!(camera.w > 0) || !(camera.h > 0)) return;
  if (![body.x, body.y, body.w, body.h].every(Number.isFinite)) return;

  const bounds = level.bounds;
  const focusX = body.x + body.w / 2;
  const focusY = body.y + body.h / 2;

  const targetX = cameraAxisTarget(bounds.x, bounds.w, camera.w, focusX, 0.5);
  const targetY = cameraAxisTarget(bounds.y, bounds.h, camera.h, focusY, 0.6);

  const delta = Number.isFinite(deltaMs) ? Math.min(Math.max(deltaMs, 0), MAX_CAMERA_STEP_MS) : 0;
  const blend = reducedMotion ? 1 : 1 - Math.exp(-delta / CAMERA_SMOOTHING_MS);

  camera.x = finiteOr(camera.x + (targetX - camera.x) * blend, targetX);
  camera.y = finiteOr(camera.y + (targetY - camera.y) * blend, targetY);
}

function wrap(value: number, period: number): number {
  const remainder = value % period;
  return remainder < 0 ? remainder + period : remainder;
}

function isVisible(rect: Rect, view: Rect, margin: number): boolean {
  if (!(rect.w > 0) || !(rect.h > 0)) return false;
  return (
    rect.x + rect.w >= view.x - margin &&
    rect.x <= view.x + view.w + margin &&
    rect.y + rect.h >= view.y - margin &&
    rect.y <= view.y + view.h + margin
  );
}

/** Fill the screen-space backdrop, then two cheap deterministic parallax layers. */
function drawBackdrop(context: CanvasRenderingContext2D, view: Rect): void {
  const gradient = context.createLinearGradient(0, 0, 0, view.h);
  gradient.addColorStop(0, PALETTE.skyTop);
  gradient.addColorStop(1, PALETTE.skyBottom);
  context.fillStyle = gradient;
  context.fillRect(0, 0, view.w, view.h);

  drawDepthSlabs(context, view, 0.2, 460, PALETTE.slabFar, view.h * 0.3, view.h * 0.18);
  drawDepthSlabs(context, view, 0.35, 320, PALETTE.slabNear, view.h * 0.24, view.h * 0.56);
}

/**
 * One repeating row of translucent slabs. Positions use a negative camera
 * offset (so distant geometry moves slower) and wrap on a fixed period, which
 * keeps the layer deterministic and independent of level length.
 */
function drawDepthSlabs(
  context: CanvasRenderingContext2D,
  view: Rect,
  parallax: number,
  period: number,
  fill: string,
  slabHeight: number,
  baseline: number,
): void {
  const offsetX = wrap(-view.x * parallax, period);
  const offsetY = -view.y * parallax * 0.4;
  const count = Math.ceil(view.w / period) + 2;

  context.fillStyle = fill;
  for (let index = -1; index < count; index += 1) {
    // Modular offsets vary the silhouette without any randomness.
    const height = slabHeight + wrap(index * 2, 3) * slabHeight * 0.22;
    const y = baseline + offsetY + (wrap(index, 3) - 1) * slabHeight * 0.35;
    context.fillRect(index * period + offsetX, y, period * 0.72, height);
  }
}

/** Walks and solids. Only horizontal top edges get a highlight; no vertical strokes. */
function drawTerrain(context: CanvasRenderingContext2D, level: LevelModel, view: Rect): void {
  const { bounds, solids } = level;
  if (bounds.w > 0 && bounds.h > 0) {
    context.fillStyle = PALETTE.tunnel;
    context.fillRect(bounds.x, bounds.y, bounds.w, bounds.h);
  }

  const margin = level.tileSize * 2;
  const highlight = Math.max(1, level.tileSize * 0.03);

  for (const solid of solids) {
    if (!isVisible(solid, view, margin)) continue;
    context.fillStyle = PALETTE.rock;
    context.fillRect(solid.x, solid.y, solid.w, solid.h);
    // A thin lighter cap reads as a lit ledge. Merged runs mean no seams.
    context.fillStyle = PALETTE.rockHighlight;
    context.fillRect(solid.x, solid.y, solid.w, Math.min(highlight, solid.h));
  }
}

function fitText(context: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (maxWidth <= 0 || text.length === 0) return '';
  if (context.measureText(text).width <= maxWidth) return text;

  const ellipsis = '…';
  if (context.measureText(ellipsis).width > maxWidth) return '';

  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (context.measureText(`${text.slice(0, mid)}${ellipsis}`).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low > 0 ? `${text.slice(0, low)}${ellipsis}` : ellipsis;
}

/** Tick for cleared rooms, hollow ring for open ones: shape, not colour alone. */
function drawBadgeShape(
  context: CanvasRenderingContext2D,
  cleared: boolean,
  x: number,
  y: number,
  size: number,
): void {
  const radius = size / 2;
  context.lineWidth = Math.max(1.4, size * 0.15);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = cleared ? PALETTE.accent : PALETTE.text;

  context.beginPath();
  context.arc(x, y, radius, 0, Math.PI * 2);
  context.stroke();

  if (cleared) {
    context.beginPath();
    context.moveTo(x - radius * 0.45, y);
    context.lineTo(x - radius * 0.08, y + radius * 0.38);
    context.lineTo(x + radius * 0.5, y - radius * 0.42);
    context.stroke();
  }
  context.lineCap = 'butt';
  context.lineJoin = 'miter';
}

function statusIsCleared(status: string): boolean {
  return status === 'cleared' || status === 'mastered';
}

/** Room chamber fill and borders. Labels are a separate pass drawn over ladders. */
function drawRoomShell(
  context: CanvasRenderingContext2D,
  room: LevelRoom,
  level: LevelModel,
  activeRoomId: string | null,
): void {
  const rect = room.rect;
  if (rect.w <= 0 || rect.h <= 0) return;

  const pad = Math.max(6, level.tileSize * 0.16);
  if (rect.w <= pad * 2 || rect.h <= pad * 2) return;

  context.fillStyle = PALETTE.chamber;
  context.fillRect(rect.x, rect.y, rect.w, rect.h);

  context.lineWidth = Math.max(1, level.tileSize * 0.03);
  context.strokeStyle = PALETTE.chamberBorder;
  context.strokeRect(rect.x, rect.y, rect.w, rect.h);

  if (room.roomId === activeRoomId) {
    // Colour + dashed double border: active is legible without colour vision.
    const inset = Math.max(3, level.tileSize * 0.08);
    context.setLineDash([Math.max(6, level.tileSize * 0.18), Math.max(4, level.tileSize * 0.12)]);
    context.strokeStyle = PALETTE.accent;
    context.lineWidth = Math.max(2, level.tileSize * 0.055);
    context.strokeRect(rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2);
    context.setLineDash([]);
    context.strokeStyle = 'rgba(127, 209, 185, 0.45)';
    context.lineWidth = 1;
    const inner = inset * 2;
    context.strokeRect(rect.x + inner, rect.y + inner, rect.w - inner * 2, rect.h - inner * 2);
  }
}

/**
 * Topic and status block, confined to the room's left 45% so a centred ladder
 * (drawn earlier, in the middle) never crosses the text.
 *
 * The block is vertically centred at 45% of the room height rather than pinned
 * to the top edge, so it stays visible when the camera follows the player on
 * the room floor. Widths are derived from the free half, so truncation keeps
 * both the text and the backdrop inside the room rect.
 */
function drawRoomLabel(
  context: CanvasRenderingContext2D,
  room: LevelRoom,
  level: LevelModel,
  badge: RoomBadge | undefined,
): void {
  const rect = room.rect;
  if (rect.w <= 0 || rect.h <= 0) return;

  const pad = Math.max(6, level.tileSize * 0.16);
  if (rect.w <= pad * 2 || rect.h <= pad * 2) return;

  const freeWidth = rect.w * 0.45;
  const centreX = rect.x + freeWidth / 2;
  const maxTextWidth = freeWidth - pad * 2;
  if (maxTextWidth <= 0) return;

  const topicSize = Math.min(Math.max(level.tileSize * 0.24, 11), 22);
  const statusSize = Math.min(Math.max(topicSize * 0.8, 10), 18);
  const topicY = rect.y + rect.h * 0.45;
  const statusY = topicY + topicSize * 0.62 + statusSize * 0.85;

  if (topicY - topicSize * 0.62 < rect.y + pad * 0.25) return;
  if (statusY + statusSize * 0.62 > rect.y + rect.h - pad) return;

  const cleared = badge ? badge.cleared : statusIsCleared(room.status);
  const label = badge ? badge.label : room.status;
  const shapeSize = statusSize * 0.95;
  const gap = statusSize * 0.45;

  context.textAlign = 'center';
  context.textBaseline = 'middle';

  context.font = `600 ${topicSize}px ${FONT_STACK}`;
  const topicText = fitText(context, room.topic, maxTextWidth);
  const topicWidth = context.measureText(topicText).width;

  context.font = `500 ${statusSize}px ${FONT_STACK}`;
  const statusText = fitText(context, label, maxTextWidth - shapeSize - gap);
  const statusTextWidth = statusText.length > 0 ? context.measureText(statusText).width : 0;
  const statusGroupWidth = statusText.length > 0 ? shapeSize + gap + statusTextWidth : 0;

  // One rounded backdrop behind both lines; its width comes from the widest
  // line, which is already capped by `maxTextWidth`.
  const blockPadX = pad * 0.55;
  const blockPadY = pad * 0.45;
  const blockWidth = Math.min(Math.max(topicWidth, statusGroupWidth) + blockPadX * 2, freeWidth);
  const blockTop = topicY - topicSize * 0.62 - blockPadY;
  const blockBottom =
    statusText.length > 0
      ? statusY + statusSize * 0.62 + blockPadY
      : topicY + topicSize * 0.62 + blockPadY;
  const blockHeight = blockBottom - blockTop;

  if (
    blockTop >= rect.y + pad * 0.25 &&
    blockBottom <= rect.y + rect.h - pad * 0.25 &&
    blockWidth > 0 &&
    blockHeight > 0
  ) {
    roundedRectPath(
      context,
      centreX - blockWidth / 2,
      blockTop,
      blockWidth,
      blockHeight,
      Math.min(blockPadY, blockWidth / 2),
    );
    context.fillStyle = PALETTE.labelBackdrop;
    context.fill();
  }

  context.fillStyle = PALETTE.textBright;
  context.fillText(topicText, centreX, topicY);

  if (statusText.length === 0) return;

  const groupLeft = centreX - statusGroupWidth / 2;
  drawBadgeShape(context, cleared, groupLeft + shapeSize / 2, statusY, shapeSize);
  context.textAlign = 'left';
  context.fillStyle = PALETTE.text;
  context.fillText(statusText, groupLeft + shapeSize + gap, statusY);
  context.textAlign = 'center';
}

function drawRooms(
  context: CanvasRenderingContext2D,
  level: LevelModel,
  activeRoomId: string | null,
  view: Rect,
): void {
  const margin = level.tileSize;
  for (const room of level.rooms) {
    if (!isVisible(room.rect, view, margin)) continue;
    drawRoomShell(context, room, level, activeRoomId);
  }
}

function drawRoomLabels(
  context: CanvasRenderingContext2D,
  level: LevelModel,
  badges: Readonly<Record<string, RoomBadge>>,
  view: Rect,
): void {
  const margin = level.tileSize;
  for (const room of level.rooms) {
    if (!isVisible(room.rect, view, margin)) continue;
    const badge: RoomBadge | undefined = badges[room.roomId];
    drawRoomLabel(context, room, level, badge);
  }
}

/** Two rails plus rungs, clipped to the visible vertical band. */
function drawLadders(context: CanvasRenderingContext2D, level: LevelModel, view: Rect): void {
  const margin = level.tileSize;
  const railInset = 0.22;

  for (const ladder of level.ladders) {
    const rect = ladder;
    if (!isVisible(rect, view, margin)) continue;

    // Clamp the drawn band to the viewport so long shafts stay cheap.
    const top = Math.max(rect.y, view.y - margin);
    const bottom = Math.min(rect.y + rect.h, view.y + view.h + margin);
    if (bottom <= top) continue;

    const leftRail = rect.x + rect.w * railInset;
    const rightRail = rect.x + rect.w * (1 - railInset);
    const weight = Math.max(1, level.tileSize * 0.03);

    context.strokeStyle = PALETTE.ladder;
    context.lineWidth = weight;

    context.beginPath();
    context.moveTo(leftRail, top);
    context.lineTo(leftRail, bottom);
    context.moveTo(rightRail, top);
    context.lineTo(rightRail, bottom);
    context.stroke();

    const spacing = Math.max(level.tileSize * 0.34, 8);
    // Rung positions are anchored to the ladder, not the camera, so they do
    // not slide while the player climbs.
    const firstRung = Math.ceil((top - rect.y) / spacing);
    context.beginPath();
    for (let index = firstRung; rect.y + index * spacing <= bottom; index += 1) {
      const rungY = rect.y + index * spacing;
      context.moveTo(leftRail, rungY);
      context.lineTo(rightRail, rungY);
    }
    context.stroke();
  }
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
 * The player is a rounded body whose silhouette changes with state:
 * narrow + arms out on a ladder, legs tucked + no contact shadow while
 * airborne, feet bar on the ground. The eye flips with horizontal velocity.
 */
function drawPlayer(
  context: CanvasRenderingContext2D,
  body: Body,
  reducedMotion: boolean,
): void {
  const width = body.w;
  const height = body.h;
  if (!(width > 0) || !(height > 0)) return;
  if (![body.x, body.y].every(Number.isFinite)) return;

  const centreX = body.x + width / 2;
  const top = body.y;
  const facing = body.vx < 0 ? -1 : 1;
  const onLadder = body.onLadder;
  const airborne = !body.onGround && !onLadder;

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
      top + height,
      bodyWidth * 0.52,
      Math.max(1.5, height * 0.07),
      0,
      0,
      Math.PI * 2,
    );
    context.fillStyle = PALETTE.shadow;
    context.fill();
  }

  if (onLadder) {
    // Arms reaching for the rails.
    const armY = top + height * 0.38;
    const armLength = width * 0.28;
    context.strokeStyle = PALETTE.player;
    context.lineWidth = weight * 1.2;
    context.beginPath();
    context.moveTo(left - armLength, armY);
    context.lineTo(left, armY);
    context.moveTo(left + bodyWidth, armY);
    context.lineTo(left + bodyWidth + armLength, armY);
    context.stroke();
  } else if (airborne) {
    // Tucked legs: two short diagonals, visible below the torso.
    context.strokeStyle = PALETTE.player;
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
  context.fillStyle = PALETTE.player;
  context.fill();
  context.strokeStyle = PALETTE.playerShade;
  context.lineWidth = weight;
  context.stroke();

  if (!airborne && !onLadder) {
    // Feet bar: an extra ground-only silhouette cue under the torso.
    context.strokeStyle = PALETTE.playerShade;
    context.lineWidth = weight * 1.2;
    context.beginPath();
    context.moveTo(left + bodyWidth * 0.22, top + height + weight * 0.5);
    context.lineTo(left + bodyWidth * 0.78, top + height + weight * 0.5);
    context.stroke();
  }

  // Eye on the leading edge; flips with vx, defaults to right when idle.
  const eyeRadius = Math.max(1.2, width * 0.075);
  const eyeX = centreX + facing * bodyWidth * 0.24;
  const eyeY = top + height * 0.3;
  context.beginPath();
  context.arc(eyeX, eyeY, eyeRadius, 0, Math.PI * 2);
  context.fillStyle = PALETTE.playerInk;
  context.fill();

  context.restore();
}

/** Static vignette; deterministic and independent of time. */
function drawVignette(context: CanvasRenderingContext2D, view: Rect): void {
  const centreX = view.w / 2;
  const centreY = view.h / 2;
  const inner = Math.min(view.w, view.h) * 0.2;
  const outer = Math.hypot(view.w, view.h) / 2;
  if (!(outer > inner)) return;

  const gradient = context.createRadialGradient(centreX, centreY, inner, centreX, centreY, outer);
  gradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
  gradient.addColorStop(1, PALETTE.vignette);
  context.fillStyle = gradient;
  context.fillRect(0, 0, view.w, view.h);
}

/**
 * Draw one frame in world space.
 *
 * `context` is restored to its incoming state, and no field of `input` is
 * written. All sizes are clamped positive so a camera wider than the world
 * (or a zero-sized body) cannot produce negative fills or NaNs.
 */
export function renderWorld(context: CanvasRenderingContext2D, input: RenderInput): void {
  const { level, body, camera, activeRoomId, badges, reducedMotion } = input;

  const view: Rect = {
    x: finiteOr(camera.x, 0),
    y: finiteOr(camera.y, 0),
    w: Math.max(1, finiteOr(camera.w, DEFAULT_VIEW_WIDTH)),
    h: Math.max(1, finiteOr(camera.h, DEFAULT_VIEW_HEIGHT)),
  };

  drawBackdrop(context, view);

  context.save();
  context.translate(-view.x, -view.y);

  drawTerrain(context, level, view);
  drawRooms(context, level, activeRoomId, view);
  drawLadders(context, level, view);
  // Labels come after ladders so rungs never cross the text.
  drawRoomLabels(context, level, badges, view);
  drawPlayer(context, body, reducedMotion);

  context.restore();

  drawVignette(context, view);
}
