import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, 'packages/runtime');

await fs.mkdir(path.join(runtimeRoot, 'dist'), { recursive: true });
await fs.rm(path.join(runtimeRoot, 'dist/assets'), { recursive: true, force: true });
await fs.rm(path.join(runtimeRoot, 'dist/templates'), { recursive: true, force: true });
await copyTree(path.join(runtimeRoot, 'src/assets'), path.join(runtimeRoot, 'dist/assets'));
await copyTree(path.join(runtimeRoot, 'src/templates'), path.join(runtimeRoot, 'dist/templates'));

async function copyTree(sourceRoot, destRoot) {
  const entries = await fs.readdir(sourceRoot, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const source = path.join(entry.parentPath, entry.name);
    const relative = path.relative(sourceRoot, source);
    const dest = path.join(destRoot, relative);
    const tmp = `${dest}.${process.pid}.${Math.random().toString(16).slice(2)}.tmp`;
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(source, tmp);
    await fs.rename(tmp, dest);
  }
}
