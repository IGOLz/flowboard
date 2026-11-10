#!/usr/bin/env node
// Flowboard CLI: compiles the project's stories with `storybook build`, serves the static bundle
// next to the canvas dashboard, and rebuilds when project files change.
// Storybook's own dev server is never used.
import http from 'node:http';
import { createReadStream, existsSync, watch } from 'node:fs';
import { readFile, rename, rm, stat } from 'node:fs/promises';
import { exec, spawn } from 'node:child_process';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values: opts } = parseArgs({
  options: {
    port: { type: 'string', short: 'p', default: process.env.FLOWBOARD_PORT ?? '6007' },
    'config-dir': { type: 'string', short: 'c', default: '.storybook' },
    'no-watch': { type: 'boolean', default: false },
    open: { type: 'boolean', short: 'o', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

if (opts.help) {
  console.log(`Usage: flowboard [--port <port>] [--config-dir <dir>] [--no-watch] [--open]

Run it from the folder that contains your Storybook config (.storybook).

  -p, --port        Dashboard port (default 6007)
  -c, --config-dir  Storybook config folder (default .storybook)
      --no-watch    Build once, do not rebuild on file changes
  -o, --open        Open the dashboard in the browser`);
  process.exit(0);
}

const root = process.cwd();
const configDir = resolve(root, opts['config-dir']);
const cache = join(root, 'node_modules', '.cache', 'flowboard');
const out = join(cache, 'storybook');
const next = join(cache, 'storybook-next');
const dashboard = fileURLToPath(new URL('../dashboard/', import.meta.url));

function fail(message) {
  console.error(message);
  process.exit(1);
}

function findStorybookBin() {
  const name = process.platform === 'win32' ? 'storybook.cmd' : 'storybook';
  for (let dir = root; ; dir = dirname(dir)) {
    const bin = join(dir, 'node_modules', '.bin', name);
    if (existsSync(bin)) return bin;
    if (dirname(dir) === dir) return null;
  }
}

if (!existsSync(configDir)) fail(`No Storybook config at ${configDir}.\nRun flowboard from the folder that contains .storybook, or pass --config-dir.`);
const storybookBin = findStorybookBin() ?? fail('Storybook is not installed in this project (node_modules/.bin/storybook not found).');

// ---------- Build ----------
const state = { build: null, building: false, error: null, stories: [] };
let queued = false;

async function loadIndex() {
  const { entries } = JSON.parse(await readFile(join(out, 'index.json'), 'utf8'));
  state.stories = Object.values(entries).filter((entry) => entry.type === 'story');
  state.build = String((await stat(join(out, 'index.json'))).mtimeMs);
}

function runBuild() {
  return new Promise((done, failed) => {
    const child = spawn(storybookBin, ['build', '-c', configDir, '-o', next, '--quiet', '--disable-telemetry'], { cwd: root });
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk; });
    child.stderr.on('data', (chunk) => { log += chunk; });
    child.on('error', failed);
    child.on('close', (code) => (code === 0 ? done() : failed(new Error(log.trim().slice(-3000) || `exit code ${code}`))));
  });
}

async function build() {
  if (state.building) { queued = true; return; }
  state.building = true;
  const started = Date.now();
  console.log('Building stories…');
  try {
    await rm(next, { recursive: true, force: true });
    await runBuild();
    // Swap only a finished build in, so the dashboard never sees a half-written bundle.
    await rm(out, { recursive: true, force: true });
    await rename(next, out);
    await loadIndex();
    state.error = null;
    console.log(`Built ${state.stories.length} screens in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  } catch (error) {
    state.error = 'Storybook build failed: see the terminal running flowboard.';
    console.error(`Storybook build failed:\n${error.message}`);
  }
  state.building = false;
  if (queued) { queued = false; build(); }
}

// ---------- Watch ----------
// Only source files trigger a rebuild; generated output (tests, reports, native builds) never does.
const IGNORED = /(^|[/\\])(node_modules|\.git|ios|android|dist|build|storybook-static|\.expo|\.turbo|coverage|test-results|playwright-report)([/\\]|$)/;
const SOURCE = /\.(tsx?|jsx?|mjs|cjs|mts|cts|css|scss|json|svg|png|jpe?g|gif|webp|ttf|otf|woff2?)$/;
if (!opts['no-watch']) {
  let timer;
  watch(root, { recursive: true }, (_event, file) => {
    if (!file || IGNORED.test(file) || !SOURCE.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(build, 1500);
  });
}

// ---------- Server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
};
const DASHBOARD = { '/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css' };

async function sendFile(res, file) {
  try {
    const info = await stat(file);
    if (info.isDirectory()) return sendFile(res, join(file, 'index.html'));
    res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-length': info.size, 'cache-control': 'no-cache' });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

const server = http.createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/api/stories') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify(state));
  }
  if (path.startsWith('/storybook/')) {
    const file = join(out, path.slice('/storybook/'.length));
    if (file !== out && !file.startsWith(out + sep)) return res.writeHead(404).end();
    return sendFile(res, file);
  }
  if (DASHBOARD[path]) return sendFile(res, join(dashboard, DASHBOARD[path]));
  res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
});

server.on('error', (error) => fail(error.code === 'EADDRINUSE' ? `Port ${opts.port} is busy: use --port <other>.` : error.message));

server.listen(Number(opts.port), async () => {
  const url = `http://localhost:${opts.port}`;
  console.log(`Flowboard   ${url}\nStories     ${configDir}`);
  if (opts.open) exec(`${process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'} ${url}`);
  // Show the previous build right away, then refresh it.
  await loadIndex().catch(() => {});
  build();
});
