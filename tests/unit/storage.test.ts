import { describe, expect, it } from 'vitest';
import { createEmptyState, MemoryEngineStorage } from '../../src/storage';

describe('memory storage', () => {
  it('isolates saved and loaded values from caller mutation', async () => {
    const storage = new MemoryEngineStorage();
    const state = createEmptyState();
    state.activeSubjectId = 'subject-1';
    await storage.save(state);
    state.activeSubjectId = 'changed-after-save';
    const loaded = await storage.load();
    expect(loaded?.activeSubjectId).toBe('subject-1');
    if (!loaded) throw new Error('Expected state');
    loaded.activeSubjectId = 'changed-after-load';
    expect((await storage.load())?.activeSubjectId).toBe('subject-1');
  });

  it('starts empty for each adapter instance', async () => {
    expect(await new MemoryEngineStorage().load()).toBeNull();
  });
});
