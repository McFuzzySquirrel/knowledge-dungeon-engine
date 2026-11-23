import type { EncounterNoteClearOutcome } from '@/application/encounterCommands';
import type { NoteValidationOutput } from '@/core/validation/notes';
import { clearSummary, draftSummary } from './outcomes';

/**
 * DOM note composer.
 *
 * The panel is deliberately dumb: it renders a room, collects text and the
 * learner's own confirmation, and hands both to the host's callbacks. It never
 * imports the engine, never calls a command, and never treats a pending submit as
 * committed. Learner text stays in the `<textarea>`/`<pre>` as text nodes.
 */

export interface NotePanelCallbacks {
  onSubmit(input: { roomId: string; noteText: string; manualConfirmed: boolean }): Promise<void>;
  onCollectArtifact(roomId: string): Promise<void>;
  onClose(): void;
}

export interface NotePanel {
  setPending(value: boolean): void;
  showDraft(validation: NoteValidationOutput): void;
  showCleared(outcome: EncounterNoteClearOutcome): void;
  showError(message: string): void;
  /** Host extension to the frozen interface: a neutral status line (artifact taken). */
  showStatus(message: string): void;
  close(): void;
}

const SECTION_TEMPLATE = ['Summary', '', 'Key Points', '', 'Recall Question', ''].join('\n');

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: { className?: string; text?: string; id?: string; type?: string } = {},
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  if (props.type && node instanceof HTMLButtonElement) node.type = props.type as 'button' | 'submit';
  return node;
}

function list(lines: readonly string[]): HTMLUListElement {
  const box = element('ul', { className: 'note-lines' });
  box.replaceChildren(
    ...lines.map((line) => {
      const item = element('li', { text: line });
      return item;
    }),
  );
  return box;
}

function definitionRow(term: string, value: string): [HTMLElement, HTMLElement] {
  const dt = element('dt', { text: term });
  const dd = element('dd', { text: value });
  return [dt, dd];
}

export function mountNotePanel(
  root: HTMLElement,
  room: { roomId: string; topic: string },
  callbacks: NotePanelCallbacks,
): NotePanel {
  root.hidden = false;
  root.replaceChildren();

  let pending = false;

  const title = element('h2', { id: 'note-panel-title', text: `Note for “${room.topic}”` });
  title.tabIndex = -1;

  const hint = element('p', {
    className: 'note-hint',
    id: 'note-template-hint',
    text:
      'Required sections: Summary, Key Points, and Recall Question. Keep the headings on their own lines. ' +
      'A recall question should end with a question mark.',
  });

  const label = element('label', { text: 'Your notes', });
  label.htmlFor = 'note-text';

  const textarea = element('textarea', { id: 'note-text' });
  textarea.value = SECTION_TEMPLATE;
  textarea.rows = 12;
  textarea.spellcheck = true;
  textarea.setAttribute('aria-describedby', 'note-template-hint note-feedback');

  const confirmLabel = element('label', { className: 'note-confirm' });
  const confirm = element('input');
  confirm.type = 'checkbox';
  confirm.id = 'note-confirmed';
  const confirmText = element('span', {
    text: ' I wrote these notes myself and I am ready to submit them.',
  });
  confirmLabel.append(confirm, confirmText);

  const submit = element('button', { id: 'note-submit', text: 'Submit note', type: 'submit' });
  const closeButton = element('button', { id: 'note-close', text: 'Close', type: 'button' });

  const actions = element('div', { className: 'note-actions' });
  actions.append(submit, closeButton);

  const error = element('div', { id: 'note-error' });
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const feedback = element('div', { id: 'note-feedback' });
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.setAttribute('aria-atomic', 'true');

  const outcome = element('section', { className: 'note-outcome', id: 'note-outcome' });
  outcome.hidden = true;
  const outcomeTitle = element('h3', { text: 'Clear result' });
  const outcomeSummary = element('dl', { id: 'note-outcome-summary' });
  const artifactTitle = element('h3', { text: 'Artifact (plain text)' });
  const artifact = element('pre', { id: 'note-artifact' });
  const collect = element('button', { id: 'note-collect', text: 'Take artifact', type: 'button' });
  const collectActions = element('div', { className: 'note-actions' });
  collectActions.append(collect);
  outcome.append(outcomeTitle, outcomeSummary, artifactTitle, artifact, collectActions);

  const form = element('form', { className: 'note-form' });
  form.noValidate = true;
  form.append(title, hint, label, textarea, confirmLabel, actions, error, feedback, outcome);

  root.append(form);

  function setPending(value: boolean): void {
    pending = value;
    submit.disabled = value;
    closeButton.disabled = value;
    collect.disabled = value;
    if (value) {
      error.hidden = true;
      error.textContent = '';
      return;
    }
    // After a clear/collect settles, move focus to the next action so a keyboard
    // user lands on "Take artifact" without hunting through the form.
    if (!outcome.hidden) collect.focus({ preventScroll: true });
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
  }

  function showStatus(message: string): void {
    feedback.replaceChildren(element('p', { text: message }));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (pending) return;
    void callbacks.onSubmit({
      roomId: room.roomId,
      noteText: textarea.value,
      manualConfirmed: confirm.checked,
    });
  });

  // `aria-modal` promises focus stays inside. Cycle Tab/Shift+Tab within the
  // composer instead of leaking into the page behind it.
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [textarea, confirm, submit, closeButton, collect].filter(
      (node) => !node.disabled && node.closest('[hidden]') === null,
    );
    if (controls.length === 0) return;
    const first = controls[0];
    const last = controls[controls.length - 1];
    const active = document.activeElement;
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  });

  closeButton.addEventListener('click', () => {
    if (pending) return;
    callbacks.onClose();
  });

  collect.addEventListener('click', () => {
    if (pending) return;
    setPending(true);
    showStatus('Collecting artifact…');
    void callbacks
      .onCollectArtifact(room.roomId)
      .finally(() => setPending(false));
  });

  // Focus the writing surface on open; the host returns focus on close.
  textarea.focus({ preventScroll: true });
  textarea.setSelectionRange(textarea.value.length, textarea.value.length);

  return {
    setPending,
    showDraft(validation) {
      outcome.hidden = true;
      feedback.replaceChildren(list(draftSummary(validation)));
    },
    showCleared(result) {
      feedback.replaceChildren(list(clearSummary(result)));
      outcomeSummary.replaceChildren(
        ...definitionRow('XP gained', String(result.progression.xpGained)),
        ...definitionRow('Rank', result.progression.newRank),
        ...definitionRow('Quality bonus', `${result.validation.qualityBonus}/10`),
      );
      artifact.textContent = result.artifactMarkdown;
      outcome.hidden = false;
      collect.focus({ preventScroll: true });
    },
    showError,
    showStatus,
    close() {
      root.hidden = true;
      root.replaceChildren();
    },
  };
}
