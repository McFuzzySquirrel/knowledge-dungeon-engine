/**
 * Proximity prompt: the only visible hint that a room can be noted.
 *
 * The prompt is DOM, not canvas text, so it is selectable, focus-free, and
 * mirrored into the HUD's live region by the injected announcer. It never holds
 * learner data — the room topic comes from the engine projection.
 */

export interface PromptRoom {
  roomId: string;
  topic: string;
}

export interface Prompts {
  /** Show the prompt for a room, or hide it with `null`. `hidden` suppresses it while a modal is open. */
  setRoom(room: PromptRoom | null, hidden?: boolean): void;
  hide(): void;
  /** Announce a message through the host's polite live region. */
  announce(message: string): void;
}

export function createPrompts(host: HTMLElement, announceFn: (message: string) => void): Prompts {
  let current: PromptRoom | null = null;
  let suppressed = false;

  function render(): void {
    if (!current || suppressed) {
      host.hidden = true;
      host.replaceChildren();
      return;
    }

    const key = document.createElement('kbd');
    key.textContent = 'E';
    const text = document.createElement('span');
    text.textContent = ` write a note — ${current.topic}`;
    host.replaceChildren(key, text);
    host.hidden = false;
  }

  return {
    setRoom(room, hidden = false) {
      if (room?.roomId === current?.roomId && hidden === suppressed) return;
      current = room;
      suppressed = hidden;
      render();
    },
    hide() {
      current = null;
      suppressed = false;
      render();
    },
    announce(message) {
      announceFn(message);
    },
  };
}
