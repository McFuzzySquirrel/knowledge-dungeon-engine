/**
 * Keyboard and pond controls help (post-P8 polish).
 *
 * The always-visible key paragraph was long enough to push the side panel into
 * a scroll on small windows. The full map now lives in a focus-trapped popup
 * behind a Controls button and the `?` key; the page keeps one short hint so
 * the shortcut is still discoverable.
 */

export interface HelpPanelCallbacks {
  onClose(): void;
}

export interface HelpPanel {
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

/** One key cap, or a sequence such as `A` / `←`. */
function keys(...labels: string[]): HTMLElement {
  const wrapper = element('span', { className: 'help-keys' });
  labels.forEach((label, index) => {
    if (index > 0) wrapper.append(document.createTextNode(' / '));
    wrapper.append(element('kbd', { text: label }));
  });
  return wrapper;
}

function rows(entries: readonly (readonly [string, string[]])[]): HTMLElement {
  const list = element('dl', { className: 'service-records help-records' });
  for (const [action, labels] of entries) {
    list.append(element('dt', { text: action }), element('dd'));
    const value = list.lastElementChild;
    value?.append(keys(...labels));
  }
  return list;
}

function section(title: string, entries: readonly (readonly [string, string[]])[]): HTMLElement {
  const node = element('section', { className: 'service-section help-section' });
  node.append(element('h3', { text: title }), rows(entries));
  return node;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

function visibleControls(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (node) => !(node as HTMLButtonElement).disabled && !node.hidden,
  );
}

export function mountHelpPanel(
  root: HTMLElement,
  returnFocus: HTMLElement,
  callbacks: HelpPanelCallbacks,
): HelpPanel {
  root.hidden = false;
  root.replaceChildren();
  root.setAttribute('aria-labelledby', 'help-panel-title');
  root.setAttribute('aria-describedby', 'help-panel-subtitle');

  const header = element('header', { className: 'service-header help-header' });
  const title = element('h2', { id: 'help-panel-title', text: 'Controls' });
  title.tabIndex = -1;
  const subtitle = element('p', {
    id: 'help-panel-subtitle',
    className: 'note-hint',
    text: 'Keyboard and pointer controls. Press ? or Escape to close.',
  });
  const close = element('button', { id: 'help-close', text: 'Close' });
  close.type = 'button';
  close.addEventListener('click', callbacks.onClose);
  header.append(title, subtitle, close);

  const body = element('div', { className: 'help-body' });
  body.append(
    section('Move', [
      ['Walk', ['A', 'D', '←', '→']],
      ['Jump', ['Space']],
      ['Climb', ['W', 'S', '↑', '↓']],
    ]),
    section('Interact', [
      ['Door, service, villager, or note', ['E']],
      ['Creator', ['C']],
      ['Review', ['R']],
      ['Journal and settings', ['J']],
      ['Close a dialog or panel', ['Esc']],
      ['This help', ['?']],
    ]),
    section('Review', [
      ['Rate recall', ['0', '1', '2', '3', '4', '5']],
      ['Submit the rating', ['Enter']],
      ['Save for later', ['S']],
      ['Discard the saved review', ['D']],
    ]),
    section('Pond', [
      ['Charge the cast', ['Hold Space']],
      ['Cast', ['Release Space']],
      ['Reel in at a bite', ['Space']],
      ['Leave the pond', ['Esc']],
    ]),
    section('World', [
      ['Street and dungeon', ['One world']],
      ['Return to the street', ['Climb the entrance shaft']],
    ]),
  );

  const form = element('div', { className: 'help-form' });
  form.append(header, body);
  root.append(form);

  function onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape' || event.key === '?' || event.code === 'Slash') {
      if (event.code === 'Slash' && !event.shiftKey) return;
      event.preventDefault();
      event.stopPropagation();
      callbacks.onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const usable = visibleControls(root);
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

  root.addEventListener('keydown', onKeyDown);
  title.focus({ preventScroll: true });

  return {
    close() {
      root.hidden = true;
      root.replaceChildren();
      returnFocus.focus({ preventScroll: true });
    },
  };
}
