import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-generated-deck-'));
const deckDir = path.join(tmp, 'my-talk');
const cli = path.join(root, 'packages/server/dist/cli.js');

await run(['create', deckDir]);
await run(['build', deckDir]);
await run(['transcript', deckDir]);

await expectFile(path.join(deckDir, 'package.json'));
await expectFile(path.join(deckDir, 'dist/index.html'));
await expectFile(path.join(deckDir, 'dist/_presso/presso.css'));
await expectFile(path.join(deckDir, 'dist/_presso/presso-runtime.js'));
await expectFile(path.join(deckDir, 'transcript.md'));

console.log(`Generated deck smoke OK at ${deckDir}`);

async function run(args) {
  await execFileAsync(process.execPath, [cli, ...args], {
    cwd: root,
    maxBuffer: 1024 * 1024
  });
}

async function expectFile(file) {
  const stat = await fs.stat(file).catch(() => undefined);
  if (!stat?.isFile()) throw new Error(`Expected generated file missing: ${file}`);
}
