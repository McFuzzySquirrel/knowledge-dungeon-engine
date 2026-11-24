import type { DungeonView, FishingView, SurfaceView } from '../projection';

/**
 * DOM HUD. Canvas is not accessible, so progress, room status, surface
 * structures, and command outcomes are mirrored as real text in the side panel
 * and a live region.
 */

export interface HudElements {
  summary: HTMLElement;
  rooms: HTMLElement;
  roomsTitle: HTMLElement;
  status: HTMLElement;
  error: HTMLElement;
}

export interface Hud {
  updateDungeon(view: DungeonView | null, activeRoomId: string | null): void;
  updateSurface(view: SurfaceView | null, activeInteractableId: string | null): void;
  updateFishing(view: FishingView | null, phase: string, hint: string): void;
  announce(message: string): void;
  showError(message: string): void;
  clearError(): void;
}

function row(term: string, value: string): [HTMLElement, HTMLElement] {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  return [dt, dd];
}

function roomItem(label: string, cleared: boolean, current: boolean): HTMLLIElement {
  const item = document.createElement('li');
  item.className = current ? 'room current' : 'room';
  if (current) item.setAttribute('aria-current', 'true');

  const marker = document.createElement('span');
  marker.className = 'marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = cleared ? '✓' : '○';

  const text = document.createElement('span');
  text.textContent = `${label}${current ? ' — you are here' : ''}`;

  item.append(marker, text);
  return item;
}

function surfaceItem(entry: SurfaceView['entries'][number], current: boolean): HTMLLIElement {
  const item = document.createElement('li');
  item.className = current ? 'room current' : 'room';
  if (current) item.setAttribute('aria-current', 'true');

  const marker = document.createElement('span');
  marker.className = 'marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.textContent = entry.portal ? '◆' : '▸';

  const text = document.createElement('span');
  const suffix = current ? ' — you are here' : '';
  const detail = entry.detail.trim();
  const redundant =
    detail.length === 0 || entry.label.toLowerCase().includes(detail.toLowerCase());
  text.textContent = `${redundant ? entry.label : `${entry.label} — ${entry.detail}`}${suffix}`;

  item.append(marker, text);
  return item;
}

export function createHud(elements: HudElements): Hud {
  return {
    updateDungeon(view, activeRoomId) {
      elements.roomsTitle.textContent = 'Rooms';
      if (!view) {
        elements.summary.replaceChildren(...row('Location', 'Unknown — no active dungeon'));
        elements.rooms.replaceChildren();
        return;
      }

      const current = view.rooms.find((room) => room.roomId === activeRoomId);
      const rows = [
        ['Subject', view.subjectName],
        ['World', `${view.world} · ${view.phase}`],
        ['XP', String(view.xp)],
        ['Rank', view.rank],
        ['Rooms cleared', `${view.clearedCount} / ${view.totalRooms}`],
        ['Current room', current ? current.topic : 'Between rooms'],
        ['Study session', view.studySessionOpen ? 'active' : 'closed'],
        ['Visited this session', String(view.visits.length)],
        ['Reviews due', view.dueRooms === 1 ? '1 room' : `${view.dueRooms} rooms`],
        ['Review pass', String(view.nextPassNumber)],
        [
          'Review mode',
          view.reviewUnlocked ? 'unlocked' : 'locked — clear every room encounter',
        ],
      ];
      elements.summary.replaceChildren(...rows.flatMap(([term, value]) => row(term, value)));

      elements.rooms.replaceChildren(
        ...view.rooms.map((room) =>
          roomItem(`${room.topic} — ${room.statusLabel}`, room.cleared, room.roomId === activeRoomId),
        ),
      );
    },

    updateSurface(view, activeInteractableId) {
      elements.roomsTitle.textContent = 'Places';
      if (!view) {
        elements.summary.replaceChildren(...row('Location', 'Unknown — surface unavailable'));
        elements.rooms.replaceChildren();
        return;
      }

      const current = view.entries.find((entry) => entry.id === activeInteractableId);
      const rows = [
        ['Location', 'Village street'],
        ['Phase', view.phase],
        ['Subject portals', view.portalCount === 1 ? '1 portal' : `${view.portalCount} portals`],
        ['Rooms cleared (all portals)', `${view.clearedRooms} / ${view.totalRooms}`],
        ['XP (all subjects)', String(view.xpTotal)],
        ['Nearby', current ? current.label : 'Nothing in reach'],
      ];
      elements.summary.replaceChildren(...rows.flatMap(([term, value]) => row(term, value)));

      elements.rooms.replaceChildren(
        ...view.entries.map((entry) => surfaceItem(entry, entry.id === activeInteractableId)),
      );
    },

    updateFishing(view, phase, hint) {
      elements.roomsTitle.textContent = 'Pond';
      if (!view) {
        elements.summary.replaceChildren(...row('Location', 'Unknown — no pond session'));
        elements.rooms.replaceChildren();
        return;
      }

      const rows = [
        ['Location', 'Fishing pond'],
        ['Subject', view.subjectName],
        ['World', `fishing · ${phase}`],
        ['XP', String(view.xp)],
        ['Rank', view.rank],
        ['Rooms cleared', `${view.clearedCount} / ${view.totalRooms}`],
        [
          'Fish collection',
          view.collection.length === 1 ? '1 fish' : `${view.collection.length} fish`,
        ],
        ['Pond session', 'active'],
      ];
      elements.summary.replaceChildren(...rows.flatMap(([term, value]) => row(term, value)));

      const items: HTMLLIElement[] = [];
      const hintItem = document.createElement('li');
      hintItem.className = 'room';
      const hintMarker = document.createElement('span');
      hintMarker.className = 'marker';
      hintMarker.setAttribute('aria-hidden', 'true');
      hintMarker.textContent = '▸';
      const hintText = document.createElement('span');
      hintText.textContent = hint;
      hintItem.append(hintMarker, hintText);
      items.push(hintItem);

      for (const fish of view.collection.slice(0, 8)) {
        const item = document.createElement('li');
        item.className = 'room';
        const marker = document.createElement('span');
        marker.className = 'marker';
        marker.setAttribute('aria-hidden', 'true');
        marker.textContent = '◆';
        const text = document.createElement('span');
        text.textContent = `${fish.name} — ${fish.rarity}`;
        item.append(marker, text);
        items.push(item);
      }
      elements.rooms.replaceChildren(...items);
    },

    announce(message) {
      elements.status.textContent = message;
    },

    showError(message) {
      elements.error.textContent = message;
      elements.error.hidden = false;
    },

    clearError() {
      elements.error.hidden = true;
      elements.error.textContent = '';
    },
  };
}
