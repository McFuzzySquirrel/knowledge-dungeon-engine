// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  SETTINGS_STORAGE_KEY,
  applySettings,
  effectiveReducedMotion,
  loadSettings,
  normalizeSettings,
  resetSettings,
  resolvedTouchLayout,
  saveSettings,
  textScaleFactor,
  type HostSettings,
  type SettingsStorage,
} from '../src/settings';

function memoryStorage(initial: Record<string, string> = {}): SettingsStorage & {
  data: Record<string, string>;
} {
  const data = { ...initial };
  return {
    data,
    getItem: (key) => data[key] ?? null,
    setItem: (key, value) => {
      data[key] = value;
    },
  };
}

describe('host settings store (P8-T5)', () => {
  it('defaults to system motion, gentle assistance, normal text, and auto touch', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      reducedMotion: 'system',
      assistanceMode: 'gentle',
      textScale: 'normal',
      touchLayout: 'auto',
    });
    expect(loadSettings(memoryStorage())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through one localStorage key', () => {
    const storage = memoryStorage();
    const settings: HostSettings = {
      reducedMotion: 'on',
      assistanceMode: 'standard',
      textScale: 'large',
      touchLayout: 'off',
    };
    saveSettings(settings, storage);
    expect(storage.data[SETTINGS_STORAGE_KEY]).toBe(JSON.stringify(settings));
    expect(loadSettings(storage)).toEqual(settings);
  });

  it('falls back to defaults on malformed JSON', () => {
    const storage = memoryStorage({ [SETTINGS_STORAGE_KEY]: '{not json' });
    expect(loadSettings(storage)).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back field by field on a partial or invalid object', () => {
    const storage = memoryStorage({
      [SETTINGS_STORAGE_KEY]: JSON.stringify({
        textScale: 'large',
        reducedMotion: 'on',
        assistanceMode: 'turbo',
      }),
    });
    expect(loadSettings(storage)).toEqual({
      ...DEFAULT_SETTINGS,
      reducedMotion: 'on',
      textScale: 'large',
    });
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({ textScale: 'huge', touchLayout: 'maybe' })).toEqual(
      DEFAULT_SETTINGS,
    );
  });

  it('returns a fresh defaults object for reset', () => {
    const first = resetSettings();
    first.textScale = 'large';
    expect(resetSettings().textScale).toBe('normal');
  });

  it('resolves system motion and the coarse-pointer auto layout', () => {
    expect(effectiveReducedMotion({ ...DEFAULT_SETTINGS }, true)).toBe(true);
    expect(effectiveReducedMotion({ ...DEFAULT_SETTINGS }, false)).toBe(false);
    expect(
      effectiveReducedMotion({ ...DEFAULT_SETTINGS, reducedMotion: 'on' }, false),
    ).toBe(true);
    expect(resolvedTouchLayout(DEFAULT_SETTINGS, true)).toBe('on');
    expect(resolvedTouchLayout(DEFAULT_SETTINGS, false)).toBe('off');
    expect(resolvedTouchLayout({ ...DEFAULT_SETTINGS, touchLayout: 'on' }, false)).toBe('on');
    expect(resolvedTouchLayout({ ...DEFAULT_SETTINGS, touchLayout: 'off' }, true)).toBe('off');
    expect(textScaleFactor(DEFAULT_SETTINGS)).toBe(1);
    expect(textScaleFactor({ ...DEFAULT_SETTINGS, textScale: 'large' })).toBe(1.3);
  });

  it('applies resolved values to the document root without touching engine state', () => {
    applySettings(
      { reducedMotion: 'system', assistanceMode: 'off', textScale: 'large', touchLayout: 'auto' },
      document,
      { prefersReducedMotion: true, coarsePointer: true },
    );
    const root = document.documentElement;
    expect(root.dataset.reducedMotion).toBe('reduce');
    expect(root.dataset.reducedMotionPreference).toBe('system');
    expect(root.dataset.textScale).toBe('large');
    expect(root.dataset.touchLayout).toBe('on');
    expect(root.dataset.touchLayoutPreference).toBe('auto');
    expect(root.dataset.assistanceMode).toBe('off');
  });
});
