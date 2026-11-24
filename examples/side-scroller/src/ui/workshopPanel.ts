import type { WorkshopView } from '../village/projection';

/**
 * Artisan Workshop interior (P7).
 *
 * The panel renders the committed equipment view and reports intents. `main.ts`
 * calls `engine.equipItem` / `engine.unequipItem`; the panel never imports the
 * engine and never mutates its copy. A rejected write leaves the previous view
 * on screen and the host shows "Not saved".
 */

export interface WorkshopPanelCallbacks {
  onEquip(itemId: string): void;
  onUnequip(itemId: string): void;
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

function actionButton(text: string, id: string, onClick: () => void): HTMLButtonElement {
  const node = element('button', { text, id });
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

/** Render the Workshop content slot from a committed projection. */
export function renderWorkshop(view: WorkshopView, callbacks: WorkshopPanelCallbacks): HTMLElement {
  const root = element('div', { className: 'service-body' });
  const section = element('section', { className: 'service-section' });
  section.append(
    element('h3', {
      text: view.subjectName ? `Inventory — ${view.subjectName}` : 'Inventory',
    }),
    element('p', {
      className: 'note-hint',
      text: 'Equipment is stored per subject. Equip or unequip one item at a time; changes are saved through the engine and survive a reload.',
    }),
  );

  if (!view.subjectId || view.items.length === 0) {
    section.append(element('p', { className: 'note-hint', text: view.emptyMessage }));
    root.append(section);
    return root;
  }

  const list = element('ul', { className: 'service-list' });
  for (const item of view.items) {
    const row = element('li', { className: 'service-row' });
    const label = `${item.name} — ${item.rarity}${item.slot ? ` — ${item.slot}` : ''}`;
    row.append(element('span', { text: label }));

    if (!item.equippable) {
      row.append(element('span', { className: 'note-hint', text: 'Not equippable' }));
    } else if (item.equipped) {
      row.append(
        actionButton('Unequip', `workshop-unequip-${item.id}`, () => callbacks.onUnequip(item.id)),
      );
    } else {
      row.append(actionButton('Equip', `workshop-equip-${item.id}`, () => callbacks.onEquip(item.id)));
    }
    list.append(row);
  }

  section.append(list);
  root.append(section);
  return root;
}
