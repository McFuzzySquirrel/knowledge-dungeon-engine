import { village, type EngineState, type KnowledgeDungeonEngine } from '@/index';
import { getState, openExampleEngine, setErrorReporter, setNoticeReporter, subscribeState } from './engine';
import { buildDungeonLevel, DEFAULT_TILE_SIZE, type LevelModel } from './level/model';
import {
  buildSurface,
  findNearestInteractable,
  placeDungeonBelow,
  type SurfaceInteractable,
  type SurfaceModel,
} from './level/surfaceLevel';
import { createVisitTracker, playerCentre, roomAtPoint } from './level/visits';
import { bodyDimensions, stepBody, type Body, type MoveIntent } from './physics';
import {
  projectDungeon,
  projectSurface,
  roomBadges,
  type DungeonView,
  type SurfaceView,
} from './projection';
import { createHud } from './render/hud';
import { createCamera, prepareCanvas, renderWorld, updateCamera } from './render/canvas';
import { projectRoute, type Screen } from './routing';
import { createIndexedDbStorage } from './storage';
import { mountNotePanel, type NotePanel } from './ui/notePanel';
import {
  interactionFailedMessage,
  notCollectedMessage,
  notSavedMessage,
  refusalMessage,
  returnFailedMessage,
} from './ui/outcomes';
import { createPrompts } from './ui/prompts';

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const canvas = must<HTMLCanvasElement>('#game');
const overlay = must<HTMLDivElement>('#overlay');
const overlayText = must<HTMLParagraphElement>('#overlay-text');
const startButton = must<HTMLButtonElement>('#start-tutorial');
const clearButton = must<HTMLButtonElement>('#clear-save');
const panelTitle = must<HTMLHeadingElement>('#panel-title');
const promptHost = must<HTMLDivElement>('#prompt');
const notePanelHost = must<HTMLElement>('#note-panel');

const hud = createHud({
  summary: must<HTMLElement>('#summary'),
  rooms: must<HTMLElement>('#rooms'),
  status: must<HTMLElement>('#status'),
  error: must<HTMLElement>('#error'),
});
setErrorReporter((message) => hud.showError(message));
setNoticeReporter((message) => hud.announce(message));

const prompts = createPrompts(promptHost, (message) => hud.announce(message));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const camera = createCamera();
const visits = createVisitTracker();

/** Four tiles of host-authored shaft between the street and the top dungeon room. */
const SHAFT_HEIGHT_TILES = 4;

let engine: KnowledgeDungeonEngine | null = null;
let context: CanvasRenderingContext2D | null = null;
let screen: Screen | null = null;
let surface: SurfaceModel | null = null;
let level: LevelModel | null = null;
let body: Body | null = null;
let view: DungeonView | null = null;
let surfaceView: SurfaceView | null = null;
let badges: Record<string, { cleared: boolean; label: string }> = {};
let activeRoomId: string | null = null;
let activeInteractable: SurfaceInteractable | null = null;
let levelKey = '';
let surfaceKey = '';
let jumpQueued = false;
let interactionPending = false;
let returnPending = false;
let fishingRecoveryPending = false;
const held = new Set<string>();

/** The open composer, or `null`. While open the world is paused and keys are modal. */
let composer: NotePanel | null = null;
let composerPending = false;

function surfaceMap(): village.VillageMapDef {
  // Scale the street to the dungeon's tile size so both share one world grid.
  return { ...village.VILLAGE_MAP, tileSize: DEFAULT_TILE_SIZE };
}

function buildStreet(structures: village.VillageStructure[]): SurfaceModel {
  return buildSurface(structures, surfaceMap());
}

function surfaceAsLevel(model: SurfaceModel): LevelModel {
  return {
    subjectId: 'surface',
    tileSize: model.tileSize,
    bounds: model.bounds,
    spawn: model.spawn,
    solids: model.solids,
    ladders: model.ladders,
    rooms: [],
    surfaceY: model.groundY,
  };
}

function createBodyAt(model: LevelModel, spawn: { x: number; y: number }): Body {
  const { w, h } = bodyDimensions(model.tileSize);
  return {
    x: spawn.x - w / 2,
    y: spawn.y - h,
    w,
    h,
    vx: 0,
    vy: 0,
    onGround: true,
    onLadder: false,
  };
}

function entranceSpawn(model: SurfaceModel): { x: number; y: number } {
  return { x: model.entrance.x + model.tileSize / 2, y: model.groundY };
}

/** Geometry changes only when the subject graph changes; statuses refresh through the view model. */
function structuralKey(state: EngineState, subjectId: string): string {
  const subject = state.subjects[subjectId];
  if (!subject) return '';
  return [
    subjectId,
    subject.dungeon.dungeonId,
    subject.dungeon.rootRoomId,
    JSON.stringify(subject.dungeon.rooms.map((room) => [room.roomId, room.topic])),
    JSON.stringify(subject.dungeon.edges),
  ].join('|');
}

/** Surface geometry key: portal counts and labels do not rebuild collision. */
function surfaceGeometryKey(structures: village.VillageStructure[]): string {
  return JSON.stringify(
    structures.map((structure) => [
      structure.id,
      structure.type,
      structure.gridX,
      structure.gridY,
      structure.width,
      structure.height,
      structure.label,
      structure.subjectId ?? null,
    ]),
  );
}

function showOverlay(text: string, showStart: boolean): void {
  overlayText.textContent = text;
  startButton.hidden = !showStart;
  overlay.hidden = false;
}

function resetDungeonLevel(): void {
  level = null;
  body = null;
  view = null;
  badges = {};
  activeRoomId = null;
  levelKey = '';
  visits.reset();
  prompts.hide();
}

function syncPrompt(): void {
  if (composer) {
    prompts.setRoom(null, true);
    prompts.setTarget(null, true);
    return;
  }
  if (screen === 'surface') {
    prompts.setTarget(
      activeInteractable
        ? { id: activeInteractable.id, action: interactionVerb(activeInteractable.type), label: activeInteractable.label }
        : null,
      interactionPending || returnPending,
    );
    return;
  }
  if (screen === 'dungeon' && level && body) {
    const room = activeRoomId ? view?.rooms.find((entry) => entry.roomId === activeRoomId) : undefined;
    prompts.setRoom(room ? { roomId: room.roomId, topic: room.topic } : null, false);
    return;
  }
  prompts.hide();
}

function interactionVerb(type: string): string {
  switch (type) {
    case 'portal-icon':
      return 'enter';
    case 'training-gate':
      return 'enter';
    case 'fishing-pond':
      return 'fish';
    default:
      return 'visit';
  }
}

function enterSurface(state: EngineState, structures: village.VillageStructure[], previous: Screen | null): void {
  const model = buildStreet(structures);
  surface = model;
  surfaceView = projectSurface(state, structures);
  view = null;
  badges = {};
  activeRoomId = null;
  activeInteractable = null;

  if (previous !== 'surface') {
    resetDungeonLevel();
    // Returning from the dungeon places the player at the entrance; boot uses
    // the engine-authored player start.
    const spawn = previous === 'dungeon' ? entranceSpawn(model) : model.spawn;
    level = surfaceAsLevel(model);
    body = createBodyAt(level, spawn);
    levelKey = 'surface';
    surfaceKey = surfaceGeometryKey(structures);
    visits.reset();
    updateCamera(camera, body, level, 100, true);
    hud.announce(
      previous === 'dungeon'
        ? 'Returned to the village street. The study session is closed.'
        : 'Village street. Walk to a door and press E.',
    );
  } else {
    level = surfaceAsLevel(model);
    const geometry = surfaceGeometryKey(structures);
    if (geometry !== surfaceKey) {
      surfaceKey = geometry;
      if (!body) body = createBodyAt(level, model.spawn);
    }
  }

  screen = 'surface';
  syncPrompt();
  const overlayWasVisible = overlay.hidden === false;
  overlay.hidden = true;
  if (overlayWasVisible) panelTitle.focus({ preventScroll: true });
  hud.updateSurface(surfaceView, null);
}

function enterDungeon(
  state: EngineState,
  subjectId: string,
  structures: village.VillageStructure[],
  previous: Screen | null,
): void {
  const subject = state.subjects[subjectId];
  if (!subject) {
    enterSurface(state, structures, previous);
    return;
  }

  const key = structuralKey(state, subjectId);
  if (previous !== 'dungeon' || key !== levelKey) {
    const base = buildDungeonLevel(subject);
    const street = buildStreet(structures);
    const placed = placeDungeonBelow(base, street, SHAFT_HEIGHT_TILES * base.tileSize);
    surface = street;
    level = placed;
    // Normal portal entry spawns at the dungeon root. `shaftBottomSpawn` keeps a
    // physical descent available for a future host without a second model.
    body = createBodyAt(placed, placed.spawn);
    levelKey = key;
    activeRoomId = null;
    activeInteractable = null;
    visits.reset();
    updateCamera(camera, body, placed, 100, true);
  } else if (!level || !body) {
    // Defensive: a state update without a usable level rebuilds from scratch.
    enterDungeon(state, subjectId, structures, null);
    return;
  }

  screen = 'dungeon';
  surfaceView = projectSurface(state, structures);
  view = projectDungeon(state);
  badges = roomBadges(view);
  syncPrompt();
  const overlayWasVisible = overlay.hidden === false;
  overlay.hidden = true;
  if (overlayWasVisible) panelTitle.focus({ preventScroll: true });
  hud.updateDungeon(view, activeRoomId);
  if (previous !== 'dungeon') {
    hud.announce(`Entered ${subject.dungeon.subjectName}. ${view?.totalRooms ?? 0} rooms.`);
  }
}

function onState(state: EngineState): void {
  const previous = screen;
  const route = projectRoute(state);
  const structures = engine ? engine.villageStructures() : [];

  if (route.notice && route.screen === 'surface') hud.announce(route.notice);

  if (route.screen === 'surface') {
    closeComposer(true);
    enterSurface(state, structures, previous);
    return;
  }

  if (route.screen === 'dungeon' && route.subjectId) {
    enterDungeon(state, route.subjectId, structures, previous);
    return;
  }

  // P4 owns the fishing screen. Until then, recover through the engine command.
  if (route.screen === 'fishing' && engine && !fishingRecoveryPending) {
    fishingRecoveryPending = true;
    closeComposer(true);
    hud.announce(route.notice ?? 'Fishing is not available in this build.');
    void engine
      .returnToVillage()
      .catch((error: unknown) => {
        hud.showError(`Could not leave the fishing session: ${describe(error)}`);
      })
      .finally(() => {
        fishingRecoveryPending = false;
      });
  }
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

const LEFT = new Set(['KeyA', 'ArrowLeft']);
const RIGHT = new Set(['KeyD', 'ArrowRight']);
const UP = new Set(['KeyW', 'ArrowUp']);
const DOWN = new Set(['KeyS', 'ArrowDown']);

function readIntent(): MoveIntent {
  return {
    left: held.has('KeyA') || held.has('ArrowLeft'),
    right: held.has('KeyD') || held.has('ArrowRight'),
    up: held.has('KeyW') || held.has('ArrowUp'),
    down: held.has('KeyS') || held.has('ArrowDown'),
    jump: jumpQueued,
  };
}

function clearInput(): void {
  held.clear();
  jumpQueued = false;
}

function focusCanvas(): void {
  canvas.focus({ preventScroll: true });
}

function closeComposer(force = false): void {
  if (!composer) return;
  if (composerPending && !force) {
    hud.announce('A submission is still pending. Wait for it to finish.');
    return;
  }
  composer.close();
  composer = null;
  composerPending = false;
  syncPrompt();
  if (!force) {
    focusCanvas();
    hud.announce('Composer closed. Nothing new was committed.');
  }
}

function openComposer(roomId: string): void {
  if (!engine || composer || screen !== 'dungeon') return;
  const room = view?.rooms.find((entry) => entry.roomId === roomId);
  if (!room) {
    hud.announce('Move into a room to write a note.');
    return;
  }

  clearInput();
  composer = mountNotePanel(
    notePanelHost,
    { roomId: room.roomId, topic: room.topic },
    {
      async onSubmit(input) {
        if (!engine || composerPending) return;
        composerPending = true;
        composer?.setPending(true);
        hud.clearError();
        try {
          const result = await engine.submitNote(input);
          if (!result.ok) {
            const message = refusalMessage(result.error.code, result.error.message);
            composer?.showError(message);
            hud.announce(`Note refused: ${result.error.message}.`);
            return;
          }
          if (result.value.kind === 'draft') {
            const missing = result.value.validation.missingSections;
            composer?.showDraft(result.value.validation);
            hud.announce(
              missing.length > 0
                ? `Draft saved. Missing sections: ${missing.join(', ')}.`
                : 'Draft saved. Manual confirmation is still required.',
            );
            return;
          }
          composer?.showCleared(result.value);
          hud.announce(
            result.value.progression.awarded
              ? `Room cleared. ${result.value.progression.xpGained} XP gained.`
              : 'Room cleared. This clear was already awarded.',
          );
        } catch (error) {
          const message = notSavedMessage(error);
          composer?.showError(message);
          hud.showError(message);
          hud.announce('The note was not saved.');
        } finally {
          composerPending = false;
          composer?.setPending(false);
        }
      },
      async onCollectArtifact(roomIdToCollect) {
        if (!engine || composerPending) return;
        composerPending = true;
        hud.clearError();
        try {
          const result = await engine.collectArtifact(roomIdToCollect);
          if (!result.ok) {
            const message = refusalMessage(result.error.code, result.error.message);
            composer?.showError(message);
            hud.announce(`Artifact not collected: ${result.error.message}.`);
            return;
          }
          composer?.showStatus('Artifact added to your journal.');
          hud.announce('Artifact added to your journal.');
        } catch (error) {
          const message = notCollectedMessage(error);
          composer?.showError(message);
          hud.showError(message);
          hud.announce('The artifact was not added to your journal.');
        } finally {
          composerPending = false;
        }
      },
      onClose() {
        closeComposer();
      },
    },
  );

  syncPrompt();
  hud.announce(`Note composer open for ${room.topic}.`);
  hud.clearError();
}

async function useInteractable(target: SurfaceInteractable): Promise<void> {
  if (!engine || interactionPending) return;
  interactionPending = true;
  clearInput();
  hud.clearError();
  syncPrompt();
  try {
    const result = await engine.interactVillageStructure(target.id);
    const structure = result.structure;
    if (getState().session.world === 'dungeon') {
      // The state subscription routes and announces the dungeon transition.
      return;
    }
    if (structure.type === 'fishing-pond') {
      hud.announce(`${structure.label} is not available in this build.`);
      return;
    }
    hud.announce(`${structure.label}. Quest step: ${getState().session.questStep}.`);
  } catch (error) {
    const message = interactionFailedMessage(target.label, error);
    hud.showError(message);
    hud.announce(`Could not use ${target.label}. You stayed on the street.`);
  } finally {
    interactionPending = false;
    syncPrompt();
  }
}

function installInput(): void {
  window.addEventListener('keydown', (event) => {
    if (composer) {
      if (event.code === 'Escape') {
        event.preventDefault();
        closeComposer();
      }
      return;
    }

    if (isTypingTarget(event.target)) return;

    if (LEFT.has(event.code) || RIGHT.has(event.code) || UP.has(event.code) || DOWN.has(event.code)) {
      event.preventDefault();
      held.add(event.code);
      return;
    }
    if (event.code === 'Space') {
      event.preventDefault();
      if (!event.repeat) jumpQueued = true;
      return;
    }
    if (event.code === 'KeyE' && !event.repeat) {
      event.preventDefault();
      if (screen === 'surface') {
        if (activeInteractable) void useInteractable(activeInteractable);
        else hud.announce('Move to a door and press E.');
        return;
      }
      if (screen === 'dungeon') {
        if (activeRoomId) openComposer(activeRoomId);
        else hud.announce('Move into a room to write a note.');
      }
    }
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });

  window.addEventListener('blur', clearInput);
}

function updateRoomVisit(): void {
  if (!level || !body || !engine || screen !== 'dungeon') return;

  const centre = playerCentre(body);
  const room = roomAtPoint(level, centre.x, centre.y);
  const roomId = room?.roomId ?? null;
  if (roomId !== activeRoomId) {
    activeRoomId = roomId;
    hud.updateDungeon(view, activeRoomId);
    syncPrompt();
    if (room) {
      const status = view?.rooms.find((entry) => entry.roomId === room.roomId)?.statusLabel ?? room.status;
      hud.announce(`Entered ${room.topic}. ${status}. Press E to write a note.`);
    }
  }

  const toRecord = visits.observe(room);
  if (!toRecord) return;

  const topic = room?.topic ?? toRecord;
  void engine
    .recordRoomVisit(toRecord)
    .then(() => {
      visits.succeed(toRecord);
    })
    .catch((error: unknown) => {
      visits.fail(toRecord);
      const message = `Could not record the visit to ${topic}: ${describe(error)}. The visit was not saved.`;
      hud.showError(message);
      hud.announce(`The visit to ${topic} was not saved.`);
    });
}

function updateInteractable(): void {
  if (!surface || !body || screen !== 'surface') return;
  const nearest = findNearestInteractable(surface, playerCentre(body));
  const nextId = nearest?.id ?? null;
  if (nextId === (activeInteractable?.id ?? null)) return;

  activeInteractable = nearest;
  syncPrompt();
  hud.updateSurface(surfaceView, activeInteractable?.id ?? null);
  if (nearest) {
    hud.announce(`Near ${nearest.label}. Press E to ${interactionVerb(nearest.type)}.`);
  }
}

function atSurfaceExitZone(): boolean {
  if (!surface || !body) return false;
  const feetX = body.x + body.w / 2;
  const feetY = body.y + body.h;
  const zone = surface.exitZone;
  const onGround = Math.abs(feetY - surface.groundY) <= surface.tileSize * 0.4;
  return onGround && feetX >= zone.x && feetX <= zone.x + zone.w;
}

function maybeReturnToVillage(): void {
  if (!engine || screen !== 'dungeon' || returnPending || composer) return;
  if (!atSurfaceExitZone()) return;

  returnPending = true;
  clearInput();
  void engine
    .returnToVillage()
    .then(() => {
      hud.announce('Returned to the village. The study session is closed.');
    })
    .catch((error: unknown) => {
      const message = returnFailedMessage(error);
      hud.showError(message);
      hud.announce('Could not return to the village.');
    })
    .finally(() => {
      returnPending = false;
    });
}

let lastFrameMs = performance.now();
let firstFrame = true;

function frame(nowMs: number): void {
  const deltaMs = firstFrame ? 0 : Math.max(0, Math.min(nowMs - lastFrameMs, 100));
  firstFrame = false;
  lastFrameMs = nowMs;

  const intent = readIntent();
  jumpQueued = false;

  if (level && body && context) {
    // The composer pauses the world: no movement, no visits while a modal is open.
    if (!composer) {
      body = stepBody(body, intent, level, deltaMs);
      if (screen === 'dungeon') {
        updateRoomVisit();
        maybeReturnToVillage();
      } else if (screen === 'surface') {
        updateInteractable();
      }
    }
    updateCamera(camera, body, level, deltaMs, reducedMotion.matches);
    renderWorld(context, {
      level,
      body,
      camera,
      activeRoomId,
      surface,
      activeInteractableId: activeInteractable?.id ?? null,
      badges,
      reducedMotion: reducedMotion.matches,
    });
  }

  requestAnimationFrame(frame);
}

function resizeCanvas(): void {
  context = prepareCanvas(canvas, camera);
  if (!context) {
    hud.showError('Canvas 2D is not available in this browser.');
    return;
  }
  if (level && body) updateCamera(camera, body, level, 100, true);
}

function wireActions(storage: ReturnType<typeof createIndexedDbStorage>): void {
  startButton.addEventListener('click', () => {
    if (!engine) return;
    startButton.disabled = true;
    hud.clearError();
    void engine
      .startTutorial()
      .then(() => hud.announce('Tutorial started. Walk to a room and press E to write a note.'))
      .catch((error: unknown) => {
        hud.showError(`Could not start the tutorial: ${describe(error)}`);
        hud.announce('Tutorial did not start.');
      })
      .finally(() => {
        startButton.disabled = false;
      });
  });

  clearButton.addEventListener('click', () => {
    if (!window.confirm('Delete the saved engine state for this example?')) return;
    clearButton.disabled = true;
    void storage
      .clear()
      .then(() => {
        hud.announce('Saved state cleared. Reloading.');
        window.location.reload();
      })
      .catch((error: unknown) => {
        hud.showError(`Could not clear saved state: ${describe(error)}`);
        clearButton.disabled = false;
      });
  });
}

function boot(): void {
  showOverlay('Loading the engine…', false);
  startButton.disabled = true;
  installInput();
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  requestAnimationFrame(frame);

  const storage = createIndexedDbStorage();
  void openExampleEngine(storage)
    .then((opened) => {
      engine = opened;
      hud.clearError();
      startButton.disabled = false;
      wireActions(storage);
      subscribeState(onState);
      // `onState` runs immediately with the current state and routes the screen.
      if (getState().session.world === 'village') {
        hud.announce('Engine ready. Walk to a door and press E. The Training Grounds leads to the tutorial.');
      }
    })
    .catch((error: unknown) => {
      hud.showError(`Could not open the engine: ${describe(error)}`);
      showOverlay('The engine could not start. Check the error panel.', false);
    });
}

boot();
