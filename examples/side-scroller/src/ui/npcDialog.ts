/**
 * NPC dialogue bubble (P7).
 *
 * The line is authored content selected by the engine's `selectVillageNpcLine`.
 * It is written as a text node in a non-live region: the host announces only
 * "The Wandering Scholar speaks", never the line itself, so a screen reader is
 * not handed a quote out of context and nothing is logged.
 *
 * The bubble is not modal. Movement keeps working; Escape or walking away
 * closes it, and each `E` press advances the engine's cursor.
 */

export interface NpcDialogView {
  label: string;
  line: string;
}

export interface NpcDialog {
  update(view: NpcDialogView): void;
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

export function mountNpcDialog(
  host: HTMLElement,
  initial: NpcDialogView,
  onClose: () => void,
): NpcDialog {
  host.hidden = false;
  host.replaceChildren();

  const title = element('strong', { id: 'npc-dialogue-label', text: initial.label });
  const line = element('span', { id: 'npc-dialogue-line', text: initial.line });
  const close = element('button', { id: 'npc-dialogue-close', text: 'Close' });
  close.type = 'button';
  close.addEventListener('click', onClose);

  const body = element('p', { className: 'npc-dialogue-body' });
  body.append(line);
  host.replaceChildren(title, body, close);

  return {
    update(view) {
      title.textContent = view.label;
      line.textContent = view.line;
    },
    close() {
      host.hidden = true;
      host.replaceChildren();
    },
  };
}
