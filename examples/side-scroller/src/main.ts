import type { EngineState, KnowledgeDungeonEngine } from '@/index';
import { getState, openExampleEngine, setErrorReporter, subscribeState } from './engine';
import { buildDungeonLevel, type LevelModel } from './level/model';
import { createVisitTracker, playerCentre, roomAtPoint } from './level/visits';
import { createPlayerBody, stepBody, type Body, type MoveIntent } from './physics';
import { projectDungeon, roomBadges, type DungeonView } from './projection';
import { createHud } from './render/hud';
import { createCamera, prepareCanvas, renderWorld, updateCamera } from './render/canvas';
import { createIndexedDbStorage } from './storage';
import { mountNotePanel, type NotePanel } from './ui/notePanel';
import { notCollectedMessage, notSavedMessage, refusalMessage } from './ui/outcomes';
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

const prompts = createPrompts(promptHost, (message) => hud.announce(message));

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const camera = createCamera();
const visits = createVisitTracker();

let engine: KnowledgeDungeonEngine | null = null;
let context: CanvasRenderingContext2D | null = null;
let level: LevelModel | null = null;
let body: Body | null = null;
let view: DungeonView | null = null;
let badges: Record<string, { cleared: boolean; label: string }> = {};
let activeRoomId: string | null = null;
let levelKey = '';
let jumpQueued = false;
const held = new Set<string>();

/** The open composer, or `null`. While open the world is paused and keys are modal. */
let composer: NotePanel | null = null;
let composerPending = false;

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

function showOverlay(text: string, showStart: boolean): void {
  overlayText.textContent = text;
  startButton.hidden = !showStart;
  overlay.hidden = false;
}

function resetLevel(): void {
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
  if (!level || !body) {
    prompts.hide();
    return;
  }
  const room = activeRoomId ? view?.rooms.find((entry) => entry.roomId === activeRoomId) : undefined;
  prompts.setRoom(room ? { roomId: room.roomId, topic: room.topic } : null, composer !== null);
}

function onState(state: EngineState): void {
  const subjectId = state.activeSubjectId;
  const subject = subjectId ? state.subjects[subjectId] : undefined;
  const inDungeon = state.session.world === 'dungeon' && subject !== undefined && subjectId !== undefined;

  if (!inDungeon || !subject || !subjectId) {
    closeComposer(true);
    resetLevel();
    hud.update(null, null);
    showOverlay('Start the tutorial to enter the dungeon.', true);
    return;
  }

  const key = structuralKey(state, subjectId);
  if (key !== levelKey) {
    level = buildDungeonLevel(subject);
    body = createPlayerBody(level);
    levelKey = key;
    activeRoomId = null;
    visits.reset();
    updateCamera(camera, body, level, 100, true);
  }

  view = projectDungeon(state);
  badges = roomBadges(view);
  const overlayWasVisible = overlay.hidden === false;
  overlay.hidden = true;
  if (overlayWasVisible) panelTitle.focus({ preventScroll: true });
  hud.update(view, activeRoomId);
  syncPrompt();
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
  if (!engine || composer) return;
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
      if (activeRoomId) openComposer(activeRoomId);
      else hud.announce('Move into a room to write a note.');
    }
  });

  window.addEventListener('keyup', (event) => {
    held.delete(event.code);
  });

  window.addEventListener('blur', clearInput);
}

function updateRoomVisit(): void {
  if (!level || !body || !engine) return;

  const centre = playerCentre(body);
  const room = roomAtPoint(level, centre.x, centre.y);
  const roomId = room?.roomId ?? null;
  if (roomId !== activeRoomId) {
    activeRoomId = roomId;
    hud.update(view, activeRoomId);
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
      updateRoomVisit();
    }
    updateCamera(camera, body, level, deltaMs, reducedMotion.matches);
    renderWorld(context, {
      level,
      body,
      camera,
      activeRoomId,
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
      if (getState().session.world !== 'dungeon') {
        hud.announce('Engine ready. Start the tutorial to enter the dungeon.');
      }
    })
    .catch((error: unknown) => {
      hud.showError(`Could not open the engine: ${describe(error)}`);
      showOverlay('The engine could not start. Check the error panel.', false);
    });
}

boot();
