import type { LevelModel, Rect } from './level/model';

/**
 * Host-owned platformer physics.
 *
 * Local-only: `stepBody` never touches engine state. The frame loop passes
 * elapsed milliseconds; the function subdivides internally so a slow frame
 * cannot move a body through a wall.
 *
 * Movement model (P1-T3 choice): constant horizontal speed while a direction
 * is held, no acceleration or friction. Jump height is two tiles, which is the
 * exact height of a room doorway above the room floor, so every horizontal
 * corridor is reachable without a special case.
 */

export interface Body {
  /** Top-left corner in world pixels. */
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  onGround: boolean;
  onLadder: boolean;
}

export interface MoveIntent {
  left: boolean;
  right: boolean;
  up: boolean;
  down: boolean;
  jump: boolean;
}

const SUBSTEP_MS = 1000 / 120;
const MAX_SUBSTEPS = 5;

const WALK_TILES_PER_SECOND = 3.6;
const GRAVITY_TILES_PER_SECOND2 = 30;
const TERMINAL_TILES_PER_SECOND = 18;
const LADDER_TILES_PER_SECOND = 5;
const JUMP_HEIGHT_TILES = 2;

const BODY_WIDTH_TILES = 0.45;
const BODY_HEIGHT_TILES = 0.7;

export function bodyDimensions(tileSize: number): { w: number; h: number } {
  return { w: tileSize * BODY_WIDTH_TILES, h: tileSize * BODY_HEIGHT_TILES };
}

export function bodyRect(body: Pick<Body, 'x' | 'y' | 'w' | 'h'>): Rect {
  return { x: body.x, y: body.y, w: body.w, h: body.h };
}

export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function rectAt(x: number, y: number, body: Body): Rect {
  return { x, y, w: body.w, h: body.h };
}

function horizontalMove(body: Body, dx: number, solids: readonly Rect[]): { x: number; blocked: boolean } {
  let x = body.x + dx;
  let blocked = false;
  for (const solid of solids) {
    if (!overlaps(rectAt(x, body.y, body), solid)) continue;
    x = dx > 0 ? Math.min(x, solid.x - body.w) : Math.max(x, solid.x + solid.w);
    blocked = true;
  }
  return { x, blocked };
}

function verticalMove(
  body: Body,
  dy: number,
  solids: readonly Rect[],
): { y: number; blocked: boolean; grounded: boolean } {
  let y = body.y + dy;
  let blocked = false;
  let grounded = false;
  for (const solid of solids) {
    if (!overlaps(rectAt(body.x, y, body), solid)) continue;
    if (dy > 0) {
      y = Math.min(y, solid.y - body.h);
      grounded = true;
    } else {
      y = Math.max(y, solid.y + solid.h);
    }
    blocked = true;
  }
  return { y, blocked, grounded };
}

function substep(body: Body, intent: MoveIntent, level: LevelModel, dt: number): Body {
  const tile = level.tileSize;
  const walkSpeed = WALK_TILES_PER_SECOND * tile;
  const gravity = GRAVITY_TILES_PER_SECOND2 * tile;
  const terminal = TERMINAL_TILES_PER_SECOND * tile;
  const ladderSpeed = LADDER_TILES_PER_SECOND * tile;
  const jumpSpeed = Math.sqrt(2 * gravity * JUMP_HEIGHT_TILES * tile);

  const next: Body = { ...body };
  const onLadderRect = level.ladders.some((ladder) => overlaps(rectAt(next.x, next.y, next), ladder));

  if (!onLadderRect) {
    next.onLadder = false;
  } else if (intent.up || intent.down) {
    next.onLadder = true;
  }

  next.vx = 0;
  if (intent.left) next.vx -= walkSpeed;
  if (intent.right) next.vx += walkSpeed;

  if (next.onLadder) {
    if (intent.jump) {
      next.onLadder = false;
      next.vy = -jumpSpeed;
      next.onGround = false;
    } else {
      next.vy = intent.up ? -ladderSpeed : intent.down ? ladderSpeed : 0;
      next.onGround = false;
    }
  } else {
    next.vy = Math.min(next.vy + gravity * dt, terminal);
    if (intent.jump && next.onGround) {
      next.vy = -jumpSpeed;
      next.onGround = false;
    }
  }

  const horizontal = horizontalMove(next, next.vx * dt, level.solids);
  next.x = horizontal.x;
  if (horizontal.blocked) next.vx = 0;

  next.onGround = false;
  const vertical = verticalMove(next, next.vy * dt, level.solids);
  next.y = vertical.y;
  if (vertical.blocked) {
    if (vertical.grounded) next.onGround = true;
    next.vy = 0;
  }

  return next;
}

/**
 * Advance one body by `deltaMs` of real time.
 *
 * The delta is clamped to the five-substep budget (≈41.7 ms). At 60 fps this
 * covers a full frame; under heavy throttling the simulation slows down rather
 * than tunnelling through a floor.
 */
export function stepBody(body: Body, intent: MoveIntent, level: LevelModel, deltaMs: number): Body {
  if (!Number.isFinite(deltaMs) || deltaMs <= 0) return body;

  const total = Math.min(deltaMs, MAX_SUBSTEPS * SUBSTEP_MS);
  const count = Math.max(1, Math.ceil(total / SUBSTEP_MS - 1e-9));
  const dt = total / count / 1000;

  let next = body;
  for (let index = 0; index < count; index += 1) {
    next = substep(next, intent, level, dt);
  }
  return next;
}

/** Create a body standing on `level.spawn` with its feet at the spawn point. */
export function createPlayerBody(level: LevelModel): Body {
  const { w, h } = bodyDimensions(level.tileSize);
  return {
    x: level.spawn.x - w / 2,
    y: level.spawn.y - h,
    w,
    h,
    vx: 0,
    vy: 0,
    onGround: true,
    onLadder: false,
  };
}
