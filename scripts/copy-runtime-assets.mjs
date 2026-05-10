import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const runtimeRoot = path.join(root, 'packages/runtime');

await fs.mkdir(path.join(runtimeRoot, 'dist'), { recursive: true });
await fs.cp(path.join(runtimeRoot, 'src/assets'), path.join(runtimeRoot, 'dist/assets'), { recursive: true });
await fs.cp(path.join(runtimeRoot, 'src/templates'), path.join(runtimeRoot, 'dist/templates'), { recursive: true });
