// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { createEmptyState, type EngineState } from '@/index';
import { mountTitlePanel, projectTitle, type TitleImportResult } from '../src/ui/titlePanel';

function state(patch: Partial<EngineState['session']> = {}): EngineState {
  const value = createEmptyState();
  value.session = { ...value.session, ...patch };
  return value;
}

function stateWithSubject(): EngineState {
  const value = state({ playerClass: 'scholar', questStep: 'enter-dungeon' });
  // Title projection only counts subjects; a structurally minimal fixture is enough.
  value.subjects.demo = { dungeon: {}, rooms: {} } as unknown as EngineState['subjects'][string];
  return value;
}

function callbacks() {
  return {
    onContinue: vi.fn(),
    onNewGame: vi.fn(),
    onStartTutorial: vi.fn(),
    onExport: vi.fn(),
    onImport: vi.fn(async (): Promise<TitleImportResult> => ({ ok: true })),
    onSettings: vi.fn(),
    onArchetype: vi.fn(),
  };
}

function button(root: HTMLElement, selector: string): HTMLButtonElement {
  const found = root.querySelector<HTMLButtonElement>(selector);
  if (!found) throw new Error(`Missing ${selector}`);
  return found;
}

describe('P9 title projection (E-17)', () => {
  it('reports no save and the archetype choice for a fresh state', () => {
    const view = projectTitle(createEmptyState());
    expect(view).toEqual({
      hasSave: false,
      subjectCount: 0,
      playerClass: null,
      questStep: 'intro',
      showArchetypes: true,
    });
  });

  it('treats an empty-subject but started save as a save', () => {
    const view = projectTitle(state({ playerClass: 'scholar', questStep: 'enter-dungeon' }));
    expect(view.hasSave).toBe(true);
    expect(view.subjectCount).toBe(0);
    expect(view.showArchetypes).toBe(false);
  });

  it('reports a dungeon save and a fishing save', () => {
    const dungeon = stateWithSubject();
    dungeon.session.world = 'dungeon';
    dungeon.activeSubjectId = 'demo';
    expect(projectTitle(dungeon)).toMatchObject({
      hasSave: true,
      subjectCount: 1,
      playerClass: 'scholar',
      questStep: 'enter-dungeon',
      showArchetypes: false,
    });

    const fishing = stateWithSubject();
    fishing.session.world = 'fishing';
    expect(projectTitle(fishing)).toMatchObject({ hasSave: true, subjectCount: 1 });
  });
});

describe('P9 title panel (E-17)', () => {
  it('disables Continue without a save and enables it with one', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const panel = mountTitlePanel(root, callbacks());

    panel.update(projectTitle(createEmptyState()));
    expect(button(root, '#title-continue').disabled).toBe(true);
    expect(button(root, '#title-export').disabled).toBe(true);
    expect(root.querySelector('#title-status')?.textContent).toContain('No save yet');
    expect(root.querySelector<HTMLElement>('#title-archetypes')?.hidden).toBe(false);

    panel.update(projectTitle(stateWithSubject()));
    expect(button(root, '#title-continue').disabled).toBe(false);
    expect(button(root, '#title-export').disabled).toBe(false);
    expect(root.querySelector<HTMLElement>('#title-archetypes')?.hidden).toBe(true);
    expect(root.querySelector('#title-status')?.textContent).toContain('quest: enter dungeon');
  });

  it('wires Continue, New game, tutorial, export, and settings', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const handlers = callbacks();
    const panel = mountTitlePanel(root, handlers);
    panel.update(projectTitle(stateWithSubject()));

    button(root, '#title-continue').click();
    button(root, '#title-new-game').click();
    button(root, '#start-tutorial').click();
    button(root, '#title-export').click();
    button(root, '#title-settings').click();

    expect(handlers.onContinue).toHaveBeenCalledOnce();
    expect(handlers.onNewGame).toHaveBeenCalledOnce();
    expect(handlers.onStartTutorial).toHaveBeenCalledOnce();
    expect(handlers.onExport).toHaveBeenCalledOnce();
    expect(handlers.onSettings).toHaveBeenCalledOnce();
  });

  it('sends the chosen archetype to the host and marks it pressed', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const handlers = callbacks();
    const panel = mountTitlePanel(root, handlers);
    panel.update(projectTitle(createEmptyState()));

    button(root, '[data-archetype="archivist"]').click();
    expect(handlers.onArchetype).toHaveBeenCalledWith('archivist');

    panel.update(projectTitle(state({ playerClass: 'archivist' })));
    expect(button(root, '[data-archetype="archivist"]').getAttribute('aria-pressed')).toBe('true');
    expect(button(root, '[data-archetype="scholar"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows a JSON error without calling the host importer', () => {
    const root = document.createElement('div');
    document.body.append(root);
    const handlers = callbacks();
    const panel = mountTitlePanel(root, handlers);
    panel.update(projectTitle(stateWithSubject()));

    button(root, '#title-import-toggle').click();
    expect(root.querySelector<HTMLElement>('#title-import-panel')?.hidden).toBe(false);
    const paste = root.querySelector<HTMLTextAreaElement>('#title-import-text');
    if (!paste) throw new Error('Missing import textarea');
    paste.value = '{ not json';
    button(root, '#title-import-apply').click();

    expect(handlers.onImport).not.toHaveBeenCalled();
    const error = root.querySelector<HTMLElement>('#title-error');
    expect(error?.hidden).toBe(false);
    expect(error?.textContent).toContain('not valid JSON');
    expect(error?.textContent).toContain('current save is unchanged');
  });

  it('renders the host validation error for a rejected bundle', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const handlers = callbacks();
    handlers.onImport.mockResolvedValue({ ok: false, error: 'Unsupported bundle version 2.' });
    const panel = mountTitlePanel(root, handlers);
    panel.update(projectTitle(stateWithSubject()));

    button(root, '#title-import-toggle').click();
    const paste = root.querySelector<HTMLTextAreaElement>('#title-import-text');
    if (!paste) throw new Error('Missing import textarea');
    paste.value = '{"bundleVersion":2}';
    button(root, '#title-import-apply').click();
    await Promise.resolve();
    await Promise.resolve();

    expect(handlers.onImport).toHaveBeenCalledOnce();
    const error = root.querySelector<HTMLElement>('#title-error');
    expect(error?.textContent).toContain('Unsupported bundle version 2.');
  });
});
