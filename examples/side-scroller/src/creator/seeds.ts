import type { KnowledgeDungeonEngine } from '@/index';

/**
 * Demo campaign seeds (P6).
 *
 * Three synthetic subjects give a fresh save a campaign without a Creator
 * detour. Every id is stable and every string is authored content; no learner
 * material is read, written, or copied here.
 *
 * Engine facts this module relies on (P6-T1):
 *
 * - `createSubject` mints the root room and starts a study session.
 * - `graph/children-add` has no room-id field: the engine mints child ids and
 *   returns them in submitted-topic order. A seed therefore holds a local
 *   `key`, never a persisted room id.
 * - `dispatchGraph` operates on the active subject only, so the root is created
 *   immediately before its children, tags, and cross-links.
 * - Every seed path ends in `returnToVillage()`, which closes the session
 *   started by `createSubject` (K-15).
 */

/** A seed-local handle for a child room; never a persisted id. */
export interface DemoSubjectChild {
  key: string;
  topic: string;
  tags?: readonly string[];
}

/** One synthetic demo subject. */
export interface DemoSubjectSeed {
  dungeonId: string;
  subjectName: string;
  rootRoomId: string;
  rootTopic: string;
  biome?: string;
  children: readonly DemoSubjectChild[];
  /** Child `key` pairs; the root is addressed as `@root`. */
  crossLinks?: readonly { from: string; to: string }[];
}

export interface SeedResult {
  /** Demo ids this run created, in seed order. */
  seeded: string[];
  /** Demo ids that already existed and were skipped without a command. */
  alreadyPresent: string[];
  /** True when a non-demo subject exists, so the first-run path is not taken. */
  skipped: boolean;
  /** Demo ids this run attempted but did not complete, in seed order. */
  failed: string[];
}

/** The three demo subjects. Ids are stable so a re-run cannot duplicate them. */
export const DEMO_SUBJECT_SEEDS: readonly DemoSubjectSeed[] = [
  {
    dungeonId: 'demo-rivers',
    subjectName: 'Rivers & Bridges',
    rootRoomId: 'demo-rivers-root',
    rootTopic: 'Why Rivers Matter',
    children: [
      { key: 'shapes', topic: 'River Shapes', tags: ['geography', 'water'] },
      { key: 'bridges', topic: 'Bridge Types', tags: ['engineering'] },
      { key: 'floods', topic: 'Flood Planning', tags: ['safety', 'water'] },
    ],
  },
  {
    dungeonId: 'demo-sky',
    subjectName: 'Sky & Weather',
    rootRoomId: 'demo-sky-root',
    rootTopic: 'Reading the Sky',
    children: [
      { key: 'clouds', topic: 'Cloud Families', tags: ['observation'] },
      { key: 'pressure', topic: 'Pressure & Wind', tags: ['physics'] },
      { key: 'storms', topic: 'Storm Signs', tags: ['safety'] },
      { key: 'forecast', topic: 'Forecast Practice', tags: ['practice'] },
    ],
  },
  {
    dungeonId: 'demo-kitchen',
    subjectName: 'Kitchen Chemistry',
    rootRoomId: 'demo-kitchen-root',
    rootTopic: 'Everyday Reactions',
    children: [
      { key: 'browning', topic: 'Heat & Browning', tags: ['cooking'] },
      { key: 'acids', topic: 'Acids & Bases', tags: ['chemistry'] },
      { key: 'emulsions', topic: 'Emulsions', tags: ['cooking', 'chemistry'] },
    ],
    crossLinks: [{ from: 'browning', to: 'emulsions' }],
  },
];

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Idempotently create the demo subjects.
 *
 * Skips every id that already exists without dispatching a command. Returns
 * `skipped` when the save already has a non-demo subject: seeding is a
 * first-run path, never a migration. A failure stops dispatching for that seed
 * but leaves earlier subjects valid; the partial result reports it.
 */
export async function seedDemoSubjects(
  engine: KnowledgeDungeonEngine,
  seeds: readonly DemoSubjectSeed[] = DEMO_SUBJECT_SEEDS,
): Promise<SeedResult> {
  const before = engine.snapshot();
  const demoIds = new Set(seeds.map((seed) => seed.dungeonId));
  const hasForeignSubject = Object.keys(before.subjects).some((id) => !demoIds.has(id));
  if (hasForeignSubject) {
    return { seeded: [], alreadyPresent: [], skipped: true, failed: [] };
  }

  const result: SeedResult = { seeded: [], alreadyPresent: [], skipped: false, failed: [] };
  let attempted = false;

  try {
    for (const seed of seeds) {
      if (Object.hasOwn(before.subjects, seed.dungeonId)) {
        result.alreadyPresent.push(seed.dungeonId);
        continue;
      }
      attempted = true;
      try {
        const created = await engine.createSubject({
          dungeonId: seed.dungeonId,
          subjectName: seed.subjectName,
          rootRoomId: seed.rootRoomId,
          rootTopic: seed.rootTopic,
          nowIso: nowIso(),
          ...(seed.biome === undefined ? {} : { biome: seed.biome }),
        });
        if (!created.ok) {
          result.failed.push(seed.dungeonId);
          continue;
        }

        const roomIds = new Map<string, string>();
        if (seed.children.length > 0) {
          const children = await engine.dispatchGraph({
            type: 'graph/children-add',
            payload: {
              parentRoomId: seed.rootRoomId,
              topics: seed.children.map((child) => child.topic),
            },
          });
          if (!children.ok) throw new Error(children.error.message);
          if (children.value.command !== 'graph/children-add') {
            throw new Error('Unexpected children-add outcome');
          }
          children.value.createdRoomIds.forEach((roomId, index) => {
            const child = seed.children[index];
            if (child) roomIds.set(child.key, roomId);
          });
        }

        for (const child of seed.children) {
          if (!child.tags || child.tags.length === 0) continue;
          const roomId = roomIds.get(child.key);
          if (!roomId) throw new Error(`Seed child ${child.key} was not created`);
          const tagged = await engine.dispatchGraph({
            type: 'graph/tags-set',
            payload: { roomId, tags: [...child.tags] },
          });
          if (!tagged.ok) throw new Error(tagged.error.message);
        }

        for (const link of seed.crossLinks ?? []) {
          const resolve = (handle: string): string | undefined =>
            handle === '@root' ? seed.rootRoomId : roomIds.get(handle);
          const fromRoomId = resolve(link.from);
          const toRoomId = resolve(link.to);
          if (!fromRoomId || !toRoomId) {
            throw new Error(`Seed cross-link ${link.from} → ${link.to} names an unknown room`);
          }
          const linked = await engine.dispatchGraph({
            type: 'graph/cross-link-add',
            payload: { fromRoomId, toRoomId },
          });
          if (!linked.ok) throw new Error(linked.error.message);
        }

        result.seeded.push(seed.dungeonId);
      } catch {
        // Keep the partially created subject and report it; later seeds still run.
        result.failed.push(seed.dungeonId);
      }
    }
  } finally {
    if (attempted) {
      // Close the session `createSubject` opened, even after a partial failure.
      await engine.returnToVillage().catch(() => undefined);
    }
  }

  return result;
}

/** localStorage key for the host-owned first-run flag. */
export const DEMO_SEED_FLAG_KEY = 'knowledge-dungeon.side-scroller.demo-seeded.v1';

/** The two operations the first-run wrapper needs from host storage. */
export interface SeedFlagStore {
  read(): string | null;
  write(value: string): void;
}

/** A `SeedFlagStore` over `localStorage`; failures degrade to "unset". */
export function browserSeedFlagStore(): SeedFlagStore {
  return {
    read() {
      try {
        return window.localStorage.getItem(DEMO_SEED_FLAG_KEY);
      } catch {
        return null;
      }
    },
    write(value) {
      try {
        window.localStorage.setItem(DEMO_SEED_FLAG_KEY, value);
      } catch {
        // A private-mode quota failure only means the flag is retried next boot.
      }
    },
  };
}

/**
 * Run the seed only on the first boot, then record the host-owned flag.
 *
 * The flag is written even when `seedDemoSubjects` skips, so an existing save
 * is never treated as a first run later.
 */
export async function seedDemoSubjectsOnFirstRun(
  engine: KnowledgeDungeonEngine,
  seeds: readonly DemoSubjectSeed[],
  flag: SeedFlagStore,
): Promise<SeedResult> {
  if (flag.read() !== null) {
    return { seeded: [], alreadyPresent: [], skipped: true, failed: [] };
  }
  const result = await seedDemoSubjects(engine, seeds);
  flag.write(nowIso());
  return result;
}
