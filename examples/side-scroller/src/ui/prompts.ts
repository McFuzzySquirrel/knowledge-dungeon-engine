/**
 * Proximity prompt: the only visible hint that a room can be noted or a surface
 * structure can be used.
 *
 * The prompt is DOM, not canvas text, so it is selectable, focus-free, and
 * mirrored into the HUD's live region by the injected announcer. It never holds
 * learner data — labels and topics come from the engine projection.
 *
 * P5 adds a second line for a cleared room: `R review` sits beside `E write a
 * note`, so the two actions are distinguishable before either is pressed.
 */

export interface PromptRoom {
  roomId: string;
  topic: string;
  /** P5: show the `R review` line for a cleared room the engine will review. */
  review?: boolean;
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
  lines: { key: string; action: string; label: string }[];
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

function promptLine(keyLabel: string, action: string, label: string): HTMLElement {
  const line = document.createElement('span');
  line.className = 'prompt-line';
  const key = document.createElement('kbd');
  key.textContent = keyLabel;
  const text = document.createElement('span');
  text.textContent = ` ${action} — ${label}`;
  line.append(key, text);
  return line;
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

    host.replaceChildren(
      ...current.lines.map((line) => promptLine(line.key, line.action, line.label)),
    );
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
        room
          ? {
              key: `room:${room.roomId}:${room.review ? 'review' : 'note'}`,
              lines: [
                { key: 'E', action: 'write a note', label: room.topic },
                ...(room.review ? [{ key: 'R', action: 'review', label: room.topic }] : []),
              ],
            }
          : null,
        hidden,
      );
    },
    setTarget(target, hidden = false) {
      set(
        target
          ? {
              key: `target:${target.id}`,
              lines: [{ key: 'E', action: target.action, label: target.label }],
            }
          : null,
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
