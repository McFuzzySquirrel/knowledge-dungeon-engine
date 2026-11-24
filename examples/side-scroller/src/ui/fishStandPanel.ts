import type { FishStandView } from '../village/projection';

/**
 * Fish Stand interior (P7).
 *
 * Display-only, deliberately: no engine command sells or trades a fish, so this
 * panel has no action control at all. The visible note says so instead of
 * offering a disabled "Sell" button that would read as a broken feature.
 */

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

/** Render the Fish Stand content slot from a committed projection. */
export function renderFishStand(view: FishStandView): HTMLElement {
  const root = element('div', { className: 'service-body' });
  const section = element('section', { className: 'service-section' });
  section.append(
    element('h3', { text: 'Fish collection' }),
    element('p', {
      className: 'service-notice',
      text: 'Selling and trading are not part of this build. The stand displays the fish you have kept.',
    }),
  );

  if (view.fish.length === 0) {
    section.append(element('p', { className: 'note-hint', text: view.emptyMessage }));
    root.append(section);
    return root;
  }

  const list = element('ul', { className: 'service-list' });
  for (const fish of view.fish) {
    list.append(
      element('li', {
        className: 'service-row',
        text: `${fish.name} — ${fish.rarity} — ${fish.subjectName}`,
      }),
    );
  }

  section.append(list);
  root.append(section);
  return root;
}
