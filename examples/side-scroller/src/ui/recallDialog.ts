import type { RecallOutcome } from '../fishing/bridge';

/**
 * Fish-on-the-line dialog.
 *
 * Renders the caught fish and, when the engine supplied one, the recall question
 * that came from a cleared room. The question text is learner material: it is
 * written as a text node and never logged, echoed into the live region, or put in
 * an attribute.
 *
 * The dialog owns focus while open and returns it through `onClose`; the host
 * decides where focus goes (the canvas).
 */

export interface CaughtFishView {
  name: string;
  rarity: string;
  description: string;
}

export interface RecallQuestionView {
  roomId: string;
  text: string;
}

export interface RecallDialogCallbacks {
  onKeep(recall: RecallOutcome): Promise<void>;
  onRelease(): Promise<void>;
  onClose(): void;
}

export interface RecallDialog {
  setPending(value: boolean): void;
  showError(message: string): void;
  showStatus(message: string): void;
  close(): void;
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

function row(term: string, value: string): [HTMLElement, HTMLElement] {
  return [element('dt', { text: term }), element('dd', { text: value })];
}

export function mountRecallDialog(
  root: HTMLElement,
  input: {
    fish: CaughtFishView;
    question: RecallQuestionView | null;
  },
  callbacks: RecallDialogCallbacks,
): RecallDialog {
  root.hidden = false;
  root.replaceChildren();

  let pending = false;

  const title = element('h2', { id: 'fishing-panel-title', text: 'Fish on the line' });
  title.tabIndex = -1;

  const summary = element('dl', { id: 'fishing-fish' });
  summary.replaceChildren(
    ...row('Fish', input.fish.name),
    ...row('Rarity', input.fish.rarity),
  );

  const description = element('p', { className: 'note-hint', text: input.fish.description });

  const buttons: HTMLButtonElement[] = [];
  const button = (id: string, label: string): HTMLButtonElement => {
    const node = element('button', { id, text: label });
    node.type = 'button';
    buttons.push(node);
    return node;
  };

  const actions = element('div', { className: 'note-actions' });

  const keepCorrect = input.question
    ? button('fishing-answered-correct', 'I answered correctly — keep fish')
    : null;
  const keepIncorrect = input.question
    ? button('fishing-answered-incorrect', 'I could not recall — return fish')
    : null;
  const keepWithoutRecall = input.question
    ? null
    : button('fishing-keep-without-recall', 'Keep fish without recall');
  const release = button('fishing-release', 'Release fish');
  const later = button('fishing-later', 'Decide later');

  const recall = element('section', { className: 'fishing-recall', id: 'fishing-recall' });
  if (input.question) {
    recall.append(
      element('h3', { text: 'Recall check' }),
      element('p', {
        className: 'note-hint',
        text: 'From one of your cleared rooms. Answer it to yourself before choosing.',
      }),
      element('blockquote', {
        className: 'fishing-prompt',
        text: input.question.text,
      }),
    );
  } else {
    recall.append(
      element('h3', { text: 'No recall question' }),
      element('p', {
        className: 'note-hint',
        text: 'This subject has no cleared-room question to draw on. The fish can still be kept, but it pays no XP.',
      }),
    );
  }

  const error = element('div', { id: 'fishing-error' });
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const feedback = element('div', { id: 'fishing-feedback' });
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.setAttribute('aria-atomic', 'true');

  if (keepCorrect) actions.append(keepCorrect);
  if (keepIncorrect) actions.append(keepIncorrect);
  if (keepWithoutRecall) actions.append(keepWithoutRecall);
  actions.append(release, later);

  const form = element('div', { className: 'note-form fishing-form' });
  form.append(title, summary, description, recall, actions, error, feedback);
  root.append(form);

  function setPending(value: boolean): void {
    pending = value;
    for (const node of buttons) node.disabled = value;
    if (!value) {
      // Disabling a focused button moves focus to the body in some browsers.
      // Put it back on the first action so a failed save can be retried with the
      // keyboard.
      const active = document.activeElement;
      if (!active || active === document.body) {
        buttons.find((node) => !node.disabled)?.focus({ preventScroll: true });
      }
    }
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
    feedback.replaceChildren();
  }

  function showStatus(message: string): void {
    feedback.replaceChildren(element('p', { text: message }));
  }

  function finish(work: () => Promise<void>): void {
    if (pending) return;
    setPending(true);
    void work().finally(() => {
      // A successful keep/release closes the dialog through the host; a failure
      // keeps it open so the learner can retry or release instead.
      if (!dialog.closed) setPending(false);
    });
  }

  if (keepCorrect && input.question) {
    keepCorrect.addEventListener('click', () => {
      finish(() => callbacks.onKeep({ kind: 'answered-correct', roomId: input.question!.roomId }));
    });
  }
  if (keepIncorrect && input.question) {
    keepIncorrect.addEventListener('click', () => {
      finish(() => callbacks.onKeep({ kind: 'answered-incorrect', roomId: input.question!.roomId }));
    });
  }
  if (keepWithoutRecall) {
    keepWithoutRecall.addEventListener('click', () => {
      finish(() => callbacks.onKeep({ kind: 'kept-without-recall' }));
    });
  }
  release.addEventListener('click', () => {
    finish(() => callbacks.onRelease());
  });
  later.addEventListener('click', () => {
    if (!pending) callbacks.onClose();
  });

  // `aria-modal` promises focus stays inside. Cycle Tab/Shift+Tab within the
  // dialog; leave Escape to the host's key handler so it can restore the canvas.
  form.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = buttons.filter((node) => !node.disabled);
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

  (keepCorrect ?? keepWithoutRecall ?? release).focus({ preventScroll: true });

  const dialog: RecallDialog & { closed: boolean } = {
    closed: false,
    setPending,
    showError,
    showStatus,
    close() {
      dialog.closed = true;
      root.hidden = true;
      root.replaceChildren();
    },
  };
  return dialog;
}
