/**
 * Title, continue, and save portability (P9).
 *
 * The title is a real DOM card inside the world viewport, not canvas text: it
 * is keyboard operable, has a visible focus ring, and can carry a file picker.
 * The panel reads only the frozen `TitleView`; the host owns the engine, the
 * storage adapter, and every command.
 *
 * The one host-provided shortcut is **Start tutorial**: the capture harness and
 * the manual smoke script use it to reproduce the P1–P8 gates without walking
 * the street every time. It is a convenience entry, not a separate game mode.
 */
import { archetypes, type EngineState } from '@/index';

export interface TitleView {
  hasSave: boolean;
  subjectCount: number;
  playerClass: string | null;
  questStep: string;
  showArchetypes: boolean;
}

/** The title needs no engine beyond the committed state it is handed. */
export function projectTitle(state: EngineState): TitleView {
  const subjectCount = Object.keys(state.subjects).length;
  return {
    hasSave:
      subjectCount > 0 ||
      state.session.playerClass !== null ||
      state.session.questStep !== 'intro' ||
      state.activeSubjectId !== null,
    subjectCount,
    playerClass: state.session.playerClass,
    questStep: state.session.questStep,
    showArchetypes: state.session.playerClass === null,
  };
}

export type TitleImportResult = { ok: true } | { ok: false; error: string };

export interface TitleCallbacks {
  onContinue(): void;
  onNewGame(): void;
  onStartTutorial(): void;
  onExport(): void;
  onImport(raw: unknown): Promise<TitleImportResult>;
  onSettings(): void;
  onArchetype(playerClass: archetypes.PlayerClassId): void;
}

export interface TitlePanel {
  update(view: TitleView): void;
  showError(message: string): void;
  clearError(): void;
  focusPrimary(): void;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; id?: string } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  return node;
}

const FOCUSABLE =
  'button, input, textarea, select, a[href], [tabindex]:not([tabindex="-1"])';

function visibleControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) =>
      !(node as HTMLButtonElement).disabled &&
      !node.hidden &&
      node.closest('[hidden]') === null,
  );
}

function questStepLabel(step: string): string {
  return step.replace(/-/g, ' ');
}

export function mountTitlePanel(root: HTMLElement, callbacks: TitleCallbacks): TitlePanel {
  root.hidden = false;
  root.replaceChildren();

  const card = element('div', { className: 'title-card' });
  const heading = element('h1', { id: 'title-heading', text: 'Knowledge Dungeon' });
  heading.tabIndex = -1;
  const subtitle = element('p', {
    className: 'title-subtitle',
    text: 'Side-Scroller — village street above a generated study dungeon.',
  });
  const status = element('p', { className: 'title-status', id: 'title-status' });

  const actions = element('div', { className: 'title-actions' });
  const continueButton = element('button', { id: 'title-continue', text: 'Continue' });
  continueButton.type = 'button';
  continueButton.className = 'title-primary';
  continueButton.addEventListener('click', () => callbacks.onContinue());

  const newGame = element('button', { id: 'title-new-game', text: 'New game' });
  newGame.type = 'button';
  newGame.addEventListener('click', () => callbacks.onNewGame());

  const tutorial = element('button', { id: 'start-tutorial', text: 'Start tutorial' });
  tutorial.type = 'button';
  tutorial.addEventListener('click', () => callbacks.onStartTutorial());

  const exportButton = element('button', { id: 'title-export', text: 'Export save' });
  exportButton.type = 'button';
  exportButton.addEventListener('click', () => callbacks.onExport());

  const importToggle = element('button', { id: 'title-import-toggle', text: 'Import save' });
  importToggle.type = 'button';
  importToggle.setAttribute('aria-expanded', 'false');
  importToggle.setAttribute('aria-controls', 'title-import-panel');

  const settings = element('button', { id: 'title-settings', text: 'Settings' });
  settings.type = 'button';
  settings.addEventListener('click', () => callbacks.onSettings());

  actions.append(continueButton, newGame, tutorial, exportButton, importToggle, settings);

  // ── Archetype choice ──────────────────────────────────────────────────────
  const archetypeSection = element('section', { className: 'title-archetypes' });
  archetypeSection.id = 'title-archetypes';
  const archetypeTitle = element('h2', { text: 'Choose a study archetype' });
  const archetypeHint = element('p', {
    className: 'note-hint',
    text: 'The engine stores this choice on the session. It has no host-invented bonuses.',
  });
  const archetypeRow = element('div', { className: 'title-archetype-row' });
  const archetypeButtons = new Map<archetypes.PlayerClassId, HTMLButtonElement>();
  for (const definition of archetypes.PLAYER_CLASSES) {
    const button = element('button', { className: 'title-archetype' });
    button.type = 'button';
    button.dataset.archetype = definition.id;
    button.append(
      element('strong', { text: definition.name }),
      element('span', { text: definition.tagline }),
    );
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => callbacks.onArchetype(definition.id));
    archetypeButtons.set(definition.id, button);
    archetypeRow.append(button);
  }
  archetypeSection.append(archetypeTitle, archetypeHint, archetypeRow);

  // ── Import ────────────────────────────────────────────────────────────────
  const importPanel = element('section', { className: 'title-import', id: 'title-import-panel' });
  importPanel.hidden = true;
  importPanel.setAttribute('aria-label', 'Import a saved game');
  const importTitle = element('h2', { text: 'Import a save bundle' });
  const importHint = element('p', {
    className: 'note-hint',
    text: 'Choose a .json file exported by this example, or paste its JSON. Nothing is written until the whole file validates.',
  });
  const fileRow = element('div', { className: 'title-import-row' });
  const fileLabel = element('label', { text: 'Save file' });
  fileLabel.htmlFor = 'title-import-file';
  const fileInput = element('input');
  fileInput.type = 'file';
  fileInput.id = 'title-import-file';
  fileInput.accept = 'application/json,.json';
  fileRow.append(fileLabel, fileInput);

  const pasteLabel = element('label', { text: 'Or paste the bundle JSON' });
  pasteLabel.htmlFor = 'title-import-text';
  const paste = element('textarea');
  paste.id = 'title-import-text';
  paste.rows = 4;
  paste.spellcheck = false;
  const importApply = element('button', { id: 'title-import-apply', text: 'Check and import' });
  importApply.type = 'button';
  const importCancel = element('button', { id: 'title-import-cancel', text: 'Cancel' });
  importCancel.type = 'button';
  const importRow = element('div', { className: 'title-actions' });
  importRow.append(importApply, importCancel);
  importPanel.append(importTitle, importHint, fileRow, pasteLabel, paste, importRow);

  const error = element('p', { className: 'title-error', id: 'title-error' });
  error.hidden = true;
  error.setAttribute('role', 'alert');

  const hint = element('p', {
    className: 'title-hint',
    text: 'The save lives in this browser (IndexedDB). Settings stay on this device and are not part of a bundle.',
  });

  card.append(heading, subtitle, status, actions, archetypeSection, importPanel, error, hint);
  root.append(card);

  let importBusy = false;
  let importDone = false;

  function clearError(): void {
    error.hidden = true;
    error.textContent = '';
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }

  function setImportOpen(open: boolean): void {
    importPanel.hidden = !open;
    importToggle.setAttribute('aria-expanded', String(open));
    if (open) {
      clearError();
      paste.focus({ preventScroll: true });
    }
  }

  importToggle.addEventListener('click', () => setImportOpen(importPanel.hidden));
  importCancel.addEventListener('click', () => setImportOpen(false));

  async function runImport(source: unknown): Promise<void> {
    if (importBusy || importDone) return;
    clearError();
    if (typeof source === 'string') {
      let parsed: unknown;
      try {
        parsed = JSON.parse(source) as unknown;
      } catch (parseError) {
        const message = parseError instanceof Error ? parseError.message : String(parseError);
        showError(`That is not valid JSON: ${message}. The current save is unchanged.`);
        return;
      }
      source = parsed;
    }
    if (source === null || source === undefined) {
      showError('Choose a file or paste a bundle first. The current save is unchanged.');
      return;
    }

    importBusy = true;
    importApply.disabled = true;
    try {
      const result = await callbacks.onImport(source);
      if (!result.ok) {
        showError(result.error);
        return;
      }
      importDone = true;
      status.textContent = 'Save imported. Reloading the world…';
      paste.value = '';
      if (fileInput.files) fileInput.value = '';
    } finally {
      importBusy = false;
      importApply.disabled = importDone;
    }
  }

  importApply.addEventListener('click', () => {
    void runImport(paste.value.trim() === '' ? (fileInput.files?.[0] ?? null) : paste.value);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    paste.value = '';
    void file
      .text()
      .then((text) => runImport(text))
      .catch((readError: unknown) => {
        const message = readError instanceof Error ? readError.message : String(readError);
        showError(`Could not read that file: ${message}. The current save is unchanged.`);
      });
  });

  function update(view: TitleView): void {
    continueButton.disabled = !view.hasSave;
    exportButton.disabled = !view.hasSave;
    const subjectCopy = view.subjectCount === 1 ? '1 subject' : `${view.subjectCount} subjects`;
    status.textContent = view.hasSave
      ? `${subjectCopy} saved · quest: ${questStepLabel(view.questStep)} · archetype: ${view.playerClass ?? 'not chosen'}`
      : 'No save yet. New game seeds three demo subjects and asks for an archetype.';
    archetypeSection.hidden = !view.showArchetypes;
    for (const [id, button] of archetypeButtons) {
      button.setAttribute('aria-pressed', String(view.playerClass === id));
    }
  }

  function trapTab(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const usable = visibleControls(root);
    if (usable.length === 0) return;
    const first = usable[0];
    const last = usable[usable.length - 1];
    const active = document.activeElement;
    if (active === heading) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  root.addEventListener('keydown', trapTab);

  return {
    update,
    showError,
    clearError,
    focusPrimary(): void {
      (continueButton.disabled ? newGame : continueButton).focus({ preventScroll: true });
    },
  };
}
