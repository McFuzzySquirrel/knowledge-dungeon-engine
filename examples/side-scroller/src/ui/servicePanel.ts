import type { ServiceShellView } from '../village/projection';

/**
 * DOM service shell (P7).
 *
 * One modal for every village interior. It owns the title, subtitle, content
 * slot, the error/result regions, the focus trap, and focus return. The content
 * is supplied by a panel renderer that never imports the engine; `main.ts`
 * owns every command.
 *
 * Keyboard: `Tab`/`Shift+Tab` cycle inside, `Escape` closes. The shell is
 * `aria-modal` and names itself with its own title.
 */

export interface ServicePanelCallbacks {
  onClose(): void;
}

export interface ServicePanelMountOptions {
  root: HTMLElement;
  shell: ServiceShellView;
  content: HTMLElement;
  /** Focus target after close; the canvas in the running host. */
  returnFocus: HTMLElement;
  callbacks: ServicePanelCallbacks;
}

export interface ServicePanel {
  /** Re-render the content slot from committed state. */
  update(content: HTMLElement): void;
  /** Disable every control while one command is in flight. */
  setPending(value: boolean): void;
  showError(message: string): void;
  showResult(message: string): void;
  /** Hide the shell, empty it, and return focus. */
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

const FOCUSABLE =
  'button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])';

function visibleControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) =>
      !(node as HTMLButtonElement).disabled &&
      !node.hidden &&
      node.closest('[hidden]') === null,
  );
}

export function mountServicePanel(options: ServicePanelMountOptions): ServicePanel {
  const { root, shell, returnFocus, callbacks } = options;
  root.hidden = false;
  root.replaceChildren();
  root.setAttribute('aria-labelledby', 'service-panel-title');
  root.setAttribute('aria-describedby', 'service-panel-subtitle');

  let pending = false;
  let pendingFocusId = '';

  const title = element('h2', { id: 'service-panel-title', text: shell.title });
  title.tabIndex = -1;

  const subtitle = element('p', {
    id: 'service-panel-subtitle',
    className: 'note-hint',
    text: shell.subtitle,
  });

  const closeButton = element('button', { id: 'service-close', text: 'Close' });
  closeButton.type = 'button';
  closeButton.addEventListener('click', () => {
    if (!pending) callbacks.onClose();
  });

  const header = element('header', { className: 'service-header' });
  header.append(title, subtitle, closeButton);

  const contentSlot = element('div', { id: 'service-content', className: 'service-content' });
  contentSlot.append(options.content);

  const error = element('div', { id: 'service-error' });
  error.setAttribute('role', 'alert');
  error.hidden = true;

  const result = element('div', { id: 'service-result', className: 'creator-result' });
  result.setAttribute('role', 'status');
  result.setAttribute('aria-live', 'polite');
  result.setAttribute('aria-atomic', 'true');
  result.hidden = true;

  const form = element('section', { className: 'note-form service-form' });
  form.append(header, contentSlot, error, result);

  function renderPending(): void {
    for (const node of form.querySelectorAll<HTMLButtonElement>('button')) {
      node.disabled = pending;
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!pending) callbacks.onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const usable = visibleControls(form).filter((node) => !(node as HTMLButtonElement).disabled);
    if (usable.length === 0) return;
    const first = usable[0];
    const last = usable[usable.length - 1];
    const active = document.activeElement;
    if (active === title) {
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

  form.addEventListener('keydown', onKeyDown);
  root.append(form);

  function focusById(id: string): boolean {
    const match = [...root.querySelectorAll<HTMLElement>('[id]')].find((node) => node.id === id);
    if (!match || (match as HTMLButtonElement).disabled) return false;
    match.focus({ preventScroll: true });
    return true;
  }

  title.focus({ preventScroll: true });

  return {
    update(content) {
      const active = document.activeElement;
      const activeId = active instanceof HTMLElement ? active.id : '';
      const scrollTop = root.scrollTop;
      contentSlot.replaceChildren(content);
      root.scrollTop = scrollTop;
      renderPending();
      if (!pending && activeId && focusById(activeId)) return;
      if (!pending && (!document.activeElement || !root.contains(document.activeElement))) {
        title.focus({ preventScroll: true });
      }
    },
    setPending(value) {
      if (value) {
        const active = document.activeElement;
        pendingFocusId = active instanceof HTMLElement ? active.id : '';
      }
      pending = value;
      renderPending();
      if (!value) {
        const target = pendingFocusId;
        pendingFocusId = '';
        if (!target || !focusById(target)) {
          if (!document.activeElement || !root.contains(document.activeElement)) {
            title.focus({ preventScroll: true });
          }
        }
      }
    },
    showError(message) {
      error.textContent = message;
      error.hidden = false;
      result.hidden = true;
      result.textContent = '';
      root.scrollTop = Math.max(0, error.offsetTop - root.clientHeight / 2);
    },
    showResult(message) {
      result.textContent = message;
      result.hidden = false;
      error.hidden = true;
      error.textContent = '';
      root.scrollTop = Math.max(0, result.offsetTop - root.clientHeight / 2);
    },
    close() {
      root.hidden = true;
      root.replaceChildren();
      returnFocus.focus({ preventScroll: true });
    },
  };
}
