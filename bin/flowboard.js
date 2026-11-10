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
// Per port, so two instances in the same project never overwrite each other's build.
const out = join(cache, `storybook-${opts.port}`);
const next = `${out}-next`;
const old = `${out}-old`;
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
let buildProcess = null;

async function loadIndex() {
  const { entries } = JSON.parse(await readFile(join(out, 'index.json'), 'utf8'));
  state.stories = Object.values(entries).filter((entry) => entry.type === 'story');
  state.build = String((await stat(join(out, 'index.json'))).mtimeMs);
}

function runBuild() {
  return new Promise((done, failed) => {
    const child = spawn(storybookBin, ['build', '-c', configDir, '-o', next, '--quiet', '--disable-telemetry'], { cwd: root });
    buildProcess = child;
    let log = '';
    child.stdout.on('data', (chunk) => { log += chunk; });
    child.stderr.on('data', (chunk) => { log += chunk; });
    child.on('error', failed);
    child.on('close', (code) => (buildProcess = null, code === 0 ? done() : failed(new Error(log.trim().slice(-3000) || `exit code ${code}`))));
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
    // Swap only a finished build in, with two renames so `out` is never missing; the old bundle
    // is deleted afterwards (requests still streaming from it keep their open files).
    await rm(old, { recursive: true, force: true });
    await rename(out, old).catch(() => {});
    await rename(next, out);
    rm(old, { recursive: true, force: true }).catch(() => {});
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
// Only source files trigger a rebuild; generated output (tests, reports, native projects) never does.
// Dependency and tool folders are ignored at any depth, output folders only at the project root,
// so source folders such as src/platform/android still count.
const IGNORED_ANYWHERE = /(^|[/\\])(node_modules|\.git|\.expo|\.turbo|\.next)([/\\]|$)/;
const IGNORED_AT_ROOT = /^(ios|android|dist|build|storybook-static|coverage|test-results|playwright-report)([/\\]|$)/;
const SOURCE = /\.(tsx?|jsx?|mjs|cjs|mts|cts|css|scss|sass|less|json|mdx?|vue|svelte|astro|html|svg|png|jpe?g|gif|webp|ttf|otf|woff2?)$/;
if (!opts['no-watch']) {
  let timer;
  const watcher = watch(root, { recursive: true }, (_event, file) => {
    if (!file || IGNORED_ANYWHERE.test(file) || IGNORED_AT_ROOT.test(file) || !SOURCE.test(file)) return;
    clearTimeout(timer);
    timer = setTimeout(build, 1500);
  });
  watcher.on('error', (error) => console.error(`File watching stopped (${error.code ?? error.message}); restart flowboard to rebuild on changes.`));
}

// ---------- Server ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.otf': 'font/otf', '.wasm': 'application/wasm', '.webmanifest': 'application/manifest+json',
  '.map': 'application/json', '.mp4': 'video/mp4', '.mp3': 'audio/mpeg',
};
const DASHBOARD = { '/': 'index.html', '/app.js': 'app.js', '/screens.js': 'screens.js', '/style.css': 'style.css', '/frame.js': 'frame.js' };
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);
const HOSTS = new Set(['localhost', '127.0.0.1']); // the two loopback names the canvas and its screens use
const HASHED = /^\/storybook\/assets\//; // content-hashed build output: safe to cache forever
const FRAME_ANCESTORS = `frame-ancestors http://localhost:${opts.port} http://127.0.0.1:${opts.port}`;

// Only loopback names on our port: blocks DNS-rebinding pages that reach us through 127.0.0.1.
function requestHost(req) {
  try {
    const { hostname, port } = new URL(`http://${req.headers.host}`);
    return HOSTS.has(hostname) && port === String(opts.port) ? hostname : null;
  } catch {
    return null;
  }
}

// Screens load from the other loopback name (localhost ⇄ 127.0.0.1): a different site, so the
// browser runs all of them in a process separate from the canvas, and their JavaScript never
// stalls panning and zooming.
function frameOrigin(hostname) {
  return `http://${hostname === '127.0.0.1' ? 'localhost' : '127.0.0.1'}:${opts.port}`;
}

// Every story iframe gets frame.js, which carries out the canvas commands (scroll, switch state).
async function sendStoryFrame(res) {
  try {
    const html = await readFile(join(out, 'iframe.html'), 'utf8');
    const body = html.replace('</head>', '<script src="/frame.js"></script></head>');
    res.writeHead(200, { 'content-type': MIME['.html'], 'cache-control': 'no-cache' }).end(body);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
}

async function sendFile(req, res, file, path) {
  let info;
  try {
    info = await stat(file);
    if (info.isDirectory()) return sendFile(req, res, join(file, 'index.html'), path);
  } catch {
    return res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
  }
  const modified = new Date(Math.floor(info.mtimeMs / 1000) * 1000).toUTCString();
  const headers = {
    'cache-control': HASHED.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache',
    'last-modified': modified,
  };
  if (req.headers['if-modified-since'] === modified) return res.writeHead(304, headers).end();
  // The file can vanish between stat and open (a rebuild swapping bundles): fail this request only.
  const stream = createReadStream(file);
  stream.on('error', () => (res.headersSent ? res.destroy() : res.writeHead(404).end()));
  stream.once('open', () => {
    res.writeHead(200, { ...headers, 'content-type': MIME[extname(file)] ?? 'application/octet-stream', 'content-length': info.size });
    stream.pipe(res);
  });
}

const server = http.createServer((req, res) => {
  // Local tool: the project's screens are never served to other machines, or to other sites.
  const hostname = requestHost(req);
  if (!LOOPBACK.has(req.socket.remoteAddress) || !hostname) return res.writeHead(403).end();
  res.setHeader('content-security-policy', FRAME_ANCESTORS);
  let path;
  try {
    path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  } catch {
    return res.writeHead(400).end();
  }
  if (path === '/api/stories') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
    return res.end(JSON.stringify({ ...state, frameOrigin: frameOrigin(hostname) }));
  }
  if (path === '/storybook/iframe.html') return sendStoryFrame(res);
  if (path.startsWith('/storybook/')) {
    const file = join(out, path.slice('/storybook/'.length));
    if (file !== out && !file.startsWith(out + sep)) return res.writeHead(404).end();
    return sendFile(req, res, file, path);
  }
  if (DASHBOARD[path]) return sendFile(req, res, join(dashboard, DASHBOARD[path]), path);
  res.writeHead(404, { 'content-type': 'text/plain' }).end('Not found');
});

// Ctrl+C or a kill also stops a build in progress.
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    buildProcess?.kill();
    process.exit(0);
  });
}

server.on('error', (error) => fail(error.code === 'EADDRINUSE' ? `Port ${opts.port} is busy: use --port <other>.` : error.message));

server.listen(Number(opts.port), async () => {
  const url = `http://localhost:${opts.port}`;
  console.log(`Flowboard   ${url}\nStories     ${configDir}`);
  if (opts.open) exec(`${process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start ""' : 'xdg-open'} ${url}`);
  // Show the previous build right away, then refresh it.
  await loadIndex().catch(() => {});
  build();
});
