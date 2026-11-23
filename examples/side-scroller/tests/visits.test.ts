import { describe, expect, it } from 'vitest';
import { buildDungeonLevel } from '../src/level/model';
import { createVisitTracker, playerCentre, roomAtPoint } from '../src/level/visits';
import { tutorial } from '@/index';

const FIXED_NOW = '2026-11-23T12:00:00.000Z';

function tutorialLevel() {
  return buildDungeonLevel(tutorial.createTutorialSubject(FIXED_NOW));
}

describe('roomAtPoint', () => {
  it('finds the room under the player centre and nothing in a corridor', () => {
    const level = tutorialLevel();
    const root = level.rooms.find((room) => room.roomId === 'tut-note');
    if (!root) throw new Error('Root room missing');

    const inside = roomAtPoint(level, root.rect.x + root.rect.w / 2, root.rect.y + root.rect.h / 2);
    expect(inside?.roomId).toBe('tut-note');

    const between = roomAtPoint(level, level.bounds.w / 2, level.bounds.y + level.bounds.h - 10);
    expect(between).toBeNull();
  });

  it('uses the centre of the body, not its edges', () => {
    const level = tutorialLevel();
    const root = level.rooms.find((room) => room.roomId === 'tut-note');
    if (!root) throw new Error('Root room missing');

    const body = { x: root.rect.x - 10, y: root.rect.y, w: 30, h: 30 };
    const centre = playerCentre(body);
    expect(roomAtPoint(level, centre.x, centre.y)?.roomId).toBe('tut-note');
  });
});

describe('createVisitTracker', () => {
  const room = (roomId: string) => ({ roomId, topic: roomId, status: 'Created', rect: { x: 0, y: 0, w: 1, h: 1 }, isRoot: false });

  it('emits once per entry and again only after leaving', () => {
    const tracker = createVisitTracker();
    const note = room('tut-note');

    expect(tracker.observe(note)).toBe('tut-note');
    expect(tracker.observe(note)).toBeNull();
    tracker.succeed('tut-note');
    expect(tracker.observe(note)).toBeNull();

    expect(tracker.observe(null)).toBeNull();
    expect(tracker.observe(note)).toBe('tut-note');
  });

  it('does not retry a failed visit until the player leaves the room', () => {
    const tracker = createVisitTracker();
    const note = room('tut-note');

    expect(tracker.observe(note)).toBe('tut-note');
    tracker.fail('tut-note');
    expect(tracker.observe(note)).toBeNull();
    expect(tracker.observe(note)).toBeNull();

    tracker.observe(null);
    expect(tracker.observe(note)).toBe('tut-note');
  });

  it('queues a different room while an entry is pending', () => {
    const tracker = createVisitTracker();
    const note = room('tut-note');
    const tools = room('tut-tools');

    expect(tracker.observe(note)).toBe('tut-note');
    expect(tracker.observe(tools)).toBeNull();
    tracker.succeed('tut-note');
    expect(tracker.observe(tools)).toBe('tut-tools');
  });
});
