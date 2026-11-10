import { existsSync, readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { spawn } from 'node:child_process';

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    // cmd.exe consumes an unquoted caret in the semver range.
    const windows = process.platform === 'win32';
    const child = spawn(command, windows ? args.map((arg) => `"${arg}"`) : args, { cwd, stdio: 'inherit', shell: windows });
    child.on('error', reject);
    child.on('close', (code) => code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}.`)));
  });
}

export function packageManager(root, pkg) {
  for (let dir = root; ; dir = dirname(dir)) {
    const found = managerAt(dir, pkg);
    if (found) return found;
    if (dirname(dir) === dir || existsSync(join(dir, '.git'))) return 'npm';
    const parentPackage = join(dirname(dir), 'package.json');
    pkg = existsSync(parentPackage) ? JSON.parse(readFileSync(parentPackage, 'utf8').replace(/^\uFEFF/, '')) : {};
  }
}

function managerAt(root, pkg) {
  if (pkg.packageManager) {
    const name = pkg.packageManager.split('@')[0];
    if (!['npm', 'pnpm', 'yarn', 'bun'].includes(name)) throw new Error(`Unsupported package manager: ${name}`);
    return name;
  }
  const managers = [
    ['npm', ['package-lock.json', 'npm-shrinkwrap.json']],
    ['pnpm', ['pnpm-lock.yaml']],
    ['yarn', ['yarn.lock']],
    ['bun', ['bun.lock', 'bun.lockb']],
  ].filter(([, files]) => files.some((file) => existsSync(join(root, file)))).map(([name]) => name);
  if (managers.length > 1) throw new Error('Multiple package manager lockfiles found. Set packageManager in package.json first.');
  return managers[0];
}

export async function initProject(root, { version, configDir = '.storybook', port = '6007', noWatch = false, install = run }) {
  const path = join(root, 'package.json');
  const pkg = JSON.parse((await readFile(path, 'utf8')).replace(/^\uFEFF/, ''));
  const manager = packageManager(root, pkg);
  configDir = relative(root, resolve(root, configDir)) || '.';
  // JSON quoting also protects spaces in custom Storybook config paths.
  if (/[\r\n"`$%&|<>^!]/.test(configDir)) throw new Error('Unsupported characters in config-dir. Configure the flowboard script manually.');
  if (!/^\d+$/.test(String(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error('Invalid port.');
  const script = `flowboard --open${configDir === '.storybook' ? '' : ` --config-dir ${JSON.stringify(configDir)}`}${String(port) === '6007' ? '' : ` --port ${Number(port)}`}${noWatch ? ' --no-watch' : ''}`;
  if (pkg.scripts?.flowboard && pkg.scripts.flowboard !== script) {
    throw new Error('A different scripts.flowboard already exists. Rename it before running init.');
  }
  if (!pkg.devDependencies?.['@igol/flowboard'] && !pkg.dependencies?.['@igol/flowboard']) {
    const args = manager === 'npm' ? ['install', '--save-dev'] : ['add', '--dev'];
    if (manager === 'pnpm' && existsSync(join(root, 'pnpm-workspace.yaml'))) args.push('--workspace-root');
    await install(manager, [...args, `@igol/flowboard@^${version}`], root);
  }
  // Re-read after installation to preserve dependency changes made by the package manager.
  const updated = await readFile(path, 'utf8');
  const current = JSON.parse(updated.replace(/^\uFEFF/, ''));
  current.scripts ??= {};
  if (current.scripts.flowboard && current.scripts.flowboard !== script) throw new Error('scripts.flowboard changed during installation; leaving it untouched.');
  if (current.scripts.flowboard !== script) {
    current.scripts.flowboard = script;
    const indent = updated.match(/\n([\t ]+)"/)?.[1] ?? '  ';
    const newline = updated.includes('\r\n') ? '\r\n' : '\n';
    const bom = updated.startsWith('\uFEFF') ? '\uFEFF' : '';
    await writeFile(path, bom + `${JSON.stringify(current, null, indent)}\n`.replace(/\n/g, newline));
  }
  console.log(`Flowboard is ready. Run: ${manager} run flowboard`);
}
