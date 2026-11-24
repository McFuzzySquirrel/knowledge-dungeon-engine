import { fishingState, village, villageInteractions, type EngineState, type KnowledgeDungeonEngine } from '@/index';
import type {
  ReviewPassCompleteOutcome,
  ReviewSessionDiscardOutcome,
  ReviewSessionResumeOutcome,
  ReviewSessionSaveOutcome,
} from '@/application/reviewCommands';
import { getState, openExampleEngine, setErrorReporter, setNoticeReporter, subscribeState, takeBootNotice } from './engine';
import { projectCreator } from './creator/projection';
import { DEMO_SEED_FLAG_KEY, DEMO_SUBJECT_SEEDS, browserSeedFlagStore, seedDemoSubjectsOnFirstRun } from './creator/seeds';
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
import {
  discardLines,
  noReviewSubjectMessage,
  passResultLines,
  reviewNotSavedMessage,
  reviewRefusalMessage,
  roomNotClearedMessage,
  saveLaterLines,
} from './review/copy';
import {
  lastStudiedSubjectId as mostRecentStudiedSubject,
  projectReview,
  projectReviewGate,
  projectReviewRoom,
} from './review/projection';
import {
  loadSettings,
  resetSettings,
  saveSettings,
  applySettings,
  effectiveReducedMotion,
  type HostSettings,
} from './settings';
import { projectAssistance, projectJournal, type JournalView } from './journal/projection';
import { mountJournalPanel, type JournalPanel } from './ui/journalPanel';
import { mountHelpPanel, type HelpPanel } from './ui/helpPanel';
import { createHud } from './render/hud';
import { createCamera, prepareCanvas, renderWorld, updateCamera } from './render/canvas';
import { projectRoute, type Screen } from './routing';
import { createIndexedDbStorage } from './storage';
import { mountNotePanel, type NotePanel } from './ui/notePanel';
import {
  interactionFailedMessage,
  notCollectedMessage,
  notSavedMessage,
  nothingInReachMessage,
  refusalMessage,
  returnFailedMessage,
  sceneryMessage,
} from './ui/outcomes';
import { createPrompts } from './ui/prompts';
import { mountRecallDialog, type RecallDialog, type RecallQuestionView } from './ui/recallDialog';
import { mountReviewPanel, type ReviewPanel } from './ui/reviewPanel';
import {
  mountCreatorPanel,
  type CreatorCreateInput,
  type CreatorPanel,
} from './ui/creatorPanel';
import { mountServicePanel, type ServicePanel } from './ui/servicePanel';
import { mountNpcDialog, type NpcDialog } from './ui/npcDialog';
import { renderLibrary } from './ui/libraryPanel';
import { renderGuild } from './ui/guildPanel';
import { renderTrophy } from './ui/trophyPanel';
import { renderWorkshop } from './ui/workshopPanel';
import { renderFishStand } from './ui/fishStandPanel';
import {
  equipmentSubjectId,
  projectFishStand,
  projectGuild,
  projectLibrary,
  projectServiceShell,
  projectTrophy,
  projectWorkshop,
  serviceForStructure,
  type VillageServiceId,
} from './village/projection';
import {
  npcQuoteIndex,
  placeSurfaceNpcs,
  projectNpcLine,
  selectNearbySurfaceTargets,
  type SurfaceNpc,
} from './village/npc';

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
const reviewPanelHost = must<HTMLElement>('#review-panel');
const creatorPanelHost = must<HTMLElement>('#creator-panel');
const servicePanelHost = must<HTMLElement>('#service-panel');
const journalPanelHost = must<HTMLElement>('#journal-panel');
const helpPanelHost = must<HTMLElement>('#help-panel');
const openHelpButton = must<HTMLButtonElement>('#open-help');
const npcDialogHost = must<HTMLElement>('#npc-dialogue');
const leaveFishingButton = must<HTMLButtonElement>('#leave-fishing');
const recoveryBanner = must<HTMLDivElement>('#recovery');
const recoveryText = must<HTMLParagraphElement>('#recovery-text');
const recoveryDismiss = must<HTMLButtonElement>('#recovery-dismiss');
const toastHost = must<HTMLDivElement>('#toast');

const hud = createHud({
  summary: must<HTMLElement>('#summary'),
  rooms: must<HTMLElement>('#rooms'),
  roomsTitle: must<HTMLElement>('#rooms-title'),
  status: must<HTMLElement>('#status'),
  error: must<HTMLElement>('#error'),
});
setErrorReporter((message) => {
  hud.showError(message);
  showToast(message, 'error');
});
setNoticeReporter((message) => hud.announce(message));

const prompts = createPrompts(promptHost, (message) => hud.announce(message));

/** P8: host-local preferences, never part of `EngineState`. */
let hostSettings: HostSettings = loadSettings();
applySettings(hostSettings);

const systemReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
systemReducedMotion.addEventListener?.('change', () => applySettings(hostSettings));

/** One answer for every consumer: `system` follows the OS, `on` forces it. */
function reducedMotionActive(): boolean {
  return effectiveReducedMotion(hostSettings, systemReducedMotion.matches);
}

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

/** The open review panel (P5), or `null`. It also pauses the world. */
let reviewPanel: ReviewPanel | null = null;
let reviewPending = false;
/** True when the surface shortcut activated the subject and must close it after. */
let reviewActivatedSubject = false;
let reviewEntryPending = false;

/** The open Creator panel (P6), or `null`. It also pauses the world. */
let creatorPanel: CreatorPanel | null = null;
/** The subject the Creator editor projects; `null` shows only the subject list. */
let creatorSubjectId: string | null = null;
/** True when the Creator activated the subject and closing must end its session. */
let creatorActivatedSubject = false;
let creatorPending = false;

/** The open village service (P7), or `null`. Every service pauses the world. */
let servicePanel: ServicePanel | null = null;
let serviceId: VillageServiceId | null = null;
let servicePending = false;
/** True when opening the Workshop activated a subject and closing must end it. */
let serviceActivatedSubject = false;
let libraryReviewPending = false;

/** The open journal (P8), or `null`. It pauses the world like every other modal. */
let journalPanel: JournalPanel | null = null;
let journalPending = false;
let journalSelectedSubjectId: string | null = null;

/** The open controls help (post-P8), or `null`. It pauses the world too. */
let helpPanel: HelpPanel | null = null;

/** P7: NPC figures on the street and host-local conversation state. */
let surfaceNpcs: SurfaceNpc[] = [];
let activeNpc: SurfaceNpc | null = null;
let npcDialog: NpcDialog | null = null;
const npcCursors = new Map<string, villageInteractions.VillageNpcLineCursor>();
let lastQuestStep: string | null = null;

/** One host clock read per projection. The panel does not tick. */
function reviewNow(): string {
  return new Date().toISOString();
}

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

let toastTimer: number | null = null;

/**
 * Show an interaction outcome over the canvas.
 *
 * The side panel holds the same text, but on narrow windows it sits below the
 * canvas, so a refusal that only went there looked like no response at all.
 */
function showToast(message: string, tone: 'info' | 'error' = 'info'): void {
  toastHost.textContent = message;
  toastHost.className = tone === 'error' ? 'error' : '';
  toastHost.hidden = false;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastHost.hidden = true;
    toastHost.textContent = '';
    toastTimer = null;
  }, 6000);
}

function hideToast(): void {
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = null;
  toastHost.hidden = true;
  toastHost.textContent = '';
}

function resetDungeonLevel(): void {
  dropReviewPanel();
  dropServicePanel();
  closeNpcDialog(false);
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
  openHelpButton.disabled = Boolean(
    composer || reviewPanel || creatorPanel || servicePanel || journalPanel || helpPanel,
  );
  if (composer || reviewPanel || creatorPanel || servicePanel || journalPanel || helpPanel) {
    prompts.setRoom(null, true);
    prompts.setTarget(null, true);
    return;
  }
  if (screen === 'surface') {
    const target = activeInteractable
      ? {
          id: activeInteractable.id,
          action: interactionVerb(activeInteractable.type),
          label: activeInteractable.label,
        }
      : activeNpc
        ? { id: activeNpc.id, action: 'talk', label: activeNpc.label }
        : null;
    prompts.setTarget(target, interactionPending || returnPending);
    return;
  }
  if (screen === 'dungeon' && level && body) {
    const room = activeRoomId ? view?.rooms.find((entry) => entry.roomId === activeRoomId) : undefined;
    prompts.setRoom(
      room ? { roomId: room.roomId, topic: room.topic, review: room.reviewable } : null,
      false,
    );
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
    case 'library':
      return 'review';
    case 'workshop':
      return 'equip';
    default:
      return 'inspect';
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
      ? 'Fishing pond. Hold Space to charge the cast and release to cast. Press Space at a bite to reel in. Use A and D or the arrow keys to walk the shore. Press Escape to leave the pond. Choose keep or release in the dialog when a fish is caught. Press J to open the journal.'
      : mode === 'dungeon'
        ? 'Side-view dungeon. Move with A and D or the arrow keys, jump with Space, climb with W and S, press E in a room to write a note, press R in a cleared room to review it, and press J to open the journal.'
        : 'Side-view village street above a dungeon. Move with A and D or the arrow keys, jump with Space, climb with W and S, press E at a door to enter a portal or open a village service, press E beside a person to talk, press C to open the Creator, press R to review the last-studied dungeon, and press J to open the journal.';
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
  dropServicePanel();
  closeNpcDialog(false);
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
  hideToast();
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
  dropReviewPanel();
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
    const message = refusal ?? 'No dungeon subject is in focus.';
    hud.showError(message);
    showToast(message, 'error');
    hud.announce(message);
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
      showToast(message, 'error');
      hud.announce(`The pond refused the session: ${result.error.message}.`);
      return;
    }
    const value = result.value as SessionBeginValue;
    if (!value.eligible) {
      const message = `Clear a room before fishing. ${subject.subjectName} has ${value.clearedRoomCount} cleared rooms.`;
      hud.showError(message);
      showToast(message, 'error');
      hud.announce(message);
    }
    // Success routes through the state subscription, which sees world === 'fishing'.
  } catch (error) {
    const message = notSavedMessage(error);
    hud.showError(message);
    showToast(message, 'error');
    hud.announce('The fishing session was not saved.');
  }
}

function enterSurface(state: EngineState, structures: village.VillageStructure[], previous: Screen | null): void {
  const model = buildStreet(structures);
  surface = model;
  surfaceNpcs = placeSurfaceNpcs(surfaceMap().npcs, model);
  const keptNpcId = activeNpc?.id ?? null;
  if (keptNpcId !== null) {
    activeNpc = surfaceNpcs.find((npc) => npc.id === keptNpcId) ?? null;
  }
  surfaceView = projectSurface(state, structures);
  view = null;
  badges = {};
  activeRoomId = null;
  activeInteractable = null;
  teardownFishing();
  setCanvasMode('surface');

  if (previous !== 'surface') {
    resetDungeonLevel();
    closeNpcDialog(false);
    activeNpc = null;
    npcCursors.clear();
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
  hud.updateSurface(surfaceView, null, activeNpc ? activeNpc.label : null);
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
  dropServicePanel();
  closeNpcDialog(false);
  teardownFishing();
  hideRecovery();
  hideToast();
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
  refreshCreator();
  refreshService();
  refreshJournal();

  // A quest step change invalidates every NPC cursor: its index belonged to a
  // script that is no longer on screen (the engine applies the same rule).
  if (lastQuestStep !== null && state.session.questStep !== lastQuestStep) {
    npcCursors.clear();
    closeNpcDialog(false);
  }
  lastQuestStep = state.session.questStep;

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

// ── Archaeologist review (P5) ────────────────────────────────────────────────

/** Detach the panel without dispatching or returning to the village. */
function dropReviewPanel(): void {
  if (!reviewPanel) return;
  reviewPanel.close();
  reviewPanel = null;
  reviewActivatedSubject = false;
  reviewPending = false;
}

/**
 * Close the panel through the learner's action.
 *
 * A review opened from the street activated a subject so `dispatchReview` had
 * one; closing it always returns to the village so no study session is left
 * open (K-15).
 */
function closeReviewPanel(): void {
  if (!reviewPanel) return;
  if (reviewPending) {
    hud.announce('A review command is still pending. Wait for it to finish.');
    return;
  }
  const deactivate = reviewActivatedSubject;
  dropReviewPanel();
  syncPrompt();
  focusCanvas();
  if (deactivate && engine) {
    void engine
      .returnToVillage()
      .then(() => hud.announce('Review closed. Returned to the village street.'))
      .catch((error: unknown) => {
        hud.showError(`Could not close the review study session: ${describe(error)}`);
        hud.announce('Could not close the review study session.');
      });
    return;
  }
  hud.announce('Review closed. Nothing new was committed.');
}

async function completeReview(roomId: string, rating: number): Promise<void> {
  if (!engine || reviewPending) return;
  const panel = reviewPanel;
  reviewPending = true;
  panel?.setPending(true);
  hud.clearError();
  try {
    const result = await engine.dispatchReview({
      type: 'review/pass-complete',
      payload: { roomId, qualityRating: rating as 0 | 1 | 2 | 3 | 4 | 5 },
    });
    if (!result.ok) {
      const message = reviewRefusalMessage(result.error.code, result.error.message);
      panel?.showError(message);
      hud.announce(`Review refused: ${result.error.message}.`);
      return;
    }
    const outcome = result.value as ReviewPassCompleteOutcome;
    const lines = passResultLines(outcome);
    const after = projectReviewRoom(getState(), roomId, reviewNow());
    if (after) lines.push(`Next review: ${after.dueLabel}.`);
    panel?.showResult(lines.join('\n'));
    panel?.markCompleted();
    hud.announce(
      outcome.progression.duplicate
        ? 'Review recorded. This pass was already awarded.'
        : outcome.progression.awarded
          ? `Review recorded. ${outcome.progression.xpGained} XP gained.`
          : 'Review recorded without a reward.',
    );
  } catch (error) {
    const message = reviewNotSavedMessage(error);
    panel?.showError(message);
    hud.showError(message);
    hud.announce('The review was not saved. The panel is still open.');
  } finally {
    reviewPending = false;
    panel?.setPending(false);
  }
}

async function saveReviewForLater(roomId: string, rating: number | null): Promise<void> {
  if (!engine || reviewPending) return;
  const panel = reviewPanel;
  reviewPending = true;
  panel?.setPending(true);
  hud.clearError();
  try {
    const result = await engine.dispatchReview({
      type: 'review/session-save',
      payload: { roomId, qualityRating: rating as 0 | 1 | 2 | 3 | 4 | 5 | null },
    });
    if (!result.ok) {
      const message = reviewRefusalMessage(result.error.code, result.error.message);
      panel?.showError(message);
      hud.announce(`Save for later refused: ${result.error.message}.`);
      return;
    }
    panel?.showResult(saveLaterLines(result.value as ReviewSessionSaveOutcome).join('\n'));
    hud.announce('Review saved for later.');
  } catch (error) {
    const message = reviewNotSavedMessage(error);
    panel?.showError(message);
    hud.showError(message);
    hud.announce('The review was not saved for later. The panel is still open.');
  } finally {
    reviewPending = false;
    panel?.setPending(false);
  }
}

async function discardReview(roomId: string): Promise<void> {
  if (!engine || reviewPending) return;
  const panel = reviewPanel;
  reviewPending = true;
  panel?.setPending(true);
  hud.clearError();
  try {
    const result = await engine.dispatchReview({
      type: 'review/session-discard',
      payload: { roomId },
    });
    if (!result.ok) {
      const message = reviewRefusalMessage(result.error.code, result.error.message);
      panel?.showError(message);
      hud.announce(`Discard refused: ${result.error.message}.`);
      return;
    }
    const outcome = result.value as ReviewSessionDiscardOutcome;
    panel?.showResult(discardLines(outcome).join('\n'));
    hud.announce(outcome.discarded ? 'Saved review discarded.' : 'No saved review was held.');
  } catch (error) {
    const message = reviewNotSavedMessage(error);
    panel?.showError(message);
    hud.showError(message);
    hud.announce('The saved review was not discarded. The panel is still open.');
  } finally {
    reviewPending = false;
    panel?.setPending(false);
  }
}

/**
 * Open the panel for one room.
 *
 * `activatedHere` records that the surface shortcut activated the subject purely
 * so the engine had an active one; closing then returns to the village.
 */
async function openReview(roomId: string, activatedHere: boolean): Promise<boolean> {
  if (!engine || reviewPanel) return false;
  if (composer) {
    hud.announce('Close the note composer before reviewing a room.');
    return false;
  }
  if (fishing?.dialog) {
    hud.announce('Finish the fish choice before reviewing a room.');
    return false;
  }

  const state = getState();
  const now = reviewNow();
  const dungeonView = projectDungeon(state, now);
  const room = dungeonView?.rooms.find((entry) => entry.roomId === roomId);
  if (!dungeonView || !room) {
    hud.announce('Move into a room to review it.');
    return false;
  }
  if (!room.reviewable) {
    const message = roomNotClearedMessage();
    hud.showError(message);
    showToast(message, 'error');
    hud.announce(message);
    return false;
  }

  const gate = projectReviewGate(state);
  if (gate && !gate.allowed) {
    hud.showError(gate.message);
    showToast(gate.message, 'error');
    hud.announce(gate.message);
    return false;
  }

  // `review/session-resume` is read-only and safe on boot: it writes nothing and
  // reports the marker the engine holds. A failure only means "start fresh".
  let resumed: ReviewSessionResumeOutcome['session'] = null;
  try {
    const result = await engine.dispatchReview({
      type: 'review/session-resume',
      payload: { roomId },
    });
    if (result.ok) resumed = (result.value as ReviewSessionResumeOutcome).session;
  } catch {
    resumed = null;
  }

  const roomView = projectReviewRoom(getState(), roomId, reviewNow());
  if (!roomView) {
    hud.announce('That room cannot be reviewed right now.');
    return false;
  }

  clearInput();
  reviewActivatedSubject = activatedHere;
  reviewPanel = mountReviewPanel(
    reviewPanelHost,
    {
      room: { roomId, topic: roomView.topic },
      prompt: roomView.prompt,
      passNumber: resumed?.passNumber ?? roomView.passNumber,
      existingRating: resumed?.qualityRating ?? roomView.existingRating,
    },
    {
      onPassComplete: (rating) => completeReview(roomId, rating),
      onSaveForLater: (rating) => saveReviewForLater(roomId, rating),
      onDiscard: () => discardReview(roomId),
      onClose: () => closeReviewPanel(),
    },
  );
  syncPrompt();
  hud.clearError();
  hud.announce(
    resumed
      ? `Saved review resumed for pass ${resumed.passNumber}. Rate your recall from 0 to 5.`
      : 'Review open. Rate your recall from 0 to 5, then press Enter.',
  );
  return true;
}

/**
 * `R` on the street: open the most urgent room in the last-studied subject's
 * queue, activating the subject only for the duration of the review.
 */
async function openReviewFromSurface(): Promise<void> {
  if (!engine || reviewPanel || reviewEntryPending || interactionPending || returnPending) return;
  const state = getState();
  const subjectId = mostRecentStudiedSubject(state) ?? lastStudiedSubjectId;
  if (!subjectId || !state.subjects[subjectId]) {
    const message = noReviewSubjectMessage();
    hud.showError(message);
    showToast(message, 'error');
    hud.announce(message);
    return;
  }

  reviewEntryPending = true;
  const alreadyActive = state.activeSubjectId === subjectId;
  try {
    if (!alreadyActive) await engine.activateSubject(subjectId);
    const fresh = getState();
    const subjectName = fresh.subjects[subjectId]?.dungeon.subjectName ?? 'that subject';

    const gate = projectReviewGate(fresh);
    if (gate && !gate.allowed) {
      hud.showError(gate.message);
      showToast(gate.message, 'error');
      hud.announce(gate.message);
      if (!alreadyActive) await engine.returnToVillage();
      return;
    }

    const queue = projectReview(fresh, reviewNow());
    if (!queue || queue.candidates.length === 0) {
      const message = `No cleared rooms to review in ${subjectName}.`;
      hud.showError(message);
      showToast(message, 'error');
      hud.announce(message);
      if (!alreadyActive) await engine.returnToVillage();
      return;
    }

    lastStudiedSubjectId = subjectId;
    const opened = await openReview(queue.candidates[0].roomId, !alreadyActive);
    if (!opened && !alreadyActive) await engine.returnToVillage();
  } catch (error) {
    const message = `Could not open the review queue: ${describe(error)}`;
    hud.showError(message);
    hud.announce('The review queue could not be opened.');
    if (!alreadyActive && getState().activeSubjectId === subjectId) {
      await engine.returnToVillage().catch(() => undefined);
    }
  } finally {
    reviewEntryPending = false;
  }
}

// ── Creator (P6) ─────────────────────────────────────────────────────────────

/** Re-project the panel from committed state; the panel never mutates its copy. */
function refreshCreator(): void {
  if (!creatorPanel) return;
  creatorPanel.update(projectCreator(getState(), creatorSubjectId));
}

/** Detach the panel without dispatching or returning to the village. */
function dropCreatorPanel(): void {
  if (!creatorPanel) return;
  creatorPanel.close();
  creatorPanel = null;
  creatorSubjectId = null;
  creatorActivatedSubject = false;
  creatorPending = false;
}

/**
 * Close the panel through the learner's action.
 *
 * Editing activates a subject so `dispatchGraph` has one; closing a Creator that
 * activated it returns to the village, which ends that study session (K-15).
 */
function closeCreatorPanel(): void {
  if (!creatorPanel) return;
  if (creatorPending) {
    hud.announce('A Creator command is still pending. Wait for it to finish.');
    return;
  }
  const deactivate = creatorActivatedSubject;
  dropCreatorPanel();
  syncPrompt();
  focusCanvas();
  if (deactivate && engine && getState().session.world === 'village') {
    void engine
      .returnToVillage()
      .then(() => hud.announce('Creator closed. The study session is closed; you are on the street.'))
      .catch((error: unknown) => {
        const message = `Could not close the Creator study session: ${describe(error)}`;
        hud.showError(message);
        hud.announce('Could not close the Creator study session.');
      });
    return;
  }
  hud.announce('Creator closed. Nothing new was committed.');
}

function showCreatorFailure(error: unknown): void {
  const message = notSavedMessage(error);
  creatorPanel?.showError(message);
  hud.showError(message);
  hud.announce('The Creator change was not saved.');
}

function showCreatorRefusal(code: string, message: string): void {
  creatorPanel?.showError(refusalMessage(code, message));
  hud.announce(`Creator refused: ${message}.`);
}

/**
 * `dispatchGraph` writes to the engine's active subject. The panel projects one
 * subject; if they ever differ, refuse instead of editing the wrong graph (K-16).
 */
function creatorActiveSubjectMatches(): boolean {
  if (creatorSubjectId !== null && getState().activeSubjectId === creatorSubjectId) return true;
  creatorPanel?.showError('Refused: the active subject changed. Select the subject again.');
  hud.announce('Creator refused: select the subject again.');
  return false;
}

function openCreator(): void {
  if (!engine || creatorPanel) return;
  clearInput();
  hud.clearError();
  creatorSubjectId = null;
  creatorActivatedSubject = false;
  creatorPanel = mountCreatorPanel(creatorPanelHost, projectCreator(getState(), null), {
    onCreate: createCreatorSubject,
    onSelect: selectCreatorSubject,
    onEnter: enterCreatorSubject,
    onAddChildren: addCreatorChildren,
    onReparent: reparentCreatorRoom,
    onRemove: removeCreatorRoom,
    onSetTags: setCreatorTags,
    onAddCrossLink: linkCreatorRooms,
    onClose: closeCreatorPanel,
  });
  syncPrompt();
  hud.announce('Creator open. Edit or create a subject, or press Escape to close.');
}

async function createCreatorSubject(input: CreatorCreateInput): Promise<void> {
  if (!engine || creatorPending) return;
  creatorPending = true;
  hud.clearError();
  try {
    const state = getState();
    const name = input.subjectName.trim();
    const duplicate = Object.values(state.subjects).some(
      (subject) =>
        subject.dungeon.subjectName.trim().toLocaleLowerCase() === name.toLocaleLowerCase(),
    );
    if (duplicate) {
      creatorPanel?.showError(`Refused: a subject named “${name}” already exists.`);
      hud.announce('Subject refused: that name is already in use.');
      return;
    }

    const dungeonId = `subject-${crypto.randomUUID()}`;
    const result = await engine.createSubject({
      dungeonId,
      subjectName: name,
      rootRoomId: `room-${crypto.randomUUID()}`,
      rootTopic: input.rootTopic.trim(),
      nowIso: new Date().toISOString(),
      ...(input.biome === undefined ? {} : { biome: input.biome }),
    });
    if (!result.ok) {
      showCreatorRefusal(result.error.code, result.error.message);
      return;
    }

    creatorSubjectId = dungeonId;
    creatorActivatedSubject = true;
    creatorPanel?.update(projectCreator(getState(), dungeonId));
    creatorPanel?.resetCreateDraft();
    creatorPanel?.showResult(
      `Created “${name}”. Add rooms below, or close to see its portal on the street.`,
    );
    hud.announce(`Subject ${name} created. Add rooms or close the Creator.`);
  } catch (error) {
    showCreatorFailure(error);
  } finally {
    creatorPending = false;
  }
}

async function selectCreatorSubject(subjectId: string): Promise<void> {
  if (!engine || creatorPending) return;
  const subject = getState().subjects[subjectId];
  if (!subject) {
    creatorPanel?.showError('Refused: that subject no longer exists.');
    return;
  }
  creatorPending = true;
  hud.clearError();
  try {
    if (getState().activeSubjectId !== subjectId) await engine.activateSubject(subjectId);
    creatorSubjectId = subjectId;
    creatorActivatedSubject = true;
    creatorPanel?.update(projectCreator(getState(), subjectId));
    creatorPanel?.showResult(
      `Editing ${subject.dungeon.subjectName}. Mutations run only on this active subject.`,
    );
    hud.announce(`Editing ${subject.dungeon.subjectName}.`);
  } catch (error) {
    showCreatorFailure(error);
  } finally {
    creatorPending = false;
  }
}

/**
 * Enter a subject through its engine-provided portal.
 *
 * `activateSubject` alone keeps `session.world` at `village` (P6-T1), so the
 * existing portal command is what routes to the dungeon. The six fixed street
 * slots mean a seventh subject has no portal; that is reported before the panel
 * closes rather than kicked out.
 */
async function enterCreatorSubject(subjectId: string): Promise<void> {
  if (!engine || creatorPending) return;
  const portalId = `portal-${subjectId}`;
  const portal = engine.villageStructures().find((structure) => structure.id === portalId);
  if (!portal) {
    creatorPanel?.showError(
      'Refused: the village has no free portal slot for this subject. This example shows six portals.',
    );
    hud.announce('Enter refused: no free portal slot.');
    return;
  }

  dropCreatorPanel();
  syncPrompt();
  focusCanvas();
  hud.clearError();
  hud.announce('Entering the dungeon…');
  try {
    await engine.interactVillageStructure(portalId);
    // The state subscription routes to the dungeon.
  } catch (error) {
    if (getState().activeStudySessionId) {
      await engine.returnToVillage().catch(() => undefined);
    }
    const message = interactionFailedMessage(portal.label, error);
    hud.showError(message);
    showToast(message, 'error');
    hud.announce('Could not enter the dungeon. You stayed on the street.');
  }
}

async function addCreatorChildren(parentRoomId: string, topics: string[]): Promise<void> {
  if (!engine || creatorPending) return;
  if (!creatorActiveSubjectMatches()) return;
  creatorPending = true;
  hud.clearError();
  try {
    const result = await engine.dispatchGraph({
      type: 'graph/children-add',
      payload: { parentRoomId, topics },
    });
    if (!result.ok) {
      showCreatorRefusal(result.error.code, result.error.message);
      return;
    }
    const created =
      result.value.command === 'graph/children-add' ? result.value.createdRoomIds.length : 0;
    refreshCreator();
    if (created === 0) {
      creatorPanel?.showError('Refused: every topic was blank or already existed; nothing was added.');
      hud.announce('No rooms were added.');
      return;
    }
    creatorPanel?.resetAddDraft();
    creatorPanel?.showResult(`Added ${created} room${created === 1 ? '' : 's'}.`);
    hud.announce(`Added ${created} room${created === 1 ? '' : 's'}.`);
  } catch (error) {
    showCreatorFailure(error);
  } finally {
    creatorPending = false;
  }
}

async function reparentCreatorRoom(roomId: string, newParentRoomId: string): Promise<void> {
  if (!engine || creatorPending) return;
  if (!creatorActiveSubjectMatches()) return;
  creatorPending = true;
  hud.clearError();
  try {
    const result = await engine.dispatchGraph({
      type: 'graph/room-reparent',
      payload: { roomId, newParentRoomId },
    });
    if (!result.ok) {
      showCreatorRefusal(result.error.code, result.error.message);
      return;
    }
    refreshCreator();
    creatorPanel?.showResult('Room moved to the new parent.');
    hud.announce('Room moved.');
  } catch (error) {
    showCreatorFailure(error);
  } finally {
    creatorPending = false;
  }
}

async function removeCreatorRoom(roomId: string): Promise<void> {
  if (!engine || creatorPending) return;
  if (!creatorActiveSubjectMatches()) return;
  creatorPending = true;
  hud.clearError();
  try {
    const result = await engine.dispatchGraph({ type: 'graph/room-remove', payload: { roomId } });
    if (!result.ok) {
      showCreatorRefusal(result.error.code, result.error.message);
      return;
    }
    const removed =
      result.value.command === 'graph/room-remove' ? result.value.removedRoomIds.length : 0;
    refreshCreator();
    creatorPanel?.showResult(
      `Removed ${removed} room${removed === 1 ? '' : 's'}, including every unreachable descendant.`,
    );
    hud.announce(`Removed ${removed} room${removed === 1 ? '' : 's'}.`);
  } catch (error) {
    showCreatorFailure(error);
  } finally {
    creatorPending = false;
  }
}

async function setCreatorTags(roomId: string, tags: string[]): Promise<void> {
  if (!engine || creatorPending) return;
  if (!creatorActiveSubjectMatches()) return;
  creatorPending = true;
  hud.clearError();
  try {
    const result = await engine.dispatchGraph({
      type: 'graph/tags-set',
      payload: { roomId, tags },
    });
    if (!result.ok) {
      showCreatorRefusal(result.error.code, result.error.message);
      return;
    }
    const stored =
      result.value.command === 'graph/tags-set' ? result.value.tags : [];
    refreshCreator();
    creatorPanel?.showResult(
      stored.length === 0
        ? 'Tags cleared. The engine stores tags normalized: lowercase, punctuation removed.'
        : `Tags saved: ${stored.join(', ')}. Tags are stored normalized.`,
    );
    hud.announce(stored.length === 0 ? 'Tags cleared.' : `Tags saved: ${stored.join(', ')}.`);
  } catch (error) {
    showCreatorFailure(error);
  } finally {
    creatorPending = false;
  }
}

async function linkCreatorRooms(fromRoomId: string, toRoomId: string): Promise<void> {
  if (!engine || creatorPending) return;
  if (!creatorActiveSubjectMatches()) return;
  creatorPending = true;
  hud.clearError();
  try {
    const result = await engine.dispatchGraph({
      type: 'graph/cross-link-add',
      payload: { fromRoomId, toRoomId },
    });
    if (!result.ok) {
      showCreatorRefusal(result.error.code, result.error.message);
      return;
    }
    refreshCreator();
    creatorPanel?.showResult('Cross-link added. It is drawn below the room tree.');
    hud.announce('Cross-link added.');
  } catch (error) {
    showCreatorFailure(error);
  } finally {
    creatorPending = false;
  }
}

// ── Village services (P7) ────────────────────────────────────────────────────

/** Re-project the open service from committed state; the panel never mutates. */
function refreshService(): void {
  if (!servicePanel || !serviceId) return;
  servicePanel.update(renderServiceContent(serviceId));
}

function renderServiceContent(id: VillageServiceId): HTMLElement {
  const state = getState();
  switch (id) {
    case 'library':
      return renderLibrary(projectLibrary(state, reviewNow()), {
        onReview: (roomId) => {
          void reviewFromLibrary(roomId);
        },
      });
    case 'guild-hall':
      return renderGuild(projectGuild(state), {
        onOpenCreator: () => {
          dropServicePanel();
          syncPrompt();
          openCreator();
        },
        onOpenJournal: () => {
          dropServicePanel();
          syncPrompt();
          openJournal();
        },
      });
    case 'trophy-hall':
      return renderTrophy(projectTrophy(state, reviewNow()));
    case 'workshop':
      return renderWorkshop(projectWorkshop(state), {
        onEquip: (itemId) => {
          void changeEquipment('equip', itemId);
        },
        onUnequip: (itemId) => {
          void changeEquipment('unequip', itemId);
        },
      });
    case 'fish-stand':
      return renderFishStand(projectFishStand(state));
  }
}

/** Detach the shell without dispatching, focusing, or ending a session. */
function dropServicePanel(): void {
  if (!servicePanel) return;
  servicePanel.close();
  servicePanel = null;
  serviceId = null;
  servicePending = false;
  serviceActivatedSubject = false;
}

function closeVillageService(): void {
  if (!servicePanel) return;
  if (servicePending) {
    hud.announce('A service command is still pending. Wait for it to finish.');
    return;
  }
  const deactivate = serviceActivatedSubject;
  const title = serviceId ? projectServiceShell(serviceId).title : 'Service';
  dropServicePanel();
  syncPrompt();
  if (deactivate && engine && getState().session.world === 'village') {
    void engine
      .returnToVillage()
      .then(() => hud.announce(`${title} closed. The study session is closed; you are on the street.`))
      .catch((error: unknown) => {
        const message = `Could not close the service study session: ${describe(error)}`;
        hud.showError(message);
        hud.announce('Could not close the service study session.');
      });
    return;
  }
  hud.announce(`${title} closed.`);
}

/**
 * Open one interior.
 *
 * The Workshop's equipment commands require an active subject, so opening it
 * activates the subject the projection names and closing returns to the village
 * to end that session (K-15). Every other service is read-only until the learner
 * chooses a review or an equipment change.
 */
async function openVillageService(id: VillageServiceId): Promise<void> {
  if (!engine || servicePanel) return;
  clearInput();
  hideToast();
  hud.clearError();
  closeNpcDialog(false);
  serviceActivatedSubject = false;

  if (id === 'workshop') {
    const subjectId = equipmentSubjectId(getState());
    if (subjectId && getState().activeSubjectId !== subjectId) {
      try {
        await engine.activateSubject(subjectId);
        serviceActivatedSubject = true;
      } catch (error) {
        const message = `Could not open the Workshop: ${describe(error)}`;
        hud.showError(message);
        showToast(message, 'error');
        hud.announce('The Workshop could not be opened.');
        return;
      }
    }
  }

  serviceId = id;
  const shell = projectServiceShell(id);
  servicePanel = mountServicePanel({
    root: servicePanelHost,
    shell,
    content: renderServiceContent(id),
    returnFocus: canvas,
    callbacks: { onClose: closeVillageService },
  });
  syncPrompt();
  hud.announce(`${shell.title} open. Tab moves through the service; Escape closes.`);
}

/**
 * The Library's review desk hands a room id here.
 *
 * Review commands need an active subject. The desk projects the last-studied
 * one, so the host activates it if needed and records that closing the P5 panel
 * must return to the village (K-15). The service shell is closed before the
 * review mounts so only one modal owns focus.
 */
async function reviewFromLibrary(roomId: string): Promise<void> {
  if (!engine || reviewPanel || libraryReviewPending) return;
  const state = getState();
  const subjectId = mostRecentStudiedSubject(state) ?? lastStudiedSubjectId;
  if (!subjectId || !state.subjects[subjectId]) {
    const message = noReviewSubjectMessage();
    hud.showError(message);
    hud.announce(message);
    return;
  }

  libraryReviewPending = true;
  const alreadyActive = state.activeSubjectId === subjectId;
  try {
    if (!alreadyActive) await engine.activateSubject(subjectId);
    dropServicePanel();
    syncPrompt();
    const opened = await openReview(roomId, !alreadyActive);
    if (!opened && !alreadyActive) await engine.returnToVillage();
  } catch (error) {
    const message = `Could not open the review: ${describe(error)}`;
    hud.showError(message);
    hud.announce('The review could not be opened.');
    if (!alreadyActive && getState().activeSubjectId === subjectId) {
      await engine.returnToVillage().catch(() => undefined);
    }
  } finally {
    libraryReviewPending = false;
  }
}

/** Equip or unequip one item; one command in flight, previous state intact on failure. */
async function changeEquipment(action: 'equip' | 'unequip', itemId: string): Promise<void> {
  if (!engine || servicePending) return;
  servicePending = true;
  servicePanel?.setPending(true);
  hud.clearError();
  try {
    const changed =
      action === 'equip' ? await engine.equipItem(itemId) : await engine.unequipItem(itemId);
    if (!changed) {
      servicePanel?.showError(
        action === 'equip'
          ? 'Refused: the engine would not equip that item. It may already be equipped or not be gear.'
          : 'Refused: the engine would not unequip that item. It may not be equipped.',
      );
      hud.announce('Equipment unchanged.');
      return;
    }
    refreshService();
    servicePanel?.showResult(action === 'equip' ? 'Equipped. The change survives a reload.' : 'Unequipped. The change survives a reload.');
    hud.announce(action === 'equip' ? 'Item equipped.' : 'Item unequipped.');
  } catch (error) {
    const message = notSavedMessage(error);
    servicePanel?.showError(message);
    hud.showError(message);
    hud.announce('The equipment change was not saved.');
  } finally {
    servicePending = false;
    servicePanel?.setPending(false);
  }
}

// ── Controls help (post-P8 polish) ───────────────────────────────────────────

function closeHelpPanel(): void {
  if (!helpPanel) return;
  const panel = helpPanel;
  // Re-enable the trigger before handing focus back to it; a disabled button
  // cannot receive focus.
  helpPanel = null;
  syncPrompt();
  panel.close();
  hud.announce('Controls closed.');
}

function openHelp(trigger: HTMLElement = canvas): void {
  if (helpPanel) return;
  if (composer || reviewPanel || creatorPanel || servicePanel || journalPanel) {
    hud.announce('Close the open panel before opening Controls.');
    return;
  }
  clearInput();
  hideToast();
  hud.clearError();
  helpPanel = mountHelpPanel(helpPanelHost, trigger, { onClose: closeHelpPanel });
  syncPrompt();
  hud.announce('Controls open. Tab moves through the list; Escape or ? closes.');
}

// ── Journal and settings (P8) ────────────────────────────────────────────────

/** Project the journal and fill in the separately computed assistance result. */
function journalView(state: EngineState, nowIso: string): JournalView {
  return {
    ...projectJournal(state, nowIso),
    assistance: projectAssistance(state, hostSettings, nowIso),
  };
}

/** Re-project the open journal from committed state; settings changes call this too. */
function refreshJournal(): void {
  if (!journalPanel) return;
  journalPanel.update(journalView(getState(), reviewNow()), hostSettings, journalSelectedSubjectId);
}

/** Detach the panel without focusing or announcing. */
function dropJournalPanel(): void {
  if (!journalPanel) return;
  journalPanel.close();
  journalPanel = null;
  journalPending = false;
}

function closeJournalPanel(): void {
  if (!journalPanel) return;
  if (journalPending) {
    hud.announce('A journal command is still pending. Wait for it to finish.');
    return;
  }
  dropJournalPanel();
  journalSelectedSubjectId = null;
  syncPrompt();
  focusCanvas();
  hud.announce('Journal closed.');
}

function openJournal(): void {
  if (!engine || journalPanel) return;
  if (composer || reviewPanel || creatorPanel || servicePanel || helpPanel) {
    hud.announce('Close the open panel before opening the journal.');
    return;
  }
  if (fishing?.dialog) {
    hud.announce('Finish the fish choice before opening the journal.');
    return;
  }

  clearInput();
  hideToast();
  hud.clearError();
  journalSelectedSubjectId = getState().activeSubjectId;
  journalPanel = mountJournalPanel(
    journalPanelHost,
    journalView(getState(), reviewNow()),
    hostSettings,
    journalSelectedSubjectId,
    canvas,
    {
      onClose: closeJournalPanel,
      onOpenSettings: () => journalPanel?.focusSettings(),
      onSelectSubject(subjectId) {
        if (!getState().subjects[subjectId]) {
          journalPanel?.showError('That subject no longer exists.');
          return;
        }
        journalSelectedSubjectId = subjectId;
        refreshJournal();
        hud.announce('Subject selected. The Enter button opens its portal.');
      },
      onEnterSubject(subjectId) {
        void enterJournalSubject(subjectId);
      },
      onSettingsChange(next) {
        changeHostSettings(next);
      },
      onResetSettings() {
        resetHostSettings();
      },
    },
  );
  syncPrompt();
  hud.announce(
    'Journal open. Subjects, progress, records, due rooms, assistance, and settings. Press J or Escape to close.',
  );
}

/** Save, apply, and re-project after one settings change. */
function changeHostSettings(next: HostSettings): void {
  hostSettings = next;
  saveSettings(hostSettings);
  applySettings(hostSettings);
  refreshJournal();
  hud.announce('Settings saved on this device.');
}

function resetHostSettings(): void {
  hostSettings = resetSettings();
  saveSettings(hostSettings);
  applySettings(hostSettings);
  refreshJournal();
  hud.announce('Settings reset to defaults. Engine state was not touched.');
}

/**
 * Enter one subject through the same village portal the street uses.
 *
 * A dungeon or pond session must be closed first so the engine starts one study
 * session, not two. A subject past the six portal slots reports that honestly
 * and keeps the journal open.
 */
async function enterJournalSubject(subjectId: string): Promise<void> {
  if (!engine || journalPending) return;
  const state = getState();
  if (!state.subjects[subjectId]) {
    journalPanel?.showError('That subject no longer exists.');
    return;
  }

  const portal = engine
    .villageStructures()
    .find(
      (structure) =>
        structure.subjectId === subjectId &&
        (structure.type === 'portal-icon' || structure.type === 'training-gate'),
    );
  if (!portal) {
    const message =
      'This subject has no free portal slot. This example shows six portals; delete another subject to make room.';
    journalPanel?.showError(message);
    hud.announce(message);
    return;
  }

  journalPending = true;
  dropJournalPanel();
  journalSelectedSubjectId = null;
  syncPrompt();
  focusCanvas();
  hud.clearError();
  try {
    if (getState().session.world !== 'village') await engine.returnToVillage();
    await engine.interactVillageStructure(portal.id);
    // The state subscription routes to the dungeon and starts the study session.
    hud.announce(`Entering ${state.subjects[subjectId]?.dungeon.subjectName ?? 'the subject'}…`);
  } catch (error) {
    if (getState().activeStudySessionId) {
      await engine.returnToVillage().catch(() => undefined);
    }
    const message = interactionFailedMessage(portal.label, error);
    hud.showError(message);
    showToast(message, 'error');
    hud.announce('Could not enter the subject. You stayed on the street.');
  } finally {
    journalPending = false;
  }
}

// ── NPCs (P7) ────────────────────────────────────────────────────────────────

function closeNpcDialog(returnFocus = false): void {
  if (!npcDialog) return;
  npcDialog.close();
  npcDialog = null;
  if (returnFocus) focusCanvas();
}

/** One `E` press: advance the engine's conversation cursor and show the line. */
function talkToNpc(target: SurfaceNpc): void {
  if (!engine) return;
  const source = surfaceMap().npcs.find((npc) => npc.id === target.id);
  if (!source) return;

  clearInput();
  const step = getState().session.questStep;
  const cursor = npcCursors.get(target.id) ?? null;
  const line = projectNpcLine(source, step, cursor, npcQuoteIndex(source));
  npcCursors.set(target.id, line.cursor);

  const view = { label: line.label, line: line.line };
  if (npcDialog) npcDialog.update(view);
  else npcDialog = mountNpcDialog(npcDialogHost, view, () => closeNpcDialog(true));

  hud.announce(`${line.label} speaks.`);
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

    const service = serviceForStructure(target.type);
    if (service) {
      if (service === 'guild-hall') {
        // The Guild Hall keeps the engine's quest-step write; the service then
        // renders the returned structure and the new step.
        await engine.interactVillageStructure(target.id);
      }
      await openVillageService(service);
      return;
    }

    if (target.type === 'portal-icon' || target.type === 'training-gate') {
      await engine.interactVillageStructure(target.id);
      // The state subscription routes and announces the dungeon transition.
      return;
    }

    // Labelled scenery: Keeper's Tower and the central fountain have no
    // interior in this build, and say so instead of opening a dead screen.
    const message = sceneryMessage(target.label);
    hud.announce(message);
    showToast(message);
  } catch (error) {
    const message = interactionFailedMessage(target.label, error);
    hud.showError(message);
    showToast(message, 'error');
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

    // The review panel handles 0–5, Enter, S, D, Escape, and Tab itself.
    if (reviewPanel) {
      if (event.code === 'Escape') {
        event.preventDefault();
        closeReviewPanel();
      }
      return;
    }

    // The Creator panel owns Escape, Tab, and every native control. Window-level
    // events (synthetic checks, or a key when focus escaped the panel) still close it.
    if (creatorPanel) {
      const insidePanel = event.target instanceof Node && creatorPanelHost.contains(event.target);
      if (event.code === 'Escape' && !insidePanel) {
        event.preventDefault();
        closeCreatorPanel();
      }
      return;
    }

    // The service shell owns Escape, Tab, and every native control. A window
    // event (focus escaped the panel) still closes it.
    if (servicePanel) {
      const insidePanel = event.target instanceof Node && servicePanelHost.contains(event.target);
      if (event.code === 'Escape' && !insidePanel) {
        event.preventDefault();
        closeVillageService();
      }
      return;
    }

    // The journal owns Escape/J, Tab, arrows, and every native control.
    if (journalPanel) {
      const insidePanel = event.target instanceof Node && journalPanelHost.contains(event.target);
      if ((event.code === 'Escape' || event.code === 'KeyJ') && !insidePanel) {
        event.preventDefault();
        closeJournalPanel();
      }
      return;
    }

    // The controls popup owns Escape/?, Tab, and its Close button.
    if (helpPanel) {
      const insidePanel = event.target instanceof Node && helpPanelHost.contains(event.target);
      if ((event.key === 'Escape' || event.key === '?') && !insidePanel) {
        event.preventDefault();
        closeHelpPanel();
      }
      return;
    }

    if (isTypingTarget(event.target)) return;

    if (event.key === '?' || (event.code === 'Slash' && event.shiftKey)) {
      event.preventDefault();
      openHelp(
        document.activeElement instanceof HTMLElement && document.activeElement !== document.body
          ? document.activeElement
          : canvas,
      );
      return;
    }

    if (event.code === 'KeyJ' && !event.repeat) {
      event.preventDefault();
      if (returnPending || interactionPending || reviewEntryPending) return;
      openJournal();
      return;
    }

    if (npcDialog && event.code === 'Escape') {
      event.preventDefault();
      closeNpcDialog(true);
      return;
    }

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
        if (activeInteractable) {
          void useInteractable(activeInteractable);
        } else if (activeNpc) {
          talkToNpc(activeNpc);
        } else {
          const message = nothingInReachMessage();
          hud.announce(message);
          showToast(message);
        }
        return;
      }
      if (screen === 'dungeon') {
        if (activeRoomId) openComposer(activeRoomId);
        else hud.announce('Move into a room to write a note.');
      }
    }
    if (event.code === 'KeyC' && !event.repeat && screen === 'surface') {
      event.preventDefault();
      if (returnPending || interactionPending || reviewEntryPending) return;
      openCreator();
      return;
    }
    if (event.code === 'KeyR' && !event.repeat) {
      event.preventDefault();
      if (returnPending || interactionPending || reviewEntryPending) return;
      if (screen === 'surface') {
        void openReviewFromSurface();
        return;
      }
      if (screen === 'dungeon') {
        if (activeRoomId) {
          void openReview(activeRoomId, false);
        } else {
          hud.announce('Move into a room to review it.');
        }
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
      const reviewable = view?.rooms.find((entry) => entry.roomId === room.roomId)?.reviewable ?? false;
      hud.announce(
        `Entered ${room.topic}. ${status}. Press E to write a note.${reviewable ? ' Press R to review it.' : ''}`,
      );
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
  const targets = selectNearbySurfaceTargets(surface, surfaceNpcs, playerCentre(body));
  const structureTarget = targets.find((target) => target.kind === 'structure') ?? null;
  const npcTarget = structureTarget
    ? null
    : targets.find((target) => target.kind === 'npc') ?? null;
  const nearest = structureTarget
    ? surface.interactables.find((entry) => entry.id === structureTarget.id) ?? null
    : null;
  const npc = npcTarget ? surfaceNpcs.find((entry) => entry.id === npcTarget.id) ?? null : null;

  const previousStructureId = activeInteractable?.id ?? null;
  const previousNpcId = activeNpc?.id ?? null;
  if ((nearest?.id ?? null) === previousStructureId && (npc?.id ?? null) === previousNpcId) return;

  activeInteractable = nearest;
  activeNpc = npc;
  if (!npc) closeNpcDialog(false);
  syncPrompt();
  hud.updateSurface(surfaceView, nearest?.id ?? null, npc?.label ?? null);
  if (nearest) {
    hud.announce(`Near ${nearest.label}. Press E to ${interactionVerb(nearest.type)}.`);
  } else if (npc) {
    hud.announce(`Near ${npc.label}. Press E to talk.`);
  } else if (previousStructureId !== null || previousNpcId !== null) {
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

  if (screen === 'fishing' && fishing && context && !journalPanel && !helpPanel) {
    fishing.clockMs += deltaMs;
    reduceFishingEvent({ type: 'tick', nowMs: fishing.clockMs });
    renderFishingScene(context, {
      state: fishing.machine,
      reducedMotion: reducedMotionActive(),
      textScale: hostSettings.textScale,
    });
    requestAnimationFrame(frame);
    return;
  }

  const intent = readIntent();
  jumpQueued = false;

  if (level && body && context) {
    // The composer, the review panel, the Creator, a village service, the
    // journal, and Controls pause the world.
    if (!composer && !reviewPanel && !creatorPanel && !servicePanel && !journalPanel && !helpPanel) {
      body = stepBody(body, intent, level, deltaMs);
      if (screen === 'dungeon') {
        updateRoomVisit();
        maybeReturnToVillage();
      } else if (screen === 'surface') {
        updateInteractable();
      }
    }
    updateCamera(camera, body, level, deltaMs, reducedMotionActive());
    renderWorld(context, {
      level,
      body,
      camera,
      activeRoomId,
      surface,
      activeInteractableId: activeInteractable?.id ?? null,
      npcs: surfaceNpcs,
      activeNpcId: activeNpc?.id ?? null,
      badges,
      reducedMotion: reducedMotionActive(),
      textScale: hostSettings.textScale,
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

  openHelpButton.addEventListener('click', () => {
    openHelp(openHelpButton);
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
        // A reset is a first run again: drop the demo-seed flag with the save.
        try {
          window.localStorage.removeItem(DEMO_SEED_FLAG_KEY);
        } catch {
          // Storage may be unavailable; the save itself is already cleared.
        }
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
    .then(async (opened) => {
      engine = opened;
      hud.clearError();

      // P6: the first-run demo campaign runs before the subscription, so the
      // first routed state already lists the demo portals.
      let seededNotice: string | null = null;
      try {
        const seeded = await seedDemoSubjectsOnFirstRun(
          opened,
          DEMO_SUBJECT_SEEDS,
          browserSeedFlagStore(),
        );
        if (seeded.seeded.length > 0) {
          seededNotice = `Demo campaign seeded: ${seeded.seeded.length} subjects. Their portals are on the street; press C or visit the Guild Hall to edit them.`;
        } else if (seeded.failed.length > 0) {
          hud.showError(`Some demo subjects could not be seeded: ${seeded.failed.join(', ')}.`);
        }
      } catch (error) {
        hud.showError(`Could not seed the demo campaign: ${describe(error)}`);
      }

      startButton.disabled = false;
      wireActions(storage);
      const bootState = getState();
      if (bootState.activeSubjectId) lastStudiedSubjectId = bootState.activeSubjectId;
      lastQuestStep = bootState.session.questStep;
      subscribeState(onState);
      // `onState` runs immediately with the current state and routes the screen.
      const bootNotice = takeBootNotice();
      if (bootNotice) {
        showRecovery(bootNotice);
        hud.announce(bootNotice);
      } else if (seededNotice) {
        hud.announce(seededNotice);
        showToast(seededNotice);
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
