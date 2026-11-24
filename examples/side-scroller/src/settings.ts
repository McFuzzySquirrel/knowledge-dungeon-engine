/**
 * Host-local settings (P8).
 *
 * The engine has no settings command and `EngineState` has no settings field.
 * These values are presentation and assistance preferences for this device, so
 * they live in `localStorage` under one key and never enter a save bundle.
 *
 * Every read is validated field by field: malformed JSON, an unknown value, or
 * a partial object falls back to the default for that field rather than
 * discarding the whole object or trusting a value the browser happened to keep.
 */

/** How much proactive assistance the journal asks the engine for. */
export type AssistanceMode = 'off' | 'gentle' | 'standard';

/** DOM and canvas text size. */
export type TextScale = 'normal' | 'large';

/** Touch-controls preference. `auto` follows a coarse pointer. */
export type TouchLayout = 'auto' | 'on' | 'off';

export interface HostSettings {
  /** `system` follows the OS; `on` forces reduced motion. Motion is never forced. */
  reducedMotion: 'system' | 'on';
  assistanceMode: AssistanceMode;
  textScale: TextScale;
  touchLayout: TouchLayout;
}

export const DEFAULT_SETTINGS: HostSettings = Object.freeze({
  reducedMotion: 'system',
  assistanceMode: 'gentle',
  textScale: 'normal',
  touchLayout: 'auto',
});

/** One key, one object, no engine state. */
export const SETTINGS_STORAGE_KEY = 'knowledge-dungeon.host-settings.v1';

/** The two storage methods the settings store needs, so tests can pass a stub. */
export interface SettingsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** The environment facts `applySettings` reads; injectable so its behaviour is testable. */
export interface SettingsEnvironment {
  prefersReducedMotion: boolean;
  coarsePointer: boolean;
}

const ASSISTANCE_MODES: readonly AssistanceMode[] = ['off', 'gentle', 'standard'];
const TEXT_SCALES: readonly TextScale[] = ['normal', 'large'];
const TOUCH_LAYOUTS: readonly TouchLayout[] = ['auto', 'on', 'off'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isOneOf<T extends string>(value: unknown, allowed: readonly T[]): value is T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value);
}

/** A new mutable copy of the defaults. */
export function resetSettings(): HostSettings {
  return { ...DEFAULT_SETTINGS };
}

/**
 * Validate an untrusted object (already parsed) field by field.
 *
 * Unknown fields are ignored and a bad field takes only its own default, so a
 * settings object written by an older or newer build still yields a usable
 * result.
 */
export function normalizeSettings(value: unknown): HostSettings {
  const defaults = resetSettings();
  if (!isRecord(value)) return defaults;

  if (value.reducedMotion === 'system' || value.reducedMotion === 'on') {
    defaults.reducedMotion = value.reducedMotion;
  }
  if (isOneOf(value.assistanceMode, ASSISTANCE_MODES)) {
    defaults.assistanceMode = value.assistanceMode;
  }
  if (isOneOf(value.textScale, TEXT_SCALES)) defaults.textScale = value.textScale;
  if (isOneOf(value.touchLayout, TOUCH_LAYOUTS)) defaults.touchLayout = value.touchLayout;
  return defaults;
}

function browserStorage(): SettingsStorage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    // A browser can expose the property and throw on access (privacy modes).
    return null;
  }
}

/** Read settings from one key, with safe defaults on any failure. */
export function loadSettings(storage: SettingsStorage | null = browserStorage()): HostSettings {
  if (!storage) return resetSettings();
  let raw: string | null;
  try {
    raw = storage.getItem(SETTINGS_STORAGE_KEY);
  } catch {
    return resetSettings();
  }
  if (raw === null) return resetSettings();
  try {
    return normalizeSettings(JSON.parse(raw) as unknown);
  } catch {
    return resetSettings();
  }
}

/** Write settings to one key. A rejected write leaves the caller running with its values. */
export function saveSettings(
  settings: HostSettings,
  storage: SettingsStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(normalizeSettings(settings)));
  } catch {
    // Settings are a preference, not a command. A full or blocked storage area
    // must not break the game; the in-memory value still applies this session.
  }
}

/** `system` follows the OS; `on` forces reduced motion; nothing forces motion. */
export function effectiveReducedMotion(
  settings: HostSettings,
  systemPrefersReducedMotion: boolean,
): boolean {
  return settings.reducedMotion === 'on' || (settings.reducedMotion === 'system' && systemPrefersReducedMotion);
}

/** Resolve `auto` against the pointer. `on`/`off` override the environment. */
export function resolvedTouchLayout(
  settings: HostSettings,
  coarsePointer: boolean,
): 'on' | 'off' {
  if (settings.touchLayout === 'on') return 'on';
  if (settings.touchLayout === 'off') return 'off';
  return coarsePointer ? 'on' : 'off';
}

/** A multiplicative scale for canvas labels. */
export function textScaleFactor(settings: HostSettings): number {
  return settings.textScale === 'large' ? 1.3 : 1;
}

/**
 * Apply the settings to the document root.
 *
 * The attributes drive CSS (`data-text-scale`, `data-reduced-motion`) and are
 * also where P9's touch overlay reads the resolved layout. `system` is
 * resolved here so every consumer gets one answer rather than each re-reading
 * `matchMedia` with a different rule.
 */
export function applySettings(
  settings: HostSettings,
  target: Document = document,
  environment?: SettingsEnvironment,
): void {
  const normalized = normalizeSettings(settings);
  const view = target.defaultView;
  const prefersReducedMotion =
    environment?.prefersReducedMotion ??
    view?.matchMedia?.('(prefers-reduced-motion: reduce)').matches ??
    false;
  const coarsePointer =
    environment?.coarsePointer ?? view?.matchMedia?.('(pointer: coarse)').matches ?? false;

  const root = target.documentElement;
  root.dataset.reducedMotion = effectiveReducedMotion(normalized, prefersReducedMotion)
    ? 'reduce'
    : 'full';
  root.dataset.reducedMotionPreference = normalized.reducedMotion;
  root.dataset.textScale = normalized.textScale;
  root.dataset.touchLayout = resolvedTouchLayout(normalized, coarsePointer);
  root.dataset.touchLayoutPreference = normalized.touchLayout;
  root.dataset.assistanceMode = normalized.assistanceMode;
}
