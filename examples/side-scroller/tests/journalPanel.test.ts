// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { assistance } from '@/index';
import type { JournalView } from '../src/journal/projection';
import { mountJournalPanel } from '../src/ui/journalPanel';
import { DEFAULT_SETTINGS } from '../src/settings';

const EMPTY_ASSISTANCE: assistance.AssistanceResult = {
  mode: 'gentle',
  suggestions: [],
  emptyReason: 'no-suggestions',
  evaluatedRuleKinds: [],
};

function view(overrides: Partial<JournalView> = {}): JournalView {
  return {
    subjects: [
      {
        subjectId: 'demo-kitchen',
        subjectName: 'Kitchen Chemistry',
        xp: 120,
        rank: 'Apprentice',
        roomsCleared: 2,
        totalRooms: 4,
        badges: ['Scribe phase complete'],
        fishCount: 1,
        dueRooms: 1,
        lastPlayedIso: '2026-11-24T10:00:00.000Z',
      },
    ],
    activeSubjectId: 'demo-kitchen',
    questStep: 'review-artifact',
    archetype: 'scholar',
    stats: null,
    assistance: EMPTY_ASSISTANCE,
    inventory: [{ id: 'item-1', name: 'Scholar’s Cap', equipped: true, slot: 'head' }],
    fish: [{ name: 'Moss Carp', rarity: 'common', subjectName: 'Kitchen Chemistry' }],
    due: [
      {
        subjectId: 'demo-kitchen',
        subjectName: 'Kitchen Chemistry',
        roomId: 'room-heat',
        topic: 'Heat & Browning',
        dueLabel: 'Overdue by 2 days',
        overdueDays: 2,
      },
    ],
    ...overrides,
  };
}

function callbacks() {
  return {
    onClose: vi.fn(),
    onOpenSettings: vi.fn(),
    onSelectSubject: vi.fn(),
    onEnterSubject: vi.fn(),
    onSettingsChange: vi.fn(),
    onResetSettings: vi.fn(),
  };
}

function host(): HTMLElement {
  const root = document.createElement('section');
  root.id = 'journal-panel';
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
  const canvas = document.createElement('canvas');
  canvas.id = 'game';
  canvas.tabIndex = 0;
  document.body.append(canvas);
});

describe('journal panel (P8-T4)', () => {
  it('renders every section, focuses its title, and shows honest empty records', () => {
    const root = host();
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing canvas');
    const panel = mountJournalPanel(root, view(), DEFAULT_SETTINGS, 'demo-kitchen', canvas, callbacks());

    expect(root.hidden).toBe(false);
    expect(document.activeElement?.id).toBe('journal-panel-title');
    const text = root.textContent ?? '';
    for (const heading of [
      'Overview',
      'Subjects',
      'Progress',
      'Badges',
      'Records',
      'Inventory',
      'Fish',
      'Due',
      'Assistance',
      'Settings',
    ]) {
      expect(text).toContain(heading);
    }
    expect(text).toContain('No records yet');
    expect(text).toContain('Kitchen Chemistry');
    expect(text).toContain('Overdue by 2 days');
    expect(text).toContain('Scholar’s Cap — head — equipped');
    expect(text).toContain('Moss Carp — common — Kitchen Chemistry');
    expect(text).toContain('The engine found nothing to suggest right now.');
    expect(text).toContain('Stored on this device only');

    panel.close();
    expect(root.hidden).toBe(true);
    expect(document.activeElement?.id).toBe('game');
  });

  it('selects a subject without entering it and reports Enter separately', () => {
    const root = host();
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing canvas');
    const handlers = callbacks();
    mountJournalPanel(root, view(), DEFAULT_SETTINGS, 'demo-kitchen', canvas, handlers);

    root.querySelector<HTMLButtonElement>('[data-focus-key="journal-subject-demo-kitchen"]')?.click();
    expect(handlers.onSelectSubject).toHaveBeenCalledWith('demo-kitchen');
    expect(handlers.onEnterSubject).not.toHaveBeenCalled();

    root.querySelector<HTMLButtonElement>('[data-focus-key="journal-enter-demo-kitchen"]')?.click();
    expect(handlers.onEnterSubject).toHaveBeenCalledWith('demo-kitchen');
  });

  it('changes and resets settings through the host callbacks', () => {
    const root = host();
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing canvas');
    const handlers = callbacks();
    mountJournalPanel(root, view(), DEFAULT_SETTINGS, 'demo-kitchen', canvas, handlers);

    const assistance = root.querySelector<HTMLSelectElement>('#journal-setting-assistance');
    if (!assistance) throw new Error('Missing assistance select');
    assistance.value = 'off';
    assistance.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handlers.onSettingsChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      assistanceMode: 'off',
    });

    const textScale = root.querySelector<HTMLSelectElement>('#journal-setting-text-scale');
    if (!textScale) throw new Error('Missing text scale select');
    textScale.value = 'large';
    textScale.dispatchEvent(new Event('change', { bubbles: true }));
    expect(handlers.onSettingsChange).toHaveBeenCalledWith({
      ...DEFAULT_SETTINGS,
      textScale: 'large',
    });

    root.querySelector<HTMLButtonElement>('#journal-reset-settings')?.click();
    expect(handlers.onResetSettings).toHaveBeenCalled();
  });

  it('traps Tab, moves with arrows, and closes on J or Escape', () => {
    const root = host();
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing canvas');
    const handlers = callbacks();
    const panel = mountJournalPanel(root, view(), DEFAULT_SETTINGS, 'demo-kitchen', canvas, handlers);

    const focusable = [...root.querySelectorAll<HTMLElement>(
      'button, select, input, textarea, a[href], [tabindex]:not([tabindex="-1"])',
    )].filter((node) => !(node as HTMLButtonElement).disabled);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    expect(first).toBeDefined();
    expect(last).toBeDefined();

    last.focus();
    press(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);

    first.focus();
    press(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);

    const close = root.querySelector<HTMLButtonElement>('#journal-close');
    if (!close) throw new Error('Missing close button');
    close.focus();
    press(close, { key: 'ArrowDown' });
    expect(document.activeElement).not.toBe(close);

    // The host listens on `window`; closing must not let the same J bubble out
    // and reopen the panel.
    const bubbled = vi.fn();
    window.addEventListener('keydown', bubbled);
    press(document.activeElement as HTMLElement, { code: 'KeyJ' });
    expect(handlers.onClose).toHaveBeenCalledTimes(1);
    expect(bubbled).not.toHaveBeenCalled();
    window.removeEventListener('keydown', bubbled);

    const second = callbacks();
    const reopened = mountJournalPanel(root, view(), DEFAULT_SETTINGS, null, canvas, second);
    press(document.activeElement as HTMLElement, { code: 'Escape' });
    expect(second.onClose).toHaveBeenCalledTimes(1);
    reopened.close();
    panel.close();
  });

  it('renders engine reason codes as labels without adding advice', () => {
    const suggestion: assistance.AssistanceSuggestion = {
      suggestionId: 'creator.missing-branch:demo-kitchen',
      kind: 'creator.missing-branch',
      surface: 'creator',
      targetId: 'demo-kitchen',
      priority: 30,
      reasonCode: 'graph-no-branch',
      signalKey: null,
      signalValue: 0,
      intensity: 'step',
      action: {
        kind: 'offer-navigation',
        subjectId: 'demo-kitchen',
        roomId: 'demo-kitchen-root',
        detail: null,
      },
    };
    const root = host();
    const canvas = document.querySelector<HTMLCanvasElement>('#game');
    if (!canvas) throw new Error('Missing canvas');
    mountJournalPanel(
      root,
      view({
        assistance: {
          mode: 'gentle',
          suggestions: [suggestion],
          emptyReason: null,
          evaluatedRuleKinds: ['creator.missing-branch'],
        },
      }),
      { ...DEFAULT_SETTINGS, assistanceMode: 'gentle' },
      'demo-kitchen',
      canvas,
      callbacks(),
    );
    expect(root.textContent ?? '').toContain('The root room has no subtopic branch.');
    expect(root.textContent ?? '').toContain('Creator · step · priority 30');
  });
});
