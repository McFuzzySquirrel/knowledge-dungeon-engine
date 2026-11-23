#!/usr/bin/env node
/**
 * Capture the P1 dungeon playthrough as a dated visual record.
 *
 * Prerequisites (host tooling, not part of the example build):
 *   1. npm --prefix examples/side-scroller run dev
 *   2. geckodriver --port 4444
 *   3. Firefox on PATH
 *
 * Usage:
 *   node examples/side-scroller/scripts/capture-dungeon.mjs \
 *     --out docs/plans/side-scroller-host/visuals/p1 \
 *     --prefix 2026-11-23-g1 \
 *     --low-fps --reduced-motion
 *
 * P2 adds `--note-loop`, which drives the composer through draft, clear,
 * reload, and a simulated storage failure after the dungeon frames.
 *
 * The script drives the real app over WebDriver, writes PNGs to `--out`, and
 * writes `<prefix>-manifest.json` plus Markdown table rows for VISUALS.md.
 * It does not edit engine source or add test hooks to the page.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function parseArgs(argv) {
  const options = {
    out: 'docs/plans/side-scroller-host/visuals/p1',
    prefix: `${new Date().toISOString().slice(0, 10)}-g1`,
    base: 'http://localhost:5174/',
    driver: 'http://127.0.0.1:4444',
    lowFps: false,
    reducedMotion: false,
    noteLoop: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out') options.out = argv[++index];
    else if (arg === '--prefix') options.prefix = argv[++index];
    else if (arg === '--base') options.base = argv[++index];
    else if (arg === '--driver') options.driver = argv[++index];
    else if (arg === '--low-fps') options.lowFps = true;
    else if (arg === '--reduced-motion') options.reducedMotion = true;
    else if (arg === '--note-loop') options.noteLoop = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const options = parseArgs(process.argv.slice(2));
const OUT = resolve(options.out);
const APP = options.base;
const WD = options.driver;

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

async function wd(method, path, body) {
  const response = await fetch(`${WD}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${JSON.stringify(json)}`);
  return json;
}

async function openSession(prefs = {}) {
  const created = await wd('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        browserName: 'firefox',
        'moz:firefoxOptions': { args: ['-headless'], prefs },
      },
    },
  });
  const id = created.value.sessionId;
  const session = (path) => `/session/${id}${path}`;
  return {
    id,
    session,
    async close() {
      await wd('DELETE', session(''));
    },
    async execute(script) {
      const result = await wd('POST', session('/execute/sync'), { script, args: [] });
      return result.value;
    },
    async executeAsync(script) {
      const result = await wd('POST', session('/execute/async'), { script, args: [] });
      return result.value;
    },
    async screenshot(name) {
      const result = await wd('GET', session('/screenshot'));
      await writeFile(resolve(OUT, name), Buffer.from(result.value, 'base64'));
      return name;
    },
    async hold(value, ms) {
      await wd('POST', session('/actions'), {
        actions: [
          {
            type: 'key',
            id: 'keyboard',
            actions: [
              { type: 'keyDown', value },
              { type: 'pause', duration: ms },
              { type: 'keyUp', value },
            ],
          },
        ],
      });
    },
    async synthDown(code, key) {
      await this.execute(
        `window.dispatchEvent(new KeyboardEvent('keydown', { code: '${code}', key: '${key}', bubbles: true })); return true;`,
      );
    },
    async synthUp(code, key) {
      await this.execute(
        `window.dispatchEvent(new KeyboardEvent('keyup', { code: '${code}', key: '${key}', bubbles: true })); return true;`,
      );
    },
  };
}

async function panel(session) {
  return session.execute(`
    return {
      summary: document.querySelector('#summary')?.innerText ?? '',
      rooms: document.querySelector('#rooms')?.innerText ?? '',
      status: document.querySelector('#status')?.innerText ?? '',
      error: document.querySelector('#error')?.hidden ? '' : (document.querySelector('#error')?.innerText ?? ''),
      overlayHidden: document.querySelector('#overlay')?.hidden ?? null,
      focus: document.activeElement?.id ?? document.activeElement?.tagName ?? '',
    };
  `);
}

async function stored(session) {
  return session.executeAsync(`
    const done = arguments[arguments.length - 1];
    const request = indexedDB.open('knowledge-dungeon-side-scroller');
    request.onerror = () => done({ error: String(request.error) });
    request.onsuccess = () => {
      const get = request.result.transaction('engine-state', 'readonly').objectStore('engine-state').get('state');
      get.onerror = () => done({ error: String(get.error) });
      get.onsuccess = () => {
        const state = get.result;
        if (!state) return done({ error: 'no state' });
        done({
          activeSubjectId: state.activeSubjectId,
          world: state.session.world,
          rooms: Object.keys(state.subjects[state.activeSubjectId]?.rooms ?? {}),
          visited: state.studySessions.find((x) => x.sessionId === state.activeStudySessionId)?.roomsVisited ?? [],
          sessions: state.studySessions.length,
          xp: state.progression[state.activeSubjectId]?.xpTotal ?? null,
          cleared: Object.values(state.subjects[state.activeSubjectId]?.rooms ?? {})
            .filter((room) => room.validationState.finalPass).length,
          artifacts: state.progression[state.activeSubjectId]?.collectedNotes?.length ?? 0,
        });
      };
    };
  `);
}

async function currentRoom(session) {
  return session.execute(`return document.querySelector('#summary')?.innerText ?? '';`);
}

async function waitForRoom(session, needle, timeoutMs = 20000, stepMs = 250) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    await sleep(stepMs);
    const summary = await currentRoom(session);
    if (summary.includes(needle)) return Date.now() - start;
  }
  return null;
}

async function startTutorial(session) {
  await session.execute(`document.querySelector('#start-tutorial').click(); return true;`);
  await sleep(1500);
}

async function waitForExpr(session, expression, timeoutMs = 8000, stepMs = 200) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await session.execute(`return (${expression});`);
    if (value) return Date.now() - start;
    await sleep(stepMs);
  }
  return null;
}

const VALID_NOTE = [
  'Summary',
  'The note records what the learner understood in this room and why it matters.',
  '',
  'Key Points',
  'A note needs a summary, key points, and a recall question. The recall question ends with a question mark.',
  '',
  'Recall Question',
  'Why does a note need a recall question?',
  '',
].join('\n');

/**
 * P2 note loop: draft, clear, reload, and a simulated save failure.
 *
 * The save failure is injected through the page's own IndexedDB prototype, not a
 * test hook in the app: the engine's storage adapter sees a rejected write and its
 * normal "not saved" path runs.
 */
async function captureNoteLoop(prefix, frames) {
  const session = await openSession();
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);

    // Reset the example's own save through its reset control, then reload clean.
    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`);
    await sleep(1500);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2200);
    await startTutorial(session);

    // 07 — composer opens from E, with the section template and textarea focus.
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await waitForExpr(session, `document.querySelector('#note-panel')?.hidden === false`);
    const composer = await session.execute(`
      return {
        focus: document.activeElement?.id ?? '',
        value: document.querySelector('#note-text')?.value ?? '',
        promptHidden: document.querySelector('#prompt')?.hidden ?? null,
      };
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-07-composer.png`),
      label: 'Composer',
      detail: `focus=${composer.focus}; prefilled=${composer.value.includes('Recall Question')}; prompt hidden while open=${composer.promptHidden}`,
    });

    // 08 — incomplete note: exact missing sections, room stays uncleared.
    await session.execute(`
      const text = document.querySelector('#note-text');
      text.value = ['Summary', 'Only the summary heading is present.', ''].join('\\n');
      document.querySelector('#note-submit').click();
      return true;
    `);
    await waitForExpr(session, `document.querySelector('#note-feedback')?.innerText.includes('Missing required') === true`);
    const draft = await session.execute(`
      return {
        feedback: document.querySelector('#note-feedback')?.innerText ?? '',
        errorHidden: document.querySelector('#note-error')?.hidden ?? null,
        focus: document.activeElement?.id ?? '',
      };
    `);
    const draftState = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-08-draft.png`),
      label: 'Draft',
      detail: `missing named=${draft.feedback.includes('Key Points, Recall Question')}; xp=${draftState.xp}; cleared=${draftState.cleared}`,
    });

    // 09 — complete note with confirmation: clear, XP, artifact as plain text.
    await session.execute(`
      const text = document.querySelector('#note-text');
      text.value = ${JSON.stringify(VALID_NOTE)};
      const confirm = document.querySelector('#note-confirmed');
      confirm.checked = true;
      document.querySelector('#note-submit').click();
      return true;
    `);
    await waitForExpr(session, `document.querySelector('#note-outcome')?.hidden === false`);
    await session.execute(`document.querySelector('#note-outcome')?.scrollIntoView({ block: 'start' }); return true;`);
    await sleep(400);
    const cleared = await session.execute(`
      return {
        feedback: document.querySelector('#note-feedback')?.innerText ?? '',
        artifact: document.querySelector('#note-artifact')?.textContent ?? '',
        focus: document.activeElement?.id ?? '',
      };
    `);
    const clearedState = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-09-cleared.png`),
      label: 'Cleared',
      detail: `xp=${clearedState.xp}; cleared=${clearedState.cleared}; artifact pre starts "${cleared.artifact.slice(0, 15)}"; focus=${cleared.focus}`,
    });

    // Take the artifact, then close with Escape; focus must return to the canvas.
    await session.execute(`document.querySelector('#note-collect').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#note-feedback')?.innerText.includes('journal') === true`);
    const collectedState = await stored(session);
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await sleep(400);
    const closed = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-10-closed.png`),
      label: 'Composer closed',
      detail: `artifacts=${collectedState.artifacts}; focus=${closed.focus}; panel hidden=true`,
    });

    // 11 — reload: cleared room, XP, and artifact survive.
    await wd('POST', session.session('/refresh'), {});
    await sleep(2600);
    const reload = await stored(session);
    const reloadHud = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-11-reload.png`),
      label: 'Reload after clear',
      detail: `xp=${reload.xp}; cleared=${reload.cleared}; artifacts=${reload.artifacts}; visits=${reload.visited.length}; cleared label=${reloadHud.rooms.includes('Cleared')}`,
    });

    // 12 — save failure: move to the lower room, open the composer, break the next write.
    await session.hold('d', 650);
    await sleep(300);
    await session.hold('s', 3000);
    await sleep(500);
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await waitForExpr(session, `document.querySelector('#note-panel')?.hidden === false`);
    const beforeFailure = await stored(session);
    await session.execute(`
      const text = document.querySelector('#note-text');
      text.value = ${JSON.stringify(VALID_NOTE)};
      const confirm = document.querySelector('#note-confirmed');
      confirm.checked = true;
      window.__originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('simulated quota failure', 'QuotaExceededError');
      };
      document.querySelector('#note-submit').click();
      return true;
    `);
    const notSavedMs = await waitForExpr(session, `document.querySelector('#note-error')?.hidden === false`);
    await session.execute(`document.querySelector('#note-error')?.scrollIntoView({ block: 'center' }); return true;`);
    await sleep(300);
    const failed = await session.execute(`
      return {
        error: document.querySelector('#note-error')?.innerText ?? '',
        pending: document.querySelector('#note-submit')?.disabled ?? null,
        feedback: document.querySelector('#note-feedback')?.innerText ?? '',
      };
    `);
    const afterFailure = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-12-not-saved.png`),
      label: 'Save failure',
      detail: `shownIn=${notSavedMs ?? 'timeout'}ms; error=${/not saved/i.test(failed.error)}; submit re-enabled=${failed.pending === false}; xp ${beforeFailure.xp}→${afterFailure.xp}; cleared ${beforeFailure.cleared}→${afterFailure.cleared}`,
    });
    await session.execute(`IDBObjectStore.prototype.put = window.__originalPut; delete window.__originalPut; return true;`);

    return {
      composer,
      draft,
      cleared,
      collected: collectedState,
      reload,
      failed,
      beforeFailure,
      afterFailure,
    };
  } finally {
    await session.close();
  }
}

async function captureReducedMotion(prefix, frames) {  const session = await openSession({ 'ui.prefersReducedMotion': 1 });
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);
    const reduced = await session.execute(`return matchMedia('(prefers-reduced-motion: reduce)').matches;`);
    await startTutorial(session);
    const state = await stored(session);
    const hud = await panel(session);
    const file = await session.screenshot(`${prefix}-06-reduced-motion.png`);
    frames.push({
      file,
      label: 'Reduced motion',
      detail: `matchMedia reduced=${reduced}; focus=${hud.focus}; rooms=${state.rooms.length}; visits=${state.visited.length}`,
    });
  } finally {
    await session.close();
  }
}

async function captureDungeon(prefix, frames) {
  const session = await openSession();
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);

    await startTutorial(session);
    frames.push({ file: await session.screenshot(`${prefix}-01-root-room.png`), label: 'Root room', detail: `visits=${(await stored(session)).visited.length}` });
    const boot = await panel(session);

    let frameStats = null;
    if (options.lowFps) {
      await session.execute(`
        window.__hog = setInterval(() => {
          const end = performance.now() + 55;
          while (performance.now() < end) {}
        }, 80);
        return true;
      `);
      frameStats = await session.executeAsync(`
        const done = arguments[arguments.length - 1];
        const deltas = [];
        let last = performance.now();
        function tick(now) {
          deltas.push(now - last);
          last = now;
          if (deltas.length < 30) requestAnimationFrame(tick);
          else done({
            frames: deltas.length,
            avgMs: Math.round(deltas.reduce((a, b) => a + b, 0) / deltas.length),
            maxMs: Math.round(Math.max(...deltas)),
          });
        }
        requestAnimationFrame(tick);
      `);
    }

    // Step into the shaft and ride the ladder down into the lower room.
    await session.hold('d', 650);
    await sleep(300);
    await session.hold('s', 3000);
    await sleep(400);
    const lower = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-02-tools-room${options.lowFps ? '-low-fps' : ''}.png`),
      label: 'Lower room',
      detail: `visits=${lower.visited.length}${frameStats ? `; frames avg=${frameStats.avgMs}ms max=${frameStats.maxMs}ms` : ''}`,
    });

    if (options.lowFps) {
      await session.execute(`clearInterval(window.__hog); delete window.__hog; return true;`);
      await sleep(300);
    }

    // Climb until the centre enters the upper room.
    await session.synthDown('KeyW', 'w');
    const climbMs = await waitForRoom(session, 'The Map & Beyond');
    await session.synthUp('KeyW', 'w');
    await sleep(600);
    const upper = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-03-map-room.png`),
      label: 'Upper room',
      detail: `climb=${climbMs ?? 'timeout'}ms; visits=${upper.visited.length}`,
    });

    // Descend into the root room and step off the ladder.
    await session.synthDown('KeyS', 's');
    const descendMs = await waitForRoom(session, 'The Note');
    await session.synthUp('KeyS', 's');
    await sleep(300);
    await session.hold('a', 700);
    await sleep(900);
    const rootAgain = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-04-return-to-root.png`),
      label: 'Return to root',
      detail: `descend=${descendMs ?? 'timeout'}ms; visits=${rootAgain.visited.length}`,
    });

    // Reload proves the subject and rooms survive IndexedDB.
    await wd('POST', session.session('/refresh'), {});
    await sleep(2600);
    const reload = await stored(session);
    const reloadHud = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-05-reload.png`),
      label: 'Reload',
      detail: `rooms=${reload.rooms.length}; sessions=${reload.sessions}; visits=${reload.visited.length}; focus=${reloadHud.focus}`,
    });

    return {
      boot,
      frameStats,
      final: reload,
      error: reloadHud.error,
    };
  } finally {
    await session.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const frames = [];
  if (options.reducedMotion) await captureReducedMotion(options.prefix, frames);
  const run = await captureDungeon(options.prefix, frames);
  const notes = options.noteLoop ? await captureNoteLoop(options.prefix, frames) : null;

  const manifest = {
    capturedAt: new Date().toISOString(),
    app: APP,
    viewport: 'default headless Firefox (captured window)',
    prefix: options.prefix,
    lowFps: options.lowFps,
    noteLoop: options.noteLoop,
    frameStats: run.frameStats,
    finalState: run.final,
    error: run.error,
    notes,
    frames,
  };
  await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));

  console.log(JSON.stringify(manifest, null, 2));
  console.log('\nMarkdown rows:\n');
  const date = manifest.capturedAt.slice(0, 10);
  for (const frame of frames) {
    console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
  }
}

await main();
