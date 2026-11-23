import type { EngineState, KnowledgeDungeonEngine } from '@/index';
import { openExampleEngine, setErrorReporter, subscribeState } from './engine';
import { createIndexedDbStorage } from './storage';

const canvas = must<HTMLCanvasElement>('#game');
const summary = must<HTMLDListElement>('#summary');
const roomList = must<HTMLUListElement>('#rooms');
const errorBox = must<HTMLDivElement>('#error');
const status = must<HTMLDivElement>('#status');
const startButton = must<HTMLButtonElement>('#start-tutorial');
const clearButton = must<HTMLButtonElement>('#clear-save');

function must<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing required element: ${selector}`);
  return element;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function showError(message: string): void {
  errorBox.textContent = message;
  errorBox.hidden = false;
}

function announce(message: string): void {
  status.textContent = message;
}

function row(term: string, value: string): [HTMLElement, HTMLElement] {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  return [dt, dd];
}

function render(state: EngineState): void {
  const activeId = state.activeSubjectId;
  const active = activeId ? state.subjects[activeId] : undefined;
  const progression = activeId ? state.progression[activeId] : undefined;

  const rows = [
    ['Session world', state.session.world],
    ['Study phase', state.session.phase],
    ['Quest step', state.session.questStep],
    ['Active subject', active ? `${active.dungeon.subjectName} (${activeId})` : 'none'],
    ['Subjects', String(Object.keys(state.subjects).length)],
    ['Study session', state.activeStudySessionId ? 'active' : 'closed'],
    ['XP', progression ? String(progression.xpTotal) : '—'],
  ];
  summary.replaceChildren(...rows.flatMap(([term, value]) => row(term, value)));

  if (!active) {
    const item = document.createElement('li');
    item.className = 'hint';
    item.textContent = 'No active subject.';
    roomList.replaceChildren(item);
    return;
  }

  const rooms = Object.values(active.rooms).map((room) => {
    const item = document.createElement('li');
    const cleared = room.validationState.finalPass ? ' — cleared' : '';
    item.textContent = `${room.topic} [${room.state}]${cleared}`;
    return item;
  });
  roomList.replaceChildren(...rooms);
}

function drawPlaceholder(): void {
  const context = canvas.getContext('2d');
  if (!context) {
    showError('Canvas 2D is not available in this browser.');
    return;
  }
  const { width, height } = canvas;
  const gradient = context.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, '#0b0d13');
  gradient.addColorStop(1, '#182033');
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);
  context.fillStyle = '#a8b3c9';
  context.font = '20px system-ui, sans-serif';
  context.textAlign = 'center';
  context.fillText('P0 pipeline proof — the world renders in P1', width / 2, height / 2);
}

function wireActions(engine: KnowledgeDungeonEngine, storage: ReturnType<typeof createIndexedDbStorage>): void {
  startButton.addEventListener('click', () => {
    startButton.disabled = true;
    void engine
      .startTutorial()
      .then(() => announce('Tutorial started. The state was committed and saved.'))
      .catch((error: unknown) => {
        showError(`Could not start the tutorial: ${describe(error)}`);
        announce('Tutorial did not start.');
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
        announce('Saved state cleared. Reloading.');
        window.location.reload();
      })
      .catch((error: unknown) => {
        showError(`Could not clear saved state: ${describe(error)}`);
        clearButton.disabled = false;
      });
  });
}

setErrorReporter(showError);
drawPlaceholder();

const storage = createIndexedDbStorage();

void openExampleEngine(storage)
  .then((engine) => {
    errorBox.hidden = true;
    wireActions(engine, storage);
    subscribeState(render);
    announce('Engine ready. Start the tutorial, then reload to verify persistence.');
  })
  .catch((error: unknown) => {
    showError(`Could not open the engine: ${describe(error)}`);
  });
