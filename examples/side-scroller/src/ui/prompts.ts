/**
 * Proximity prompt: the only visible hint that a room can be noted or a surface
 * structure can be used.
 *
 * The prompt is DOM, not canvas text, so it is selectable, focus-free, and
 * mirrored into the HUD's live region by the injected announcer. It never holds
 * learner data — labels and topics come from the engine projection.
 */

export interface PromptRoom {
  roomId: string;
  topic: string;
}

/** P3: a surface facade the player is standing near. */
export interface PromptTarget {
  id: string;
  /** Verb shown after the `E` key, e.g. `enter` or `visit`. */
  action: string;
  label: string;
}

interface ActivePrompt {
  key: string;
  action: string;
  label: string;
}

export interface Prompts {
  /** Show the prompt for a room, or hide it with `null`. `hidden` suppresses it while a modal is open. */
  setRoom(room: PromptRoom | null, hidden?: boolean): void;
  /** Show the prompt for a surface structure. */
  setTarget(target: PromptTarget | null, hidden?: boolean): void;
  hide(): void;
  /** Announce a message through the host's polite live region. */
  announce(message: string): void;
}

export function createPrompts(host: HTMLElement, announceFn: (message: string) => void): Prompts {
  let current: ActivePrompt | null = null;
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
    text.textContent = ` ${current.action} — ${current.label}`;
    host.replaceChildren(key, text);
    host.hidden = false;
  }

  function set(next: ActivePrompt | null, hidden: boolean): void {
    if (next?.key === current?.key && hidden === suppressed) return;
    current = next;
    suppressed = hidden;
    render();
  }

  return {
    setRoom(room, hidden = false) {
      set(
        room ? { key: `room:${room.roomId}`, action: 'write a note', label: room.topic } : null,
        hidden,
      );
    },
    setTarget(target, hidden = false) {
      set(
        target ? { key: `target:${target.id}`, action: target.action, label: target.label } : null,
        hidden,
      );
    },
    hide() {
      set(null, false);
    },
    announce(message) {
      announceFn(message);
    },
  };
}
