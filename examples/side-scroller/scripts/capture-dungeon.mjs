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
 * P3 adds `--surface`, which captures the village street, portal entry,
 * clearing a room, the shaft return, and reloads on both screens.
 * P4 adds `--fishing`, which captures the pond entry, cast, bite, recall,
 * keep, a rejected save, release, and mid-cast reload recovery.
 * P5 adds `--review`, which clears the three tutorial rooms, captures the locked
 * refusal and the `R review` prompt, rates a pass, saves for later across a
 * reload, resumes, discards, shows the duplicate award, and simulates a rejected
 * review save.
 * P6 adds `--creator`, which opens the Guild Hall's Creator overlay with `C`,
 * creates a subject, adds a nested room tree, tags a room, cross-links two
 * rooms, captures the cascade confirmation, removes the subtree, shows the new
 * street portal, records a duplicate-name refusal and a rejected graph write,
 * and checks the keyboard focus path.
 * P10 adds `--p10` (the first-ten-minutes path plus layout, focus, large-text,
 * phone, and import checks), `--perf` (10-second traces plus an about:blank
 * baseline), and `--smoke` (a production-build boot check). The P10 modes
 * subscribe to the browser log and record console errors/warnings.
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
    surface: false,
    fishing: false,
    review: false,
    creator: false,
    services: false,
    journal: false,
    help: false,
    openings: false,
    shell: false,
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
    else if (arg === '--surface') options.surface = true;
    else if (arg === '--fishing') options.fishing = true;
    else if (arg === '--review') options.review = true;
    else if (arg === '--creator') options.creator = true;
    else if (arg === '--services') options.services = true;
    else if (arg === '--journal') options.journal = true;
    else if (arg === '--help') options.help = true;
    else if (arg === '--openings') options.openings = true;
    else if (arg === '--shell' || arg === '--mobile') options.shell = true;
    else if (arg === '--p10') options.p10 = true;
    else if (arg === '--perf') options.perf = true;
    else if (arg === '--smoke') options.smoke = true;
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
        webSocketUrl: true,
        'moz:firefoxOptions': { args: ['-headless'], prefs },
      },
    },
  });
  const id = created.value.sessionId;
  const bidiUrl = created.value.capabilities?.webSocketUrl ?? null;
  const session = (path) => `/session/${id}${path}`;
  let bidi = null;
  let bidiNext = 1;
  const bidiPending = new Map();
  /** P10: browser console and uncaught-error entries, subscribed before navigation. */
  const consoleEntries = [];

  function bidiCommand(method, params) {
    if (!bidi) throw new Error('WebDriver BiDi is not available for this session');
    const messageId = bidiNext++;
    bidi.send(JSON.stringify({ id: messageId, method, params }));
    return new Promise((resolve) => bidiPending.set(messageId, resolve));
  }

  async function ensureBidi() {
    if (!bidiUrl) return false;
    if (!bidi) {
      bidi = new WebSocket(bidiUrl);
      await new Promise((resolve, reject) => {
        bidi.onopen = resolve;
        bidi.onerror = reject;
      });
      bidi.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.method === 'log.entryAdded') {
          const entry = message.params?.entry ?? {};
          consoleEntries.push({
            level: entry.level ?? '',
            type: entry.type ?? '',
            text: entry.text ?? '',
          });
        }
        if (message.id && bidiPending.has(message.id)) {
          bidiPending.get(message.id)(message);
          bidiPending.delete(message.id);
        }
      };
    }
    return true;
  }

  async function subscribeLogs() {
    if (!(await ensureBidi())) return false;
    const result = await bidiCommand('session.subscribe', { events: ['log.entryAdded'] });
    return result.type === 'success';
  }

  async function setViewport(width, height, devicePixelRatio = 1) {
    if (!bidiUrl) return false;
    if (!(await ensureBidi())) return false;
    const tree = await bidiCommand('browsingContext.getTree', { maxDepth: 0 });
    const context = tree.result.contexts[0].context;
    const result = await bidiCommand('browsingContext.setViewport', {
      context,
      viewport: { width, height },
      devicePixelRatio,
    });
    return result.type === 'success';
  }

  return {
    id,
    session,
    setViewport,
    subscribeLogs,
    consoleEntries,
    consoleErrors() {
      return consoleEntries.filter(
        (entry) =>
          entry.level === 'error' ||
          entry.level === 'warning' ||
          entry.type === 'javascript',
      );
    },
    async close() {
      bidi?.close();
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
      recovery: document.querySelector('#recovery')?.hidden
        ? ''
        : (document.querySelector('#recovery-text')?.innerText ?? ''),
      fishing: document.querySelector('#fishing-panel')?.hidden === false
        ? (document.querySelector('#fishing-panel')?.innerText ?? '')
        : null,
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
          activeStudy: state.activeStudySessionId !== null,
          subjects: Object.keys(state.subjects).length,
          world: state.session.world,
          rooms: Object.keys(state.subjects[state.activeSubjectId]?.rooms ?? {}),
          visited: state.studySessions.find((x) => x.sessionId === state.activeStudySessionId)?.roomsVisited ?? [],
          sessions: state.studySessions.length,
          xp: state.progression[state.activeSubjectId]?.xpTotal ?? null,
          inventory:
            Object.values(state.progression ?? {}).reduce(
              (sum, record) => sum + (record?.inventory?.length ?? 0),
              0,
            ),
          equipped:
            Object.values(state.progression ?? {}).reduce(
              (sum, record) => sum + (record?.equippedItems?.length ?? 0),
              0,
            ),
          xpTotal: Object.values(state.progression ?? {})
            .reduce((sum, record) => sum + (record?.xpTotal ?? 0), 0),
          fish: Object.values(state.progression ?? {})
            .reduce((sum, record) => sum + (record?.fishCollection?.length ?? 0), 0),
          cleared: Object.values(state.subjects[state.activeSubjectId]?.rooms ?? {})
            .filter((room) => room.validationState.finalPass).length,
          artifacts: state.progression[state.activeSubjectId]?.collectedNotes?.length ?? 0,
          reviewPasses: state.progression[state.activeSubjectId]?.reviewPasses ?? 0,
          reviewPassesTotal: Object.values(state.progression ?? {}).reduce(
            (sum, record) => sum + (record?.reviewPasses ?? 0),
            0,
          ),
          reviewPassCounts: Object.fromEntries(
            Object.entries(state.subjects[state.activeSubjectId]?.rooms ?? {})
              .map(([id, room]) => [id, room.reviewPassCount ?? 0]),
          ),
          nextReview: Object.fromEntries(
            Object.entries(state.subjects[state.activeSubjectId]?.rooms ?? {})
              .map(([id, room]) => [id, room.sm2NextReviewDate ?? null]),
          ),
          marker:
            state.progression[state.activeSubjectId]?.extraFields?.interruptedReviewSession?.roomId ?? null,
          attachmentKeys: Object.keys(state.attachmentBytes ?? {}),
          attachmentSizes: Object.fromEntries(
            Object.entries(state.attachmentBytes ?? {}).map(([key, bytes]) => [key, bytes?.length ?? 0]),
          ),
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
  await waitForExpr(session, `document.querySelector('#start-tutorial') !== null`, 10000);
  await session.execute(`document.querySelector('#start-tutorial').click(); return true;`);
  await sleep(1500);
}

/** P9+ reloads land on the title; continue before testing the world. */
async function continueTitleIfVisible(session) {
  const visible = await waitForExpr(
    session,
    `document.querySelector('#title-panel')?.hidden === false`,
    6000,
  );
  if (visible === null) return false;
  await session.execute(`document.querySelector('#title-continue').click(); return true;`);
  await waitForExpr(session, `document.querySelector('#overlay')?.hidden === true`, 8000);
  await sleep(400);
  return true;
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

/** The Nearby row is only rendered while the desktop panel is open. */
async function ensureProgressVisible(session) {
  await session.execute(`
    const panel = document.querySelector('#progress-panel');
    if (panel?.hidden) document.querySelector('#toggle-panel').click();
    return true;
  `);
  await sleep(300);
}

/** Hold a direction until the HUD's Nearby row names the target. */
async function walkToNearby(session, code, key, needle, timeoutMs = 15000) {
  const hidden = await session.execute(
    `return document.querySelector('#progress-panel')?.hidden === true;`,
  );
  if (hidden) await ensureProgressVisible(session);
  await session.synthDown(code, key);
  const start = Date.now();
  let found = false;
  let nearby = '';
  while (Date.now() - start < timeoutMs) {
    await sleep(100);
    const summary = (await panel(session)).summary;
    const lines = summary.split('\n');
    const at = lines.indexOf('Nearby');
    nearby = at >= 0 ? lines[at + 1] : '';
    if (nearby.includes(needle)) {
      found = true;
      break;
    }
  }
  await session.synthUp(code, key);
  await sleep(250);
  return { found, nearby };
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
    if (!(await openComposerWithRetry(session))) throw new Error('The note composer did not open');
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
    await continueTitleIfVisible(session);
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
    if (!(await openComposerWithRetry(session))) throw new Error('The note composer did not open');
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
    await continueTitleIfVisible(session);
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

async function captureSurface(prefix, frames) {
  const session = await openSession();
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);

    // Reset the example's own save, then reload clean.
    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`);
    await sleep(1400);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2200);
    await continueTitleIfVisible(session);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`);
    await waitForExpr(session, `document.querySelector('#prompt')?.hidden === false`, 5000);

    const boot = await panel(session);
    const bootState = await stored(session);
    const bootWorld = bootState.world ?? (bootState.error ? 'fresh save (no durable state yet)' : 'unknown');
    const nearby = boot.summary.match(/Nearby\n(.+)/)?.[1] ?? 'none';
    frames.push({
      file: await session.screenshot(`${prefix}-01-street.png`),
      label: 'Village street',
      detail: `world=${bootWorld}; subjects=${bootState.subjects ?? 0}; nearby=${nearby}`,
    });

    // The spawn is in front of the Training Grounds door; E enters the tutorial.
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    const enterMs = await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`);
    await sleep(800);
    const entered = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-02-dungeon-entry.png`),
      label: 'Portal entry',
      detail: `shownIn=${enterMs ?? 'timeout'}ms; world=${entered.world}; active=${entered.activeStudy}; subjects=${entered.subjects}; rooms=${entered.rooms.length}`,
    });

    // Clear the root room with the same note fixture used at G2.
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    let composerOpen = await waitForExpr(session, `document.querySelector('#note-panel')?.hidden === false`);
    if (composerOpen === null) {
      // The portal transition can swallow the first E; retry once, then fail loudly.
      await sleep(400);
      await session.synthDown('KeyE', 'e');
      await session.synthUp('KeyE', 'e');
      composerOpen = await waitForExpr(session, `document.querySelector('#note-panel')?.hidden === false`);
    }
    if (composerOpen === null) throw new Error('The surface run could not open the note composer');
    await session.execute(`
      const text = document.querySelector('#note-text');
      text.value = ${JSON.stringify(VALID_NOTE)};
      document.querySelector('#note-confirmed').checked = true;
      document.querySelector('#note-submit').click();
      return true;
    `);
    await waitForExpr(session, `document.querySelector('#note-outcome')?.hidden === false`);
    const cleared = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-03-cleared.png`),
      label: 'Room cleared',
      detail: `world=${cleared.world}; xp=${cleared.xp}; cleared=${cleared.cleared}; active session=${cleared.activeStudy}`,
    });
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await sleep(400);

    // Step onto the root-room ladder, climb to the street, and let the exit zone
    // call returnToVillage().
    await session.synthDown('KeyD', 'd');
    await sleep(320);
    await session.synthUp('KeyD', 'd');
    await sleep(200);
    await session.synthDown('KeyW', 'w');
    const returnMs = await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      25000,
    );
    await session.synthUp('KeyW', 'w');
    await sleep(600);
    const returned = await panel(session);
    const returnedState = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-04-returned.png`),
      label: 'Returned through the shaft',
      detail: `climb=${returnMs ?? 'timeout'}ms; world=${returnedState.world}; activeSubject=${returnedState.activeSubjectId}; active session=${returnedState.activeStudy}; sessions=${returnedState.sessions}; portals label=${returned.rooms.includes('First Dungeon (Tutorial)')}`,
    });

    // Reload on the surface: engine state, subject portals, and cleared count survive.
    await wd('POST', session.session('/refresh'), {});
    await sleep(2600);
    await continueTitleIfVisible(session);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`);
    const reloadSurface = await stored(session);
    const reloadSurfacePanel = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-05-reload-surface.png`),
      label: 'Reload on the street',
      detail: `world=${reloadSurface.world}; subjects=${reloadSurface.subjects}; activeSubject=${reloadSurface.activeSubjectId}; portal row=${reloadSurfacePanel.rooms.includes('rooms cleared')}`,
    });

    // Enter the training gate again, then reload in the dungeon. P0-T5 recovery
    // ends the interrupted session and re-enters the tutorial.
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2600);
    await continueTitleIfVisible(session);
    const reloadDungeon = await stored(session);
    const reloadDungeonPanel = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-06-reload-dungeon.png`),
      label: 'Reload in the dungeon',
      detail: `world=${reloadDungeon.world}; active=${reloadDungeon.activeStudy}; rooms=${reloadDungeon.rooms.length}; sessions=${reloadDungeon.sessions}; summary has world=${reloadDungeonPanel.summary.includes('dungeon')}`,
    });

    return {
      boot: bootState,
      entered,
      cleared,
      returned: returnedState,
      reloadSurface,
      reloadDungeon,
      error: reloadDungeonPanel.error,
    };
  } finally {
    await session.close();
  }
}

async function captureFishing(prefix, frames) {
  const session = await openSession(options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {});
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);

    // Reset the example's own save, then reload clean.
    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`);
    await sleep(1400);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2200);
    await continueTitleIfVisible(session);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`);

    // Before any clear, the pond must explain why E cannot open it — on the
    // canvas, not only in the side panel.
    const freshPond = await walkToNearby(session, 'KeyA', 'a', 'Fishing Pond');
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    const refusalMs = await waitForExpr(session, `document.querySelector('#toast')?.hidden === false`, 3000);
    const refusalText = await session.execute(`return document.querySelector('#toast')?.innerText ?? '';`);
    frames.push({
      file: await session.screenshot(`${prefix}-01a-pond-refusal.png`),
      label: 'Pond before a clear',
      detail: `nearby=${freshPond.nearby}; shownIn=${refusalMs ?? 'timeout'}ms; canvas message="${refusalText}"`,
    });
    await walkToNearby(session, 'KeyD', 'd', 'Training Grounds');

    // The spawn is in front of the Training Grounds door; E opens the tutorial.
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`);
    await sleep(800);
    const entered = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-01-dungeon-entry.png`),
      label: 'Dungeon entry',
      detail: `world=${entered.world}; active session=${entered.activeStudy}; rooms=${entered.rooms.length}`,
    });

    // Clear one room so the pond is eligible.
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    let composerOpen = await waitForExpr(session, `document.querySelector('#note-panel')?.hidden === false`);
    if (composerOpen === null) {
      await sleep(400);
      await session.synthDown('KeyE', 'e');
      await session.synthUp('KeyE', 'e');
      composerOpen = await waitForExpr(session, `document.querySelector('#note-panel')?.hidden === false`);
    }
    if (composerOpen === null) throw new Error('The fishing run could not open the note composer');
    await session.execute(`
      const text = document.querySelector('#note-text');
      text.value = ${JSON.stringify(VALID_NOTE)};
      document.querySelector('#note-confirmed').checked = true;
      document.querySelector('#note-submit').click();
      return true;
    `);
    await waitForExpr(session, `document.querySelector('#note-outcome')?.hidden === false`);
    const cleared = await stored(session);
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await sleep(400);

    // Climb the entrance shaft to the street.
    await session.synthDown('KeyD', 'd');
    await sleep(320);
    await session.synthUp('KeyD', 'd');
    await session.synthDown('KeyW', 'w');
    const returnMs = await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      25000,
    );
    await session.synthUp('KeyW', 'w');
    await sleep(600);

    // Walk left to the nearest pond; the HUD's Nearby row is the proximity proof.
    await session.synthDown('KeyA', 'a');
    let pondReached = null;
    for (let index = 0; index < 80; index += 1) {
      await sleep(100);
      const summary = (await panel(session)).summary;
      const lines = summary.split('\n');
      const at = lines.indexOf('Nearby');
      const nearby = at >= 0 ? lines[at + 1] : '';
      if (nearby.includes('Fishing Pond')) {
        pondReached = { steps: index, nearby };
        break;
      }
    }
    await session.synthUp('KeyA', 'a');
    await sleep(300);
    const surfaceBefore = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-02-pond-on-street.png`),
      label: 'Pond on the street',
      detail: `cleared=${cleared.cleared}; nearby=${pondReached?.nearby ?? 'not reached'}; prompt=${surfaceBefore.status}`,
    });
    if (!pondReached) throw new Error('The player did not reach a fishing pond');

    // Enter the pond.
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    const enterMs = await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Fishing pond') === true`,
    );
    const pond = await stored(session);
    const reduced = await session.execute(`return matchMedia('(prefers-reduced-motion: reduce)').matches;`);
    const frameStats = await session.executeAsync(`
      const done = arguments[arguments.length - 1];
      const deltas = [];
      const started = performance.now();
      let last = started;
      function tick(now) {
        deltas.push(now - last);
        last = now;
        if (now - started < 10000) requestAnimationFrame(tick);
        else {
          const sorted = [...deltas].sort((a, b) => a - b);
          done({
            frames: deltas.length,
            avgMs: Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100,
            p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
            maxMs: Math.round(Math.max(...deltas) * 100) / 100,
            over16_7: deltas.filter((value) => value > 16.7).length,
          });
        }
      }
      requestAnimationFrame(tick);
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-03-pond-idle.png`),
      label: 'Pond entry',
      detail: `shownIn=${enterMs ?? 'timeout'}ms; world=${pond.world}; subject=${pond.activeSubjectId ?? 'host-resolved'}; xp=${pond.xpTotal}; fish=${pond.fish}; reduced-motion=${reduced}; frame avg=${frameStats.avgMs}ms p95=${frameStats.p95Ms}ms max=${frameStats.maxMs}ms over16.7=${frameStats.over16_7}/${frameStats.frames}`,
    });

    // Hold to power, then capture the meter before releasing.
    await session.synthDown('Space', ' ');
    await sleep(650);
    frames.push({
      file: await session.screenshot(`${prefix}-03b-powering.png`),
      label: 'Charging the cast',
      detail: `phase=powering; prompt=${(await panel(session)).status}`,
    });
    await sleep(50);
    await session.synthUp('Space', ' ');
    await waitForExpr(session, `document.querySelector('#status')?.innerText.includes('Waiting for a bite') === true`);
    frames.push({
      file: await session.screenshot(`${prefix}-04-waiting.png`),
      label: 'Cast waiting',
      detail: `phase=waiting; prompt=${(await panel(session)).status}`,
    });

    // Watch for the bite, then hook with Space.
    const biteMs = await waitForExpr(
      session,
      `document.querySelector('#status')?.innerText.includes('Bite!') === true`,
      25000,
    );
    frames.push({
      file: await session.screenshot(`${prefix}-05-bite.png`),
      label: 'Bite',
      detail: `shownIn=${biteMs ?? 'timeout'}ms; screen-reader message present=${(await panel(session)).status.includes('Bite!')}`,
    });
    await session.synthDown('Space', ' ');
    await session.synthUp('Space', ' ');

    const dialogMs = await waitForExpr(session, `document.querySelector('#fishing-panel')?.hidden === false`, 8000);
    const caught = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-06-recall.png`),
      label: 'Recall dialog',
      detail: `shownIn=${dialogMs ?? 'timeout'}ms; focus=${caught.focus}; question shown=${(caught.fishing ?? '').includes('Recall check')}; collection row=0 fish`,
    });

    // Tab order stays inside the modal and wraps back to the first action.
    const focusOrder = [];
    for (let index = 0; index < 4; index += 1) {
      await session.hold('\uE004', 40);
      focusOrder.push(await session.execute(`return document.activeElement?.id ?? '';`));
    }

    // P4-T6: a rejected save must say "Not saved" and leave the collection alone.
    const beforeFailure = await stored(session);
    await session.execute(`
      window.__originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('simulated quota failure', 'QuotaExceededError');
      };
      document.querySelector('#fishing-answered-correct').click();
      return true;
    `);
    const notSavedMs = await waitForExpr(session, `document.querySelector('#fishing-error')?.hidden === false`);
    await sleep(300);
    const failed = await panel(session);
    const afterFailure = await stored(session);
    await session.execute(`IDBObjectStore.prototype.put = window.__originalPut; delete window.__originalPut; return true;`);
    frames.push({
      file: await session.screenshot(`${prefix}-07-not-saved.png`),
      label: 'Catch save failure',
      detail: `shownIn=${notSavedMs ?? 'timeout'}ms; error=${/not saved/i.test(failed.error)}; dialog still open=${failed.fishing !== null}; fish ${beforeFailure.fish}→${afterFailure.fish}`,
    });

    // Retry with Enter on the focused button: the keep path is keyboard-only.
    await session.execute(`document.querySelector('#fishing-answered-correct').focus(); return true;`);
    await session.hold('\uE007', 80);
    const keptMs = await waitForExpr(session, `document.querySelector('#fishing-panel')?.hidden === true`, 10000);
    await sleep(500);
    const kept = await stored(session);
    const keptPanel = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-08-kept.png`),
      label: 'Kept with recall',
      detail: `shownIn=${keptMs ?? 'timeout'}ms; fish=${kept.fish}; xp=${kept.xpTotal}; focus=${keptPanel.focus}; message="${keptPanel.status}"`,
    });

    // Second cast, release instead of keep.
    await session.synthDown('Space', ' ');
    await sleep(600);
    await session.synthUp('Space', ' ');
    await waitForExpr(session, `document.querySelector('#status')?.innerText.includes('Waiting for a bite') === true`, 15000);
    await waitForExpr(session, `document.querySelector('#status')?.innerText.includes('Bite!') === true`, 25000);
    await session.synthDown('Space', ' ');
    await session.synthUp('Space', ' ');
    await waitForExpr(session, `document.querySelector('#fishing-panel')?.hidden === false`, 8000);
    await session.execute(`document.querySelector('#fishing-release').focus(); return true;`);
    await session.hold('\uE007', 80);
    await waitForExpr(session, `document.querySelector('#fishing-panel')?.hidden === true`, 10000);
    await sleep(400);
    const released = await stored(session);
    const releasedPanel = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-09-released.png`),
      label: 'Released',
      detail: `fish=${released.fish} (unchanged from ${kept.fish}); focus=${releasedPanel.focus}; message="${releasedPanel.status}"`,
    });

    // Leave with Escape and confirm the street.
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    const leftMs = await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      8000,
    );
    frames.push({
      file: await session.screenshot(`${prefix}-10-street.png`),
      label: 'Left the pond',
      detail: `shownIn=${leftMs ?? 'timeout'}ms; world=village; fish=${released.fish}`,
    });

    // Reload: the collection and XP survive.
    await wd('POST', session.session('/refresh'), {});
    await continueTitleIfVisible(session);
    await sleep(2600);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`);
    const reloaded = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-11-reload.png`),
      label: 'Reload after a catch',
      detail: `fish=${reloaded.fish}; xp=${reloaded.xpTotal}; world=${reloaded.world}`,
    });

    // A non-portal facade explains itself on the canvas rather than silently
    // advancing the side-panel quest text.
    const library = await walkToNearby(session, 'KeyD', 'd', 'Library', 25000);
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await sleep(400);
    const facadeText = await session.execute(`return document.querySelector('#toast')?.innerText ?? '';`);
    frames.push({
      file: await session.screenshot(`${prefix}-11a-library.png`),
      label: 'Non-portal building',
      detail: `nearby=${library.nearby}; canvas message="${facadeText}"`,
    });

    // K-12: reloading mid-cast returns to the street with a visible notice.
    await session.synthDown('KeyA', 'a');
    for (let index = 0; index < 80; index += 1) {
      await sleep(100);
      const summary = (await panel(session)).summary;
      if (summary.includes('Nearby\nFishing Pond')) break;
    }
    await session.synthUp('KeyA', 'a');
    await sleep(200);
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Fishing pond') === true`);
    await session.synthDown('Space', ' ');
    await sleep(500);
    await session.synthUp('Space', ' ');
    await sleep(400);
    await wd('POST', session.session('/refresh'), {});
    await continueTitleIfVisible(session);
    await sleep(2800);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`);
    const recovered = await panel(session);
    const recoveredState = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-12-mid-cast-reload.png`),
      label: 'Mid-cast reload recovery',
      detail: `world=${recoveredState.world}; notice=${recovered.recovery.includes('could not be resumed')}; fish=${recoveredState.fish}`,
    });

    return {
      entered,
      cleared,
      pond,
      reduced,
      frameStats,
      focusOrder,
      caughtFocus: caught.focus,
      questionShown: (caught.fishing ?? '').includes('Recall check'),
      beforeFailure,
      afterFailure,
      kept,
      released,
      reloaded,
      recovered,
      recoveredState,
      error: recovered.error,
    };
  } finally {
    await session.close();
  }
}

// ── P5 review ───────────────────────────────────────────────────────────────

/** Press E and wait for the composer; a portal transition can swallow the first press. */
async function openComposerWithRetry(session, attempts = 3) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    const opened = await waitForExpr(
      session,
      `document.querySelector('#note-panel')?.hidden === false`,
      4000,
    );
    if (opened !== null) return true;
    await sleep(500);
  }
  return false;
}

/** Open the composer with `E`, submit the valid fixture, and close it again. */
async function clearCurrentRoom(session, collect = false) {
  if (!(await openComposerWithRetry(session))) throw new Error('The note composer did not open');
  await session.execute(`
    const text = document.querySelector('#note-text');
    text.value = ${JSON.stringify(VALID_NOTE)};
    document.querySelector('#note-confirmed').checked = true;
    document.querySelector('#note-submit').click();
    return true;
  `);
  const cleared = await waitForExpr(session, `document.querySelector('#note-outcome')?.hidden === false`);
  if (!cleared) throw new Error('The note did not clear the room');
  if (collect) {
    await session.execute(`document.querySelector('#note-collect').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#note-feedback')?.innerText.includes('journal') === true`);
  }
  await session.synthDown('Escape', 'Escape');
  await session.synthUp('Escape', 'Escape');
  await sleep(400);
}

/** Hold a direction until the HUD names a room, then release. */
async function holdUntilRoom(session, code, key, needle, timeoutMs) {
  await session.synthDown(code, key);
  const ms = await waitForRoom(session, needle, timeoutMs);
  await session.synthUp(code, key);
  await sleep(500);
  return ms;
}

/**
 * Step into the entrance shaft and ride the ladder into the lower room.
 *
 * Returns the time the HUD took to name the room, or null. Retries nudge the
 * player toward the shaft, because a shaft bottom can be left at either side.
 */
async function descendToToolsRoom(session) {
  await session.hold('d', 650);
  await sleep(300);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ms = await holdUntilRoom(session, 'KeyS', 's', 'Tools of the Trade', 7000);
    if (ms !== null) return ms;
    await session.hold(attempt % 2 === 0 ? 'a' : 'd', 400);
    await sleep(300);
  }
  return null;
}

/** Climb the shaft until the HUD names the upper room, retrying a missed ladder. */
async function climbToMapRoom(session) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ms = await holdUntilRoom(session, 'KeyW', 'w', 'The Map & Beyond', 15000);
    if (ms !== null) return ms;
    await session.hold(attempt === 0 ? 'a' : 'd', 400);
    await sleep(300);
  }
  return null;
}

/** Descend from the upper room back to the lower one. */
async function descendToToolsFromMap(session) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const ms = await holdUntilRoom(session, 'KeyS', 's', 'Tools of the Trade', 12000);
    if (ms !== null) return ms;
    await session.hold(attempt === 0 ? 'a' : 'd', 400);
    await sleep(300);
  }
  return null;
}

/** Climb until the HUD reports the village street, retrying a missed ladder. */
async function climbToStreet(session) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await session.synthDown('KeyW', 'w');
    const ms = await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      7000,
    );
    await session.synthUp('KeyW', 'w');
    if (ms !== null) return ms;
    await session.hold(attempt % 2 === 0 ? 'a' : 'd', 300);
    await sleep(250);
  }
  return null;
}

/**
 * P10 traversal: a wider retry budget than the per-phase captures.
 *
 * The player can stop just outside the room centre at the top of a ladder; a
 * bigger horizontal nudge gives the centre test another chance without changing
 * the game or the capture.
 */
async function climbUntilRoomWide(session, needle, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const ms = await holdUntilRoom(session, 'KeyW', 'w', needle, 15000);
    if (ms !== null) return ms;
    await session.hold(attempt % 2 === 0 ? 'a' : 'd', 700);
    await sleep(250);
  }
  return null;
}

async function climbToStreetWide(session, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await session.synthDown('KeyW', 'w');
    const ms = await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      8000,
    );
    await session.synthUp('KeyW', 'w');
    if (ms !== null) return ms;
    await session.hold(attempt % 2 === 0 ? 'a' : 'd', 700);
    await sleep(250);
  }
  return null;
}

/**
 * Escape a generated dungeon without knowing its room graph: climb, sweep the
 * level, and try the next ladder. The public HUD's "Village street" row is the
 * only success test, so this still uses the same physical exit a learner uses.
 */
async function escapeDungeonToStreet(session, cycles = 4) {
  for (let cycle = 0; cycle < cycles; cycle += 1) {
    for (const move of [
      { direction: null, ms: 0 },
      { direction: 'd', ms: 2500 },
      { direction: 'a', ms: 5000 },
    ]) {
      if (move.direction) await session.hold(move.direction, move.ms);
      await session.synthDown('KeyW', 'w');
      const ms = await waitForExpr(
        session,
        `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
        6000,
      );
      await session.synthUp('KeyW', 'w');
      if (ms !== null) return ms;
      await sleep(200);
    }
  }
  return null;
}

async function descendUntilRoomWide(session, needle, attempts = 8) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const ms = await holdUntilRoom(session, 'KeyS', 's', needle, 12000);
    if (ms !== null) return ms;
    await session.hold(attempt % 2 === 0 ? 'a' : 'd', 700);
    await sleep(250);
  }
  return null;
}

/** Press `R` and wait for the panel. */
async function openReviewWithR(session) {
  await session.synthDown('KeyR', 'r');
  await session.synthUp('KeyR', 'r');
  return waitForExpr(session, `document.querySelector('#review-panel')?.hidden === false`);
}

async function reviewPanelState(session) {
  return session.execute(`
    return {
      text: document.querySelector('#review-panel')?.innerText ?? '',
      focus: document.activeElement?.id ?? '',
      hidden: document.querySelector('#review-panel')?.hidden ?? null,
      ratingButtons: document.querySelectorAll('#review-panel [id^="review-rating-"]').length,
      pressed: [...document.querySelectorAll('#review-panel [id^="review-rating-"]')]
        .filter((node) => node.getAttribute('aria-pressed') === 'true')
        .map((node) => node.id),
      submitEnabled: document.querySelector('#review-submit')?.disabled === false,
      promptShown: (document.querySelector('#review-prompt blockquote')?.innerText ?? '').length > 0,
      previousRow: (document.querySelector('#review-summary')?.innerText ?? ''),
      result: document.querySelector('#review-result')?.hidden === false
        ? (document.querySelector('#review-result')?.innerText ?? '')
        : '',
      error: document.querySelector('#review-error')?.hidden
        ? ''
        : (document.querySelector('#review-error')?.innerText ?? ''),
    };
  `);
}

/**
 * P5 review run: clear the three tutorial rooms, capture the locked refusal, the
 * due prompt, a rated pass, save-for-later across a reload, resume, discard, a
 * duplicate completion, and a rejected review save.
 *
 * Every panel key is sent through WebDriver to the focused element, so the run is
 * keyboard-only in the same way a learner's is.
 */
async function captureReview(prefix, frames) {
  const session = await openSession(options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {});
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);

    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`);
    await sleep(1500);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2200);
    await startTutorial(session);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`);
    const reduced = await session.execute(`return matchMedia('(prefers-reduced-motion: reduce)').matches;`);

    // Clear the root room only; review is still locked by the engine's unlock.
    await clearCurrentRoom(session);
    const rootCleared = await stored(session);
    await session.synthDown('KeyR', 'r');
    await session.synthUp('KeyR', 'r');
    const lockedMs = await waitForExpr(session, `document.querySelector('#toast')?.hidden === false`);
    const locked = await session.execute(`
      return {
        toast: document.querySelector('#toast')?.innerText ?? '',
        error: document.querySelector('#error')?.hidden ? '' : (document.querySelector('#error')?.innerText ?? ''),
        prompt: document.querySelector('#prompt')?.innerText ?? '',
        panelHidden: document.querySelector('#review-panel')?.hidden ?? null,
      };
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-01-locked.png`),
      label: 'Review locked',
      detail: `shownIn=${lockedMs ?? 'timeout'}ms; cleared=${rootCleared.cleared}/3; toast says locked=${/locked/i.test(locked.toast)}; panel stayed closed=${locked.panelHidden === true}; prompt offers R=${/R/.test(locked.prompt) && /review/i.test(locked.prompt)}`,
    });
    await session.execute(`document.querySelector('#toast').hidden = true; return true;`);

    // Finish the other two rooms so the engine unlocks review.
    await session.hold('d', 650);
    await sleep(300);
    if ((await descendUntilRoomWide(session, 'Tools of the Trade')) === null) {
      throw new Error('Could not descend to the lower room');
    }
    await clearCurrentRoom(session);
    const climbMs = await climbUntilRoomWide(session, 'The Map & Beyond');
    if (climbMs === null) throw new Error('Could not climb to the upper room');
    await clearCurrentRoom(session);
    const allCleared = await stored(session);
    if (allCleared.cleared !== 3) {
      throw new Error(`Expected 3 cleared rooms before review, got ${allCleared.cleared}`);
    }
    const duePanel = await panel(session);
    const promptText = await session.execute(`return document.querySelector('#prompt')?.innerText ?? '';`);
    frames.push({
      file: await session.screenshot(`${prefix}-02-due-prompt.png`),
      label: 'Cleared room prompt',
      detail: `cleared=${allCleared.cleared}/3; climb=${climbMs ?? 'timeout'}ms; prompt shows E and R=${/E/.test(promptText) && /R/.test(promptText)}; HUD reviews due="${(duePanel.summary.match(/Reviews due\n(.+)/) ?? [])[1] ?? 'missing'}"`,
    });

    // Open the panel, measure a 10-second frame window, then capture it unrated.
    const openMs = await openReviewWithR(session);
    const opened = await reviewPanelState(session);
    const frameStats = await session.executeAsync(`
      const done = arguments[arguments.length - 1];
      const deltas = [];
      const started = performance.now();
      let last = started;
      function tick(now) {
        deltas.push(now - last);
        last = now;
        if (now - started < 10000) requestAnimationFrame(tick);
        else {
          const sorted = [...deltas].sort((a, b) => a - b);
          done({
            frames: deltas.length,
            avgMs: Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100,
            p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
            maxMs: Math.round(Math.max(...deltas) * 100) / 100,
            over16_7: deltas.filter((value) => value > 16.7).length,
          });
        }
      }
      requestAnimationFrame(tick);
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-03-review-panel.png`),
      label: 'Review panel',
      detail: `shownIn=${openMs ?? 'timeout'}ms; focus=${opened.focus}; rating buttons=${opened.ratingButtons}; prompt shown=${opened.promptShown}; previous row="${opened.previousRow.split('\n').slice(-2).join(' ')}"; frame avg=${frameStats.avgMs}ms p95=${frameStats.p95Ms}ms max=${frameStats.maxMs}ms over16.7=${frameStats.over16_7}/${frameStats.frames}`,
    });

    await session.hold('5', 60);
    await sleep(250);
    const selected = await reviewPanelState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-04-selected.png`),
      label: 'Rating selected',
      detail: `pressed=${selected.pressed.join(',')}; submit enabled=${selected.submitEnabled}`,
    });

    await session.hold('\uE007', 60);
    const ratedMs = await waitForExpr(session, `document.querySelector('#review-result')?.hidden === false`);
    await sleep(300);
    const rated = await reviewPanelState(session);
    const ratedState = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-05-rated.png`),
      label: 'Rated pass',
      detail: `shownIn=${ratedMs ?? 'timeout'}ms; XP copy=${/XP gained/.test(rated.result)}; pass progress=${/Pass progress/.test(rated.result)}; next review copy=${/Next review/.test(rated.result)}; passCount tut-map=${ratedState.reviewPassCounts['tut-map']}; reviewPasses=${ratedState.reviewPasses}; focus=${rated.focus}`,
    });

    // Save for later from a fresh panel, with a different preselected rating.
    await session.hold('\uE00C', 60);
    await sleep(400);
    await openReviewWithR(session);
    await session.hold('4', 60);
    await session.hold('s', 60);
    const savedMs = await waitForExpr(session, `document.querySelector('#review-result')?.innerText.includes('Saved for later') === true`);
    await sleep(300);
    const saved = await reviewPanelState(session);
    const savedState = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-06-saved.png`),
      label: 'Saved for later',
      detail: `shownIn=${savedMs ?? 'timeout'}ms; marker=${savedState.marker}; no XP promise=${/No XP was awarded/.test(saved.result)}; passCount unchanged=${savedState.reviewPassCounts['tut-map']}; focus=${saved.focus}`,
    });
    await session.hold('\uE00C', 60);

    // Reload: the marker survives. Walk back to the same room and resume.
    await wd('POST', session.session('/refresh'), {});
    await continueTitleIfVisible(session);
    await sleep(2800);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`);
    const reloaded = await stored(session);
    await session.hold('d', 650);
    await sleep(300);
    if ((await descendUntilRoomWide(session, 'Tools of the Trade')) === null) {
      throw new Error('Could not descend to the lower room after reload');
    }
    if ((await climbUntilRoomWide(session, 'The Map & Beyond')) === null) {
      throw new Error('Could not climb to the upper room after reload');
    }
    await openReviewWithR(session);
    const resumed = await reviewPanelState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-07-resumed.png`),
      label: 'Resumed after reload',
      detail: `marker after reload=${reloaded.marker}; previous rating restored=${/4 · Good/.test(resumed.previousRow)}; focus=${resumed.focus}`,
    });

    // D twice: arm then confirm.
    await session.hold('d', 60);
    const armed = await reviewPanelState(session);
    await session.hold('d', 60);
    const discardedMs = await waitForExpr(session, `document.querySelector('#review-result')?.innerText.includes('discarded') === true`);
    await sleep(300);
    const discarded = await reviewPanelState(session);
    const discardedState = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-08-discarded.png`),
      label: 'Saved review discarded',
      detail: `armed copy=${/Confirm discard/.test(armed.text)}; shownIn=${discardedMs ?? 'timeout'}ms; marker=${discardedState.marker}; result="${discarded.result.split('\n').slice(-1)[0]}"`,
    });
    await session.hold('\uE00C', 60);

    // Save again, reload, resume, and complete: the same pass is not paid twice.
    await openReviewWithR(session);
    await session.hold('4', 60);
    await session.hold('s', 60);
    await waitForExpr(session, `document.querySelector('#review-result')?.innerText.includes('Saved for later') === true`);
    await session.hold('\uE00C', 60);
    await wd('POST', session.session('/refresh'), {});
    await continueTitleIfVisible(session);
    await sleep(2800);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`);
    await session.hold('d', 650);
    await sleep(300);
    if ((await descendUntilRoomWide(session, 'Tools of the Trade')) === null) {
      throw new Error('Could not descend to the lower room after reload');
    }
    if ((await climbUntilRoomWide(session, 'The Map & Beyond')) === null) {
      throw new Error('Could not climb to the upper room after reload');
    }
    await openReviewWithR(session);
    const beforeComplete = await stored(session);
    await session.hold('\uE007', 60);
    const completeMs = await waitForExpr(session, `document.querySelector('#review-result')?.hidden === false`);
    await sleep(300);
    const completed = await reviewPanelState(session);
    const afterComplete = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-09-duplicate.png`),
      label: 'Resumed completion is not paid twice',
      detail: `shownIn=${completeMs ?? 'timeout'}ms; marker left in place disclosed=${/saved marker was left in place/.test(completed.result)}; duplicate copy=${/already awarded/.test(completed.result)}; xp ${beforeComplete.xpTotal}→${afterComplete.xpTotal}; reviewPasses ${beforeComplete.reviewPasses}→${afterComplete.reviewPasses}`,
    });
    await session.hold('\uE00C', 60);

    // A duplicate pass leaves the marker in place (the engine's award path is the
    // one that clears it). Re-open and discard it so the run ends with no marker.
    await openReviewWithR(session);
    await session.hold('d', 60);
    await session.hold('d', 60);
    await waitForExpr(session, `document.querySelector('#review-result')?.innerText.includes('discarded') === true`);
    const afterDuplicateDiscard = await stored(session);
    await session.hold('\uE00C', 60);

    // Descend to the lower room, which has never been reviewed, and break the save.
    const descendMs = await descendToToolsFromMap(session);
    if (descendMs === null) throw new Error('Could not descend to the lower room');
    await openReviewWithR(session);
    await session.hold('5', 60);
    const beforeFailure = await stored(session);
    await session.execute(`
      window.__originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('simulated quota failure', 'QuotaExceededError');
      };
      return true;
    `);
    await session.hold('\uE007', 60);
    const notSavedMs = await waitForExpr(session, `document.querySelector('#review-error')?.hidden === false`);
    await sleep(300);
    const failed = await reviewPanelState(session);
    const afterFailure = await stored(session);
    await session.execute(`IDBObjectStore.prototype.put = window.__originalPut; delete window.__originalPut; return true;`);
    frames.push({
      file: await session.screenshot(`${prefix}-11-not-saved.png`),
      label: 'Review save failure',
      detail: `descend=${descendMs ?? 'timeout'}ms; shownIn=${notSavedMs ?? 'timeout'}ms; error says not saved=${/not saved/i.test(failed.error)}; panel open=${failed.hidden === false}; submit enabled after failure=${failed.submitEnabled}; xp ${beforeFailure.xpTotal}→${afterFailure.xpTotal}; passCount tut-tools ${beforeFailure.reviewPassCounts['tut-tools']}→${afterFailure.reviewPassCounts['tut-tools']}`,
    });
    await session.hold('\uE00C', 60);

    // Final reload: review state is durable and no marker is left behind.
    await wd('POST', session.session('/refresh'), {});
    await continueTitleIfVisible(session);
    await sleep(2800);
    const finalState = await stored(session);
    const finalPanel = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-11-reload.png`),
      label: 'Reload after review work',
      detail: `world=${finalState.world}; cleared=${finalState.cleared}/3; reviewPasses=${finalState.reviewPasses}; passCounts=${JSON.stringify(finalState.reviewPassCounts)}; nextReview set=${Object.values(finalState.nextReview).some(Boolean)}; marker=${finalState.marker}; focus=${finalPanel.focus}`,
    });

    // Climb the entrance shaft to the street, then open the queue with R. The
    // host activates the last-studied subject for the command and must close it.
    await session.hold('d', 320);
    await session.synthDown('KeyW', 'w');
    const streetMs = await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      25000,
    );
    await session.synthUp('KeyW', 'w');
    await sleep(700);
    await session.synthDown('KeyR', 'r');
    await session.synthUp('KeyR', 'r');
    const streetReviewMs = await waitForExpr(
      session,
      `document.querySelector('#review-panel')?.hidden === false`,
      8000,
    );
    const streetReview = await reviewPanelState(session);
    const streetState = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-12-street-shortcut.png`),
      label: 'Street review shortcut',
      detail: `street=${streetMs ?? 'timeout'}ms; panel=${streetReviewMs ?? 'timeout'}ms; focus=${streetReview.focus}; previous="${streetReview.previousRow.split('\n').slice(-2).join(' ')}"; subject activated for the command=${streetState.activeStudy}`,
    });
    await session.hold('\uE00C', 60);
    await sleep(1400);
    const streetClosed = await stored(session);
    const streetClosedPanel = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-13-street-closed.png`),
      label: 'Street review closed',
      detail: `world=${streetClosed.world}; activeSubject=${streetClosed.activeSubjectId}; study session open=${streetClosed.activeStudy}; focus=${streetClosedPanel.focus}; reviews due still listed=${streetClosedPanel.rooms.includes('rooms cleared')}`,
    });

    return {
      reduced,
      frameStats,
      rootCleared,
      locked,
      allCleared,
      opened,
      selected,
      rated: { state: ratedState, result: rated.result },
      saved: { state: savedState, result: saved.result },
      reloaded,
      resumed: { state: reloaded.marker, previousRow: resumed.previousRow },
      discarded: discardedState,
      beforeComplete,
      afterComplete,
      afterDuplicateDiscard,
      beforeFailure,
      afterFailure,
      failureError: failed.error,
      finalState,
      streetReview,
      streetState,
      streetClosed,
      error: finalPanel.error,
    };
  } finally {
    await session.close();
  }
}

// ── P6 Creator ──────────────────────────────────────────────────────────────

async function creatorState(session) {
  return session.execute(`
    const root = document.querySelector('#creator-panel');
    const text = (selector) => document.querySelector(selector)?.innerText ?? '';
    return {
      hidden: root?.hidden ?? null,
      focusKey: document.activeElement?.dataset?.focusKey ?? document.activeElement?.id ?? '',
      focusTag: document.activeElement?.tagName ?? '',
      subjects: [...document.querySelectorAll('#creator-panel .creator-subject')].map((node) => node.innerText),
      rooms: [...document.querySelectorAll('#creator-panel .creator-room-select')].map((node) => node.innerText.trim()),
      edges: [...document.querySelectorAll('#creator-panel .creator-edge-list li')].map((node) => node.innerText),
      tags: document.querySelector('#creator-tags')?.value ?? '',
      createName: document.querySelector('#creator-subject-name')?.value ?? '',
      createRoot: document.querySelector('#creator-root-topic')?.value ?? '',
      result: text('#creator-result'),
      error: text('#creator-error'),
      resultHidden: document.querySelector('#creator-result')?.hidden ?? null,
      errorHidden: document.querySelector('#creator-error')?.hidden ?? null,
    };
  `);
}

async function selectCreatorRoom(session, topic) {
  return session.execute(`
    const button = [...document.querySelectorAll('#creator-panel .creator-room-select')]
      .find((node) => node.innerText.includes(${JSON.stringify(topic)}));
    if (!button) return false;
    button.click();
    return true;
  `);
}

async function addCreatorRooms(session, parentTopic, topics) {
  return session.execute(`
    const parent = document.querySelector('#creator-add-parent');
    const option = [...parent.options].find((node) => node.textContent.includes(${JSON.stringify(parentTopic)}));
    if (!option) return false;
    parent.value = option.value;
    parent.dispatchEvent(new Event('change', { bubbles: true }));
    const text = document.querySelector('#creator-add-topics');
    text.value = ${JSON.stringify(topics.join('\n'))};
    text.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-focus-key="add-submit"]').click();
    return true;
  `);
}

/**
 * P6 Creator run.
 *
 * A fresh profile seeds the three demo subjects on boot. The run then creates a
 * fourth subject, builds a nested tree, tags and cross-links rooms, captures the
 * removal confirmation with its cascade count, removes the subtree, shows the
 * new portal on the street, and records a duplicate-name refusal and a rejected
 * graph write. The write failure is injected through the page's own IndexedDB
 * prototype, as P2 does; the app has no test hook.
 */
async function captureCreator(prefix, frames) {
  const session = await openSession(
    options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {},
  );
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await continueTitleIfVisible(session);
    const seededMs = await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('3 portals') === true`,
      25000,
    );
    await sleep(400);
    const seededState = await stored(session);
    const seededPanel = await panel(session);

    // 01 — open from the street with the host shortcut.
    await session.synthDown('KeyC', 'c');
    await session.synthUp('KeyC', 'c');
    const openedMs = await waitForExpr(
      session,
      `document.querySelector('#creator-panel')?.hidden === false`,
      8000,
    );
    const opened = await creatorState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-01-subject-list.png`),
      label: 'Creator subject list',
      detail: `seededIn=${seededMs ?? 'timeout'}ms; openIn=${openedMs ?? 'timeout'}ms; subjects=${seededState.subjects}; portals row="${(seededPanel.summary.match(/Subject portals\n(.+)/) ?? [])[1] ?? 'missing'}"; listed=${opened.subjects.length}; focus=${opened.focusTag}`,
    });

    if (options.reducedMotion) {
      frames.push({
        file: await session.screenshot(`${prefix}-02-reduced-motion.png`),
        label: 'Creator reduced motion',
        detail: `prefers-reduced-motion=1; panel has no animation; rooms=${opened.rooms.length}; listed=${opened.subjects.length}`,
      });
      await session.synthDown('Escape', 'Escape');
      await session.synthUp('Escape', 'Escape');
      const closedMs = await waitForExpr(
        session,
        `document.querySelector('#creator-panel')?.hidden !== false && document.activeElement?.id === 'game'`,
        8000,
      );
      return { opened, closedMs, reducedMotion: true };
    }

    // 02 — create form, filled but not submitted.
    await session.execute(`
      const set = (selector, value) => {
        const node = document.querySelector(selector);
        node.value = value;
        node.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('#creator-subject-name', 'Tide Pools');
      set('#creator-root-topic', 'Rock Pool Ecology');
      return true;
    `);
    const form = await creatorState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-02-create-form.png`),
      label: 'Creator create form',
      detail: `name="${form.createName}"; root="${form.createRoot}"; subjects before create=${seededState.subjects}`,
    });

    // 03 — create the subject; it becomes the edited subject immediately.
    await session.execute(`document.querySelector('[data-focus-key="create-submit"]').click(); return true;`);
    const createdMs = await waitForExpr(
      session,
      `document.querySelector('#creator-panel .creator-room-select') !== null && document.querySelector('#creator-result')?.innerText.includes('Created') === true`,
      10000,
    );
    const afterCreate = await stored(session);
    const created = await creatorState(session);
    await session.execute(
      `document.querySelector('#creator-panel .creator-tree')?.scrollIntoView({ block: 'start' }); return true;`,
    );
    await sleep(150);
    frames.push({
      file: await session.screenshot(`${prefix}-03-created.png`),
      label: 'Created subject',
      detail: `shownIn=${createdMs ?? 'timeout'}ms; subjects ${seededState.subjects}→${afterCreate.subjects}; rooms=${created.rooms.length}; active study=${afterCreate.activeStudy}; result=${/Created/.test(created.result)}`,
    });

    // 04 — add three root children.
    await addCreatorRooms(session, 'Rock Pool Ecology', ['Tide Zones', 'Pool Life', 'Salinity']);
    const rootChildrenMs = await waitForExpr(
      session,
      `document.querySelectorAll('#creator-panel .creator-room-select').length === 4`,
      10000,
    );
    const tree = await creatorState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-04-tree.png`),
      label: 'Room tree',
      detail: `addedIn=${rootChildrenMs ?? 'timeout'}ms; rooms=${tree.rooms.length}; order=${tree.rooms.map((room) => room.replace(/^.*?\\s/, '')).join(' > ')}`,
    });

    // 05 — nest two rooms under Tide Zones, then arm its removal.
    await addCreatorRooms(session, 'Tide Zones', ['Splash Zone', 'Mid Zone']);
    await waitForExpr(
      session,
      `document.querySelectorAll('#creator-panel .creator-room-select').length === 6`,
      10000,
    );
    await selectCreatorRoom(session, 'Tide Zones');
    await session.execute(`document.querySelector('[data-focus-key="remove-button"]').click(); return true;`);
    const armed = await creatorState(session);
    const confirmLabel = await session.execute(
      `return document.querySelector('[data-focus-key="remove-button"]')?.innerText ?? '';`,
    );
    frames.push({
      file: await session.screenshot(`${prefix}-05-cascade-confirm.png`),
      label: 'Cascade confirmation',
      detail: `rooms=${armed.rooms.length}; confirm="${confirmLabel}"; names cascade=${/Confirm remove: 3 rooms/.test(confirmLabel)}; no write yet=${armed.resultHidden === true}`,
    });

    // 06 — confirm: Tide Zones plus the two nested rooms go.
    await session.execute(`document.querySelector('[data-focus-key="remove-button"]').click(); return true;`);
    const removedMs = await waitForExpr(
      session,
      `document.querySelectorAll('#creator-panel .creator-room-select').length === 3`,
      10000,
    );
    const removed = await creatorState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-06-cascade-removed.png`),
      label: 'Cascade removed',
      detail: `removedIn=${removedMs ?? 'timeout'}ms; rooms=${removed.rooms.length}; result=${/Removed 3 rooms/.test(removed.result)}`,
    });

    // 07 — tag Pool Life and cross-link it to Salinity.
    await selectCreatorRoom(session, 'Pool Life');
    await session.execute(`
      const input = document.querySelector('#creator-tags');
      input.value = 'water, observation';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('[data-focus-key="tags-submit"]').click();
      return true;
    `);
    const tagsSavedMs = await waitForExpr(
      session,
      `document.querySelector('#creator-tags')?.value.includes('water') === true`,
      10000,
    );
    await session.execute(`
      const pick = (selector, topic) => {
        const select = document.querySelector(selector);
        const option = [...select.options].find((node) => node.textContent.includes(topic));
        if (!option) return false;
        select.value = option.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      };
      pick('#creator-link-from', 'Pool Life');
      pick('#creator-link-to', 'Salinity');
      document.querySelector('[data-focus-key="link-submit"]').click();
      return true;
    `);
    const linkedMs = await waitForExpr(
      session,
      `document.querySelectorAll('#creator-panel .creator-edge-list li').length === 1`,
      10000,
    );
    const tagged = await creatorState(session);
    await session.execute(
      `document.querySelector('#creator-panel .creator-tree')?.scrollIntoView({ block: 'start' }); return true;`,
    );
    await sleep(150);
    frames.push({
      file: await session.screenshot(`${prefix}-07-tree-tags.png`),
      label: 'Tree with tags',
      detail: `tagsIn=${tagsSavedMs ?? 'timeout'}ms; tags="${tagged.tags}"; rooms=${tagged.rooms.length}`,
    });
    await session.execute(
      `document.querySelector('#creator-panel .creator-edge-list')?.scrollIntoView({ block: 'center' }); return true;`,
    );
    await sleep(150);
    frames.push({
      file: await session.screenshot(`${prefix}-08-cross-link.png`),
      label: 'Cross-link edge',
      detail: `linkIn=${linkedMs ?? 'timeout'}ms; edges=${JSON.stringify(tagged.edges)}`,
    });

    // 08 — keyboard check: Tab reaches a native control, Escape closes to #game.
    await session.hold('\uE004', 60);
    await sleep(150);
    const tabbed = await creatorState(session);
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    const closedMs = await waitForExpr(
      session,
      `document.querySelector('#creator-panel')?.hidden !== false && document.activeElement?.id === 'game'`,
      10000,
    );
    await sleep(600);
    const afterClose = await stored(session);

    // 09 — the new portal is on the street, from engine data.
    await sleep(300);
    const walked = await walkToNearby(session, 'KeyD', 'd', 'Tide Pools', 30000);
    await sleep(300);
    const streetPanel = await panel(session);
    frames.push({
      file: await session.screenshot(`${prefix}-09-street-portal.png`),
      label: 'New portal on the street',
      detail: `closedIn=${closedMs ?? 'timeout'}ms; focus returned to #game=${closedMs !== null}; tab reached=${tabbed.focusKey || tabbed.focusTag}; subjects=${afterClose.subjects}; portals row="${(streetPanel.summary.match(/Subject portals\n(.+)/) ?? [])[1] ?? 'missing'}"; walk found Tide Pools=${walked.found}; nearby="${walked.nearby}"; activeStudy=${afterClose.activeStudy}`,
    });

    // 10 — open again and refuse a duplicate subject name.
    await session.synthDown('KeyC', 'c');
    await session.synthUp('KeyC', 'c');
    await waitForExpr(session, `document.querySelector('#creator-panel')?.hidden === false`, 8000);
    await session.execute(`
      const set = (selector, value) => {
        const node = document.querySelector(selector);
        node.value = value;
        node.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('#creator-subject-name', 'Tide Pools');
      set('#creator-root-topic', 'Another Root');
      document.querySelector('[data-focus-key="create-submit"]').click();
      return true;
    `);
    const refusalMs = await waitForExpr(
      session,
      `document.querySelector('#creator-error')?.hidden === false`,
      8000,
    );
    const refusal = await creatorState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-10-refusal.png`),
      label: 'Duplicate-name refusal',
      detail: `shownIn=${refusalMs ?? 'timeout'}ms; refusal=${/Refused/.test(refusal.error) && /already exists/.test(refusal.error)}; subjects still=${afterClose.subjects}; error="${refusal.error}"`,
    });

    // 11 — select Tide Pools for editing, then reject the next graph write.
    await session.execute(`
      const row = [...document.querySelectorAll('#creator-panel .creator-subject')]
        .find((node) => node.innerText.includes('Tide Pools'));
      row?.querySelector('button')?.click();
      return true;
    `);
    await waitForExpr(
      session,
      `document.querySelectorAll('#creator-panel .creator-room-select').length === 3`,
      10000,
    );
    await selectCreatorRoom(session, 'Pool Life');
    await session.execute(`
      const input = document.querySelector('#creator-tags');
      input.value = 'quota-test';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      window.__originalPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function () {
        throw new DOMException('simulated quota failure', 'QuotaExceededError');
      };
      document.querySelector('[data-focus-key="tags-submit"]').click();
      return true;
    `);
    const notSavedMs = await waitForExpr(
      session,
      `document.querySelector('#creator-error')?.hidden === false`,
      10000,
    );
    const failed = await creatorState(session);
    const afterFailure = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-11-not-saved.png`),
      label: 'Rejected graph write',
      detail: `shownIn=${notSavedMs ?? 'timeout'}ms; not saved=${/Not saved/.test(failed.error)}; tree intact=${failed.rooms.length === 3}; tags still "${failed.tags}"; subjects ${afterCreate.subjects}→${afterFailure.subjects}`,
    });
    await session.execute(`IDBObjectStore.prototype.put = window.__originalPut; delete window.__originalPut; return true;`);

    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await sleep(600);

    // 12–14 — keyboard-only Creator pass: C, Tab, Enter, typing, Escape, then
    // walk to the new portal and press E. No pointer events are used.
    const keyboard = await keyboardCreatorFlow(session, frames, prefix, afterClose.subjects);

    return {
      seeded: seededState,
      opened,
      created,
      tree,
      confirmLabel,
      tagged,
      tabbed,
      refusal,
      failed,
      afterFailure,
      afterClose,
      street: streetPanel.summary,
      keyboard,
    };
  } finally {
    await session.close();
  }
}

/** Send one real WebDriver key and let the page handle it. */
async function pressKey(session, value) {
  await session.hold(value, 40);
  await sleep(70);
}

async function typeKeys(session, text) {
  for (const character of text) {
    await session.hold(character, 10);
  }
  await sleep(150);
}

/** Tab forward until the predicate matches; returns the tab count or null. */
async function tabTo(session, predicate, max = 40) {
  for (let index = 0; index < max; index += 1) {
    await pressKey(session, '\uE004');
    const matched = await session.execute(`return (${predicate});`);
    if (matched) return index + 1;
  }
  return null;
}

/**
 * Keyboard-only path through the Creator and into a new subject's dungeon.
 *
 * The capture uses real WebDriver key events, so the host's own handlers run:
 * `C` opens, Tab walks native controls, Enter activates a button, typing fills
 * an input, Escape closes and returns focus to `#game`, then D/E enter the new
 * portal. This is the phase gate's keyboard pass for the P6 surface.
 */
async function keyboardCreatorFlow(session, frames, prefix, baselineSubjects) {
  await pressKey(session, 'c');
  const openedMs = await waitForExpr(
    session,
    `document.querySelector('#creator-panel')?.hidden === false`,
    8000,
  );

  const nameTabs = await tabTo(session, `document.activeElement?.dataset?.focusKey === 'create-name'`);
  await typeKeys(session, 'keyboard subject');
  await pressKey(session, '\uE004');
  await typeKeys(session, 'keyboard root');
  await pressKey(session, '\uE004');
  await pressKey(session, '\uE004');
  const createFocus = await session.execute(`return document.activeElement?.dataset?.focusKey ?? '';`);
  await pressKey(session, '\uE006');
  const createdMs = await waitForExpr(
    session,
    `document.querySelectorAll('#creator-panel .creator-room-select').length === 1 && document.querySelector('#creator-result')?.innerText.includes('Created') === true`,
    12000,
  );
  const afterKeyboardCreate = await stored(session);
  await sleep(400);

  const topicsTabs = await tabTo(session, `document.activeElement?.dataset?.focusKey === 'add-topics'`);
  await typeKeys(session, 'one');
  await pressKey(session, '\uE006');
  await typeKeys(session, 'two');
  const submitTabs = await tabTo(session, `document.activeElement?.dataset?.focusKey === 'add-submit'`);
  await pressKey(session, '\uE006');
  const treeMs = await waitForExpr(
    session,
    `document.querySelectorAll('#creator-panel .creator-room-select').length === 3`,
    12000,
  );
  await sleep(400);
  await session.execute(
    `document.querySelector('#creator-panel .creator-tree')?.scrollIntoView({ block: 'start' }); return true;`,
  );
  await sleep(150);
  const keyboardTree = await creatorState(session);
  frames.push({
    file: await session.screenshot(`${prefix}-12-keyboard-create.png`),
    label: 'Keyboard-only Creator',
    detail: `openIn=${openedMs ?? 'timeout'}ms; tabs to name=${nameTabs}; create focus=${createFocus}; createdIn=${createdMs ?? 'timeout'}ms; subjects ${baselineSubjects}→${afterKeyboardCreate.subjects}; tabs to topics=${topicsTabs}, to add=${submitTabs}; treeIn=${treeMs ?? 'timeout'}ms; rooms=${keyboardTree.rooms.length}`,
  });

  await pressKey(session, '\uE00C');
  const closedMs = await waitForExpr(
    session,
    `document.querySelector('#creator-panel')?.hidden !== false && document.activeElement?.id === 'game'`,
    10000,
  );
  await sleep(600);

  const walked = await walkToNearby(session, 'KeyD', 'd', 'keyboard subject', 45000);
  await pressKey(session, 'e');
  const enteredMs = await waitForExpr(
    session,
    `document.querySelector('#summary')?.innerText.includes('keyboard subject') === true && document.querySelector('#summary')?.innerText.includes('dungeon') === true`,
    15000,
  );
  await sleep(300);
  const entered = await panel(session);
  frames.push({
    file: await session.screenshot(`${prefix}-13-keyboard-enter.png`),
    label: 'Keyboard-only portal entry',
    detail: `escape focus returned=${closedMs !== null}; walk found=${walked.found}; enteredIn=${enteredMs ?? 'timeout'}ms; summary subject row=${/keyboard subject/.test(entered.summary)}; world=${(entered.summary.match(/World\n(.+)/) ?? [])[1] ?? 'missing'}`,
  });

  return {
    openedMs,
    nameTabs,
    createFocus,
    createdMs,
    topicsTabs,
    submitTabs,
    treeMs,
    closedMs,
    walked,
    enteredMs,
    summary: entered.summary,
  };
}


// ── P7 village services ─────────────────────────────────────────────────────

async function serviceState(session) {
  return session.execute(`
    const root = document.querySelector('#service-panel');
    return {
      hidden: root?.hidden ?? null,
      text: root?.innerText ?? '',
      focus: document.activeElement?.id ?? '',
      role: root?.getAttribute('role') ?? '',
      modal: root?.getAttribute('aria-modal') ?? '',
      error: document.querySelector('#service-error')?.hidden
        ? ''
        : (document.querySelector('#service-error')?.innerText ?? ''),
      result: document.querySelector('#service-result')?.hidden
        ? ''
        : (document.querySelector('#service-result')?.innerText ?? ''),
      npc: document.querySelector('#npc-dialogue')?.hidden === false
        ? (document.querySelector('#npc-dialogue')?.innerText ?? '')
        : null,
    };
  `);
}

async function openServiceAt(session, needle, direction = 'KeyD', key = 'd', timeoutMs = 30000) {
  const walked = await walkToNearby(session, direction, key, needle, timeoutMs);
  await pressKey(session, 'e');
  const openedMs = await waitForExpr(
    session,
    `document.querySelector('#service-panel')?.hidden === false`,
    8000,
  );
  const state = await serviceState(session);
  return { walked, openedMs, state };
}

async function closeService(session) {
  await pressKey(session, '\uE00C');
  return waitForExpr(
    session,
    `document.querySelector('#service-panel')?.hidden !== false && document.activeElement?.id === 'game'`,
    8000,
  );
}

async function journalState(session) {
  return session.execute(`
    const root = document.querySelector('#journal-panel');
    return {
      hidden: root?.hidden ?? null,
      text: root?.innerText ?? '',
      focus: document.activeElement?.id || document.activeElement?.dataset?.focusKey || '',
      sections: [...(root?.querySelectorAll('section[id]') ?? [])].map((node) => node.id),
      settings: {
        reducedMotion: document.querySelector('#journal-setting-reduced-motion')?.value ?? null,
        assistance: document.querySelector('#journal-setting-assistance')?.value ?? null,
        textScale: document.querySelector('#journal-setting-text-scale')?.value ?? null,
        touch: document.querySelector('#journal-setting-touch')?.value ?? null,
      },
      dataset: { ...document.documentElement.dataset },
    };
  `);
}

async function openJournalWithJ(session) {
  await session.synthDown('KeyJ', 'j');
  await session.synthUp('KeyJ', 'j');
  return waitForExpr(session, `document.querySelector('#journal-panel')?.hidden === false`, 8000);
}

async function closeJournal(session) {
  await session.synthDown('Escape', 'Escape');
  await session.synthUp('Escape', 'Escape');
  return waitForExpr(
    session,
    `document.querySelector('#journal-panel')?.hidden !== false && document.activeElement?.id === 'game'`,
    8000,
  );
}

async function scrollJournal(session, sectionId) {
  return session.execute(`
    const node = document.querySelector('#${sectionId}');
    node?.scrollIntoView({ block: 'start' });
    return node ? Math.round(node.getBoundingClientRect().top) : null;
  `);
}

async function setJournalSelect(session, id, value) {
  return session.execute(`
    const select = document.querySelector('#${id}');
    if (!select) return false;
    select.value = ${JSON.stringify(value)};
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  `);
}

/**
 * Capture a deterministic gear item for the Workshop frame.
 *
 * The engine grants gear only on a strong room clear; the fixture clear may or
 * may not roll one. Writing a synthetic item into the example's own IndexedDB
 * state is capture tooling, not a page test hook, and it keeps the visual record
 * reproducible.
 */
async function seedWorkshopGear(session) {
  return session.executeAsync(`
    const done = arguments[arguments.length - 1];
    const request = indexedDB.open('knowledge-dungeon-side-scroller');
    request.onerror = () => done({ error: String(request.error) });
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction('engine-state', 'readwrite');
      const store = tx.objectStore('engine-state');
      const get = store.get('state');
      get.onerror = () => done({ error: String(get.error) });
      get.onsuccess = () => {
        const state = get.result;
        if (!state) return done({ error: 'no state' });
        const ids = Object.keys(state.subjects ?? {});
        const subjectId =
          ids.find((id) => id.startsWith('tutorial')) ??
          ids[0];
        const record = subjectId ? state.progression[subjectId] : null;
        if (!record) return done({ error: 'no progression record' });
        const existing = record.inventory.find((item) => item.equipSlot);
        if (!existing) {
          record.inventory.push({
            id: 'gear-capture-cap',
            name: 'Scholar’s Cap',
            description: 'A capture fixture, not learner data.',
            rarity: 'common',
            acquiredAt: new Date().toISOString(),
            equipSlot: 'head',
            equipped: false,
          });
          store.put(state, 'state');
        }
        tx.oncomplete = () =>
          done({
            subjectId,
            added: !existing,
            inventory: record.inventory.length,
            equipped: record.equippedItems.length,
          });
      };
    };
  `);
}

/**
 * P7 services run.
 *
 * Clears one tutorial room (collecting its artifact), returns to the street, and
 * opens every labelled service plus a villager. The Workshop frame proves an
 * equip survives a reload and a rejected write shows "Not saved" without
 * changing equipment. `--reduced-motion` keeps the same path with the
 * preference enabled; the panels have no animation.
 */
/**
 * P8 journal run.
 *
 * A cleared three-room tutorial, three seeded demo subjects, and seeded gear
 * give the journal real records, due rooms, inventory, and assistance. The run
 * then changes text scale and assistance mode, proves both survive a reload,
 * enters a subject from the journal, and finishes on a fresh save's zero records.
 */
/**
 * Room-opening visual check (post-P8 polish).
 *
 * The chamber outline is broken at each engine doorway so a corridor or ladder
 * reads as a connection instead of a wall. Captures the root, lower, and upper
 * tutorial rooms.
 */
async function captureOpenings(prefix, frames) {
  const session = await openSession(
    options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {},
  );
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);
    await session.execute(
      `window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`,
    );
    await sleep(1400);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2200);
    await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      10000,
    );
    await startTutorial(session);
    await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('First Dungeon') === true`,
      10000,
    );
    await sleep(600);
    frames.push({
      file: await session.screenshot(`${prefix}-01-root-opening.png`),
      label: 'Root room opening',
      detail: 'The chamber outline is cut at the ladder doorway; the room reads as connected to the shaft',
    });

    await session.hold('d', 650);
    await sleep(300);
    if ((await descendUntilRoomWide(session, 'Tools of the Trade')) === null) {
      throw new Error('Could not descend to the lower room');
    }
    await sleep(500);
    frames.push({
      file: await session.screenshot(`${prefix}-02-lower-opening.png`),
      label: 'Lower room opening',
      detail: 'The lower chamber shows the same doorway gap at the ladder',
    });

    return { doors: 4, reducedMotion: options.reducedMotion };
  } finally {
    await session.close();
  }
}

/**
 * Controls popup (post-P8 polish).
 *
 * Opens the static help panel once from the side-panel button and once with `?`,
 * and proves focus returns to the trigger or the canvas.
 */
async function captureHelp(prefix, frames) {
  const session = await openSession(
    options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {},
  );
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);
    await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      12000,
    );

    await session.execute(`document.querySelector('#open-help').click(); return true;`);
    const openedMs = await waitForExpr(
      session,
      `document.querySelector('#help-panel')?.hidden === false`,
      5000,
    );
    const opened = await session.execute(`
      const root = document.querySelector('#help-panel');
      return {
        focus: document.activeElement?.id ?? '',
        text: root?.innerText ?? '',
        closeButtons: root?.querySelectorAll('button').length ?? 0,
      };
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-01-controls-help.png`),
      label: 'Controls help',
      detail: `openIn=${openedMs ?? 'timeout'}ms; focus=${opened.focus}; groups=${['Move', 'Interact', 'Review', 'Pond', 'World'].filter((name) => opened.text.includes(name)).join(',')}; close buttons=${opened.closeButtons}`,
    });

    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    const closedMs = await waitForExpr(
      session,
      `document.querySelector('#help-panel')?.hidden !== false && document.activeElement?.id === 'open-help'`,
      5000,
    );
    frames.push({
      file: await session.screenshot(`${prefix}-02-controls-closed.png`),
      label: 'Controls closed',
      detail: `closedIn=${closedMs ?? 'timeout'}ms; focus returned to open-help; help hidden=true`,
    });

    await session.execute(`document.querySelector('#game').focus(); return true;`);
    await session.synthDown('Slash', '?');
    await session.synthUp('Slash', '?');
    const questionMs = await waitForExpr(
      session,
      `document.querySelector('#help-panel')?.hidden === false`,
      5000,
    );
    frames.push({
      file: await session.screenshot(`${prefix}-03-controls-question.png`),
      label: 'Controls opened with ?',
      detail: `openIn=${questionMs ?? 'timeout'}ms; focus=${(await session.execute(`return document.activeElement?.id ?? '';`))}; shortcut works without the mouse`,
    });
    await session.synthDown('Slash', '?');
    await session.synthUp('Slash', '?');

    return {
      opened,
      openMs: openedMs,
      closedMs,
      questionMs,
      reducedMotion: options.reducedMotion,
    };
  } finally {
    await session.close();
  }
}

async function captureJournal(prefix, frames) {
  const session = await openSession(
    options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {},
  );
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);

    await session.execute(
      `window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`,
    );
    await sleep(1500);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2200);
    await continueTitleIfVisible(session);
    await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      10000,
    );

    await startTutorial(session);
    await clearCurrentRoom(session, true);
    await session.hold('d', 650);
    await sleep(300);
    if ((await descendUntilRoomWide(session, 'Tools of the Trade')) === null) {
      throw new Error('Could not descend to the lower room');
    }
    await clearCurrentRoom(session);
    if ((await climbUntilRoomWide(session, 'The Map & Beyond')) === null) {
      throw new Error('Could not climb to the upper room');
    }
    await clearCurrentRoom(session);
    if ((await holdUntilRoom(session, 'KeyS', 's', 'The Note', 15000)) === null) {
      throw new Error('Could not descend to the root room');
    }
    if ((await climbToStreet(session)) === null) {
      throw new Error('Could not return to the village street');
    }
    await sleep(700);

    // One deterministic gear item, then reload so the running engine sees it.
    const seeded = await seedWorkshopGear(session);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2600);
    await continueTitleIfVisible(session);
    await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      10000,
    );
    const reloaded = await stored(session);
    if (reloaded.subjects < 4) {
      throw new Error(`Expected the tutorial and three demo subjects, got ${reloaded.subjects}`);
    }

    // 01 — open with J and capture the overview.
    const openMs = await openJournalWithJ(session);
    const opened = await journalState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-01-journal-overview.png`),
      label: 'Journal overview',
      detail: `openIn=${openMs ?? 'timeout'}ms; focus=${opened.focus}; subjects=${opened.sections.length ? '' : ''}${(opened.text.match(/Active subject/) ?? []).length > 0 ? 'active subject row' : 'no active row'}; sections=${opened.sections.join(',')}; records=${opened.text.includes('Sessions completed')}; due=${opened.text.includes('Rooms due')}; assistance=${opened.text.includes('Assistance')}; settings=${opened.text.includes('Settings')}`,
    });

    // 02 — subjects, records, assistance, and settings sections.
    await scrollJournal(session, 'journal-subjects');
    await sleep(350);
    frames.push({
      file: await session.screenshot(`${prefix}-02-journal-subjects.png`),
      label: 'Journal subjects',
      detail: `section=${(await journalState(session)).focus}; room counts=${/rooms ·/.test((await journalState(session)).text)}; enter buttons=${(await session.execute(`return document.querySelectorAll('[data-focus-key^="journal-enter-"]').length;`))}`,
    });

    await scrollJournal(session, 'journal-records');
    await sleep(350);
    const records = await journalState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-03-journal-records.png`),
      label: 'Journal records',
      detail: `notes=${/Notes submitted\s*\n\s*3/.test(records.text)}; active days=${/Active days/.test(records.text)}; engine copy=${records.text.includes('does not re-sum progress')}`,
    });

    await scrollJournal(session, 'journal-assistance');
    await sleep(350);
    const assistance = await journalState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-04-journal-assistance.png`),
      label: 'Journal assistance',
      detail: `suggestions=${(assistance.text.match(/priority \d+/g) ?? []).length}; engine reason labels=${assistance.text.includes('required note section') || assistance.text.includes('rubric criterion')}; mode copy=${assistance.text.includes('Mode: gentle')}`,
    });

    await scrollJournal(session, 'journal-settings');
    await sleep(350);
    frames.push({
      file: await session.screenshot(`${prefix}-05-journal-settings.png`),
      label: 'Journal settings',
      detail: `focus=${(await journalState(session)).focus}; values=${JSON.stringify((await journalState(session)).settings)}; local-only copy=${(await journalState(session)).text.includes('never written into the engine save')}`,
    });

    // 03 — large text and assistance off apply immediately.
    await setJournalSelect(session, 'journal-setting-text-scale', 'large');
    await sleep(450);
    const large = await journalState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-06-journal-large-text.png`),
      label: 'Large text applied',
      detail: `dataset=${large.dataset.textScale}; value=${large.settings.textScale}; same panel open=${large.hidden === false}`,
    });

    await setJournalSelect(session, 'journal-setting-assistance', 'off');
    await sleep(450);
    await scrollJournal(session, 'journal-assistance');
    await sleep(350);
    const assistanceOff = await journalState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-07-journal-assistance-off.png`),
      label: 'Assistance mode off',
      detail: `mode=${assistanceOff.settings.assistance}; off copy=${assistanceOff.text.includes('Assistance is off in Settings.')}; suggestions=${(assistanceOff.text.match(/priority \d+/g) ?? []).length}`,
    });

    // 04 — settings survive a reload.
    await closeJournal(session);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2600);
    await continueTitleIfVisible(session);
    await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      10000,
    );
    const persistedDataset = await session.execute(
      `return { ...document.documentElement.dataset };`,
    );
    await openJournalWithJ(session);
    await scrollJournal(session, 'journal-settings');
    await sleep(350);
    const persisted = await journalState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-08-journal-settings-persisted.png`),
      label: 'Settings after reload',
      detail: `dataset text=${persistedDataset.textScale}; select text=${persisted.settings.textScale}; assistance=${persisted.settings.assistance}; reduced motion=${persisted.settings.reducedMotion}; touch=${persisted.settings.touch}`,
    });

    // 05 — Enter a subject from the journal's own button.
    await scrollJournal(session, 'journal-subjects');
    await sleep(250);
    const entered = await session.execute(`
      const button = document.querySelector('[data-focus-key^="journal-enter-"]');
      if (!button) return null;
      const subject = button.getAttribute('data-focus-key').replace('journal-enter-', '');
      button.click();
      return subject;
    `);
    const enteredMs = await waitForExpr(
      session,
      `document.querySelector('#journal-panel')?.hidden !== false && document.querySelector('#summary')?.innerText.includes('Subject') === true`,
      12000,
    );
    await sleep(900);
    const afterEnter = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-09-journal-entry.png`),
      label: 'Entered from the journal',
      detail: `subject=${entered}; enteredIn=${enteredMs ?? 'timeout'}ms; world=${afterEnter.world}; study session open=${afterEnter.activeStudy}; focus=${(await panel(session)).focus}`,
    });

    // 06 — reset settings, clear the save, and capture the fresh zero state.
    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`);
    await sleep(1500);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2400);
    await continueTitleIfVisible(session);
    await waitForExpr(
      session,
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      10000,
    );
    await openJournalWithJ(session);
    const emptyOverview = await journalState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-10-journal-empty.png`),
      label: 'Journal on a fresh save',
      detail: `subjects visible=${emptyOverview.text.includes('Demo') || emptyOverview.text.includes('Kitchen')}; active subject=${emptyOverview.text.includes('No active subject')}; due=${emptyOverview.text.includes('No rooms are due')}; focus=${emptyOverview.focus}`,
    });
    await scrollJournal(session, 'journal-records');
    await sleep(350);
    const emptyRecords = await journalState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-11-journal-empty-records.png`),
      label: 'Fresh-save records',
      detail: `zero notes=${/Notes submitted\s*\n\s*0/.test(emptyRecords.text)}; zero fish=${/Fish kept\s*\n\s*0/.test(emptyRecords.text)}; badges empty=${emptyRecords.text.includes('No badges yet')}; fish empty=${emptyRecords.text.includes('No fish yet')}`,
    });

    await closeJournal(session);
    return {
      seeded,
      reloaded,
      openMs,
      opened,
      records,
      assistance,
      large,
      assistanceOff,
      persisted: { dataset: persistedDataset, state: persisted },
      entered,
      afterEnter,
      emptyOverview,
      emptyRecords,
      reducedMotion: options.reducedMotion,
      error: (await panel(session)).error,
    };
  } finally {
    await session.close();
  }
}

async function captureServices(prefix, frames) {
  const session = await openSession(options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {});
  try {
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(1800);

    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`);
    await sleep(1500);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2200);
    await continueTitleIfVisible(session);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`);

    await startTutorial(session);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`);
    await clearCurrentRoom(session, true);
    await session.hold('d', 650);
    await sleep(300);
    if ((await descendUntilRoomWide(session, 'Tools of the Trade')) === null) {
      throw new Error('Could not descend to the lower room');
    }
    await clearCurrentRoom(session);
    if ((await climbUntilRoomWide(session, 'The Map & Beyond')) === null) {
      throw new Error('Could not climb to the upper room');
    }
    await clearCurrentRoom(session);
    const cleared = await stored(session);
    if (cleared.cleared !== 3) {
      throw new Error(`Expected 3 cleared rooms before the Library review, got ${cleared.cleared}`);
    }

    // Descend from the upper room to the root, then climb the entrance shaft to
    // the street. From the root the shaft is a single continuous climb.
    if ((await holdUntilRoom(session, 'KeyS', 's', 'The Note', 15000)) === null) {
      throw new Error('Could not descend to the root room');
    }
    const streetMs = await climbToStreet(session);
    if (streetMs === null) throw new Error('Could not return to the village street');
    await sleep(700);

    // Seed deterministic gear, then reload so the running engine sees it.
    const seeded = await seedWorkshopGear(session);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2600);
    await continueTitleIfVisible(session);
    const reloadStreet = await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`, 8000);
    if (reloadStreet === null) throw new Error('The reload did not land on the village street');
    const reloaded = await stored(session);

    // 01 — a villager bubble. Each E press advances the engine cursor.
    const npcWalk = await walkToNearby(session, 'KeyD', 'd', 'Wandering Scholar', 20000);
    await pressKey(session, 'e');
    const firstLineMs = await waitForExpr(session, `document.querySelector('#npc-dialogue')?.hidden === false`, 5000);
    const firstLine = await serviceState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-01-villager.png`),
      label: 'Villager dialogue',
      detail: `openedIn=${firstLineMs ?? 'timeout'}ms; nearby="${npcWalk.nearby}"; focus=${firstLine.focus}; text as node=${(firstLine.npc ?? '').length > 0}`,
    });
    await pressKey(session, 'e');
    await sleep(200);
    const secondLine = await serviceState(session);
    await pressKey(session, '\uE00C');
    const npcClosedMs = await waitForExpr(session, `document.querySelector('#npc-dialogue')?.hidden !== false`, 5000);
    frames.push({
      file: await session.screenshot(`${prefix}-02-villager-second-line.png`),
      label: 'Villager cursor advanced',
      detail: `second line differs=${(secondLine.npc ?? '') !== (firstLine.npc ?? '')}; closedIn=${npcClosedMs ?? 'timeout'}ms`,
    });

    // 02 — Library: review desk, collected artifact, notes list.
    const library = await openServiceAt(session, 'Library');
    frames.push({
      file: await session.screenshot(`${prefix}-03-library.png`),
      label: 'Library',
      detail: `walk found=${library.walked.found}; openIn=${library.openedMs ?? 'timeout'}ms; role=${library.state.role} modal=${library.state.modal}; review desk=${library.state.text.includes('Review desk')}; artifact=${library.state.text.includes('Show artifact')}; notes=${library.state.text.includes('Collected notes')}; focus=${library.state.focus}`,
    });
    // 03b — review a due room from the open Library desk. The host activates
    // the last-studied subject for the command and closes the session after.
    // Keyboard-only: Tab past Close to the first Review button, then Enter.
    await pressKey(session, '\uE004');
    await pressKey(session, '\uE004');
    const reviewFocused = await session.execute(`return document.activeElement?.innerText ?? '';`);
    await pressKey(session, '\uE007');
    const clicked = reviewFocused === 'Review';
    if (!clicked) throw new Error('The Library review desk had no Review button');
    const reviewOpenMs = await waitForExpr(
      session,
      `document.querySelector('#review-panel')?.hidden === false`,
      10000,
    );
    const reviewPanel = await session.execute(`
      return {
        focus: document.activeElement?.id ?? '',
        text: document.querySelector('#review-panel')?.innerText ?? '',
        serviceHidden: document.querySelector('#service-panel')?.hidden ?? null,
        promptShown: (document.querySelector('#review-prompt blockquote')?.innerText ?? '').length > 0,
      };
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-04-library-review.png`),
      label: 'Review opened from the Library',
      detail: `openIn=${reviewOpenMs ?? 'timeout'}ms; keyboard focus on "${reviewFocused}"; focus=${reviewPanel.focus}; prompt shown=${reviewPanel.promptShown}; service closed=${reviewPanel.serviceHidden !== false}; rating controls=${(reviewPanel.text.match(/[0-5] · /g) ?? []).length}`,
    });
    await session.hold('5', 60);
    await session.hold('\uE007', 60);
    const ratedMs = await waitForExpr(session, `document.querySelector('#review-result')?.hidden === false`, 10000);
    const ratedPanel = await session.execute(`return document.querySelector('#review-result')?.innerText ?? '';`);
    frames.push({
      file: await session.screenshot(`${prefix}-05-library-review-rated.png`),
      label: 'Review rated from the Library',
      detail: `shownIn=${ratedMs ?? 'timeout'}ms; reward copy=${/XP gained/.test(ratedPanel)}; next review copy=${/Next review/.test(ratedPanel)}`,
    });
    await session.hold('\uE00C', 60);
    const reviewClosedMs = await waitForExpr(
      session,
      `document.querySelector('#review-panel')?.hidden !== false && document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      10000,
    );
    await sleep(900);
    const afterLibraryReview = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-06-library-review-closed.png`),
      label: 'Library review closed',
      detail: `closedIn=${reviewClosedMs ?? 'timeout'}ms; world=${afterLibraryReview.world}; activeSubject=${afterLibraryReview.activeSubjectId}; study session open=${afterLibraryReview.activeStudy}; reviewPasses total=${afterLibraryReview.reviewPassesTotal}`,
    });

    // 04 — Fish Stand: display-only, explicit notice, no transaction.
    const fishStand = await openServiceAt(session, 'Fish Stand');
    frames.push({
      file: await session.screenshot(`${prefix}-07-fish-stand.png`),
      label: 'Fish Stand (display only)',
      detail: `walk found=${fishStand.walked.found}; openIn=${fishStand.openedMs ?? 'timeout'}ms; selling notice=${/Selling and trading are not part of this build/.test(fishStand.state.text)}; buttons=${await session.execute(`return document.querySelectorAll('#service-panel button').length;`)}; focus=${fishStand.state.focus}`,
    });
    await closeService(session);

    // 04 — Workshop: gear, a rejected write, then a successful equip.
    const workshop = await openServiceAt(session, 'Artisan Workshop');
    const equipButton = await session.execute(`
      const button = [...document.querySelectorAll('#service-panel button')]
        .find((node) => node.innerText === 'Equip');
      if (!button) return null;
      return { id: button.id, disabled: button.disabled };
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-08-workshop.png`),
      label: 'Workshop inventory',
      detail: `walk found=${workshop.walked.found}; openIn=${workshop.openedMs ?? 'timeout'}ms; subject=${/Inventory —/.test(workshop.state.text)}; equip button=${equipButton?.id ?? 'missing'}; inventory=${reloaded.inventory}; focus=${workshop.state.focus}`,
    });

    if (equipButton) {
      const beforeFailure = await stored(session);
      await session.execute(`
        window.__originalPut = IDBObjectStore.prototype.put;
        IDBObjectStore.prototype.put = function () {
          throw new DOMException('simulated quota failure', 'QuotaExceededError');
        };
        document.querySelector(${JSON.stringify(`#${equipButton.id}`)}).focus();
        return true;
      `);
      await session.hold('\uE007', 60);
      const notSavedMs = await waitForExpr(session, `document.querySelector('#service-error')?.hidden === false`, 8000);
      const failed = await serviceState(session);
      const afterFailure = await stored(session);
      frames.push({
        file: await session.screenshot(`${prefix}-09-workshop-not-saved.png`),
        label: 'Workshop save failure',
        detail: `shownIn=${notSavedMs ?? 'timeout'}ms; not saved=${/Not saved/.test(failed.error)}; panel open=${failed.hidden === false}; equipped ${beforeFailure.equipped}→${afterFailure.equipped}; inventory ${beforeFailure.inventory}→${afterFailure.inventory}`,
      });
      await session.execute(`IDBObjectStore.prototype.put = window.__originalPut; delete window.__originalPut; return true;`);

      await session.execute(`document.querySelector(${JSON.stringify(`#${equipButton.id}`)}).focus(); return true;`);
      await session.hold('\uE007', 60);
      const equippedMs = await waitForExpr(
        session,
        `document.querySelector('#service-result')?.innerText.includes('Equipped') === true`,
        8000,
      );
      const equipped = await stored(session);
      frames.push({
        file: await session.screenshot(`${prefix}-10-workshop-equipped.png`),
        label: 'Workshop equipped',
        detail: `shownIn=${equippedMs ?? 'timeout'}ms; equipped=${equipped.equipped}; result="${(await serviceState(session)).result}"`,
      });
    }
    await closeService(session);

    // 05 — Trophy Hall (badges/records; fish may be empty).
    const trophy = await openServiceAt(session, 'Trophy Hall');
    frames.push({
      file: await session.screenshot(`${prefix}-11-trophy-hall.png`),
      label: 'Trophy Hall',
      detail: `walk found=${trophy.walked.found}; openIn=${trophy.openedMs ?? 'timeout'}ms; badges section=${trophy.state.text.includes('Badges')}; records=${trophy.state.text.includes('Records')}; zeroes shown=${trophy.state.text.includes('Notes submitted')}; focus=${trophy.state.focus}`,
    });
    await closeService(session);

    // 06 — Guild Hall: quest board, archetype, roster, Creator entry. The Guild
    // Hall shares gridX with the Trophy Hall and is placed first, so it is west
    // of the trophy door.
    const guild = await openServiceAt(session, 'Guild Hall', 'KeyA', 'a', 20000);
    frames.push({
      file: await session.screenshot(`${prefix}-12-guild-hall.png`),
      label: 'Guild Hall',
      detail: `walk found=${guild.walked.found}; openIn=${guild.openedMs ?? 'timeout'}ms; quest board=${guild.state.text.includes('Quest board')}; roster=${guild.state.text.includes('Subject roster')}; creator entry=${guild.state.text.includes('Open Creator')}; focus=${guild.state.focus}`,
    });
    await closeService(session);

    if (options.reducedMotion) {
      return {
        cleared,
        seeded,
        reloaded,
        reducedMotion: true,
        frames,
        error: (await panel(session)).error,
      };
    }

    // 07 — reload: the equip survives, then the Workshop shows Unequip.
    await wd('POST', session.session('/refresh'), {});
    await sleep(2800);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`);
    const afterReload = await stored(session);
    const workshopAgain = await openServiceAt(session, 'Artisan Workshop');
    const unequipShown = await session.execute(`
      return [...document.querySelectorAll('#service-panel button')].some((node) => node.innerText === 'Unequip');
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-13-workshop-reload.png`),
      label: 'Equipment after reload',
      detail: `equipped=${afterReload.equipped}; walk found=${workshopAgain.walked.found}; subject=${/Inventory —/.test(workshopAgain.state.text)}; unequip shown=${unequipShown}; focus=${workshopAgain.state.focus}`,
    });
    await closeService(session);

    return {
      cleared,
      seeded,
      reloaded,
      afterReload,
      reducedMotion: false,
      library,
      fishStand,
      workshop,
      equipButton,
      trophy,
      guild,
      unequipShown,
      streetMs,
      error: (await panel(session)).error,
    };
  } finally {
    await session.close();
  }
}

async function touchDown(session, intent, pointerId = 21) {
  return session.execute(`
    const el = document.querySelector('[data-intent="${intent}"]');
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true, cancelable: true, pointerId: ${pointerId}, pointerType: 'touch',
    }));
    return true;
  `);
}

async function touchUp(session, intent, pointerId = 21) {
  return session.execute(`
    const el = document.querySelector('[data-intent="${intent}"]');
    if (!el) return false;
    el.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerId: ${pointerId}, pointerType: 'touch',
    }));
    return true;
  `);
}

async function touchHold(session, intent, ms) {
  await touchDown(session, intent);
  await sleep(ms);
  await touchUp(session, intent);
  await sleep(200);
}

async function touchHoldUntil(session, intent, predicate, timeoutMs = 20000) {
  await touchDown(session, intent);
  const started = Date.now();
  let matched = false;
  while (Date.now() - started < timeoutMs) {
    await sleep(100);
    if (await session.execute(`return (${predicate});`)) {
      matched = true;
      break;
    }
  }
  await touchUp(session, intent);
  await sleep(250);
  return matched;
}

/** One tap of the contextual touch action button. */
async function tapTouchAction(session, pointerId = 30) {
  await touchDown(session, 'action', pointerId);
  await sleep(80);
  await touchUp(session, 'action', pointerId);
}

/** Open the composer with the touch action, submit the fixture, close it. */
async function touchClearRoom(session) {
  await tapTouchAction(session);
  const opened = await waitForExpr(
    session,
    `document.querySelector('#note-panel')?.hidden === false`,
    5000,
  );
  if (!opened) throw new Error('The touch action did not open the note composer');
  await session.execute(`
    const text = document.querySelector('#note-text');
    text.value = ${JSON.stringify(VALID_NOTE)};
    document.querySelector('#note-confirmed').checked = true;
    document.querySelector('#note-submit').click();
    return true;
  `);
  const cleared = await waitForExpr(
    session,
    `document.querySelector('#note-outcome')?.hidden === false`,
    8000,
  );
  if (!cleared) throw new Error('The touch note did not clear the room');
  await session.synthDown('Escape', 'Escape');
  await session.synthUp('Escape', 'Escape');
  await sleep(450);
}

async function shellState(session) {
  return session.execute(`
    const title = document.querySelector('#title-panel');
    const touch = document.querySelector('#touch-controls');
    const imports = document.querySelector('#title-import-panel');
    const error = document.querySelector('#title-error');
    return {
      titleVisible: title?.hidden === false && document.querySelector('#overlay')?.hidden === false,
      overlayVisible: document.querySelector('#overlay')?.hidden === false,
      status: document.querySelector('#title-status')?.innerText ?? '',
      touchVisible: touch?.hidden === false,
      touchLayout: document.documentElement.dataset.touchLayout ?? '',
      touchPreference: document.documentElement.dataset.touchLayoutPreference ?? '',
      actionLabel: document.querySelector('[data-intent="action"]')?.innerText ?? '',
      importOpen: imports?.hidden === false,
      importError: error?.hidden ? '' : (error?.innerText ?? ''),
      viewport: { width: window.innerWidth, height: window.innerHeight },
      panelOpen: document.querySelector('#progress-panel')?.hidden === false,
      panelSheet: getComputedStyle(document.querySelector('#progress-panel')).borderTopLeftRadius,
      focus: document.activeElement?.id ?? document.activeElement?.tagName ?? '',
      overflow: getComputedStyle(document.body).overflow,
    };
  `);
}

/**
 * Keyboard-only regression on the same build (P9-T7).
 *
 * Focus starts on Continue, Tab and Shift+Tab move inside the title, Enter
 * starts the game, `d` walks with the real keyboard, and `j`/Escape open and
 * close the journal. No pointer event is dispatched.
 */
async function captureKeyboardRegression() {
  const session = await openSession(
    options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {},
  );
  try {
    await session.setViewport(1280, 800, 1);
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(2200);
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 15000);
    const initialFocus = await session.execute(`return document.activeElement?.id ?? '';`);

    await session.hold('\uE004', 40); // Tab
    const afterTab = await session.execute(`return document.activeElement?.id ?? '';`);
    await wd('POST', session.session('/actions'), {
      actions: [
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            { type: 'keyDown', value: '\uE008' },
            { type: 'keyDown', value: '\uE004' },
            { type: 'keyUp', value: '\uE004' },
            { type: 'keyUp', value: '\uE008' },
          ],
        },
      ],
    });
    const afterShiftTab = await session.execute(`return document.activeElement?.id ?? '';`);

    await session.hold('\uE007', 40); // Enter on Continue
    const continued = await waitForExpr(
      session,
      `document.querySelector('#overlay')?.hidden === true`,
      8000,
    );
    const focusAfterContinue = await session.execute(`return document.activeElement?.id ?? document.activeElement?.tagName ?? '';`);

    await session.hold('d', 700);
    await sleep(300);
    const walked = await session.execute(
      `return document.querySelector('#summary')?.innerText.includes('Village street') === true;`,
    );

    await session.hold('j', 40);
    const journalOpened = await waitForExpr(
      session,
      `document.querySelector('#journal-panel')?.hidden === false`,
      6000,
    );
    await session.hold('\uE00C', 40); // Escape
    const journalClosed = await waitForExpr(
      session,
      `document.querySelector('#journal-panel')?.hidden === true`,
      6000,
    );

    return {
      initialFocus,
      afterTab,
      afterShiftTab,
      continued: continued !== null,
      focusAfterContinue,
      walked,
      journalOpened: journalOpened !== null,
      journalClosed: journalClosed !== null,
    };
  } finally {
    await session.close();
  }
}

/**
 * P9 shell: desktop title, mobile title, archetype choice, a rejected import,
 * touch controls on the street, in a dungeon room, and at the pond, plus the
 * responsive progress sheet. Movement and actions in the mobile segment use
 * pointer events on the same buttons a player would tap.
 */
async function captureShell(prefix, frames) {
  const keyboard = await captureKeyboardRegression();
  const session = await openSession(
    options.reducedMotion ? { 'ui.prefersReducedMotion': 1 } : {},
  );
  try {
    await session.setViewport(1280, 800, 1);
    await wd('POST', session.session('/url'), { url: APP });
    await sleep(2200);
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 15000);

    const desktop = await shellState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-01-title-desktop.png`),
      label: 'Title — desktop',
      detail: `title=${desktop.titleVisible}; viewport=${desktop.viewport.width}×${desktop.viewport.height}; focus=${desktop.focus}; touch=${desktop.touchLayout}; no page scroll=${desktop.overflow === 'hidden'}; status="${desktop.status}"`,
    });

    // Fresh save: clear through the host's own reset, then reload.
    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save')?.click(); return true;`);
    await sleep(1400);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2400);
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 15000);
    await session.setViewport(390, 844, 2);
    await sleep(500);

    const mobileTitle = await shellState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-02-title-mobile.png`),
      label: 'Title — phone viewport',
      detail: `title=${mobileTitle.titleVisible}; viewport=${mobileTitle.viewport.width}×${mobileTitle.viewport.height}; no horizontal overflow=${await session.execute(`return document.documentElement.scrollWidth <= window.innerWidth;`)}; archetype buttons=${await session.execute(`return document.querySelectorAll('[data-archetype]').length;`)}; status="${mobileTitle.status}"`,
    });

    const archetypes = await session.execute(`
      return [...document.querySelectorAll('[data-archetype]')].map((button) => ({
        id: button.dataset.archetype,
        text: button.innerText.replace(/\\n/g, ' / '),
        pressed: button.getAttribute('aria-pressed'),
      }));
    `);
    await session.execute(`document.querySelector('[data-archetype="scholar"]').click(); return true;`);
    await sleep(700);
    const chosen = await shellState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-03-archetype.png`),
      label: 'Archetype chosen',
      detail: `offered=${archetypes.map((entry) => entry.id).join(',')}; chosen=scholar; engine status="${chosen.status}"; archetype panel hidden=${await session.execute(`return document.querySelector('#title-archetypes')?.hidden === true;`)}`,
    });

    // A hostile import is refused without touching the save.
    const beforeImport = await stored(session);
    await session.execute(`document.querySelector('#title-import-toggle').click(); return true;`);
    await session.execute(`
      const text = document.querySelector('#title-import-text');
      text.value = '{"bundleVersion":2,"app":"knowledge-dungeon-side-scroller","state":{}}';
      document.querySelector('#title-import-apply').click();
      return true;
    `);
    await sleep(500);
    const refused = await shellState(session);
    const afterImport = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-04-import-error.png`),
      label: 'Import refused',
      detail: `panel=${refused.importOpen}; error="${refused.importError}"; save unchanged=${beforeImport.subjects === afterImport.subjects && beforeImport.xpTotal === afterImport.xpTotal}; title still usable=${refused.titleVisible}`,
    });

    // Touch layout on, then Continue with the same pointer layer a phone uses.
    await session.execute(`
      localStorage.setItem('knowledge-dungeon.host-settings.v1', JSON.stringify({
        reducedMotion: 'system', assistanceMode: 'gentle', textScale: 'normal', touchLayout: 'on',
      }));
      return true;
    `);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2400);
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 15000);
    await session.execute(`document.querySelector('#title-continue').click(); return true;`);
    await sleep(1200);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`, 12000);

    const street = await shellState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-05-touch-street.png`),
      label: 'Touch controls on the street',
      detail: `touch=${street.touchVisible}; layout=${street.touchLayout} (${street.touchPreference}); action="${street.actionLabel}"; viewport=${street.viewport.width}×${street.viewport.height}; no page scroll=${street.overflow === 'hidden'}`,
    });

    // Orientation change: the canvas resizes and the engine state is untouched.
    const worldBeforeRotate = await stored(session);
    await session.setViewport(844, 390, 2);
    await sleep(500);
    const landscape = await shellState(session);
    const worldAfterRotate = await stored(session);
    await session.setViewport(390, 844, 2);
    await sleep(500);
    const orientation = {
      landscape: `${landscape.viewport.width}×${landscape.viewport.height}`,
      portrait: `${(await shellState(session)).viewport.width}×${(await shellState(session)).viewport.height}`,
      worldKept: worldAfterRotate.world === worldBeforeRotate.world,
      touchKept: landscape.touchVisible,
    };

    // The progress panel is a sheet over the world on this width.
    await session.execute(`document.querySelector('#toggle-panel').click(); return true;`);
    await sleep(400);
    const sheet = await shellState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-06-responsive-hud.png`),
      label: 'Responsive progress sheet',
      detail: `open=${sheet.panelOpen}; sheet radius=${sheet.panelSheet}; summary="${(await panel(session)).summary.split('\\n').slice(0, 6).join(' / ')}"; touch still visible=${sheet.touchVisible}`,
    });
    await session.execute(`document.querySelector('#toggle-panel').click(); return true;`);
    await sleep(300);

    // Walk right to the Training Grounds with the touch pad, then tap action.
    const reached = await touchHoldUntil(
      session,
      'right',
      `document.querySelector('#summary')?.innerText.includes('Training Grounds') === true`,
      20000,
    );
    if (!reached) throw new Error('Touch movement did not reach the Training Grounds');
    await session.execute(`document.querySelector('[data-intent="action"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 22, pointerType: 'touch' })); return true;`);
    await sleep(120);
    await session.execute(`document.querySelector('[data-intent="action"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 22, pointerType: 'touch' })); return true;`);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`, 12000);
    await sleep(800);

    const dungeon = await shellState(session);
    const currentRoom = await session.execute(`
      const term = [...document.querySelectorAll('#summary dt')].find((node) => node.innerText === 'Current room');
      return term?.nextElementSibling?.innerText ?? 'unknown';
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-07-touch-dungeon.png`),
      label: 'Touch controls in the dungeon',
      detail: `touch=${dungeon.touchVisible}; action="${dungeon.actionLabel}"; current room="${currentRoom}"; buttons=${await session.execute(`return document.querySelectorAll('#touch-controls [data-intent]').length;`)}; min target=${await session.execute(`return Math.min(...[...document.querySelectorAll('#touch-controls button')].map((b) => b.getBoundingClientRect().width));`)}px`,
    });

    // Clear the room with the same note form a tap opens.
    await session.execute(`document.querySelector('[data-intent="action"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 23, pointerType: 'touch' })); return true;`);
    await session.execute(`document.querySelector('[data-intent="action"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 23, pointerType: 'touch' })); return true;`);
    await waitForExpr(session, `document.querySelector('#note-panel')?.hidden === false`, 4000);
    await session.execute(`
      const text = document.querySelector('#note-text');
      text.value = ${JSON.stringify(VALID_NOTE)};
      document.querySelector('#note-confirmed').checked = true;
      document.querySelector('#note-submit').click();
      return true;
    `);
    await waitForExpr(session, `document.querySelector('#note-outcome')?.hidden === false`, 8000);
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await sleep(400);
    const cleared = await stored(session);

    // Touch-only journal and review entry from the progress sheet.
    await session.execute(`document.querySelector('#toggle-panel').click(); return true;`);
    await sleep(350);
    await session.execute(`document.querySelector('#open-journal').click(); return true;`);
    const touchJournal = await waitForExpr(
      session,
      `document.querySelector('#journal-panel')?.hidden === false`,
      6000,
    );
    frames.push({
      file: await session.screenshot(`${prefix}-07b-touch-journal.png`),
      label: 'Touch-only journal entry',
      detail: `opened=${touchJournal}ms via Progress → Journal; focus=${await session.execute(`return document.activeElement?.id ?? '';`)}; title hidden=${await session.execute(`return document.querySelector('#overlay')?.hidden === true;`)}`,
    });
    await session.execute(`document.querySelector('#journal-close').click(); return true;`);
    await sleep(400);
    // Close the sheet before walking, then clear the other two rooms with the
    // touch pad and action button.
    await session.execute(`document.querySelector('#toggle-panel').click(); return true;`);
    await sleep(300);

    let toolsReached = false;
    for (let attempt = 0; attempt < 3 && !toolsReached; attempt += 1) {
      if (attempt === 0) await touchHold(session, 'right', 650);
      else await touchHold(session, attempt % 2 === 1 ? 'left' : 'right', 400);
      toolsReached = await touchHoldUntil(
        session,
        'down',
        `document.querySelector('#summary')?.innerText.includes('Tools of the Trade') === true`,
        9000,
      );
    }
    if (!toolsReached) throw new Error('Touch controls did not descend to the lower room');
    await touchClearRoom(session);

    let mapReached = false;
    for (let attempt = 0; attempt < 3 && !mapReached; attempt += 1) {
      if (attempt > 0) await touchHold(session, attempt === 1 ? 'left' : 'right', 400);
      mapReached = await touchHoldUntil(
        session,
        'up',
        `document.querySelector('#summary')?.innerText.includes('The Map & Beyond') === true`,
        20000,
      );
    }
    if (!mapReached) throw new Error('Touch controls did not climb to the upper room');
    await touchClearRoom(session);
    const allCleared = await stored(session);

    await session.execute(`document.querySelector('#toggle-panel').click(); return true;`);
    await sleep(350);
    await session.execute(`document.querySelector('#open-review').click(); return true;`);
    const touchReview = await waitForExpr(
      session,
      `document.querySelector('#review-panel')?.hidden === false`,
      6000,
    );
    if (!touchReview) throw new Error('The progress-panel Review button did not open a review');
    frames.push({
      file: await session.screenshot(`${prefix}-07c-touch-review.png`),
      label: 'Touch-only review entry',
      detail: `opened=${touchReview}ms via Progress → Review after three touch clears; cleared=${allCleared.cleared}; room="${await session.execute(`return document.querySelector('#review-panel-title')?.innerText ?? '';`)}"`,
    });
    await session.execute(`document.querySelector('#review-close').click(); return true;`);
    await sleep(400);
    await session.execute(`document.querySelector('#toggle-panel').click(); return true;`);
    await sleep(300);

    // ── Portable save: inject one attachment, export, clear, import ───────
    await session.executeAsync(`
      const done = arguments[arguments.length - 1];
      const request = indexedDB.open('knowledge-dungeon-side-scroller');
      request.onerror = () => done({ error: String(request.error) });
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('engine-state', 'readwrite');
        const store = transaction.objectStore('engine-state');
        const get = store.get('state');
        get.onsuccess = () => {
          const state = get.result;
          state.attachmentBytes['p9-evidence.txt'] = new TextEncoder().encode(
            'P9 attachment bytes survive a JSON export and import.',
          );
          store.put(state, 'state');
        };
        transaction.oncomplete = () => done({ ok: true });
        transaction.onerror = () => done({ error: String(transaction.error) });
      };
    `);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2600);
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 15000);
    await session.execute(`document.querySelector('#title-continue').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`, 12000);
    await sleep(500);

    await session.execute(`
      window.__p9Export = null;
      const realCreate = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        const url = realCreate.call(URL, blob);
        blob.text().then((text) => { window.__p9Export = text; });
        return url;
      };
      const realClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) return;
        return realClick.call(this);
      };
      document.querySelector('#export-save').click();
      return true;
    `);
    await waitForExpr(
      session,
      `typeof window.__p9Export === 'string' && window.__p9Export.length > 100`,
      8000,
    );
    const exported = JSON.parse(await session.execute(`return window.__p9Export;`));
    const beforeExport = await stored(session);
    if (exported.bundleVersion !== 1 || exported.app !== 'knowledge-dungeon-side-scroller') {
      throw new Error('Export did not produce a P9 bundle');
    }
    const exportedAttachment = exported.state.attachmentBytes['p9-evidence.txt'];

    // Clear the save through the host reset, then import the captured bundle.
    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save').click(); return true;`);
    await sleep(1400);
    await wd('POST', session.session('/refresh'), {});
    await sleep(2400);
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 15000);
    const emptied = await stored(session);

    await session.execute(`
      document.querySelector('#title-import-toggle').click();
      const text = document.querySelector('#title-import-text');
      text.value = ${JSON.stringify(JSON.stringify(exported))};
      document.querySelector('#title-import-apply').click();
      return true;
    `);
    await sleep(1400);
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 15000);
    await session.execute(`document.querySelector('#title-continue').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`, 15000);
    await sleep(500);
    const restored = await stored(session);
    if (
      restored.cleared !== beforeExport.cleared ||
      restored.xpTotal !== beforeExport.xpTotal ||
      !restored.attachmentKeys.includes('p9-evidence.txt')
    ) {
      throw new Error(
        `Import round trip lost state: before=${JSON.stringify(beforeExport)} after=${JSON.stringify(restored)}`,
      );
    }
    frames.push({
      file: await session.screenshot(`${prefix}-08-import-roundtrip.png`),
      label: 'Export → clear → import',
      detail: `bundle v${exported.bundleVersion}/${exported.app}; attachment base64=${typeof exportedAttachment === 'string' && exportedAttachment.length > 0}; cleared ${beforeExport.cleared}→${restored.cleared}; XP ${beforeExport.xpTotal}→${restored.xpTotal}; attachment bytes=${restored.attachmentSizes['p9-evidence.txt']}; emptied save had cleared=${emptied.cleared}, XP=${emptied.xpTotal}`,
    });

    // Climb the shaft with the touch pad and walk to the pond.
    await touchHold(session, 'right', 340);
    const climbed = await touchHoldUntil(
      session,
      'up',
      `document.querySelector('#summary')?.innerText.includes('Village street') === true`,
      25000,
    );
    if (!climbed) throw new Error('Touch climb did not return to the street');
    const pondReached = await touchHoldUntil(
      session,
      'left',
      `document.querySelector('#summary')?.innerText.includes('Fishing Pond') === true`,
      25000,
    );
    if (!pondReached) throw new Error('Touch walk did not reach the pond');
    await session.execute(`document.querySelector('[data-intent="action"]').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerId: 24, pointerType: 'touch' })); return true;`);
    await session.execute(`document.querySelector('[data-intent="action"]').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerId: 24, pointerType: 'touch' })); return true;`);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Fishing pond') === true`, 12000);
    await sleep(600);

    const pond = await shellState(session);
    frames.push({
      file: await session.screenshot(`${prefix}-09-touch-pond.png`),
      label: 'Touch controls at the pond',
      detail: `touch=${pond.touchVisible}; action="${pond.actionLabel}"; cleared rooms=${allCleared.cleared}; world=${(await stored(session)).world}; phase hint="${(await panel(session)).status}"`,
    });

    // Hold the action button to charge, release to cast.
    await touchDown(session, 'action', 25);
    await sleep(650);
    const charging = await shellState(session);
    await touchUp(session, 'action', 25);
    await waitForExpr(session, `document.querySelector('#status')?.innerText.includes('Waiting for a bite') === true`, 6000);
    frames.push({
      file: await session.screenshot(`${prefix}-10-touch-cast.png`),
      label: 'Touch cast charged and released',
      detail: `charging label="${charging.actionLabel}"; after release="${(await shellState(session)).actionLabel}"; status="${(await panel(session)).status}"`,
    });

    // Touch-only keep: wait for the bite, tap the action to hook, tap the recall
    // answer. The collection must grow.
    const biteMs = await waitForExpr(
      session,
      `document.querySelector('#status')?.innerText.includes('Bite!') === true`,
      25000,
    );
    if (!biteMs) throw new Error('No bite arrived for the touch keep check');
    await tapTouchAction(session, 31);
    const recallMs = await waitForExpr(
      session,
      `document.querySelector('#fishing-panel')?.hidden === false`,
      8000,
    );
    if (!recallMs) throw new Error('The touch hook did not open the recall dialog');
    const fishBefore = (await stored(session)).fish;
    await session.execute(`document.querySelector('#fishing-answered-correct').click(); return true;`);
    const keptMs = await waitForExpr(
      session,
      `document.querySelector('#fishing-panel')?.hidden === true`,
      10000,
    );
    await sleep(500);
    const kept = await stored(session);
    if (kept.fish !== fishBefore + 1) {
      throw new Error(`Touch keep did not add a fish: ${fishBefore} → ${kept.fish}`);
    }
    frames.push({
      file: await session.screenshot(`${prefix}-10b-touch-kept.png`),
      label: 'Touch-only catch kept',
      detail: `bite=${biteMs}ms; recall=${recallMs}ms; kept=${keptMs !== null}; fish ${fishBefore}→${kept.fish}; xp=${kept.xpTotal}; action label now="${(await shellState(session)).actionLabel}"`,
    });

    const reduced = await session.execute(`return matchMedia('(prefers-reduced-motion: reduce)').matches;`);
    return {
      keyboard,
      desktop,
      mobileTitle,
      refused,
      street,
      orientation,
      sheet,
      dungeon,
      pond,
      reducedMotion: reduced,
      touchOnly: {
        reached,
        climbed,
        pondReached,
        clearedRooms: allCleared.cleared,
        reviewOpened: touchReview,
        attachmentBytes: restored.attachmentSizes['p9-evidence.txt'],
        fishKept: kept.fish,
        world: (await stored(session)).world,
      },
    };
  } finally {
    await session.close();
  }
}

// ── P10 playtest, layout audit, and performance ────────────────────────────

/** Rects of the fixed HUD surfaces, plus overlap and target-size checks. */
async function layoutAudit(session) {
  return session.execute(`
    const ids = [
      'prompt', 'recovery', 'toast', 'toggle-panel', 'progress-panel',
      'touch-controls', 'npc-dialogue', 'title-panel',
    ];
    const visible = (node) => {
      if (!node || node.hidden) return false;
      if (node.closest('[hidden]')) return false;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    };
    const boxes = ids
      .map((id) => document.getElementById(id))
      .filter(visible)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.id,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
      });
    const overlaps = [];
    for (let i = 0; i < boxes.length; i += 1) {
      for (let j = i + 1; j < boxes.length; j += 1) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) {
          overlaps.push(a.id + '×' + b.id);
        }
      }
    }
    const targets = [...document.querySelectorAll('button, [role="button"], select')]
      .filter(visible)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.id || node.dataset.archetype || node.dataset.intent || node.innerText.trim().slice(0, 24),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
        };
      });
    const smallTargets = targets.filter((target) => target.w < 44 || target.h < 44);
    const clippedPanels = [...document.querySelectorAll('#progress-panel, #note-panel, #fishing-panel, #review-panel, #creator-panel, #service-panel, #journal-panel, #help-panel')]
      .filter(visible)
      .map((node) => ({
        id: node.id,
        horizontalClip: node.scrollWidth > node.clientWidth + 1,
        verticalClip: node.scrollWidth > node.clientWidth + 1,
      }));
    return {
      viewport: { w: window.innerWidth, h: window.innerHeight },
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
      overflowY: document.documentElement.scrollHeight > window.innerHeight,
      boxes,
      overlaps,
      smallTargets,
      clippedPanels,
      focus: document.activeElement?.id || document.activeElement?.tagName || '',
      textScale: document.documentElement.dataset.textScale ?? '',
      touchVisible: document.getElementById('touch-controls')?.hidden === false,
      progressOpen: document.getElementById('progress-panel')?.hidden === false,
    };
  `);
}

async function focusAudit(session) {
  return session.execute(`
    const node = document.activeElement;
    if (!node || node === document.body) return { focus: '', focusVisible: false, outline: '' };
    const style = getComputedStyle(node);
    return {
      focus: node.id || node.tagName,
      focusVisible: node.matches(':focus-visible'),
      outline: style.outlineStyle + ' ' + style.outlineWidth + ' ' + style.outlineColor,
    };
  `);
}

async function measureFrames(session, durationMs = 10000) {
  return session.executeAsync(`
    const done = arguments[arguments.length - 1];
    const duration = ${durationMs};
    const deltas = [];
    const started = performance.now();
    let last = started;
    function tick(now) {
      deltas.push(now - last);
      last = now;
      if (now - started < duration) requestAnimationFrame(tick);
      else {
        const sorted = [...deltas].sort((a, b) => a - b);
        done({
          frames: deltas.length,
          avgMs: Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 100) / 100,
          p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] * 100) / 100,
          maxMs: Math.round(Math.max(...deltas) * 100) / 100,
          over16_7: deltas.filter((value) => value > 16.7).length,
        });
      }
    }
    requestAnimationFrame(tick);
  `);
}

/** Durable-state size from IndexedDB, without learner prose in the output. */
async function storageFootprint(session) {
  return session.executeAsync(`
    const done = arguments[arguments.length - 1];
    const finish = async (state) => {
      const json = JSON.stringify(state);
      const estimate = await navigator.storage?.estimate?.().catch(() => null);
      done({
        stateJsonBytes: new TextEncoder().encode(json).length,
        attachmentCount: Object.keys(state.attachmentBytes ?? {}).length,
        attachmentBytes: Object.values(state.attachmentBytes ?? {}).reduce(
          (sum, bytes) => sum + (bytes?.length ?? 0),
          0,
        ),
        subjects: Object.keys(state.subjects ?? {}).length,
        rooms: Object.values(state.subjects ?? {}).reduce(
          (sum, subject) => sum + Object.keys(subject.rooms ?? {}).length,
          0,
        ),
        notes: Object.values(state.progression ?? {}).reduce(
          (sum, record) => sum + (record?.collectedNotes?.length ?? 0),
          0,
        ),
        fish: Object.values(state.progression ?? {}).reduce(
          (sum, record) => sum + (record?.fishCollection?.length ?? 0),
          0,
        ),
        usageBytes: estimate?.usage ?? null,
        quotaBytes: estimate?.quota ?? null,
      });
    };
    const request = indexedDB.open('knowledge-dungeon-side-scroller');
    request.onerror = () => done({ error: String(request.error) });
    request.onsuccess = () => {
      const get = request.result.transaction('engine-state', 'readonly').objectStore('engine-state').get('state');
      get.onerror = () => done({ error: String(get.error) });
      get.onsuccess = () => finish(get.result);
    };
  `);
}

async function p10Title(session) {
  const titleAudit = await layoutAudit(session);
  const focus = await focusAudit(session);
  const status = await session.execute(`return document.querySelector('#title-status')?.innerText ?? '';`);
  return { titleAudit, focus, status };
}

/**
 * P10 first-ten-minutes run.
 *
 * One real session covers title → archetype → street → three rooms → review →
 * Creator → new portal → fishing → journal → export → clear → import → reload.
 * It records layout overlaps, minimum target sizes, focus, durable-state size,
 * and every browser console error/warning collected by the BiDi log subscription.
 */
async function captureP10(prefix, frames) {
  // One WebDriver session at a time: run the keyboard-only pass first.
  const keyboard = await captureKeyboardRegression();
  const session = await openSession();
  const subscribed = await session.subscribeLogs();
  try {
    await session.setViewport(1280, 800, 1);
    await wd('POST', session.session('/url'), { url: APP });
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 20000);
    await sleep(500);

    const title = await p10Title(session);
    frames.push({
      file: await session.screenshot(`${prefix}-01-title.png`),
      label: 'Title',
      detail: `focus=${title.focus.focus} (${title.focus.focusVisible}); title=${title.titleAudit.overflowX === false}; targets under 44px=${title.titleAudit.smallTargets.length}; consoles subscribed=${subscribed}; status="${title.status}"`,
    });

    // Fresh save through the title's own New game path.
    await session.execute(`window.confirm = () => true; document.querySelector('#title-new-game').click(); return true;`);
    await sleep(1600);
    await wd('POST', session.session('/refresh'), {});
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 20000);
    await sleep(400);
    await session.execute(`document.querySelector('[data-archetype="scholar"]').click(); return true;`);
    await sleep(500);
    const archetypePressed = await session.execute(
      `return document.querySelector('[data-archetype="scholar"]')?.getAttribute('aria-pressed') === 'true';`,
    );
    await session.execute(`document.querySelector('#title-continue').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`, 15000);
    await sleep(500);
    const street = await layoutAudit(session);
    frames.push({
      file: await session.screenshot(`${prefix}-02-street.png`),
      label: 'Village street',
      detail: `archetype scholar=${archetypePressed}; focus=${street.focus}; overlaps=${street.overlaps.join(',') || 'none'}; targets under 44px=${street.smallTargets.length}; page scroll=${street.overflowY}`,
    });

    // The open desktop panel shortens the notice column instead of covering it.
    await session.execute(`
      const panel = document.querySelector('#progress-panel');
      if (panel.hidden) document.querySelector('#toggle-panel').click();
      return true;
    `);
    await sleep(300);
    const panelAudit = await layoutAudit(session);
    frames.push({
      file: await session.screenshot(`${prefix}-03-progress-panel.png`),
      label: 'Progress panel',
      detail: `open=${panelAudit.progressOpen}; overlaps=${panelAudit.overlaps.join(',') || 'none'}; touch hidden=${!panelAudit.touchVisible}; targets under 44px=${panelAudit.smallTargets.length}`,
    });
    await session.execute(`
      const panel = document.querySelector('#progress-panel');
      if (!panel.hidden) document.querySelector('#toggle-panel').click();
      return true;
    `);
    await sleep(250);

    // Enter the Training Grounds from the spawn.
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`, 12000);
    await sleep(400);
    await clearCurrentRoom(session);
    await session.hold('d', 650);
    await sleep(300);
    const lowerMs = await descendUntilRoomWide(session, 'Tools of the Trade');
    if (lowerMs === null) throw new Error('P10 playtest could not reach the lower room');
    await clearCurrentRoom(session);
    const climbMs = await climbUntilRoomWide(session, 'The Map & Beyond');
    if (climbMs === null) throw new Error('P10 playtest could not reach the upper room');
    await clearCurrentRoom(session);
    const cleared = await stored(session);
    if (cleared.cleared !== 3) throw new Error(`P10 playtest expected 3 clears, got ${cleared.cleared}`);
    const clearedPrompt = await session.execute(
      `return document.querySelector('#prompt')?.innerText ?? '';`,
    );
    frames.push({
      file: await session.screenshot(`${prefix}-04-cleared.png`),
      label: 'Three rooms cleared',
      detail: `cleared=${cleared.cleared}/3; lower=${lowerMs}ms; climb=${climbMs}ms; xp=${cleared.xp}; prompt="${clearedPrompt.replace(/\\n/g, ' / ')}"`,
    });

    // Review the upper room with the keyboard.
    const reviewMs = await openReviewWithR(session);
    if (!reviewMs) throw new Error('P10 playtest could not open review');
    await session.hold('5', 60);
    await session.hold('\uE007', 60);
    await waitForExpr(session, `document.querySelector('#review-result')?.hidden === false`, 10000);
    const reviewed = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-05-review.png`),
      label: 'Review passed',
      detail: `openedIn=${reviewMs}ms; passes=${reviewed.reviewPasses}; XP=${reviewed.xp}; next review set=${Object.values(reviewed.nextReview).some(Boolean)}`,
    });
    await session.hold('\uE00C', 60);
    await sleep(400);

    // Return to the street, then fish and read the journal.
    if ((await climbToStreetWide(session)) === null) throw new Error('P10 playtest could not climb to the street');
    await sleep(400);
    let pond = await walkToNearby(session, 'KeyA', 'a', 'Fishing Pond', 30000);
    if (!pond.found) pond = await walkToNearby(session, 'KeyD', 'd', 'Fishing Pond', 30000);
    if (!pond.found) {
      throw new Error(`P10 playtest could not reach a pond; nearby="${pond.nearby}"`);
    }
    await session.execute(`
      const panel = document.querySelector('#progress-panel');
      if (!panel.hidden) document.querySelector('#toggle-panel').click();
      return true;
    `);
    await sleep(250);
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Fishing pond') === true`, 12000);
    await session.synthDown('Space', ' ');
    await sleep(650);
    await session.synthUp('Space', ' ');
    await waitForExpr(session, `document.querySelector('#status')?.innerText.includes('Waiting for a bite') === true`, 8000);
    const biteMs = await waitForExpr(session, `document.querySelector('#status')?.innerText.includes('Bite!') === true`, 25000);
    if (!biteMs) throw new Error('P10 playtest saw no bite');
    await session.synthDown('Space', ' ');
    await session.synthUp('Space', ' ');
    await waitForExpr(session, `document.querySelector('#fishing-panel')?.hidden === false`, 10000);
    const fishBefore = (await stored(session)).fish;
    await session.execute(`document.querySelector('#fishing-answered-correct').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#fishing-panel')?.hidden === true`, 10000);
    const fished = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-07-fishing.png`),
      label: 'Catch kept',
      detail: `bite=${biteMs}ms; fish ${fishBefore}→${fished.fish}; xp=${fished.xpTotal}; world=${fished.world}`,
    });
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`, 12000);
    await sleep(400);
    await session.synthDown('KeyJ', 'j');
    await session.synthUp('KeyJ', 'j');
    const journalMs = await waitForExpr(session, `document.querySelector('#journal-panel')?.hidden === false`, 8000);
    const journalLayout = await layoutAudit(session);
    const journalFocus = await focusAudit(session);
    frames.push({
      file: await session.screenshot(`${prefix}-08-journal.png`),
      label: 'Journal',
      detail: `openedIn=${journalMs}ms; focus=${journalFocus.focus}; subjects in journal=${await session.execute(`return document.querySelectorAll('#journal-panel .journal-subject').length;`)}; overlaps=${journalLayout.overlaps.join(',') || 'none'}; horizontal clip=${journalLayout.clippedPanels.some((panel) => panel.horizontalClip)}`,
    });
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await sleep(350);

    // Portable save: inject one attachment, export, clear, import.
    await session.executeAsync(`
      const done = arguments[arguments.length - 1];
      const request = indexedDB.open('knowledge-dungeon-side-scroller');
      request.onerror = () => done({ error: String(request.error) });
      request.onsuccess = () => {
        const database = request.result;
        const transaction = database.transaction('engine-state', 'readwrite');
        const store = transaction.objectStore('engine-state');
        const get = store.get('state');
        get.onsuccess = () => {
          const state = get.result;
          state.attachmentBytes['p10-evidence.txt'] = new TextEncoder().encode(
            'P10 attachment bytes survive a JSON export and import.',
          );
          store.put(state, 'state');
        };
        transaction.oncomplete = () => done({ ok: true });
        transaction.onerror = () => done({ error: String(transaction.error) });
      };
    `);
    await wd('POST', session.session('/refresh'), {});
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 20000);
    await sleep(500);
    await session.execute(`document.querySelector('#title-continue').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`, 12000);
    await sleep(400);
    await session.execute(`
      window.__p10Export = null;
      const realCreate = URL.createObjectURL;
      URL.createObjectURL = (blob) => {
        const url = realCreate.call(URL, blob);
        blob.text().then((text) => { window.__p10Export = text; });
        return url;
      };
      const realClick = HTMLAnchorElement.prototype.click;
      HTMLAnchorElement.prototype.click = function () {
        if (this.download) return;
        return realClick.call(this);
      };
      document.querySelector('#export-save').click();
      return true;
    `);
    await waitForExpr(session, `typeof window.__p10Export === 'string' && window.__p10Export.length > 100`, 8000);
    const exported = JSON.parse(await session.execute(`return window.__p10Export;`));
    const beforeExport = await stored(session);
    const sizeBefore = await storageFootprint(session);
    if (exported.bundleVersion !== 1 || exported.app !== 'knowledge-dungeon-side-scroller') {
      throw new Error('P10 export did not produce a v1 bundle');
    }

    await session.execute(`window.confirm = () => true; document.querySelector('#clear-save').click(); return true;`);
    await sleep(1600);
    await wd('POST', session.session('/refresh'), {});
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 20000);
    await sleep(400);
    const emptied = await stored(session);
    await session.execute(`
      document.querySelector('#title-import-toggle').click();
      const text = document.querySelector('#title-import-text');
      text.value = ${JSON.stringify(JSON.stringify(exported))};
      document.querySelector('#title-import-apply').click();
      return true;
    `);
    await sleep(1400);
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 20000);
    await session.execute(`document.querySelector('#title-continue').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`, 15000);
    await sleep(400);
    const restored = await stored(session);
    if (
      restored.cleared !== beforeExport.cleared ||
      restored.xpTotal !== beforeExport.xpTotal ||
      restored.fish !== beforeExport.fish ||
      !restored.attachmentKeys.includes('p10-evidence.txt')
    ) {
      throw new Error(
        `P10 import round trip lost state: before=${JSON.stringify(beforeExport)} after=${JSON.stringify(restored)}`,
      );
    }
    const sizeAfter = await storageFootprint(session);
    frames.push({
      file: await session.screenshot(`${prefix}-09-import-roundtrip.png`),
      label: 'Export → clear → import',
      detail: `bundle v${exported.bundleVersion}; attachment base64=${typeof exported.state.attachmentBytes['p10-evidence.txt'] === 'string'}; cleared ${beforeExport.cleared}→${restored.cleared}; XP ${beforeExport.xpTotal}→${restored.xpTotal}; fish ${beforeExport.fish}→${restored.fish}; emptied save cleared=${emptied.cleared}; state JSON ${sizeBefore.stateJsonBytes}→${sizeAfter.stateJsonBytes} bytes`,
    });

    // Large text: the open journal must not clip horizontally.
    await session.execute(`
      localStorage.setItem('knowledge-dungeon.host-settings.v1', JSON.stringify({
        reducedMotion: 'system', assistanceMode: 'gentle', textScale: 'large', touchLayout: 'auto',
      }));
      return true;
    `);
    await wd('POST', session.session('/refresh'), {});
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 20000);
    await session.execute(`document.querySelector('#title-continue').click(); return true;`);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`, 12000);
    await session.synthDown('KeyJ', 'j');
    await session.synthUp('KeyJ', 'j');
    await waitForExpr(session, `document.querySelector('#journal-panel')?.hidden === false`, 8000);
    const large = await layoutAudit(session);
    frames.push({
      file: await session.screenshot(`${prefix}-10-large-text.png`),
      label: 'Large text',
      detail: `text scale=${large.textScale}; page overflowX=${large.overflowX}; clipped dialogs=${large.clippedPanels.filter((panel) => panel.horizontalClip).map((panel) => panel.id).join(',') || 'none'}; targets under 44px=${large.smallTargets.length}`,
    });
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await session.execute(`
      localStorage.setItem('knowledge-dungeon.host-settings.v1', JSON.stringify({
        reducedMotion: 'system', assistanceMode: 'gentle', textScale: 'normal', touchLayout: 'auto',
      }));
      return true;
    `);

    // Phone width: the sheet hides the touch pad and no HUD surface overlaps.
    await session.setViewport(390, 844, 2);
    await sleep(500);
    await session.execute(`
      const panel = document.querySelector('#progress-panel');
      if (panel.hidden) document.querySelector('#toggle-panel').click();
      return true;
    `);
    await sleep(350);
    const phone = await layoutAudit(session);
    frames.push({
      file: await session.screenshot(`${prefix}-11-phone-sheet.png`),
      label: 'Phone progress sheet',
      detail: `viewport=${phone.viewport.w}×${phone.viewport.h}; sheet open=${phone.progressOpen}; touch hidden=${!phone.touchVisible}; overlaps=${phone.overlaps.join(',') || 'none'}; page overflowX=${phone.overflowX}; targets under 44px=${phone.smallTargets.length}`,
    });
    await session.execute(`
      const panel = document.querySelector('#progress-panel');
      if (!panel.hidden) document.querySelector('#toggle-panel').click();
      return true;
    `);
    await session.setViewport(1280, 800, 1);
    await session.execute(`document.documentElement.dataset.textScale = 'normal'; return true;`);
    await sleep(300);

    // Creator last: create a subject, enter it through the journal, clear its
    // root room, and leave the playtest in that dungeon. The portable-save run
    // above already proved the street state, so no physical walk-out is needed
    // after this final mode.
    await session.synthDown('KeyC', 'c');
    await session.synthUp('KeyC', 'c');
    await waitForExpr(session, `document.querySelector('#creator-panel')?.hidden === false`, 10000);
    await session.execute(`
      const set = (selector, value) => {
        const node = document.querySelector(selector);
        node.value = value;
        node.dispatchEvent(new Event('input', { bubbles: true }));
      };
      set('#creator-subject-name', 'P10 Playtest');
      set('#creator-root-topic', 'Playtest Root');
      document.querySelector('[data-focus-key="create-submit"]').click();
      return true;
    `);
    await waitForExpr(
      session,
      `document.querySelector('#creator-panel .creator-room-select') !== null`,
      12000,
    );
    await addCreatorRooms(session, 'Playtest Root', ['Playtest One', 'Playtest Two', 'Playtest Three']);
    await waitForExpr(
      session,
      `document.querySelectorAll('#creator-panel .creator-room-select').length === 4`,
      12000,
    );
    const created = await stored(session);
    const creatorLayout = await layoutAudit(session);
    frames.push({
      file: await session.screenshot(`${prefix}-12-creator.png`),
      label: 'Creator subject',
      detail: `subjects=${created.subjects}; rooms=${created.rooms.length}; overlaps=${creatorLayout.overlaps.join(',') || 'none'}; targets under 44px=${creatorLayout.smallTargets.length}`,
    });
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await waitForExpr(session, `document.querySelector('#creator-panel')?.hidden !== false`, 8000);
    await sleep(600);

    await session.synthDown('KeyJ', 'j');
    await session.synthUp('KeyJ', 'j');
    await waitForExpr(session, `document.querySelector('#journal-panel')?.hidden === false`, 8000);
    const journalEntry = await session.execute(`
      const row = [...document.querySelectorAll('#journal-panel .journal-subject')]
        .find((node) => node.innerText.includes('P10 Playtest'));
      const enter = row?.querySelector('[data-focus-key^="journal-enter-"]');
      if (!enter) return false;
      enter.click();
      return true;
    `);
    if (!journalEntry) throw new Error('P10 playtest journal had no new subject row');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('P10 Playtest') === true`, 15000);
    await clearCurrentRoom(session);
    const subjectCleared = await stored(session);
    frames.push({
      file: await session.screenshot(`${prefix}-13-new-subject.png`),
      label: 'New subject room',
      detail: `cleared=${subjectCleared.cleared}; rooms=${subjectCleared.rooms.length}; world=${subjectCleared.world}; created subject active=true`,
    });

    const durable = await storageFootprint(session);
    const consoleErrors = session.consoleErrors();
    return {
      subscribed,
      title: { focus: title.focus, status: title.status },
      archetypePressed,
      street,
      panelAudit,
      cleared,
      reviewed,
      created,
      creatorLayout,
      subjectCleared,
      fished,
      journal: { journalMs, focus: journalFocus, layout: journalLayout },
      export: {
        bundleVersion: exported.bundleVersion,
        before: beforeExport,
        restored,
        emptied,
        sizeBefore,
        sizeAfter,
      },
      largeText: large,
      phone,
      keyboard,
      durable,
      consoleErrors,
    };
  } finally {
    await session.close();
  }
}

/**
 * P10 performance run.
 *
 * A 10 s trace at each surface the plan names, plus an about:blank baseline and
 * the durable-state footprint after a scripted run.
 */
async function capturePerf(prefix, frames) {
  const session = await openSession();
  const subscribed = await session.subscribeLogs();
  try {
    await session.setViewport(1280, 800, 1);
    await wd('POST', session.session('/url'), { url: 'about:blank' });
    await sleep(500);
    const baseline = await measureFrames(session);

    await wd('POST', session.session('/url'), { url: APP });
    await waitForExpr(session, `document.querySelector('#title-panel')?.hidden === false`, 20000);
    await startTutorial(session);
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Subject') === true`, 12000);
    const root = await measureFrames(session);
    frames.push({
      file: await session.screenshot(`${prefix}-01-dungeon-room.png`),
      label: 'Dungeon room',
      detail: `avg=${root.avgMs}ms p95=${root.p95Ms}ms max=${root.maxMs}ms over16.7=${root.over16_7}/${root.frames}`,
    });

    await clearCurrentRoom(session);
    if ((await descendToToolsRoom(session)) === null) throw new Error('perf run could not reach the lower room');
    const lower = await measureFrames(session);
    frames.push({
      file: await session.screenshot(`${prefix}-02-lower-room.png`),
      label: 'Lower dungeon room',
      detail: `avg=${lower.avgMs}ms p95=${lower.p95Ms}ms max=${lower.maxMs}ms over16.7=${lower.over16_7}/${lower.frames}`,
    });

    if ((await climbToStreetWide(session)) === null) throw new Error('perf run could not reach the street');
    await sleep(400);
    const street = await measureFrames(session);
    frames.push({
      file: await session.screenshot(`${prefix}-03-street.png`),
      label: 'Street',
      detail: `avg=${street.avgMs}ms p95=${street.p95Ms}ms max=${street.maxMs}ms over16.7=${street.over16_7}/${street.frames}`,
    });

    const pondWalk = await walkToNearby(session, 'KeyA', 'a', 'Fishing Pond', 30000);
    if (!pondWalk.found) throw new Error('perf run could not reach the pond');
    await session.synthDown('KeyE', 'e');
    await session.synthUp('KeyE', 'e');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Fishing pond') === true`, 12000);
    const pond = await measureFrames(session);
    frames.push({
      file: await session.screenshot(`${prefix}-04-pond.png`),
      label: 'Pond',
      detail: `avg=${pond.avgMs}ms p95=${pond.p95Ms}ms max=${pond.maxMs}ms over16.7=${pond.over16_7}/${pond.frames}`,
    });
    await session.synthDown('Escape', 'Escape');
    await session.synthUp('Escape', 'Escape');
    await waitForExpr(session, `document.querySelector('#summary')?.innerText.includes('Village street') === true`, 12000);
    await sleep(300);

    const library = await openServiceAt(session, 'Library', 'KeyD', 'd', 30000);
    if (!library.openedMs) throw new Error('perf run could not open the Library');
    const libraryFrames = await measureFrames(session);
    frames.push({
      file: await session.screenshot(`${prefix}-05-library.png`),
      label: 'Library service',
      detail: `avg=${libraryFrames.avgMs}ms p95=${libraryFrames.p95Ms}ms max=${libraryFrames.maxMs}ms over16.7=${libraryFrames.over16_7}/${libraryFrames.frames}`,
    });
    await closeService(session);
    await sleep(300);

    await session.synthDown('KeyJ', 'j');
    await session.synthUp('KeyJ', 'j');
    let journalOpen = await waitForExpr(
      session,
      `document.querySelector('#journal-panel')?.hidden === false`,
      8000,
    );
    if (journalOpen === null) {
      await ensureProgressVisible(session);
      await session.execute(`document.querySelector('#open-journal').click(); return true;`);
      journalOpen = await waitForExpr(
        session,
        `document.querySelector('#journal-panel')?.hidden === false`,
        8000,
      );
    }
    if (journalOpen === null) throw new Error('The perf run could not open the journal');
    const journal = await measureFrames(session);
    frames.push({
      file: await session.screenshot(`${prefix}-06-journal.png`),
      label: 'Journal',
      detail: `avg=${journal.avgMs}ms p95=${journal.p95Ms}ms max=${journal.maxMs}ms over16.7=${journal.over16_7}/${journal.frames}`,
    });
    const durable = await storageFootprint(session);
    const consoleErrors = session.consoleErrors();
    return {
      subscribed,
      baseline,
      root,
      lower,
      street,
      pond,
      library: libraryFrames,
      journal,
      durable,
      consoleErrors,
    };
  } finally {
    await session.close();
  }
}

/** A production-build boot check: title visible, no failed resources, clean log. */
async function captureSmoke(prefix, frames) {
  const session = await openSession();
  const subscribed = await session.subscribeLogs();
  try {
    await session.setViewport(1280, 800, 1);
    await wd('POST', session.session('/url'), { url: APP });
    const titleMs = await waitForExpr(
      session,
      `document.querySelector('#title-panel')?.hidden === false`,
      20000,
    );
    const state = await session.execute(`
      return {
        titleVisible: document.querySelector('#title-panel')?.hidden === false,
        overlayHidden: document.querySelector('#overlay')?.hidden === true,
        status: document.querySelector('#title-status')?.innerText ?? '',
        canvas: {
          width: document.querySelector('#game')?.width ?? 0,
          height: document.querySelector('#game')?.height ?? 0,
        },
        error: document.querySelector('#error')?.hidden
          ? ''
          : (document.querySelector('#error')?.innerText ?? ''),
        failedResources: performance.getEntriesByType('resource')
          .filter((entry) => typeof entry.responseStatus === 'number' && entry.responseStatus >= 400)
          .map((entry) => ({ name: entry.name.split('/').pop() ?? entry.name, status: entry.responseStatus })),
      };
    `);
    frames.push({
      file: await session.screenshot(`${prefix}-01-boot.png`),
      label: 'Production boot',
      detail: `title in ${titleMs ?? 'timeout'}ms; title visible=${state.titleVisible}; canvas=${state.canvas.width}×${state.canvas.height}; failed resources=${state.failedResources.length}; panel error="${state.error}"`,
    });
    return {
      subscribed,
      titleMs,
      state,
      consoleErrors: session.consoleErrors(),
    };
  } finally {
    await session.close();
  }
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const frames = [];

  if (options.smoke) {
    const run = await captureSmoke(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: '1280×800 desktop',
      prefix: options.prefix,
      smoke: true,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    return;
  }

  if (options.p10) {
    const run = await captureP10(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: '1280×800 desktop, then 390×844 DPR 2 phone sheet',
      prefix: options.prefix,
      p10: true,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.perf) {
    const run = await capturePerf(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: '1280×800 desktop',
      prefix: options.prefix,
      perf: true,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.shell) {
    const run = await captureShell(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: '1280×800 desktop title, then 390×844 portrait for the touch run',
      prefix: options.prefix,
      shell: true,
      reducedMotion: options.reducedMotion,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.openings) {
    const run = await captureOpenings(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: 'default headless Firefox (captured window)',
      prefix: options.prefix,
      openings: true,
      reducedMotion: options.reducedMotion,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.help) {
    const run = await captureHelp(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: 'default headless Firefox (captured window)',
      prefix: options.prefix,
      help: true,
      reducedMotion: options.reducedMotion,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.journal) {
    const run = await captureJournal(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: 'default headless Firefox (captured window)',
      prefix: options.prefix,
      journal: true,
      reducedMotion: options.reducedMotion,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.services) {
    const run = await captureServices(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: 'default headless Firefox (captured window)',
      prefix: options.prefix,
      services: true,
      reducedMotion: options.reducedMotion,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.creator) {
    const run = await captureCreator(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: 'default headless Firefox (captured window)',
      prefix: options.prefix,
      creator: true,
      reducedMotion: options.reducedMotion,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.fishing) {
    const run = await captureFishing(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: 'default headless Firefox (captured window)',
      prefix: options.prefix,
      fishing: true,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  if (options.review) {
    const run = await captureReview(options.prefix, frames);
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: 'default headless Firefox (captured window)',
      prefix: options.prefix,
      review: true,
      reducedMotion: options.reducedMotion,
      result: run,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
    const date = new Date().toISOString().slice(0, 10);
    console.log('\nMarkdown rows:\n');
    for (const frame of frames) {
      console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
    }
    return;
  }

  const surface = options.surface ? await captureSurface(options.prefix, frames) : null;
  if (!options.surface) {
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
  } else {
    const manifest = {
      capturedAt: new Date().toISOString(),
      app: APP,
      viewport: 'default headless Firefox (captured window)',
      prefix: options.prefix,
      surface: true,
      result: surface,
      frames,
    };
    await writeFile(resolve(OUT, `${options.prefix}-manifest.json`), JSON.stringify(manifest, null, 2));
    console.log(JSON.stringify(manifest, null, 2));
  }

  console.log('\nMarkdown rows:\n');
  const date = new Date().toISOString().slice(0, 10);
  for (const frame of frames) {
    console.log(`| ${date} | ${frame.label} | \`${frame.file}\` | ${frame.detail} |`);
  }
}

await main();
