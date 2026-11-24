import type { GuildView } from '../village/projection';

/**
 * Guild Hall interior (P7).
 *
 * The quest board and archetype come from `session`, and the roster is the
 * engine's subject list. The only write is the Guild Hall facade's own
 * `interactVillageStructure` call, which `main.ts` runs before this panel opens;
 * the panel itself never invents a quest or a reward.
 *
 * The "Open Creator" button preserves P6's second entry point to the Creator
 * (the street `C` shortcut is the first).
 */

export interface GuildPanelCallbacks {
  onOpenCreator(): void;
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

function questSection(view: GuildView): HTMLElement {
  const section = element('section', { className: 'service-section' });
  section.append(element('h3', { text: 'Quest board' }));
  const list = element('dl', { className: 'service-records' });
  list.append(
    element('dt', { text: 'Current step' }),
    element('dd', { text: view.questStep }),
    element('dt', { text: 'Next step' }),
    element('dd', { text: view.nextQuestStep }),
    element('dt', { text: 'Archetype' }),
    element('dd', {
      text: view.archetype ?? 'Not chosen yet — archetype selection arrives with the title screen.',
    }),
  );
  section.append(
    list,
    element('p', {
      className: 'note-hint',
      text: 'The Guild Hall advances the quest step when you use its door. Quests and rewards are the engine’s, not the host’s.',
    }),
  );
  return section;
}

function rosterSection(view: GuildView): HTMLElement {
  const section = element('section', { className: 'service-section' });
  section.append(element('h3', { text: 'Subject roster' }));

  if (view.subjects.length === 0) {
    section.append(element('p', { className: 'note-hint', text: view.emptyMessage }));
    return section;
  }

  const list = element('ul', { className: 'service-list' });
  for (const subject of view.subjects) {
    list.append(
      element('li', {
        className: `service-row${subject.active ? ' current' : ''}`,
        text: `${subject.subjectName} — ${subject.clearedCount} / ${subject.roomCount} rooms cleared${
          subject.active ? ' — active' : ''
        }`,
      }),
    );
  }
  section.append(list);
  return section;
}

/** Render the Guild Hall content slot from a committed projection. */
export function renderGuild(view: GuildView, callbacks: GuildPanelCallbacks): HTMLElement {
  const root = element('div', { className: 'service-body' });
  const creator = element('button', { id: 'guild-open-creator', text: 'Open Creator' });
  creator.type = 'button';
  creator.addEventListener('click', callbacks.onOpenCreator);

  const actions = element('div', { className: 'note-actions' });
  actions.append(creator);

  root.append(
    questSection(view),
    rosterSection(view),
    actions,
    element('p', {
      className: 'note-hint',
      text: 'The Creator edits the active subject. The street shortcut C opens it too.',
    }),
  );
  return root;
}
