import type { EngineState } from '@/index';

/**
 * Pure Creator projections (P6).
 *
 * No DOM, no canvas, no commands. The panel renders these view models and
 * `main.ts` refreshes them from the one engine subscription after every
 * committed mutation.
 *
 * The tree is expressed by `subtopic` edges; every other relation type is a
 * cross-link. Room order is depth-first from the root in edge order, with any
 * room the root cannot reach appended at depth 0 so a corrupt graph is still
 * inspectable instead of disappearing.
 */

export interface CreatorSubjectView {
  subjectId: string;
  subjectName: string;
  roomCount: number;
  clearedCount: number;
  rootRoomId: string;
}

export interface CreatorRoomView {
  roomId: string;
  topic: string;
  parentRoomId: string | null;
  tags: string[];
  depth: number;
}

export interface CreatorView {
  subjects: CreatorSubjectView[];
  /** The subject this view projects, not necessarily `state.activeSubjectId`. */
  activeSubjectId: string | null;
  rooms: CreatorRoomView[];
  /** Cross-links only; the tree is expressed by each room's parent. */
  edges: { fromRoomId: string; toRoomId: string; relationType: string }[];
}

const TREE_RELATION = 'subtopic';

function projectSubjects(state: EngineState): CreatorSubjectView[] {
  return Object.values(state.subjects).map((subject) => ({
    subjectId: subject.dungeon.dungeonId,
    subjectName: subject.dungeon.subjectName,
    roomCount: subject.dungeon.rooms.length,
    clearedCount: Object.values(subject.rooms).filter(
      (room) => room.validationState.finalPass,
    ).length,
    rootRoomId: subject.dungeon.rootRoomId,
  }));
}

export function projectCreator(state: EngineState, subjectId: string | null): CreatorView {
  const subjects = projectSubjects(state);
  const subject = subjectId ? state.subjects[subjectId] : undefined;
  if (!subject || !subjectId) {
    return { subjects, activeSubjectId: null, rooms: [], edges: [] };
  }

  const summaryById = new Map(subject.dungeon.rooms.map((room) => [room.roomId, room]));
  const parentOf = new Map<string, string>();
  const childrenOf = new Map<string, string[]>();
  for (const edge of subject.dungeon.edges) {
    if (edge.relationType !== TREE_RELATION) continue;
    if (!summaryById.has(edge.toRoomId)) continue;
    parentOf.set(edge.toRoomId, edge.fromRoomId);
    const siblings = childrenOf.get(edge.fromRoomId) ?? [];
    siblings.push(edge.toRoomId);
    childrenOf.set(edge.fromRoomId, siblings);
  }

  const rooms: CreatorRoomView[] = [];
  const seen = new Set<string>();
  const visit = (roomId: string, depth: number): void => {
    if (seen.has(roomId) || !summaryById.has(roomId)) return;
    seen.add(roomId);
    const summary = summaryById.get(roomId);
    const metadata = subject.rooms[roomId];
    rooms.push({
      roomId,
      topic: metadata?.topic ?? summary?.topic ?? roomId,
      parentRoomId: parentOf.get(roomId) ?? null,
      tags: [...(metadata?.tags ?? [])],
      depth,
    });
    for (const childId of childrenOf.get(roomId) ?? []) visit(childId, depth + 1);
  };
  visit(subject.dungeon.rootRoomId, 0);
  for (const summary of subject.dungeon.rooms) visit(summary.roomId, 0);

  return {
    subjects,
    activeSubjectId: subjectId,
    rooms,
    edges: subject.dungeon.edges
      .filter((edge) => edge.relationType !== TREE_RELATION)
      .map((edge) => ({
        fromRoomId: edge.fromRoomId,
        toRoomId: edge.toRoomId,
        relationType: edge.relationType,
      })),
  };
}

/**
 * How many rooms a removal would take, including the room itself.
 *
 * Mirrors `removeRoom` in `src/core/graph/graphDomain.ts`: adjacency is
 * undirected over **all** edges (cross-links included), the removed room is
 * dropped, and every room no longer reachable from the root is cascaded. A
 * hierarchy-only count would over-report, because the engine lets a cross-link
 * keep a branch reachable.
 */
export function cascadeRemovalCount(view: CreatorView, roomId: string): number {
  if (!view.activeSubjectId) return 1;
  const subject = view.subjects.find((entry) => entry.subjectId === view.activeSubjectId);
  const rootRoomId = subject?.rootRoomId;
  if (!rootRoomId) return 1;

  const adjacency = new Map<string, Set<string>>();
  for (const room of view.rooms) {
    adjacency.set(room.roomId, new Set());
  }
  const connect = (a: string, b: string): void => {
    adjacency.get(a)?.add(b);
    adjacency.get(b)?.add(a);
  };
  for (const room of view.rooms) {
    if (room.parentRoomId) connect(room.parentRoomId, room.roomId);
  }
  for (const edge of view.edges) connect(edge.fromRoomId, edge.toRoomId);

  const reachable = new Set<string>();
  const queue: string[] = [rootRoomId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reachable.has(current) || current === roomId) continue;
    reachable.add(current);
    for (const neighbour of adjacency.get(current) ?? []) {
      if (!reachable.has(neighbour)) queue.push(neighbour);
    }
  }
  const removed = view.rooms.filter((room) => !reachable.has(room.roomId)).length;
  return removed === 0 ? 1 : removed;
}
