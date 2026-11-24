/**
 * Touch controls (P9).
 *
 * The overlay is a second *view* of the one input state the keyboard feeds —
 * never a second movement implementation. `createIntentState` owns the held
 * intents; `intentForKeyCode` maps keyboard codes to the same intents, and the
 * overlay buttons call `press` / `release` with those intents. Physics and the
 * fishing state machine see exactly what they saw before.
 *
 * Every touch action is a visible button (no gesture-only controls), uses
 * pointer events with `pointercancel` cleanup, and is at least 44 px square.
 */
import type { MoveIntent } from './physics';
import { DEFAULT_SETTINGS, resolvedTouchLayout, type HostSettings } from './settings';

export type TouchIntent =
  | 'left'
  | 'right'
  | 'up'
  | 'down'
  | 'jump'
  | 'action'
  | 'cast'
  | 'release';

export interface IntentState {
  press(intent: TouchIntent): void;
  release(intent: TouchIntent): void;
  /** Read the movement intent. Jump is one-shot until `clearJump`. */
  read(): MoveIntent;
  clear(): void;
  clearJump(): void;
}

const MOVE_INTENTS = new Set<TouchIntent>(['left', 'right', 'up', 'down']);

/**
 * Held intents are reference-counted so `A` + `Left` both holding "left" and
 * releasing one still leaves the player walking left.
 */
export function createIntentState(): IntentState {
  const held = new Map<TouchIntent, number>();
  let jumpQueued = false;

  return {
    press(intent) {
      if (intent === 'jump') {
        jumpQueued = true;
        return;
      }
      if (!MOVE_INTENTS.has(intent)) return;
      held.set(intent, (held.get(intent) ?? 0) + 1);
    },
    release(intent) {
      if (!MOVE_INTENTS.has(intent)) return;
      const count = (held.get(intent) ?? 0) - 1;
      if (count <= 0) held.delete(intent);
      else held.set(intent, count);
    },
    read() {
      const on = (intent: TouchIntent): boolean => (held.get(intent) ?? 0) > 0;
      return {
        left: on('left'),
        right: on('right'),
        up: on('up'),
        down: on('down'),
        jump: jumpQueued,
      };
    },
    clear() {
      held.clear();
      jumpQueued = false;
    },
    clearJump() {
      jumpQueued = false;
    },
  };
}

/** The keyboard key code that means the same thing as a touch intent. */
const KEY_TO_INTENT: Readonly<Record<string, TouchIntent>> = {
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  KeyW: 'up',
  ArrowUp: 'up',
  KeyS: 'down',
  ArrowDown: 'down',
  Space: 'jump',
};

/** Map one keyboard code to an intent, or `null` when the key is not movement. */
export function intentForKeyCode(code: string): TouchIntent | null {
  return KEY_TO_INTENT[code] ?? null;
}

/** `auto` follows a coarse pointer; `on`/`off` override it. */
export function shouldShowTouchControls(
  settings: Pick<HostSettings, 'touchLayout'>,
  coarsePointer: boolean,
): boolean {
  return (
    resolvedTouchLayout({ ...DEFAULT_SETTINGS, touchLayout: settings.touchLayout }, coarsePointer) ===
    'on'
  );
}

export interface TouchControlHandlers {
  press(intent: TouchIntent): void;
  release(intent: TouchIntent): void;
}

export interface TouchControls {
  /** Feed a held intent into the same input state the keyboard uses. */
  press(intent: TouchIntent): void;
  release(intent: TouchIntent): void;
  /** Context label for the action button: Enter, Note, Fish, Cast, Reel, Keep. */
  setActionLabel(label: string): void;
  setVisible(visible: boolean): void;
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

function controlButton(intent: TouchIntent, label: string, className: string): HTMLButtonElement {
  const button = element('button', { className, text: label });
  button.type = 'button';
  button.dataset.intent = intent;
  button.setAttribute('aria-label', label);
  return button;
}

export function createTouchControls(
  host: HTMLElement,
  handlers: TouchControlHandlers,
): TouchControls {
  host.replaceChildren();

  const pad = element('div', { className: 'touch-pad' });
  const up = controlButton('up', 'Climb up', 'touch-button touch-up');
  const left = controlButton('left', 'Walk left', 'touch-button touch-left');
  const down = controlButton('down', 'Climb down', 'touch-button touch-down');
  const right = controlButton('right', 'Walk right', 'touch-button touch-right');
  pad.append(up, left, down, right);

  const actions = element('div', { className: 'touch-actions' });
  const jump = controlButton('jump', 'Jump', 'touch-button touch-jump');
  const action = controlButton('action', 'Use', 'touch-button touch-action');
  actions.append(jump, action);

  host.append(pad, actions);

  /** Intents currently held by a pointer or a keyboard activation of a button. */
  const pressed = new Set<TouchIntent>();
  const pointerOwners = new Map<number, TouchIntent>();

  function press(intent: TouchIntent): void {
    if (pressed.has(intent)) return;
    pressed.add(intent);
    handlers.press(intent);
  }

  function release(intent: TouchIntent): void {
    if (!pressed.delete(intent)) return;
    handlers.release(intent);
  }

  function releaseAll(): void {
    for (const intent of [...pressed]) release(intent);
  }

  function bind(button: HTMLButtonElement, intent: TouchIntent): void {
    button.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      event.preventDefault();
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        // Synthetic pointers (tests, capture tooling) have no capturable id.
      }
      if (typeof event.pointerId === 'number') pointerOwners.set(event.pointerId, intent);
      press(intent);
    });
    const end = (event: PointerEvent): void => {
      if (typeof event.pointerId === 'number') pointerOwners.delete(event.pointerId);
      release(intent);
    };
    button.addEventListener('pointerup', end);
    button.addEventListener('pointercancel', end);
    button.addEventListener('lostpointercapture', (event) => {
      // A cancelled pointer can deliver `lostpointercapture` after
      // `pointercancel`; release is idempotent, so both paths are safe.
      if (pointerOwners.get(event.pointerId) === intent) pointerOwners.delete(event.pointerId);
      release(intent);
    });
    button.addEventListener('contextmenu', (event) => event.preventDefault());
    // Keyboard activation on a hybrid device holds the same intent.
    button.addEventListener('keydown', (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      press(intent);
    });
    button.addEventListener('keyup', (event) => {
      if (event.key !== ' ' && event.key !== 'Enter') return;
      event.preventDefault();
      release(intent);
    });
    button.addEventListener('blur', () => release(intent));
  }

  bind(up, 'up');
  bind(left, 'left');
  bind(down, 'down');
  bind(right, 'right');
  bind(jump, 'jump');
  bind(action, 'action');

  window.addEventListener('blur', releaseAll);

  return {
    press(intent) {
      press(intent);
    },
    release(intent) {
      release(intent);
    },
    setActionLabel(label) {
      action.textContent = label;
      action.setAttribute('aria-label', label);
    },
    setVisible(visible) {
      if (host.hidden === !visible) return;
      host.hidden = !visible;
      // Hiding mid-hold must not leave the player walking forever.
      if (!visible) releaseAll();
    },
  };
}
