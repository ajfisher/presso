import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-create-consumer-'));
const env = { ...process.env, npm_config_cache: path.join(tmp, '.npm-cache') };
const readJson = async (file) => JSON.parse(await fs.readFile(file, 'utf8'));
const { version } = await readJson(path.join(root, 'packages/create-presso/package.json'));

try {
  const tarballs = [];
  for (const name of ['create', 'create-presso']) {
    const { stdout } = await run('npm', [
      'pack', path.join(root, 'packages', name), '--json', '--pack-destination', tmp
    ]);
    const [packed] = JSON.parse(stdout);
    tarballs.push(path.join(tmp, packed.filename));
    console.log(`Packed ${packed.name}@${packed.version} for consumer smoke`);
  }

  await fs.writeFile(path.join(tmp, 'package.json'), JSON.stringify({ private: true }));
  await run('npm', ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund', ...tarballs]);
  for (const name of ['create-presso', '@ajfisher/presso-create']) {
    const installed = await fs.realpath(path.join(tmp, 'node_modules', name));
    assert.ok(installed.startsWith(await fs.realpath(tmp) + path.sep), `${name} must come from its tarball`);
  }
  console.log('Installed both packed scaffolders outside the workspace');

  // A pinned local version exercises npm's create mapping before latest exists on npm.
  const createArgs = ['create', '--offline', '--yes', `presso@${version}`];
  await assert.rejects(run('npm', createArgs), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Usage: npm create presso@latest <directory>/);
    return true;
  });

  const target = 'My Talk';
  await run('npm', [...createArgs, target]);
  const deck = path.join(tmp, target);
  const manifest = await readJson(path.join(deck, 'package.json'));
  assert.equal(manifest.name, 'my-talk');
  assert.equal(manifest.devDependencies['@ajfisher/presso-server'], `^${version}`);
  assert.equal(manifest.scripts.dev, 'presso dev');
  assert.deepEqual(await fs.readdir(path.join(deck, 'slides')), [
    '001-title.md', '002-content.md', '003-notes.md'
  ]);
  for (const file of ['presso.config.ts', 'theme.css', 'README.md']) {
    await fs.access(path.join(deck, file));
  }
  console.log('npm create generated a deck with a published semver dependency');

  const title = path.join(deck, 'slides/001-title.md');
  await fs.writeFile(title, '# Keep my existing slide\n');
  await assert.rejects(run('npm', [...createArgs, target]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /Target directory is not empty/);
    return true;
  });
  assert.equal(await fs.readFile(title, 'utf8'), '# Keep my existing slide\n');

  await run('npm', ['exec', '--offline', '--yes', '--', `@ajfisher/presso-create@${version}`, 'legacy-talk']);
  const legacy = await readJson(path.join(tmp, 'legacy-talk/package.json'));
  assert.equal(legacy.devDependencies['@ajfisher/presso-server'], `^${version}`);
  console.log('Both entry points work; existing slide content is protected');

  const cli = path.join(root, 'packages/server/dist/cli.js');
  await run(process.execPath, [cli, 'build', deck]);
  await run(process.execPath, [cli, 'transcript', deck]);
  for (const file of ['dist/index.html', 'dist/_presso/presso.css', 'dist/_presso/presso-runtime.js', 'transcript.md']) {
    await fs.access(path.join(deck, file));
  }
  console.log(`Packed create-presso consumer smoke OK at ${version}`);
} finally {
  await fs.rm(tmp, { recursive: true, force: true });
}

function run(command, args) {
  return execFileAsync(command, args, { cwd: tmp, env, maxBuffer: 1024 * 1024 });
}
