import { createCreatorGraphController } from './application/creatorGraphCommands';
import type { GraphCommand } from './application/contracts/commands';
import { createRootDungeon, type GraphDomainResult, type RootDungeonInitInput } from './core/graph';
import { makeDefaultSubjectProgression } from './core/progression/canonicalProgression';
import { makeEmptyRoomMetadata, type SubjectSnapshot } from './core/validation/persistence';
import { createEmptyState, type EngineState, type EngineStorage } from './storage';

export interface CreatorEngineOptions {
  storage: EngineStorage;
  nowIso(): string;
  newRoomId(): string;
}

function validId(id: string): boolean {
  return id.trim().length > 0 && !['__proto__', 'constructor', 'prototype'].includes(id);
}

/**
 * An initial creator-only facade. Use one instance per storage adapter: the
 * adapter contract does not coordinate writes from separate instances.
 */
export class CreatorEngine {
  private queue: Promise<void> = Promise.resolve();

  private constructor(
    private state: EngineState,
    private readonly options: CreatorEngineOptions,
  ) {}

  static async open(options: CreatorEngineOptions): Promise<CreatorEngine> {
    const state = await options.storage.load();
    if (state !== null && state.version !== 1) {
      throw new Error('Unsupported engine state version');
    }
    return new CreatorEngine(structuredClone(state ?? createEmptyState()), options);
  }

  snapshot(): EngineState {
    return structuredClone(this.state);
  }

  private serialize<T>(work: () => Promise<T>): Promise<T> {
    const result = this.queue.then(work);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async commit(next: EngineState): Promise<void> {
    await this.options.storage.save(structuredClone(next));
    this.state = next;
  }

  createSubject(input: RootDungeonInitInput): Promise<GraphDomainResult<SubjectSnapshot>> {
    return this.serialize(async () => {
      if (!validId(input.dungeonId) || !validId(input.rootRoomId)) {
        throw new Error('Invalid subject id');
      }
      if (Object.hasOwn(this.state.subjects, input.dungeonId)) {
        throw new Error('Subject already exists');
      }
      const result = createRootDungeon(input);
      if (!result.ok) return result;
      const dungeon = result.value;
      const snapshot: SubjectSnapshot = {
        dungeon,
        rooms: {
          [dungeon.rootRoomId]: makeEmptyRoomMetadata({
            roomId: dungeon.rootRoomId,
            topic: dungeon.rooms[0].topic,
            nowIso: input.nowIso,
          }),
        },
      };
      const next = structuredClone(this.state);
      next.subjects[dungeon.dungeonId] = snapshot;
      next.progression[dungeon.dungeonId] = {
        ...makeDefaultSubjectProgression(),
        subjectId: dungeon.dungeonId,
        extraFields: {},
      };
      next.activeSubjectId = dungeon.dungeonId;
      await this.commit(next);
      return { ok: true, value: structuredClone(snapshot) };
    });
  }

  dispatchGraph(command: GraphCommand) {
    return this.serialize(async () => {
      const activeId = this.state.activeSubjectId;
      const controller = createCreatorGraphController({
        nowIso: this.options.nowIso,
        newRoomId: () => {
          const id = this.options.newRoomId();
          if (!validId(id)) throw new Error('Invalid room id');
          return id;
        },
        store: {
          readSnapshot: () => activeId ? structuredClone(this.state.subjects[activeId] ?? null) : null,
          commit: async (snapshot) => {
            if (!activeId) throw new Error('No active subject');
            const next = structuredClone(this.state);
            next.subjects[activeId] = structuredClone(snapshot);
            await this.commit(next);
          },
          reportFailure: () => {},
        },
      });
      return controller.dispatch(command);
    });
  }
}
