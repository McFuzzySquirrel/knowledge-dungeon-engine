import type { DungeonView } from '../projection';

/**
 * DOM HUD. Canvas is not accessible, so progress, room status, and command
 * outcomes are mirrored as real text in the side panel and a live region.
 */

export interface HudElements {
  summary: HTMLElement;
  rooms: HTMLElement;
  status: HTMLElement;
  error: HTMLElement;
}

export interface Hud {
  update(view: DungeonView | null, activeRoomId: string | null): void;
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

export function createHud(elements: HudElements): Hud {
  return {
    update(view, activeRoomId) {
      if (!view) {
        elements.summary.replaceChildren(...row('Subject', 'None — start the tutorial'));
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
      ];
      elements.summary.replaceChildren(...rows.flatMap(([term, value]) => row(term, value)));

      elements.rooms.replaceChildren(
        ...view.rooms.map((room) =>
          roomItem(`${room.topic} — ${room.statusLabel}`, room.cleared, room.roomId === activeRoomId),
        ),
      );
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
