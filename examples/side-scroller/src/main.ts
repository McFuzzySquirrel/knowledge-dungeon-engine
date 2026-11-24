import { fishingState, village, type EngineState, type KnowledgeDungeonEngine } from '@/index';
import { getState, openExampleEngine, setErrorReporter, setNoticeReporter, subscribeState, takeBootNotice } from './engine';
import { createFishingBridge, type RecallOutcome } from './fishing/bridge';
import {
  catchKeepSummary,
  fishingCollectionCount,
  fishingEntryRefusal,
  resolveFishingSubject,
} from './fishing/session';
import { fishingControlHint, renderFishingScene } from './fishing/scene';
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
  projectFishing,
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
import {
  mountRecallDialog,
  type RecallDialog,
  type RecallQuestionView,
} from './ui/recallDialog';

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
const fishingPanelHost = must<HTMLElement>('#fishing-panel');
const leaveFishingButton = must<HTMLButtonElement>('#leave-fishing');
const recoveryBanner = must<HTMLDivElement>('#recovery');
const recoveryText = must<HTMLParagraphElement>('#recovery-text');
const recoveryDismiss = must<HTMLButtonElement>('#recovery-dismiss');

const hud = createHud({
  summary: must<HTMLElement>('#summary'),
  rooms: must<HTMLElement>('#rooms'),
  roomsTitle: must<HTMLElement>('#rooms-title'),
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

/** The subject the host last entered; the pond's fallback when the engine has none. */
let lastStudiedSubjectId: string | null = null;
/** The pond the player just left, so the street spawn stays near it. */
let lastPondId: string | null = null;

interface FishingCatchView {
  castNumber: number;
  catalogId: string;
  name: string;
  rarity: string;
  description: string;
}

interface FishingRuntime {
  bridge: ReturnType<typeof createFishingBridge>;
  context: { pondId: string; subjectId: string; subjectName: string; roomId: string | null };
  machine: fishingState.FishingMachineState;
  rng: () => number;
  /** One host clock. The machine derives elapsed time from this. */
  clockMs: number;
  pending: boolean;
  /** Casts already reported to the engine, so no transition dispatches twice. */
  reportedCast: number;
  resolvedCast: number;
  /** A catch whose keep/release dialog is already open. */
  shownCatch: number;
  catch: FishingCatchView | null;
  recall: RecallQuestionView | null;
  dialog: RecallDialog | null;
  lastHudPhase: fishingState.FishingStateName | null;
  /** The in-flight `fishing/bite-resolve` report, if any. */
  biteReport: Promise<void> | null;
}

let fishing: FishingRuntime | null = null;

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

/** Leave the pond where it was, not at the street's start. */
function pondSpawn(model: SurfaceModel, pondId: string | null): { x: number; y: number } {
  const pond = pondId
    ? model.interactables.find((entry) => entry.id === pondId)
    : undefined;
  return pond ? { x: pond.door.x, y: model.groundY } : model.spawn;
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

function showRecovery(message: string): void {
  recoveryText.textContent = message;
  recoveryBanner.hidden = false;
}

function hideRecovery(): void {
  recoveryBanner.hidden = true;
  recoveryText.textContent = '';
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

// ── Fishing (P4) ─────────────────────────────────────────────────────────────

function pondLabelFor(pondId: string): string {
  const structure = engine?.villageStructures().find((entry) => entry.id === pondId);
  return structure?.label ?? 'Fishing Pond';
}

function setCanvasMode(mode: Screen): void {
  const label =
    mode === 'fishing'
      ? 'Fishing pond. Hold Space to charge the cast and release to cast. Press Space at a bite to reel in. Use A and D or the arrow keys to walk the shore. Press Escape to leave the pond. Choose keep or release in the dialog when a fish is caught.'
      : mode === 'dungeon'
        ? 'Side-view dungeon. Move with A and D or the arrow keys, jump with Space, climb with W and S, and press E in a room to write a note.'
        : 'Side-view village street above a dungeon. Move with A and D or the arrow keys, jump with Space, climb with W and S, and press E at a door to enter a portal or visit a building.';
  canvas.setAttribute('aria-label', label);
}

function teardownFishing(): void {
  if (fishing) {
    fishing.dialog?.close();
    fishing = null;
  }
  fishingPanelHost.hidden = true;
  fishingPanelHost.replaceChildren();
  leaveFishingButton.hidden = true;
  leaveFishingButton.disabled = false;
}

function refreshFishingHud(force = false): void {
  if (!fishing) return;
  if (!force && fishing.lastHudPhase === fishing.machine.phase) return;
  fishing.lastHudPhase = fishing.machine.phase;
  hud.updateFishing(
    projectFishing(getState()),
    fishing.machine.phase,
    fishingControlHint(fishing.machine.phase),
  );
  leaveFishingButton.disabled = fishing.pending;
}

interface SessionBeginValue {
  command: 'fishing/session-begin';
  eligible: boolean;
  clearedRoomCount: number;
}

interface BiteOutcomeValue {
  command: 'fishing/bite-resolve';
  resolution: 'hooked' | 'missed';
  catch: {
    recall: { roomId: string; prompt: { text: string } } | null;
  } | null;
}

interface KeepOutcomeValue {
  command: 'fishing/catch-keep';
  outcome: string;
  progression: { awarded: boolean; duplicate: boolean; xpGained: number } | null;
}

function createFishingRuntime(
  context: { pondId: string; subjectId: string; subjectName: string; roomId: string | null },
  state: EngineState,
): FishingRuntime {
  const viewport = {
    width: Math.max(1, camera.w || canvas.clientWidth || 960),
    height: Math.max(1, camera.h || canvas.clientHeight || 540),
  };
  const bridge = createFishingBridge(
    {
      pondId: context.pondId,
      subjectId: context.subjectId,
      subjectName: context.subjectName,
      roomId: context.roomId,
    },
    {
      dispatch: (command) => {
        if (!engine) throw new Error('The engine is not open');
        return engine.dispatchFishing(command);
      },
    },
  );

  return {
    bridge,
    context,
    machine: fishingState.createFishingState({ viewport, nowMs: 0, eligible: true }),
    // One stream per session. Production seeds from the same day/archetype rule
    // the engine scene used; tests inject their own fixed seed.
    rng: fishingState.createFishingSessionRng(
      new Date().toISOString().slice(0, 10),
      state.session.playerClass ?? 'scholar',
    ),
    clockMs: 0,
    pending: false,
    reportedCast: 0,
    resolvedCast: 0,
    shownCatch: 0,
    catch: null,
    recall: null,
    dialog: null,
    lastHudPhase: null,
    biteReport: null,
  };
}

function onFishingPhase(from: fishingState.FishingStateName, to: fishingState.FishingStateName): void {
  if (from === to) return;
  switch (to) {
    case 'casting':
      hud.announce('Cast away.');
      break;
    case 'waiting':
      void reportCastLanded();
      hud.announce('Waiting for a bite.');
      break;
    case 'biting':
      hud.announce('Bite! Press Space to reel in.');
      break;
    case 'reeling':
      void reportBiteResolved('hooked');
      hud.announce('Hooked. Reeling in.');
      break;
    case 'caught':
      hud.announce('Fish caught. Choose keep or release.');
      void presentCatch();
      break;
    case 'missed':
      void reportBiteResolved('missed');
      hud.announce('The fish got away. Press Space to try again.');
      break;
    default:
      break;
  }
}

async function reportCastLanded(): Promise<void> {
  const runtime = fishing;
  if (!runtime) return;
  const { castNumber, candidate, fishDirection } = runtime.machine;
  if (!candidate || runtime.reportedCast >= castNumber) return;
  runtime.reportedCast = castNumber;
  try {
    const outcome = await runtime.bridge.onCastLanded({
      castNumber,
      catalogId: candidate.id,
      direction: fishDirection,
    });
    if (!outcome.ok) {
      hud.showError(`Could not report the cast: ${outcome.error.message}.`);
      hud.announce('The cast was not saved.');
    }
  } catch (error) {
    const message = notSavedMessage(error);
    hud.showError(message);
    hud.announce('The cast was not saved.');
  }
}

async function reportBiteResolved(resolution: 'hooked' | 'missed'): Promise<void> {
  const runtime = fishing;
  if (!runtime) return;
  const { castNumber, candidate } = runtime.machine;
  if (runtime.resolvedCast >= castNumber) return;
  if (resolution === 'hooked' && !candidate) return;
  runtime.resolvedCast = castNumber;

  const reporting = (async () => {
    try {
      const outcome = await runtime.bridge.onBiteResolved({
        castNumber,
        resolution,
        catalogId: resolution === 'hooked' ? candidate!.id : undefined,
      });
      if (!outcome.ok) {
        hud.showError(`Could not report the bite: ${outcome.error.message}.`);
        hud.announce('The bite result was not saved.');
        return;
      }
      if (resolution === 'hooked') {
        const value = outcome.value as BiteOutcomeValue;
        const recall = value.catch?.recall ?? null;
        runtime.recall = recall ? { roomId: recall.roomId, text: recall.prompt.text } : null;
      }
    } catch (error) {
      const message = notSavedMessage(error);
      hud.showError(message);
      hud.announce('The bite result was not saved.');
    }
  })();

  runtime.biteReport = reporting;
  await reporting;
}

function captureCatch(effect: {
  catalogId: string;
  rarity: string;
  castNumber: number;
  description: string;
}): void {
  const runtime = fishing;
  if (!runtime) return;
  const candidate = runtime.machine.candidate;
  runtime.catch = {
    castNumber: effect.castNumber,
    catalogId: effect.catalogId,
    name: candidate?.name ?? effect.catalogId,
    rarity: effect.rarity,
    description: effect.description,
  };
  // The dialog opens after the bite report settles, so it can show the engine's
  // own recall question. `presentCatch` awaits that report.
  void presentCatch();
}

async function presentCatch(): Promise<void> {
  const runtime = fishing;
  if (!runtime) return;
  await runtime.biteReport;
  if (!fishing || fishing !== runtime) return;
  const caught = runtime.catch;
  if (!caught || runtime.dialog || runtime.shownCatch === caught.castNumber) return;
  runtime.shownCatch = caught.castNumber;

  clearInput();
  reduceFishingEvent({ type: 'move', nowMs: runtime.clockMs, intent: 0 });
  const dialog = mountRecallDialog(
    fishingPanelHost,
    {
      fish: { name: caught.name, rarity: caught.rarity, description: caught.description },
      question: runtime.recall,
    },
    {
      onKeep: (recall) => keepCatch(runtime, recall),
      onRelease: () => releaseCatch(runtime),
      onClose: () => {
        runtime.dialog = null;
        runtime.shownCatch = 0;
        fishingPanelHost.hidden = true;
        fishingPanelHost.replaceChildren();
        focusCanvas();
        hud.announce('The fish is still on the line. Press Space to choose again.');
      },
    },
  );
  runtime.dialog = dialog;
  refreshFishingHud(true);
}

function finishCatch(message: string): void {
  const runtime = fishing;
  if (!runtime) return;
  runtime.dialog?.close();
  runtime.dialog = null;
  runtime.catch = null;
  runtime.recall = null;
  runtime.shownCatch = 0;
  reduceFishingEvent({ type: 'reset', nowMs: runtime.clockMs });
  fishingPanelHost.hidden = true;
  fishingPanelHost.replaceChildren();
  focusCanvas();
  hud.clearError();
  hud.announce(message);
  refreshFishingHud(true);
}

async function keepCatch(runtime: FishingRuntime, recall: RecallOutcome): Promise<void> {
  const caught = runtime.catch;
  if (!caught || runtime.pending) return;
  runtime.pending = true;
  runtime.dialog?.setPending(true);
  runtime.dialog?.showStatus('Saving the catch…');
  hud.clearError();
  try {
    const outcome = await runtime.bridge.onKeep({
      castNumber: caught.castNumber,
      catalogId: caught.catalogId,
      recall,
    });
    if (!outcome.ok) {
      const message = refusalMessage(outcome.error.code, outcome.error.message);
      runtime.dialog?.showError(message);
      hud.announce(`Catch refused: ${outcome.error.message}.`);
      return;
    }
    const value = outcome.value as KeepOutcomeValue;
    const progression = value.progression;
    const summary = catchKeepSummary({
      outcome: value.outcome,
      rewarded: progression?.awarded ?? false,
      duplicate: progression?.duplicate ?? false,
      xpGained: progression?.xpGained ?? 0,
    });
    finishCatch(`${summary} Collection: ${fishingCollectionCount(getState(), runtime.context.subjectId)}.`);
  } catch (error) {
    const message = notSavedMessage(error);
    runtime.dialog?.showError(message);
    hud.showError(message);
    hud.announce('The catch was not saved. The fish is still on the line.');
  } finally {
    runtime.pending = false;
    runtime.dialog?.setPending(false);
    leaveFishingButton.disabled = false;
  }
}

async function releaseCatch(runtime: FishingRuntime): Promise<void> {
  const caught = runtime.catch;
  if (!caught || runtime.pending) return;
  runtime.pending = true;
  runtime.dialog?.setPending(true);
  runtime.dialog?.showStatus('Releasing the fish…');
  hud.clearError();
  try {
    const outcome = await runtime.bridge.onRelease({
      castNumber: caught.castNumber,
      catalogId: caught.catalogId,
    });
    if (!outcome.ok) {
      const message = refusalMessage(outcome.error.code, outcome.error.message);
      runtime.dialog?.showError(message);
      hud.announce(`Release refused: ${outcome.error.message}.`);
      return;
    }
    finishCatch('Released. Nothing was added to the collection.');
  } catch (error) {
    const message = notSavedMessage(error);
    runtime.dialog?.showError(message);
    hud.showError(message);
    hud.announce('The release was not saved.');
  } finally {
    runtime.pending = false;
    runtime.dialog?.setPending(false);
    leaveFishingButton.disabled = false;
  }
}

function reduceFishingEvent(event: fishingState.FishingMachineEvent): void {
  if (!fishing) return;
  const before = fishing.machine;
  const result = fishingState.reduceFishing(before, event, fishing.rng);
  if (!result.accepted) {
    if (result.refusal === 'bite-window-closed') {
      hud.announce('The bite window closed. The fish got away.');
    }
    return;
  }
  fishing.machine = result.state;
  for (const effect of result.effects) {
    if (effect.type === 'catch-revealed') captureCatch(effect);
    // Audio hooks are ignored: the example ships no audio (assumption S-04).
  }
  if (result.state.phase !== before.phase) onFishingPhase(before.phase, result.state.phase);
  refreshFishingHud();
}

function enterFishing(state: EngineState): void {
  const context = state.fishingSession;
  if (!context || !engine) {
    // The router already falls back to the surface with a notice; this is the
    // defensive path for a fishing world without a usable session (K-12).
    if (engine && !fishingRecoveryPending) {
      fishingRecoveryPending = true;
      hud.announce('The pond session could not be resumed. Returning to the village street.');
      void engine
        .returnToVillage()
        .catch((error: unknown) => hud.showError(`Could not leave the fishing session: ${describe(error)}`))
        .finally(() => {
          fishingRecoveryPending = false;
        });
    }
    return;
  }

  const previous = screen;
  screen = 'fishing';
  closeComposer(true);
  teardownDungeonAndSurface();

  const sameSession =
    fishing !== null &&
    fishing.context.pondId === context.pondId &&
    fishing.context.subjectId === context.subjectId;

  if (!sameSession) {
    teardownFishing();
    fishing = createFishingRuntime(
      {
        pondId: context.pondId,
        subjectId: context.subjectId,
        subjectName: context.subjectName,
        roomId: context.roomId ?? null,
      },
      state,
    );
  }

  lastStudiedSubjectId = context.subjectId;
  lastPondId = context.pondId;
  prompts.hide();
  hideRecovery();
  setCanvasMode('fishing');
  leaveFishingButton.hidden = false;
  const overlayWasVisible = overlay.hidden === false;
  overlay.hidden = true;
  if (overlayWasVisible) panelTitle.focus({ preventScroll: true });
  if (previous !== 'fishing') {
    hud.announce(
      `Fishing at ${pondLabelFor(context.pondId)} in ${context.subjectName}. Hold Space to charge the cast.`,
    );
  }
  refreshFishingHud(true);
}

function teardownDungeonAndSurface(): void {
  level = null;
  body = null;
  view = null;
  surface = null;
  surfaceView = null;
  badges = {};
  activeRoomId = null;
  activeInteractable = null;
  visits.reset();
}

async function leavePond(): Promise<void> {
  if (!engine || !fishing || fishing.pending) return;
  leaveFishingButton.disabled = true;
  hud.clearError();
  try {
    await engine.returnToVillage();
    hud.announce('Left the pond. The study session is closed.');
  } catch (error) {
    hud.showError(`Could not leave the pond: ${describe(error)}`);
    hud.announce('Could not leave the pond.');
  } finally {
    leaveFishingButton.disabled = false;
  }
}

async function beginFishing(target: SurfaceInteractable): Promise<void> {
  if (!engine) return;
  const state = getState();
  const subject = resolveFishingSubject(state, lastStudiedSubjectId);
  const refusal = fishingEntryRefusal(subject);
  if (refusal !== null || !subject) {
    hud.showError(refusal ?? 'No dungeon subject is in focus.');
    hud.announce(refusal ?? 'No dungeon subject is in focus.');
    return;
  }

  try {
    const result = await engine.dispatchFishing({
      type: 'fishing/session-begin',
      payload: {
        pondId: target.id,
        subjectId: subject.subjectId,
        subjectName: subject.subjectName,
        roomId: null,
      },
    });
    if (!result.ok) {
      const message = refusalMessage(result.error.code, result.error.message);
      hud.showError(message);
      hud.announce(`The pond refused the session: ${result.error.message}.`);
      return;
    }
    const value = result.value as SessionBeginValue;
    if (!value.eligible) {
      const message = `Clear a room before fishing. ${subject.subjectName} has ${value.clearedRoomCount} cleared rooms.`;
      hud.showError(message);
      hud.announce(message);
    }
    // Success routes through the state subscription, which sees world === 'fishing'.
  } catch (error) {
    const message = notSavedMessage(error);
    hud.showError(message);
    hud.announce('The fishing session was not saved.');
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
  teardownFishing();
  setCanvasMode('surface');

  if (previous !== 'surface') {
    resetDungeonLevel();
    // Returning from the dungeon places the player at the entrance; leaving a
    // pond places them beside that pond; boot uses the engine-authored start.
    const spawn =
      previous === 'dungeon'
        ? entranceSpawn(model)
        : previous === 'fishing'
          ? pondSpawn(model, lastPondId)
          : model.spawn;
    level = surfaceAsLevel(model);
    body = createBodyAt(level, spawn);
    levelKey = 'surface';
    surfaceKey = surfaceGeometryKey(structures);
    visits.reset();
    updateCamera(camera, body, level, 100, true);
    hud.announce(
      previous === 'dungeon'
        ? 'Returned to the village street. The study session is closed.'
        : previous === 'fishing'
          ? 'Left the pond. Walk to a door and press E.'
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
  setCanvasMode('surface');
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
  lastStudiedSubjectId = subjectId;
  teardownFishing();
  hideRecovery();
  setCanvasMode('dungeon');
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

  if (route.screen === 'fishing') {
    if (state.fishingSession) {
      enterFishing(state);
      return;
    }
    // A fishing world without a pond session is unrecoverable mid-cast (K-12):
    // close it through the command path and land on the street.
    if (engine && !fishingRecoveryPending) {
      fishingRecoveryPending = true;
      closeComposer(true);
      hud.announce(route.notice ?? 'The pond session could not be resumed. Returning to the village street.');
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
    if (target.type === 'fishing-pond') {
      await beginFishing(target);
      return;
    }
    const result = await engine.interactVillageStructure(target.id);
    const structure = result.structure;
    if (getState().session.world === 'dungeon') {
      // The state subscription routes and announces the dungeon transition.
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

    if (screen === 'fishing' && fishing) {
      handleFishingKeyDown(event);
      return;
    }

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
    if (screen === 'fishing' && fishing) {
      handleFishingKeyUp(event);
      return;
    }
    held.delete(event.code);
  });

  window.addEventListener('blur', () => {
    clearInput();
    if (fishing) reduceFishingEvent({ type: 'move', nowMs: fishing.clockMs, intent: 0 });
  });
}

/** Keys belong to the recall dialog while it is open; only Escape dismisses it. */
function dismissCatchDialog(): void {
  if (!fishing?.dialog) return;
  fishing.dialog.close();
  fishing.dialog = null;
  fishing.shownCatch = 0;
  fishingPanelHost.hidden = true;
  fishingPanelHost.replaceChildren();
  focusCanvas();
  hud.announce('Choices closed. Press Space to open them again.');
}

function handleFishingKeyDown(event: KeyboardEvent): void {
  if (!fishing) return;
  const runtime = fishing;

  if (runtime.dialog) {
    if (event.code === 'Escape') {
      event.preventDefault();
      if (!runtime.pending) dismissCatchDialog();
    }
    return;
  }

  if (event.code === 'Escape') {
    event.preventDefault();
    if (!event.repeat) void leavePond();
    return;
  }

  if (LEFT.has(event.code) || RIGHT.has(event.code)) {
    event.preventDefault();
    reduceFishingEvent({
      type: 'move',
      nowMs: runtime.clockMs,
      intent: LEFT.has(event.code) ? -1 : 1,
    });
    return;
  }

  if (event.code === 'Space' || event.code === 'Enter') {
    event.preventDefault();
    if (event.repeat) return;
    switch (runtime.machine.phase) {
      case 'idle':
        reduceFishingEvent({ type: 'begin-power', nowMs: runtime.clockMs });
        break;
      case 'biting':
        reduceFishingEvent({ type: 'hook', nowMs: runtime.clockMs });
        break;
      case 'caught':
        void presentCatch();
        break;
      case 'missed':
        reduceFishingEvent({ type: 'reset', nowMs: runtime.clockMs });
        break;
      default:
        // `powering` casts on release; casting/waiting/reeling ignore presses.
        break;
    }
  }
}

function handleFishingKeyUp(event: KeyboardEvent): void {
  if (!fishing) return;
  if (event.code === 'Space') {
    event.preventDefault();
    if (fishing.machine.phase === 'powering') {
      reduceFishingEvent({ type: 'release', nowMs: fishing.clockMs });
    }
    return;
  }
  if (LEFT.has(event.code) || RIGHT.has(event.code)) {
    reduceFishingEvent({ type: 'move', nowMs: fishing.clockMs, intent: 0 });
  }
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
  const previous = activeInteractable;
  if (nextId === (previous?.id ?? null)) return;

  activeInteractable = nearest;
  syncPrompt();
  hud.updateSurface(surfaceView, activeInteractable?.id ?? null);
  if (nearest) {
    hud.announce(`Near ${nearest.label}. Press E to ${interactionVerb(nearest.type)}.`);
  } else if (previous) {
    hud.announce('No door in reach.');
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

  if (screen === 'fishing' && fishing && context) {
    fishing.clockMs += deltaMs;
    reduceFishingEvent({ type: 'tick', nowMs: fishing.clockMs });
    renderFishingScene(context, {
      state: fishing.machine,
      reducedMotion: reducedMotion.matches,
    });
    requestAnimationFrame(frame);
    return;
  }

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
  if (screen === 'fishing' && fishing) {
    reduceFishingEvent({
      type: 'resize',
      nowMs: fishing.clockMs,
      viewport: { width: camera.w, height: camera.h },
    });
    return;
  }
  if (level && body) updateCamera(camera, body, level, 100, true);
}

function wireActions(storage: ReturnType<typeof createIndexedDbStorage>): void {
  recoveryDismiss.addEventListener('click', () => {
    hideRecovery();
    focusCanvas();
    hud.announce('Recovery notice dismissed.');
  });

  leaveFishingButton.addEventListener('click', () => {
    void leavePond();
  });

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
      const bootState = getState();
      if (bootState.activeSubjectId) lastStudiedSubjectId = bootState.activeSubjectId;
      subscribeState(onState);
      // `onState` runs immediately with the current state and routes the screen.
      const bootNotice = takeBootNotice();
      if (bootNotice) {
        showRecovery(bootNotice);
        hud.announce(bootNotice);
      } else if (getState().session.world === 'village') {
        hud.announce('Engine ready. Walk to a door and press E. The Training Grounds leads to the tutorial.');
      }
    })
    .catch((error: unknown) => {
      hud.showError(`Could not open the engine: ${describe(error)}`);
      showOverlay('The engine could not start. Check the error panel.', false);
    });
}

boot();
