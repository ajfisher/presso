import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const write = process.argv.includes('--write');
const dryRun = process.argv.includes('--dry-run') || !write;
const root = process.cwd();
const packageRoot = path.join(root, 'packages');
const requiredPackageFiles = ['README.md', 'LICENSE', 'package.json'];
const destination = write
  ? path.join(root, '.presso', 'packages')
  : await fs.mkdtemp(path.join(os.tmpdir(), 'presso-pack-'));
const npmCache = path.join(destination, '.npm-cache');

await fs.mkdir(destination, { recursive: true });
await fs.mkdir(npmCache, { recursive: true });

const packageDirs = (await fs.readdir(packageRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packageRoot, entry.name))
  .sort();

for (const dir of packageDirs) {
  const args = ['pack', dir, '--json', '--pack-destination', destination];
  if (dryRun) args.push('--dry-run');
  const { stdout } = await execFileAsync('npm', args, {
    env: {
      ...process.env,
      npm_config_cache: npmCache
    },
    maxBuffer: 1024 * 1024
  });
  const [packed] = JSON.parse(stdout);
  validatePackedFiles(packed);
  console.log(`${dryRun ? 'Checked' : 'Packed'} ${packed.name}@${packed.version} (${packed.files.length} files)`);
}

if (write) {
  console.log(`Package tarballs written to ${destination}`);
}

function validatePackedFiles(packed) {
  const paths = new Set(packed.files.map((file) => file.path));
  for (const file of requiredPackageFiles) {
    if (!paths.has(file)) {
      throw new Error(`${packed.name}: packed package is missing ${file}.`);
    }
  }
}
