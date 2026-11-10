import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { initProject, packageManager } from '../bin/init.js';

async function project(t, pkg = {}) {
  const root = await mkdtemp(join(tmpdir(), 'flowboard-init-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  return root;
}

test('init installs with the selected manager, preserves changes and is idempotent', async (t) => {
  const root = await project(t, { packageManager: 'pnpm@10.0.0', scripts: { test: 'my-tests' } });
  let calls = 0;
  const install = async (command, args, cwd) => {
    calls++;
    assert.equal(command, 'pnpm');
    assert.deepEqual(args, ['add', '--dev', 'flowboard@^0.1.0']);
    assert.equal(cwd, root);
    const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
    pkg.devDependencies = { flowboard: '^0.1.0' };
    await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2));
  };
  await initProject(root, { version: '0.1.0', configDir: 'config/story book', install });
  const first = await readFile(join(root, 'package.json'), 'utf8');
  assert.deepEqual(JSON.parse(first).scripts, { test: 'my-tests', flowboard: 'flowboard --open --config-dir "config/story book"' });
  await initProject(root, { version: '0.1.0', configDir: 'config/story book', install });
  assert.equal(await readFile(join(root, 'package.json'), 'utf8'), first);
  assert.equal(calls, 1);
});

test('init preserves a conflicting script without installing', async (t) => {
  const root = await project(t, { scripts: { flowboard: 'custom-command' } });
  await assert.rejects(initProject(root, { version: '0.1.0', install: () => assert.fail('must not install') }), /already exists/);
});

test('manager detection handles locks and rejects ambiguity', async (t) => {
  const root = await project(t);
  assert.equal(packageManager(root, {}), 'npm');
  await writeFile(join(root, 'bun.lock'), '');
  assert.equal(packageManager(root, {}), 'bun');
  await writeFile(join(root, 'yarn.lock'), '');
  assert.throws(() => packageManager(root, {}), /Multiple/);
  assert.equal(packageManager(root, { packageManager: 'yarn@4.0.0' }), 'yarn');
  assert.throws(() => packageManager(root, { packageManager: 'other@1' }), /Unsupported/);
});

test('init stops after an installation failure without adding a script', async (t) => {
  const root = await project(t);
  await assert.rejects(initProject(root, { version: '0.1.0', install: async () => { throw new Error('offline'); } }), /offline/);
  assert.equal(JSON.parse(await readFile(join(root, 'package.json'), 'utf8')).scripts, undefined);
});

test('manager detection inherits workspace configuration and lockfiles', async (t) => {
  const root = await project(t, { packageManager: 'pnpm@10.0.0' });
  const child = join(root, 'packages', 'app');
  await mkdir(child, { recursive: true });
  assert.equal(packageManager(child, {}), 'pnpm');
  await writeFile(join(root, 'package.json'), '{}');
  await writeFile(join(root, 'pnpm-lock.yaml'), '');
  assert.equal(packageManager(child, {}), 'pnpm');
  await mkdir(join(child, '.git'));
  assert.equal(packageManager(child, {}), 'npm');
});

test('init explicitly targets a pnpm workspace root', async (t) => {
  const root = await project(t, { packageManager: 'pnpm@10.0.0' });
  await writeFile(join(root, 'pnpm-workspace.yaml'), 'packages: []');
  await initProject(root, { version: '0.1.0', install: async (command, args) => {
    assert.equal(command, 'pnpm');
    assert.deepEqual(args, ['add', '--dev', '--workspace-root', 'flowboard@^0.1.0']);
  } });
});

test('init preserves BOM and CRLF, makes config portable and saves launch options', async (t) => {
  const root = await project(t);
  await writeFile(join(root, 'package.json'), '\uFEFF{\r\n\t"devDependencies": {"flowboard": "^0.1.0"}\r\n}\r\n');
  await initProject(root, { version: '0.1.0', configDir: join(root, 'custom config'), port: '7000', noWatch: true });
  const content = await readFile(join(root, 'package.json'), 'utf8');
  assert.ok(content.startsWith('\uFEFF'));
  assert.ok(content.includes('\r\n\t"scripts"'));
  assert.ok(!content.replaceAll('\r\n', '').includes('\n'));
  assert.equal(JSON.parse(content.slice(1)).scripts.flowboard, 'flowboard --open --config-dir "custom config" --port 7000 --no-watch');
});
