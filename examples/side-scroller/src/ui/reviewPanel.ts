import type { review } from '@/index';
import { RATING_OPTIONS, type RatingOption } from '../review/copy';

/**
 * DOM Archaeologist review panel (P5).
 *
 * The panel owns no machine and no commands: `main.ts` dispatches
 * `review/pass-complete`, `review/session-save`, and `review/session-discard`,
 * and the panel only renders what came back. It never imports the engine's
 * command layer.
 *
 * Learner material — the room topic and the generated self-check prompt — is
 * written as text nodes. The prompt is never logged, put in an attribute, or
 * announced verbatim through the live region; the host announces which control
 * was used instead.
 *
 * Keyboard: `0`–`5` choose a rating, `Enter` submits it, `S` saves for later,
 * `D` discards (twice: the first press arms the confirmation), `Escape` closes
 * without writing.
 */

export interface ReviewPanelView {
  room: { roomId: string; topic: string };
  prompt: string | null;
  passNumber: number;
  existingRating: review.QualityRating | null;
}

export interface ReviewPanelCallbacks {
  onPassComplete(rating: review.QualityRating): Promise<void>;
  onSaveForLater(rating: review.QualityRating | null): Promise<void>;
  onDiscard(): Promise<void>;
  onClose(): void;
}

export interface ReviewPanel {
  setPending(value: boolean): void;
  showError(message: string): void;
  showResult(message: string): void;
  close(): void;
  /**
   * Host extension to the frozen interface: a recorded pass disables the rating
   * controls so the same panel cannot submit a second time. Escape still closes.
   */
  markCompleted(): void;
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

function ratingButton(option: RatingOption): HTMLButtonElement {
  const node = element('button', {
    id: `review-rating-${option.rating}`,
    text: `${option.rating} · ${option.short}`,
  });
  node.type = 'button';
  node.setAttribute('aria-label', `${option.rating} — ${option.label}`);
  node.setAttribute('aria-pressed', 'false');
  node.title = option.label;
  return node;
}

export function mountReviewPanel(
  root: HTMLElement,
  view: ReviewPanelView,
  callbacks: ReviewPanelCallbacks,
): ReviewPanel {
  root.hidden = false;
  root.replaceChildren();

  let pending = false;
  let completed = false;
  let discardArmed = false;
  let selected: review.QualityRating | null = view.existingRating;

  const ratings = RATING_OPTIONS.map((option) => ({ option, button: ratingButton(option) }));

  const title = element('h2', { id: 'review-panel-title', text: `Review “${view.room.topic}”` });
  title.tabIndex = -1;

  const summary = element('dl', { id: 'review-summary' });
  summary.replaceChildren(
    ...row('Room', view.room.topic),
    ...row('Pass', String(view.passNumber)),
    ...row(
      'Previous rating',
      view.existingRating === null
        ? 'None chosen yet'
        : `${view.existingRating} · ${RATING_OPTIONS[view.existingRating].short}`,
    ),
  );

  const promptSection = element('section', { className: 'review-prompt', id: 'review-prompt' });
  promptSection.append(element('h3', { text: 'Self-check prompt' }));
  if (view.prompt) {
    promptSection.append(
      element('blockquote', { className: 'fishing-prompt', text: view.prompt }),
      element('p', {
        className: 'note-hint',
        text: 'Answer it to yourself, then rate how the recall felt. This is self-assessment, not a grade.',
      }),
    );
  } else {
    promptSection.append(
      element('p', {
        className: 'note-hint',
        text: 'No self-check prompt is available for this room. Review the topic from memory and rate the attempt.',
      }),
    );
  }

  const fieldset = element('fieldset', { className: 'review-ratings' });
  const legend = element('legend', { text: 'Rate your recall (0–5)' });
  const ratingRow = element('div', { className: 'review-rating-row' });
  for (const entry of ratings) ratingRow.append(entry.button);
  const ratingHint = element('p', {
    className: 'note-hint',
    text: 'Keys: 0–5 choose a rating · Enter submits · S saves for later · D discards · Escape closes.',
  });
  fieldset.append(legend, ratingRow, ratingHint);

  const submit = element('button', { id: 'review-submit', text: 'Submit rating' });
  submit.type = 'button';
  const save = element('button', { id: 'review-save', text: 'Save for later' });
  save.type = 'button';
  const discard = element('button', { id: 'review-discard', text: 'Discard saved review' });
  discard.type = 'button';
  const closeButton = element('button', { id: 'review-close', text: 'Close without writing' });
  closeButton.type = 'button';

  const actions = element('div', { className: 'note-actions' });
  actions.append(submit, save, discard, closeButton);

  const error = element('div', { id: 'review-error' });
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const feedback = element('div', { id: 'review-feedback' });
  feedback.setAttribute('role', 'status');
  feedback.setAttribute('aria-live', 'polite');
  feedback.setAttribute('aria-atomic', 'true');

  const result = element('div', { className: 'review-result', id: 'review-result' });
  result.hidden = true;

  const form = element('section', { className: 'note-form review-form' });
  form.append(title, summary, promptSection, fieldset, actions, error, feedback, result);
  root.append(form);

  function render(): void {
    for (const entry of ratings) {
      entry.button.disabled = pending || completed;
      entry.button.setAttribute('aria-pressed', entry.option.rating === selected ? 'true' : 'false');
    }
    submit.disabled = pending || completed || selected === null;
    save.disabled = pending || completed;
    discard.disabled = pending || completed;
    discard.textContent = discardArmed ? 'Confirm discard' : 'Discard saved review';
    closeButton.disabled = pending;
  }

  function choose(rating: review.QualityRating): void {
    if (pending || completed) return;
    selected = rating;
    discardArmed = false;
    render();
  }

  function setPending(value: boolean): void {
    pending = value;
    render();
    if (!value && (!document.activeElement || document.activeElement === document.body)) {
      const chosen = ratings.find((entry) => entry.option.rating === selected)?.button;
      (chosen ?? ratings[0].button).focus({ preventScroll: true });
    }
  }

  /**
   * Bring a result or error into view inside the panel.
   *
   * `scrollIntoView` also scrolls the document, which pushes the page header out
   * of the window; the panel is the only scroll container this modal owns, so
   * move its own scroll position instead.
   */
  function reveal(node: HTMLElement): void {
    root.scrollTop = Math.max(0, node.offsetTop - root.clientHeight / 2);
  }

  function showError(message: string): void {
    error.textContent = message;
    error.hidden = false;
    feedback.replaceChildren();
    reveal(error);
  }

  function showResult(message: string): void {
    result.replaceChildren(element('h3', { text: 'Result' }), element('p', { text: message }));
    result.hidden = false;
    error.hidden = true;
    error.textContent = '';
    reveal(result);
  }

  function runPass(): void {
    if (pending || completed || selected === null) return;
    setPending(true);
    error.hidden = true;
    void callbacks.onPassComplete(selected).finally(() => setPending(false));
  }

  function runSave(): void {
    if (pending || completed) return;
    setPending(true);
    error.hidden = true;
    void callbacks.onSaveForLater(selected).finally(() => setPending(false));
  }

  function runDiscard(): void {
    if (pending || completed) return;
    if (!discardArmed) {
      discardArmed = true;
      render();
      feedback.replaceChildren(
        element('p', {
          text: 'Press D or the confirm button again to discard the saved review. Escape cancels.',
        }),
      );
      return;
    }
    discardArmed = false;
    setPending(true);
    error.hidden = true;
    void callbacks.onDiscard().finally(() => setPending(false));
  }

  for (const entry of ratings) {
    entry.button.addEventListener('click', () => choose(entry.option.rating));
  }
  submit.addEventListener('click', runPass);
  save.addEventListener('click', runSave);
  discard.addEventListener('click', runDiscard);
  closeButton.addEventListener('click', () => {
    if (!pending) callbacks.onClose();
  });

  form.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (pending) return;
      if (discardArmed) {
        discardArmed = false;
        render();
        feedback.replaceChildren(element('p', { text: 'Discard cancelled.' }));
        return;
      }
      callbacks.onClose();
      return;
    }

    if (/^[0-5]$/.test(event.key)) {
      event.preventDefault();
      choose(Number(event.key) as review.QualityRating);
      return;
    }

    const onButton = event.target instanceof HTMLButtonElement;
    if (event.key === 'Enter') {
      // Enter on a rating button must submit the chosen rating, not re-click the
      // button. It only falls through to the button when the button is an action
      // (submit, save, discard, close), where its own click handler is the intent.
      const isActionButton =
        event.target === submit ||
        event.target === save ||
        event.target === discard ||
        event.target === closeButton;
      if (!onButton || !isActionButton) {
        event.preventDefault();
        runPass();
      }
      return;
    }
    if (event.key === 's' || event.key === 'S') {
      event.preventDefault();
      runSave();
      return;
    }
    if (event.key === 'd' || event.key === 'D') {
      event.preventDefault();
      runDiscard();
      return;
    }

    if (event.key !== 'Tab') return;
    const controls = [...ratings.map((entry) => entry.button), submit, save, discard, closeButton].filter(
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

  const panel: ReviewPanel = {
    setPending,
    showError,
    showResult,
    close() {
      root.hidden = true;
      root.replaceChildren();
    },
    markCompleted() {
      completed = true;
      pending = false;
      discardArmed = false;
      render();
      closeButton.focus({ preventScroll: true });
    },
  };

  render();
  const chosen = ratings.find((entry) => entry.option.rating === selected)?.button;
  (chosen ?? ratings[0].button).focus({ preventScroll: true });

  return panel;
}
