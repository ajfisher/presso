import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageRoot = path.join(root, 'packages');
const packageDirs = (await fs.readdir(packageRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(packageRoot, entry.name))
  .sort();

const errors = [];
const packages = await Promise.all(packageDirs.map(readPackage));
const packageNames = new Set(packages.map((pkg) => pkg.json.name));
const versions = new Set(packages.map((pkg) => pkg.json.version));

if (versions.size !== 1) {
  errors.push(`All publishable packages must share one version. Found: ${[...versions].join(', ')}`);
}

const releaseConfig = await readJson(path.join(root, 'release-please-config.json'));
const releaseManifest = await readJson(path.join(root, '.release-please-manifest.json'));
const releasePaths = Object.keys(releaseConfig.packages ?? {}).sort();
const manifestPaths = Object.keys(releaseManifest).sort();
const expectedPaths = packages.map((pkg) => path.relative(root, pkg.dir)).sort();

if (JSON.stringify(releasePaths) !== JSON.stringify(expectedPaths)) {
  errors.push(`release-please-config.json packages must match publishable packages. Expected ${expectedPaths.join(', ')}, found ${releasePaths.join(', ')}`);
}
if (JSON.stringify(manifestPaths) !== JSON.stringify(expectedPaths)) {
  errors.push(`.release-please-manifest.json packages must match publishable packages. Expected ${expectedPaths.join(', ')}, found ${manifestPaths.join(', ')}`);
}

for (const pkg of packages) {
  validatePackage(pkg, packages[0]?.json.version);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join('\n'));
  process.exit(1);
}

console.log(`Release readiness OK for ${packages.length} packages at ${packages[0]?.json.version}.`);

async function readPackage(dir) {
  return {
    dir,
    json: await readJson(path.join(dir, 'package.json'))
  };
}

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, 'utf8'));
}

function validatePackage(pkg, expectedVersion) {
  const { dir, json } = pkg;
  const rel = path.relative(root, dir);
  const id = `${json.name ?? rel}`;

  if (!json.name?.startsWith('@ajfisher/presso-')) errors.push(`${id}: package name must be scoped under @ajfisher/presso-.`);
  if (json.private) errors.push(`${id}: publishable packages must not be private.`);
  if (json.version !== expectedVersion) errors.push(`${id}: version must match ${expectedVersion}.`);
  if (json.type !== 'module') errors.push(`${id}: type must be module.`);
  if (json.license !== 'MIT') errors.push(`${id}: license must be MIT.`);
  if (!json.description) errors.push(`${id}: description is required for npm.`);
  if (json.publishConfig?.access !== 'public') errors.push(`${id}: publishConfig.access must be public.`);
  if (!Array.isArray(json.files) || !json.files.includes('dist')) errors.push(`${id}: files must include dist.`);
  if (!json.scripts?.build) errors.push(`${id}: build script is required.`);

  validateExports(id, dir, json.exports);
  validateBin(id, dir, json.bin);
  validateDependencies(id, json.dependencies ?? {}, json.version);
  validateDependencies(id, json.optionalDependencies ?? {}, json.version);
  validateDependencies(id, json.peerDependencies ?? {}, json.version);
}

function validateExports(id, dir, exportsField) {
  const entry = exportsField?.['.'];
  if (!entry?.default || !entry?.types) {
    errors.push(`${id}: exports["."] must define default and types.`);
    return;
  }
  for (const file of [entry.default, entry.types]) {
    const target = path.join(dir, file);
    if (!file.startsWith('./dist/')) errors.push(`${id}: export ${file} must point at dist.`);
    if (!fileExists(target)) errors.push(`${id}: built export is missing: ${file}. Run npm run build first.`);
  }
}

function validateBin(id, dir, bin) {
  if (!bin) return;
  for (const [name, file] of Object.entries(bin)) {
    const target = path.join(dir, file);
    if (!pointsAtDist(file)) errors.push(`${id}: bin ${name} must point at dist.`);
    if (!fileExists(target)) errors.push(`${id}: built bin is missing: ${file}. Run npm run build first.`);
  }
}

function validateDependencies(id, dependencies, version) {
  for (const [name, spec] of Object.entries(dependencies)) {
    if (typeof spec !== 'string') continue;
    if (spec.startsWith('file:') || spec.startsWith('workspace:')) {
      errors.push(`${id}: dependency ${name} must use a publishable semver range, not ${spec}.`);
    }
    if (packageNames.has(name) && spec !== `^${version}`) {
      errors.push(`${id}: internal dependency ${name} must be ^${version}, found ${spec}.`);
    }
  }
}

function fileExists(file) {
  return existsSync(file);
}

function pointsAtDist(file) {
  return file.startsWith('./dist/') || file.startsWith('dist/');
}
