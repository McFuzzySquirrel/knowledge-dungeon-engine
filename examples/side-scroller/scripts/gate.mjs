#!/usr/bin/env node
/**
 * P10 local gate (host tooling; no engine change).
 *
 * Runs from any directory, resolves the repository root from this file, and
 * checks the same list the phase plan names:
 *
 *   - root test, typecheck, build
 *   - example test, typecheck, build
 *   - root Vitest discovery contains no `examples/` path
 *   - `git status --short src` and `git diff --stat src` are empty
 *
 * Output is printed, not swallowed. A summary table reports pass/fail and the
 * test counts parsed from each suite. The process exits non-zero on any failed
 * check.
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const EXAMPLE = resolve(HERE, '..');
const ROOT = resolve(EXAMPLE, '../..');

const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const status = ok ? 'PASS' : 'FAIL';
  console.log(`\n[${status}] ${name}${detail ? ` — ${detail}` : ''}`);
}

function run(name, command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  const started = Date.now();
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? ROOT,
    env: process.env,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.error) {
    record(name, false, `${result.error.message} (${elapsed}s)`);
    return { ok: false, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
  }
  const ok = result.status === 0;
  record(name, ok, `exit ${result.status} · ${elapsed}s`);
  return { ok, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

function counts(output) {
  const files = output.match(/Test Files\s+(\d+)\s+passed/);
  const tests = output.match(/Tests\s+(\d+)\s+passed/);
  if (!files || !tests) return null;
  return { files: Number(files[1]), tests: Number(tests[1]) };
}

function combined(result) {
  return `${result.stdout}\n${result.stderr}`;
}

console.log('Knowledge Dungeon — side-scroller local gate');
console.log(`Repository: ${ROOT}`);
console.log(`Started:    ${new Date().toISOString()}`);

// ── Engine (root) ────────────────────────────────────────────────────────────
const engineTest = run('root tests', 'npm', ['test']);
const engineCounts = counts(combined(engineTest));
if (!engineCounts && engineTest.ok) record('root test counts', false, 'could not parse counts');
run('root typecheck', 'npm', ['run', 'typecheck']);
run('root build', 'npm', ['run', 'build']);

// ── Example ──────────────────────────────────────────────────────────────────
const exampleTest = run('example tests', 'npm', ['--prefix', 'examples/side-scroller', 'test']);
const exampleCounts = counts(combined(exampleTest));
if (!exampleCounts && exampleTest.ok) record('example test counts', false, 'could not parse counts');
run('example typecheck', 'npm', ['--prefix', 'examples/side-scroller', 'run', 'typecheck']);
run('example build', 'npm', ['--prefix', 'examples/side-scroller', 'run', 'build']);

// ── Isolation probe ──────────────────────────────────────────────────────────
const probe = run('root Vitest discovery', 'npx', ['vitest', 'list', '--config', 'vitest.config.ts']);
if (probe.ok) {
  const leaked = combined(probe)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.includes('examples/'));
  record(
    'isolation: no examples/ paths',
    leaked.length === 0,
    leaked.length === 0 ? '0 example paths' : `${leaked.length} example path(s): ${leaked.slice(0, 3).join(', ')}`,
  );
} else {
  record('isolation: no examples/ paths', false, 'discovery command failed');
}

// ── Engine boundary ──────────────────────────────────────────────────────────
const status = spawnSync('git', ['status', '--short', '--', 'src'], {
  cwd: ROOT,
  encoding: 'utf8',
});
const statusText = (status.stdout ?? '').trim();
const statusOk = status.status === 0 && statusText === '';
record('engine status empty', statusOk, statusText || 'no changes under src/');

const diff = spawnSync('git', ['diff', '--stat', '--', 'src'], {
  cwd: ROOT,
  encoding: 'utf8',
});
const diffText = (diff.stdout ?? '').trim();
const diffOk = diff.status === 0 && diffText === '';
record('engine diff empty', diffOk, diffText || 'no diff under src/');

// ── Summary ──────────────────────────────────────────────────────────────────
const passed = results.filter((entry) => entry.ok).length;
const failed = results.length - passed;
const engineLabel = engineCounts
  ? `${engineCounts.files} files / ${engineCounts.tests} tests`
  : 'unparsed';
const exampleLabel = exampleCounts
  ? `${exampleCounts.files} files / ${exampleCounts.tests} tests`
  : 'unparsed';

console.log('\n── Gate summary ─────────────────────────────────────────────');
console.log(`Engine suite:  ${engineLabel}`);
console.log(`Example suite: ${exampleLabel}`);
console.log('');
for (const entry of results) {
  console.log(`${entry.ok ? 'PASS' : 'FAIL'}  ${entry.name.padEnd(32)} ${entry.detail}`);
}
console.log('');
console.log(`${passed} passed, ${failed} failed`);
console.log(`Finished: ${new Date().toISOString()}`);

process.exit(failed === 0 ? 0 : 1);
