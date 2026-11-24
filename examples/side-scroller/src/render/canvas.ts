import type { LevelDoor, LevelModel, LevelRoom, Rect } from '../level/model';
import type { SurfaceFacade, SurfaceModel } from '../level/surfaceLevel';
import type { Body } from '../physics';
import type { SurfaceNpc } from '../village/npc';
import { drawPlayerFigure, PLAYER_COLORS } from './playerFigure';

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
  /** P3: the surface street drawn above the dungeon, when present. */
  surface?: SurfaceModel | null;
  /** P3: the facade the player can interact with right now. */
  activeInteractableId?: string | null;
  /** P7: labelled placeholder figures from `VILLAGE_MAP.npcs`. */
  npcs?: readonly SurfaceNpc[];
  /** P7: the NPC the player can talk to right now. */
  activeNpcId?: string | null;
  badges: Readonly<Record<string, RoomBadge>>;
  reducedMotion: boolean;
  /** P8: `large` scales canvas labels with the DOM text scale. */
  textScale?: 'normal' | 'large';
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
  player: PLAYER_COLORS.body,
  playerShade: PLAYER_COLORS.shade,
  playerInk: PLAYER_COLORS.ink,
  text: '#a8b3c9',
  textBright: '#e6ecf7',
  accent: '#7fd1b9',
  labelBackdrop: 'rgba(7, 10, 18, 0.68)',
  vignette: 'rgba(4, 6, 10, 0.55)',
  surfaceSkyTop: '#1b2740',
  surfaceSkyBottom: '#3a5275',
  surfaceSkylineFar: 'rgba(24, 34, 56, 0.55)',
  surfaceSkylineNear: 'rgba(34, 47, 72, 0.72)',
  street: '#243047',
  streetEdge: '#33445f',
  streetPebble: 'rgba(11, 13, 19, 0.2)',
  facadeBase: '#2c3a54',
  facadeAlt: '#344662',
  facadeRoof: '#1d2940',
  facadeInk: '#e6ecf7',
  facadeWindow: 'rgba(255, 212, 121, 0.72)',
  facadeWindowDark: 'rgba(11, 13, 19, 0.5)',
  doorInk: '#0b0d13',
  portalGlow: 'rgba(127, 209, 185, 0.38)',
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

/**
 * A distant, deterministic skyline and a moon in screen space. The camera is
 * cancelled with a translate so these layers can use a slow parallax while the
 * street and facades stay in world coordinates.
 */
function drawSurfaceSkyline(
  context: CanvasRenderingContext2D,
  surface: SurfaceModel,
  view: Rect,
): void {
  const groundScreenY = surface.groundY - view.y;
  if (groundScreenY <= 0) return;

  context.save();
  context.translate(view.x, view.y);
  context.beginPath();
  context.rect(0, 0, view.w, groundScreenY);
  context.clip();

  const moonX = view.w * 0.78;
  const moonY = groundScreenY * 0.24;
  const moonRadius = Math.max(9, surface.tileSize * 0.24);
  const glow = context.createRadialGradient(moonX, moonY, moonRadius * 0.4, moonX, moonY, moonRadius * 3.2);
  glow.addColorStop(0, 'rgba(232, 236, 247, 0.18)');
  glow.addColorStop(1, 'rgba(232, 236, 247, 0)');
  context.fillStyle = glow;
  context.fillRect(moonX - moonRadius * 4, moonY - moonRadius * 4, moonRadius * 8, moonRadius * 8);
  context.fillStyle = 'rgba(232, 236, 247, 0.5)';
  context.beginPath();
  context.arc(moonX, moonY, moonRadius, 0, Math.PI * 2);
  context.fill();

  const band = (
    factor: number,
    period: number,
    baseHeight: number,
    variance: number,
    fill: string,
  ): void => {
    const offset = -view.x * factor;
    const first = Math.floor(-offset / period) - 1;
    const count = Math.ceil(view.w / period) + 3;
    context.fillStyle = fill;
    for (let index = 0; index < count; index += 1) {
      const slot = first + index;
      const positive = ((slot % 11) + 11) % 11;
      const wobble = (((slot * 13) % 17) + 17) % 17;
      const width = period * (0.52 + wobble / 40);
      const height = baseHeight + (positive / 11) * variance;
      context.fillRect(slot * period + offset, groundScreenY - height, width, height);
      // A small roof notch breaks the flat silhouette without randomness.
      if (positive % 3 === 0) {
        context.fillRect(slot * period + offset + width * 0.35, groundScreenY - height - period * 0.12, width * 0.3, period * 0.12);
      }
    }
  };

  band(0.12, 180, groundScreenY * 0.1, groundScreenY * 0.1, PALETTE.surfaceSkylineFar);
  band(0.22, 140, groundScreenY * 0.16, groundScreenY * 0.12, PALETTE.surfaceSkylineNear);
  context.restore();
}

/**
 * The surface street. Drawn after terrain so it replaces the tunnel fill above
 * the ground with a sky, a street, and depth-sorted facades. All geometry comes
 * from `SurfaceModel`; the renderer only chooses placeholder shapes.
 */
function drawSurface(
  context: CanvasRenderingContext2D,
  level: LevelModel,
  surface: SurfaceModel,
  activeInteractableId: string | null,
  view: Rect,
  labelScale: number,
): void {
  const { bounds, groundY, tileSize } = surface;
  const streetBottom = bounds.y + bounds.h;

  const sky = context.createLinearGradient(0, bounds.y, 0, groundY);
  sky.addColorStop(0, PALETTE.surfaceSkyTop);
  sky.addColorStop(1, PALETTE.surfaceSkyBottom);
  context.fillStyle = sky;
  context.fillRect(bounds.x, bounds.y, bounds.w, Math.max(0, groundY - bounds.y));
  drawSurfaceSkyline(context, surface, view);

  context.fillStyle = PALETTE.street;
  context.fillRect(bounds.x, groundY, bounds.w, Math.max(0, streetBottom - groundY));
  context.fillStyle = PALETTE.streetEdge;
  context.fillRect(bounds.x, groundY, bounds.w, Math.max(1, tileSize * 0.08));

  // Sparse paving seams keep the long street from reading as a flat slab.
  const seamSpacing = tileSize * 2;
  const firstSeam = Math.floor(view.x / seamSpacing) * seamSpacing;
  context.fillStyle = PALETTE.streetPebble;
  for (let x = firstSeam; x < view.x + view.w + seamSpacing; x += seamSpacing) {
    context.fillRect(x, groundY + tileSize * 0.15, tileSize * 0.9, Math.max(1, tileSize * 0.02));
  }
  const streetShade = context.createLinearGradient(0, groundY, 0, streetBottom);
  streetShade.addColorStop(0, 'rgba(5, 8, 14, 0)');
  streetShade.addColorStop(1, 'rgba(5, 8, 14, 0.35)');
  context.fillStyle = streetShade;
  context.fillRect(bounds.x, groundY, bounds.w, Math.max(0, streetBottom - groundY));

  const shaft = level.ladders.find(
    (ladder) =>
      ladder.x <= surface.entrance.x + tileSize / 2 &&
      ladder.x + ladder.w >= surface.entrance.x + tileSize / 2 &&
      ladder.y <= groundY + 1 &&
      ladder.y + ladder.h >= groundY,
  );
  if (shaft) {
    context.fillStyle = PALETTE.doorInk;
    context.fillRect(surface.entrance.x, groundY, tileSize, Math.min(tileSize, streetBottom - groundY));
    // A small chevron in the opening says "up" without adding a floating sign.
    const centre = surface.entrance.x + tileSize / 2;
    const tip = groundY + tileSize * 0.35;
    const size = tileSize * 0.16;
    context.strokeStyle = PALETTE.accent;
    context.lineWidth = Math.max(1.5, tileSize * 0.035);
    context.beginPath();
    context.moveTo(centre - size, tip + size);
    context.lineTo(centre, tip);
    context.lineTo(centre + size, tip + size);
    context.stroke();
  }

  const facades = [...surface.facades].sort(
    (a, b) => a.depth - b.depth || a.id.localeCompare(b.id),
  );
  for (const facade of facades) {
    if (!isVisible(facade.rect, view, tileSize * 2)) continue;
    drawFacade(context, facade, tileSize, facade.id === activeInteractableId, labelScale);
  }
}

function facadeFill(facade: SurfaceFacade): string {
  return facade.depth % 2 === 0 ? PALETTE.facadeBase : PALETTE.facadeAlt;
}

function drawScenery(context: CanvasRenderingContext2D, facade: SurfaceFacade, tileSize: number): void {
  const rect = facade.rect;
  const baseX = rect.x + rect.w / 2;
  const baseY = rect.y + rect.h;
  const weight = Math.max(1, tileSize * 0.035);

  switch (facade.type) {
    case 'tree': {
      context.fillStyle = PALETTE.facadeRoof;
      context.fillRect(baseX - weight * 1.5, baseY - rect.h * 0.5, weight * 3, rect.h * 0.5);
      context.fillStyle = PALETTE.accent;
      context.beginPath();
      context.arc(baseX, baseY - rect.h * 0.72, rect.w * 0.42, 0, Math.PI * 2);
      context.fill();
      return;
    }
    case 'bush': {
      context.fillStyle = 'rgba(127, 209, 185, 0.34)';
      context.beginPath();
      context.ellipse(baseX, baseY - rect.h * 0.32, rect.w * 0.5, rect.h * 0.36, 0, 0, Math.PI * 2);
      context.fill();
      return;
    }
    case 'flower': {
      context.fillStyle = PALETTE.text;
      context.fillRect(baseX - weight * 0.5, baseY - rect.h * 0.5, weight, rect.h * 0.5);
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(baseX, baseY - rect.h * 0.55, weight * 2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    case 'rock': {
      context.fillStyle = PALETTE.rockHighlight;
      context.beginPath();
      context.ellipse(baseX, baseY - rect.h * 0.2, rect.w * 0.38, rect.h * 0.28, 0, 0, Math.PI * 2);
      context.fill();
      return;
    }
    case 'torch': {
      context.fillStyle = PALETTE.facadeRoof;
      context.fillRect(baseX - weight * 0.8, baseY - rect.h * 0.8, weight * 1.6, rect.h * 0.8);
      context.fillStyle = PALETTE.player;
      context.beginPath();
      context.arc(baseX, baseY - rect.h * 0.86, weight * 2.2, 0, Math.PI * 2);
      context.fill();
      return;
    }
    case 'bench': {
      context.fillStyle = PALETTE.facadeRoof;
      context.fillRect(rect.x + rect.w * 0.08, baseY - rect.h * 0.35, rect.w * 0.84, rect.h * 0.16);
      context.fillRect(rect.x + rect.w * 0.14, baseY - rect.h * 0.18, weight * 1.6, rect.h * 0.18);
      context.fillRect(rect.x + rect.w * 0.78, baseY - rect.h * 0.18, weight * 1.6, rect.h * 0.18);
      return;
    }
    case 'pond': {
      context.fillStyle = 'rgba(58, 82, 117, 0.72)';
      context.fillRect(rect.x, baseY - rect.h * 0.45, rect.w, rect.h * 0.45);
      context.strokeStyle = PALETTE.accent;
      context.lineWidth = weight;
      context.beginPath();
      context.moveTo(rect.x + rect.w * 0.12, baseY - rect.h * 0.24);
      context.lineTo(rect.x + rect.w * 0.5, baseY - rect.h * 0.24);
      context.moveTo(rect.x + rect.w * 0.62, baseY - rect.h * 0.34);
      context.lineTo(rect.x + rect.w * 0.88, baseY - rect.h * 0.34);
      context.stroke();
      return;
    }
    case 'gate': {
      // A low threshold and two short posts: the gate is an exit marker, not a
      // beam that visually joins neighbouring buildings.
      const post = Math.max(2, tileSize * 0.08);
      const postHeight = Math.min(rect.h, tileSize * 0.9);
      context.fillStyle = PALETTE.facadeRoof;
      context.fillRect(rect.x, baseY - postHeight, post, postHeight);
      context.fillRect(rect.x + rect.w - post, baseY - postHeight, post, postHeight);
      context.fillStyle = PALETTE.streetEdge;
      context.fillRect(rect.x, baseY - Math.max(1, tileSize * 0.06), rect.w, Math.max(1, tileSize * 0.06));
      return;
    }
    default: {
      context.fillStyle = PALETTE.text;
      context.fillRect(rect.x, baseY - rect.h, Math.max(1, weight), rect.h);
    }
  }
}

function facadeHash(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

/** A deterministic grid of small warm/dark windows between the sign and door. */
function drawFacadeWindows(
  context: CanvasRenderingContext2D,
  facade: SurfaceFacade,
  tileSize: number,
): void {
  const rect = facade.rect;
  const pad = Math.max(4, tileSize * 0.1);
  const signHeight = Math.max(10, tileSize * 0.3);
  const top = rect.y + pad + signHeight * 1.45 + tileSize * 0.04;
  const bottom = facade.door.y - tileSize * 0.08;
  if (bottom - top < tileSize * 0.12) return;

  const rows = Math.max(1, Math.min(2, Math.floor((bottom - top) / (tileSize * 0.3))));
  const cols = Math.max(1, Math.min(3, Math.floor(rect.w / (tileSize * 0.6))));
  const rowStep = (bottom - top) / (rows + 1);
  const colStep = rect.w / (cols + 1);
  const windowW = Math.max(3, Math.min(tileSize * 0.16, colStep * 0.36));
  const windowH = Math.max(3, Math.min(tileSize * 0.18, rowStep * 0.55));
  const hash = facadeHash(facade.id);

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x = rect.x + colStep * (col + 1) - windowW / 2;
      const y = top + rowStep * (row + 1) - windowH / 2;
      const lit = ((hash >> ((row * 3 + col) % 24)) & 3) !== 0;
      context.fillStyle = lit ? PALETTE.facadeWindow : PALETTE.facadeWindowDark;
      context.fillRect(x, y, windowW, windowH);
    }
  }
}

function drawFacade(
  context: CanvasRenderingContext2D,
  facade: SurfaceFacade,
  tileSize: number,
  active: boolean,
  labelScale: number,
): void {
  const rect = facade.rect;
  if (rect.w <= 0 || rect.h <= 0) return;

  if (!facade.building) {
    drawScenery(context, facade, tileSize);
    if (facade.interactive) drawFacadeSign(context, facade, tileSize, active, labelScale);
    return;
  }

  const baseY = rect.y + rect.h;
  // Contact shadow on the street grounds the facade without making it solid.
  context.fillStyle = 'rgba(5, 8, 14, 0.32)';
  context.fillRect(rect.x - tileSize * 0.12, baseY, rect.w + tileSize * 0.24, tileSize * 0.12);

  context.fillStyle = facadeFill(facade);
  context.fillRect(rect.x, rect.y, rect.w, rect.h);

  context.fillStyle = PALETTE.facadeRoof;
  context.fillRect(rect.x, rect.y, rect.w, Math.max(2, rect.h * 0.14));
  context.fillStyle = 'rgba(230, 236, 247, 0.12)';
  context.fillRect(rect.x, rect.y, rect.w, Math.max(1, tileSize * 0.02));

  const floor = Math.max(1, tileSize * 0.04);
  context.fillStyle = 'rgba(11, 13, 19, 0.24)';
  for (let y = rect.y + rect.h * 0.32; y < rect.y + rect.h - floor; y += rect.h * 0.24) {
    context.fillRect(rect.x, y, rect.w, floor);
  }

  context.fillStyle = 'rgba(11, 13, 19, 0.28)';
  context.fillRect(rect.x, baseY - tileSize * 0.08, rect.w, tileSize * 0.08);
  drawFacadeWindows(context, facade, tileSize);

  const door = facade.door;
  if (facade.type === 'portal-icon' || facade.type === 'training-gate' || facade.type === 'fishing-pond') {
    context.fillStyle = PALETTE.portalGlow;
    context.fillRect(door.x - tileSize * 0.08, door.y - tileSize * 0.08, door.w + tileSize * 0.16, door.h + tileSize * 0.08);
  }
  context.fillStyle = PALETTE.doorInk;
  context.fillRect(door.x, door.y, door.w, door.h);
  context.fillStyle = PALETTE.facadeRoof;
  context.fillRect(door.x + door.w * 0.2, door.y + door.h * 0.45, door.w * 0.6, door.h * 0.55);
  context.fillStyle = PALETTE.doorInk;
  context.fillRect(door.x + door.w * 0.3, door.y + door.h * 0.1, door.w * 0.4, door.h * 0.35);

  // Door frame and a thin step.
  context.fillStyle = PALETTE.facadeRoof;
  context.fillRect(door.x - tileSize * 0.08, door.y - tileSize * 0.1, door.w + tileSize * 0.16, tileSize * 0.08);
  context.fillStyle = 'rgba(127, 209, 185, 0.18)';
  context.fillRect(door.x - tileSize * 0.05, baseY - tileSize * 0.05, door.w + tileSize * 0.1, tileSize * 0.05);

  drawFacadeSign(context, facade, tileSize, active, labelScale);
}

function drawFacadeSign(
  context: CanvasRenderingContext2D,
  facade: SurfaceFacade,
  tileSize: number,
  active: boolean,
  labelScale: number,
): void {
  const rect = facade.rect;
  const pad = Math.max(4, tileSize * 0.1);
  const signHeight = Math.max(10, tileSize * 0.3) * labelScale;
  // Subject names are longer than a two-tile portal; let that sign use the
  // guaranteed gap on either side instead of truncating the name.
  const maxWidth = Math.max(
    rect.w - pad * 2,
    facade.type === 'portal-icon' ? tileSize * 3 : 0,
  );
  if (maxWidth <= 0) return;

  const label = facade.subjectName || facade.label;
  const subtitle =
    facade.type === 'portal-icon' && facade.roomCount !== undefined
      ? `${facade.clearedCount ?? 0} / ${facade.roomCount} cleared`
      : facade.type === 'training-gate'
        ? 'Tutorial dungeon'
        : facade.type === 'fishing-pond'
          ? 'Fishing'
          : '';

  const signY = rect.y + pad;
  let fontSize = Math.max(10, signHeight * 0.62);
  context.font = `600 ${fontSize}px ${FONT_STACK}`;
  while (fontSize > 9 && context.measureText(label).width > maxWidth - pad * 1.4) {
    fontSize -= 1;
    context.font = `600 ${fontSize}px ${FONT_STACK}`;
  }  const signWidth = Math.min(maxWidth, context.measureText(label).width + pad * 1.4);
  const signX = rect.x + (rect.w - signWidth) / 2;
  roundedRectPath(context, signX, signY, signWidth, signHeight, signHeight * 0.22);
  context.fillStyle = PALETTE.labelBackdrop;
  context.fill();
  context.strokeStyle = 'rgba(127, 209, 185, 0.28)';
  context.lineWidth = Math.max(1, tileSize * 0.015);
  context.stroke();

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = PALETTE.facadeInk;
  context.fillText(
    fitText(context, label, signWidth - pad * 1.4),
    rect.x + rect.w / 2,
    signY + signHeight / 2,
  );

  if (subtitle) {
    context.font = `500 ${Math.max(9, signHeight * 0.5)}px ${FONT_STACK}`;
    context.fillStyle = PALETTE.text;
    context.fillText(
      fitText(context, subtitle, signWidth - pad * 0.6),
      rect.x + rect.w / 2,
      signY + signHeight * 1.45,
    );
  }

  if (!active) return;
  const inset = Math.max(3, tileSize * 0.06);
  context.setLineDash([Math.max(5, tileSize * 0.14), Math.max(3, tileSize * 0.1)]);
  context.strokeStyle = PALETTE.accent;
  context.lineWidth = Math.max(2, tileSize * 0.04);
  context.strokeRect(rect.x + inset, rect.y + inset, rect.w - inset * 2, rect.h - inset * 2);
  context.setLineDash([]);
}

/**
 * One NPC placeholder: a muted capsule with a head, a ground shadow, and a
 * label pill. Deliberately not the player figure, so the player can tell at a
 * glance which silhouette is theirs. Static and deterministic; `reducedMotion`
 * changes nothing because there is no animation to drop.
 */
function drawNpc(
  context: CanvasRenderingContext2D,
  npc: SurfaceNpc,
  tileSize: number,
  active: boolean,
  labelScale: number,
): void {
  const top = npc.feetY - npc.h;
  const bodyW = npc.w * 0.7;
  const left = npc.x - bodyW / 2;
  const headRadius = npc.w * 0.32;
  const bodyTop = top + headRadius * 1.6;
  const weight = Math.max(1, tileSize * 0.03);

  context.save();
  context.fillStyle = 'rgba(5, 8, 14, 0.32)';
  context.beginPath();
  context.ellipse(npc.x, npc.feetY, npc.w * 0.42, Math.max(1.5, tileSize * 0.05), 0, 0, Math.PI * 2);
  context.fill();

  context.fillStyle = '#9aa8d6';
  roundedRectPath(context, left, bodyTop, bodyW, npc.feetY - bodyTop, bodyW * 0.28);
  context.fill();
  context.strokeStyle = '#5f6d99';
  context.lineWidth = weight;
  context.stroke();

  context.fillStyle = '#c6d0ef';
  context.beginPath();
  context.arc(npc.x, top + headRadius, headRadius, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = '#5f6d99';
  context.stroke();

  // Two ink dots read as eyes without an extra sprite sheet.
  context.fillStyle = PALETTE.doorInk;
  context.beginPath();
  context.arc(npc.x - headRadius * 0.35, top + headRadius * 0.95, Math.max(1, headRadius * 0.14), 0, Math.PI * 2);
  context.arc(npc.x + headRadius * 0.35, top + headRadius * 0.95, Math.max(1, headRadius * 0.14), 0, Math.PI * 2);
  context.fill();

  const pad = Math.max(3, tileSize * 0.08);
  const fontSize = Math.max(9, tileSize * 0.19) * labelScale;
  context.font = `600 ${fontSize}px ${FONT_STACK}`;
  const labelWidth = Math.min(
    Math.max(tileSize * 1.4, context.measureText(npc.label).width + pad * 2),
    tileSize * 3 * labelScale,
  );
  const labelHeight = fontSize + pad * 1.2;
  const labelX = npc.x - labelWidth / 2;
  const labelY = top - labelHeight - pad;
  roundedRectPath(context, labelX, labelY, labelWidth, labelHeight, labelHeight * 0.28);
  context.fillStyle = active ? 'rgba(47, 107, 93, 0.92)' : PALETTE.labelBackdrop;
  context.fill();
  context.strokeStyle = active ? PALETTE.accent : 'rgba(127, 209, 185, 0.22)';
  context.lineWidth = Math.max(1, tileSize * 0.015);
  context.stroke();

  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = PALETTE.facadeInk;
  context.fillText(
    fitText(context, npc.label, labelWidth - pad * 1.2),
    npc.x,
    labelY + labelHeight / 2,
  );
  context.textAlign = 'left';
  context.textBaseline = 'alphabetic';
  context.restore();
}

function drawNpcs(
  context: CanvasRenderingContext2D,
  npcs: readonly SurfaceNpc[],
  activeNpcId: string | null,
  view: Rect,
  tileSize: number,
  labelScale: number,
): void {
  const ordered = [...npcs].sort((left, right) => left.depth - right.depth || left.id.localeCompare(right.id));
  for (const npc of ordered) {
    const bounds: Rect = { x: npc.x - npc.w, y: npc.feetY - npc.h * 2, w: npc.w * 2, h: npc.h * 2 };
    if (!isVisible(bounds, view, tileSize * 2)) continue;
    drawNpc(context, npc, tileSize, npc.id === activeNpcId, labelScale);
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

  // Break the chamber outline where a corridor enters. Before this, two
  // connected rooms looked like two sealed boxes with a line between them.
  const doors = level.doors?.filter((door) => door.roomId === room.roomId) ?? [];
  for (const door of doors) drawDoorOpening(context, room, door, level.tileSize);
}

/** A tunnel-coloured gap in the room border, plus a short threshold mark. */
function drawDoorOpening(
  context: CanvasRenderingContext2D,
  room: LevelRoom,
  door: LevelDoor,
  tileSize: number,
): void {
  const rect = room.rect;
  const thickness = Math.max(4, tileSize * 0.12);
  const half = thickness / 2;

  if (door.side === 'W' || door.side === 'E') {
    const x = door.side === 'W' ? rect.x - half : rect.x + rect.w - half;
    context.fillStyle = PALETTE.tunnel;
    context.fillRect(x, door.rect.y, thickness, door.rect.h);

    // Two short jambs read as a threshold without looking like a wall.
    context.strokeStyle = 'rgba(127, 209, 185, 0.42)';
    context.lineWidth = Math.max(1, tileSize * 0.02);
    context.beginPath();
    context.moveTo(x - thickness, door.rect.y);
    context.lineTo(x + thickness * 1.6, door.rect.y);
    context.moveTo(x - thickness, door.rect.y + door.rect.h);
    context.lineTo(x + thickness * 1.6, door.rect.y + door.rect.h);
    context.stroke();
    return;
  }

  const y = door.side === 'N' ? rect.y - half : rect.y + rect.h - half;
  context.fillStyle = PALETTE.tunnel;
  context.fillRect(door.rect.x, y, door.rect.w, thickness);

  context.strokeStyle = 'rgba(127, 209, 185, 0.42)';
  context.lineWidth = Math.max(1, tileSize * 0.02);
  context.beginPath();
  context.moveTo(door.rect.x, y - thickness);
  context.lineTo(door.rect.x, y + thickness * 1.6);
  context.moveTo(door.rect.x + door.rect.w, y - thickness);
  context.lineTo(door.rect.x + door.rect.w, y + thickness * 1.6);
  context.stroke();
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
  labelScale: number,
): void {
  const rect = room.rect;
  if (rect.w <= 0 || rect.h <= 0) return;

  const pad = Math.max(6, level.tileSize * 0.16);
  if (rect.w <= pad * 2 || rect.h <= pad * 2) return;

  const freeWidth = rect.w * 0.45;
  const centreX = rect.x + freeWidth / 2;
  const maxTextWidth = freeWidth - pad * 2;
  if (maxTextWidth <= 0) return;

  const topicSize = Math.min(Math.max(level.tileSize * 0.24, 11), 22) * labelScale;
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
  labelScale: number,
): void {
  const margin = level.tileSize;
  for (const room of level.rooms) {
    if (!isVisible(room.rect, view, margin)) continue;
    const badge: RoomBadge | undefined = badges[room.roomId];
    drawRoomLabel(context, room, level, badge, labelScale);
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
 * Draw the shared player figure from the physics body.
 *
 * The silhouette changes with state: narrow + arms out on a ladder, legs tucked
 * + no contact shadow while airborne, feet bar on the ground. The eye flips with
 * horizontal velocity. The pond scene draws the same `drawPlayerFigure`, so the
 * character is one implementation (P5 follow-up).
 */
function drawPlayer(
  context: CanvasRenderingContext2D,
  body: Body,
  reducedMotion: boolean,
): void {
  drawPlayerFigure(context, {
    centreX: body.x + body.w / 2,
    feetY: body.y + body.h,
    width: body.w,
    height: body.h,
    facing: body.vx < 0 ? -1 : 1,
    pose: body.onLadder ? 'ladder' : body.onGround ? 'ground' : 'air',
    reducedMotion,
  });
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
  const { level, body, camera, activeRoomId, surface, activeInteractableId, npcs, activeNpcId, badges, reducedMotion } = input;
  const labelScale = input.textScale === 'large' ? 1.3 : 1;

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
  if (surface) drawSurface(context, level, surface, activeInteractableId ?? null, view, labelScale);
  drawRooms(context, level, activeRoomId, view);
  drawLadders(context, level, view);
  // Labels come after ladders so rungs never cross the text.
  drawRoomLabels(context, level, badges, view, labelScale);
  if (surface && npcs && npcs.length > 0) {
    drawNpcs(context, npcs, activeNpcId ?? null, view, level.tileSize, labelScale);
  }
  drawPlayer(context, body, reducedMotion);

  context.restore();

  drawVignette(context, view);
}
