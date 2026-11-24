import type { TrophyView } from '../village/projection';

/**
 * Trophy Hall interior (P7).
 *
 * Read-only by design: badges, the fish collection, and the engine's statistics
 * metrics. Every row is labelled with text; nothing relies on colour, and a
 * fresh save shows real zeroes rather than an error.
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

function badgesSection(view: TrophyView): HTMLElement {
  const section = element('section', { className: 'service-section' });
  section.append(element('h3', { text: 'Badges' }));

  if (view.badges.length === 0) {
    section.append(
      element('p', {
        className: 'note-hint',
        text: 'No badges yet. Clearing rooms, passing reviews, and keeping fish unlock them; achievements appear here too.',
      }),
    );
    return section;
  }

  const list = element('ul', { className: 'service-list' });
  for (const badge of view.badges) {
    list.append(element('li', { className: 'service-row', text: badge }));
  }
  section.append(list);
  return section;
}

function fishSection(view: TrophyView): HTMLElement {
  const section = element('section', { className: 'service-section' });
  section.append(element('h3', { text: 'Fish collection' }));

  if (view.fish.length === 0) {
    section.append(element('p', { className: 'note-hint', text: view.fishEmptyMessage }));
    return section;
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
  return section;
}

function recordsSection(view: TrophyView): HTMLElement {
  const section = element('section', { className: 'service-section' });
  section.append(
    element('h3', { text: 'Records' }),
    element('p', {
      className: 'note-hint',
      text: 'Device totals from the engine’s statistics. A fresh save reports zero, not an error.',
    }),
  );

  const list = element('dl', { className: 'service-records' });
  for (const metric of view.metrics) {
    list.append(element('dt', { text: metric.label }), element('dd', { text: metric.value }));
  }
  section.append(list);
  return section;
}

/** Render the Trophy Hall content slot from a committed projection. */
export function renderTrophy(view: TrophyView): HTMLElement {
  const root = element('div', { className: 'service-body' });
  root.append(badgesSection(view), fishSection(view), recordsSection(view));
  return root;
}
