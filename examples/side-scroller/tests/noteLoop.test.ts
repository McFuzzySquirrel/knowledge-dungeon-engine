import { describe, expect, it } from 'vitest';
import { KnowledgeDungeonEngine, MemoryEngineStorage } from '@/index';
import { draftSummary, refusalMessage } from '../src/ui/outcomes';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

const VALID_NOTE = [
  'Summary',
  'The note is the unit of study in this dungeon and it records what the learner understood.',
  '',
  'Key Points',
  'A note needs a summary, key points, and one recall question. The recall question must end with a question mark.',
  '',
  'Recall Question',
  'Why does a note need a recall question?',
  '',
].join('\n');

const INCOMPLETE_NOTE = ['Summary', 'Only the summary heading is present.', ''].join('\n');

function openEngine(storage = new MemoryEngineStorage()) {
  return KnowledgeDungeonEngine.open({
    storage,
    nowIso: () => FIXED_NOW,
    newRoomId: () => crypto.randomUUID(),
    newStudySessionId: () => crypto.randomUUID(),
  });
}

describe('P2 note loop', () => {
  it('saves an incomplete note as a draft and names every missing section', async () => {
    const engine = await openEngine();
    await engine.startTutorial();
    const subjectId = engine.snapshot().activeSubjectId;
    if (!subjectId) throw new Error('Tutorial subject missing');
    const priorXp = engine.snapshot().progression[subjectId]?.xpTotal ?? 0;

    const result = await engine.submitNote({
      roomId: 'tut-note',
      noteText: INCOMPLETE_NOTE,
      manualConfirmed: false,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== 'draft') throw new Error('Expected a draft outcome');

    expect(result.value.validation.finalPass).toBe(false);
    expect(result.value.validation.missingSections).toEqual(['Key Points', 'Recall Question']);
    expect(result.value.validation.failedChecks).toContain('VAL_REQUIRED_SECTION_MISSING');
    expect(result.value.validation.failedChecks).toContain('VAL_MANUAL_CONFIRM_REQUIRED');
    expect(result.value.artifactMarkdown).toBeNull();

    const lines = draftSummary(result.value.validation).join('\n');
    expect(lines).toContain('Missing required sections: Key Points, Recall Question.');
    expect(lines).toContain('Confirmation is required');
    expect(lines).toContain('Word count:');

    const state = engine.snapshot();
    const room = state.subjects[subjectId]?.rooms['tut-note'];
    expect(room?.validationState.finalPass).toBe(false);
    expect(room?.artifactMarkdown).toBeNull();
    expect(state.progression[subjectId]?.xpTotal ?? 0).toBe(priorXp);
  });

  it('clears the room, awards XP, and keeps the artifact across a reload', async () => {
    const storage = new MemoryEngineStorage();
    const engine = await openEngine(storage);
    await engine.startTutorial();
    const subjectId = engine.snapshot().activeSubjectId;
    if (!subjectId) throw new Error('Tutorial subject missing');

    const result = await engine.submitNote({
      roomId: 'tut-note',
      noteText: VALID_NOTE,
      manualConfirmed: true,
    });

    expect(result.ok).toBe(true);
    if (!result.ok || result.value.kind !== 'cleared') throw new Error('Expected a cleared outcome');
    expect(result.value.artifactMarkdown).toContain('# Scribe Artifact');
    expect(result.value.progression.awarded).toBe(true);
    expect(result.value.progression.xpGained).toBeGreaterThan(0);

    const afterClear = engine.snapshot();
    expect(afterClear.subjects[subjectId]?.rooms['tut-note']?.validationState.finalPass).toBe(true);
    expect(afterClear.subjects[subjectId]?.rooms['tut-note']?.artifactMarkdown).toBe(
      result.value.artifactMarkdown,
    );
    expect(afterClear.progression[subjectId]?.xpTotal).toBeGreaterThan(0);

    const collected = await engine.collectArtifact('tut-note');
    expect(collected).toEqual({
      ok: true,
      value: { command: 'artifact/collect', roomId: 'tut-note', handedToWorldFlow: true },
    });
    expect(
      engine.snapshot().progression[subjectId]?.collectedNotes.some(
        (entry) => entry.roomId === 'tut-note',
      ),
    ).toBe(true);

    // Reload: a second engine over the same durable record keeps the clear, XP, and artifact.
    const reloaded = await openEngine(storage);
    const restored = reloaded.snapshot();
    expect(restored.subjects[subjectId]?.rooms['tut-note']?.validationState.finalPass).toBe(true);
    expect(restored.subjects[subjectId]?.rooms['tut-note']?.artifactMarkdown).toBe(
      result.value.artifactMarkdown,
    );
    expect(restored.progression[subjectId]?.xpTotal).toBe(afterClear.progression[subjectId]?.xpTotal);
    expect(
      restored.progression[subjectId]?.collectedNotes.some((entry) => entry.roomId === 'tut-note'),
    ).toBe(true);
  });

  it('returns a typed refusal for an unknown room and commits nothing', async () => {
    const engine = await openEngine();
    await engine.startTutorial();
    const prior = engine.snapshot();

    const result = await engine.submitNote({
      roomId: 'not-a-room',
      noteText: VALID_NOTE,
      manualConfirmed: true,
    });

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error('Expected a refusal');
    expect(result.error.code).toBe('ROOM_NOT_FOUND');
    expect(refusalMessage(result.error.code, result.error.message)).toBe(
      'Refused (ROOM_NOT_FOUND): Room not found',
    );
    expect(engine.snapshot()).toEqual(prior);
  });

  it('rejects an artifact pickup for an uncleared room without changing state', async () => {
    const engine = await openEngine();
    await engine.startTutorial();
    const prior = engine.snapshot();

    await expect(engine.collectArtifact('tut-note')).rejects.toThrow('Room has no artifact');

    expect(engine.snapshot()).toEqual(prior);
  });
});
