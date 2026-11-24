// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountHelpPanel } from '../src/ui/helpPanel';

function host(): HTMLElement {
  const root = document.createElement('section');
  root.id = 'help-panel';
  root.hidden = true;
  document.body.append(root);
  return root;
}

function press(target: HTMLElement, init: KeyboardEventInit): void {
  target.dispatchEvent(
    new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }),
  );
}

beforeEach(() => {
  document.body.replaceChildren();
  const trigger = document.createElement('button');
  trigger.id = 'open-help';
  trigger.textContent = 'Controls (?)';
  document.body.append(trigger);
});

describe('controls help panel', () => {
  it('renders every control group, focuses the title, and returns focus', () => {
    const root = host();
    const trigger = document.querySelector<HTMLButtonElement>('#open-help');
    if (!trigger) throw new Error('Missing trigger');
    const panel = mountHelpPanel(root, trigger, { onClose: vi.fn() });

    expect(root.hidden).toBe(false);
    expect(document.activeElement?.id).toBe('help-panel-title');
    const text = root.textContent ?? '';
    for (const heading of ['Move', 'Interact', 'Review', 'Pond', 'World']) {
      expect(text).toContain(heading);
    }
    expect(text).toContain('Rate recall');
    expect(text).toContain('Charge the cast');
    expect(text).toContain('Climb the entrance shaft');

    panel.close();
    expect(root.hidden).toBe(true);
    expect(document.activeElement?.id).toBe('open-help');
  });

  it('traps Tab, closes on Escape or ?, and leaves a bare slash alone', () => {
    const root = host();
    const trigger = document.querySelector<HTMLButtonElement>('#open-help');
    if (!trigger) throw new Error('Missing trigger');
    const handlers = { onClose: vi.fn() };
    mountHelpPanel(root, trigger, handlers);

    const controls = [...root.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')];
    const first = controls[0];
    const last = controls[controls.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();

    last.focus();
    press(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    press(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    press(last, { key: '/', code: 'Slash' });
    expect(handlers.onClose).not.toHaveBeenCalled();

    press(last, { key: '?' });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);

    press(last, { key: 'Escape', code: 'Escape' });
    expect(handlers.onClose).toHaveBeenCalledTimes(2);
  });
});
