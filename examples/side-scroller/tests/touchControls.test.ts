// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import {
  createIntentState,
  createTouchControls,
  intentForKeyCode,
  shouldShowTouchControls,
} from '../src/touchControls';
import { DEFAULT_SETTINGS } from '../src/settings';

function pointer(
  element: Element,
  type: 'pointerdown' | 'pointerup' | 'pointercancel',
  pointerType = 'touch',
): void {
  const event = new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: 7,
    pointerType,
  });
  element.dispatchEvent(event);
}

function actionButton(root: HTMLElement): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>('[data-intent="action"]');
  if (!found) throw new Error('Missing action button');
  return found;
}

describe('P9 touch intent mapping (E-17)', () => {
  it('maps the keyboard codes to the same intents as the buttons', () => {
    expect(intentForKeyCode('KeyA')).toBe('left');
    expect(intentForKeyCode('ArrowLeft')).toBe('left');
    expect(intentForKeyCode('KeyD')).toBe('right');
    expect(intentForKeyCode('ArrowRight')).toBe('right');
    expect(intentForKeyCode('KeyW')).toBe('up');
    expect(intentForKeyCode('ArrowUp')).toBe('up');
    expect(intentForKeyCode('KeyS')).toBe('down');
    expect(intentForKeyCode('ArrowDown')).toBe('down');
    expect(intentForKeyCode('Space')).toBe('jump');
    expect(intentForKeyCode('KeyE')).toBeNull();
  });

  it('produces the same MoveIntent from a touch press as from its key', () => {
    const touch = createIntentState();
    touch.press('left');
    touch.press('right');
    touch.press('up');
    touch.press('jump');
    expect(touch.read()).toEqual({ left: true, right: true, up: true, down: false, jump: true });

    touch.clearJump();
    expect(touch.read().jump).toBe(false);

    touch.release('left');
    touch.release('right');
    touch.release('up');
    expect(touch.read()).toEqual({ left: false, right: false, up: false, down: false, jump: false });
  });

  it('reference-counts two keys that mean the same intent', () => {
    const state = createIntentState();
    state.press(intentForKeyCode('KeyA') ?? 'left');
    state.press(intentForKeyCode('ArrowLeft') ?? 'left');
    state.release('left');
    expect(state.read().left).toBe(true);
    state.release('left');
    expect(state.read().left).toBe(false);
  });

  it('clears every held intent on blur/cancel', () => {
    const state = createIntentState();
    state.press('left');
    state.press('down');
    state.press('jump');
    state.clear();
    expect(state.read()).toEqual({ left: false, right: false, up: false, down: false, jump: false });
  });

  it('resolves touch visibility from the pointer and the setting', () => {
    expect(shouldShowTouchControls(DEFAULT_SETTINGS, true)).toBe(true);
    expect(shouldShowTouchControls(DEFAULT_SETTINGS, false)).toBe(false);
    expect(shouldShowTouchControls({ ...DEFAULT_SETTINGS, touchLayout: 'on' }, false)).toBe(true);
    expect(shouldShowTouchControls({ ...DEFAULT_SETTINGS, touchLayout: 'off' }, true)).toBe(false);
  });
});

describe('P9 touch overlay (E-17)', () => {
  it('feeds pointer presses and releases into the handlers', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const press = vi.fn();
    const release = vi.fn();
    createTouchControls(host, { press, release });

    const left = host.querySelector('[data-intent="left"]');
    if (!left) throw new Error('Missing left button');
    pointer(left, 'pointerdown');
    pointer(left, 'pointerup');

    expect(press).toHaveBeenCalledWith('left');
    expect(release).toHaveBeenCalledWith('left');
  });

  it('releases a held intent on pointercancel and on window blur', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const press = vi.fn();
    const release = vi.fn();
    createTouchControls(host, { press, release });

    const right = host.querySelector('[data-intent="right"]');
    if (!right) throw new Error('Missing right button');
    pointer(right, 'pointerdown');
    pointer(right, 'pointercancel');
    expect(release).toHaveBeenCalledWith('right');

    pointer(right, 'pointerdown');
    window.dispatchEvent(new Event('blur'));
    expect(release).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenLastCalledWith('right');
  });

  it('labels the contextual action button', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const controls = createTouchControls(host, { press: vi.fn(), release: vi.fn() });

    controls.setActionLabel('Reel');
    expect(actionButton(host).textContent).toBe('Reel');
    expect(actionButton(host).getAttribute('aria-label')).toBe('Reel');
  });

  it('hides and shows the layer, releasing held intents when hidden', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const press = vi.fn();
    const release = vi.fn();
    const controls = createTouchControls(host, { press, release });

    const action = actionButton(host);
    pointer(action, 'pointerdown');
    controls.setVisible(false);
    expect(host.hidden).toBe(true);
    expect(release).toHaveBeenCalledWith('action');

    controls.setVisible(true);
    expect(host.hidden).toBe(false);
  });

  it('activates buttons from the keyboard on a hybrid device', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const press = vi.fn();
    const release = vi.fn();
    createTouchControls(host, { press, release });

    const jump = host.querySelector('[data-intent="jump"]');
    if (!jump) throw new Error('Missing jump button');
    jump.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    jump.dispatchEvent(new KeyboardEvent('keyup', { key: ' ', bubbles: true }));
    expect(press).toHaveBeenCalledWith('jump');
    expect(release).toHaveBeenCalledWith('jump');
  });
});
