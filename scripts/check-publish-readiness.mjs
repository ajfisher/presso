import fs from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const packageRoot = path.join(root, 'packages');
const requiredKeywords = ['presso', 'presentations', 'markdown', 'slides', 'speaker-notes'];
const requiredPackageFiles = ['dist', 'README.md', 'LICENSE'];
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
const publishWorkflow = await fs.readFile(path.join(root, '.github/workflows/publish-npm.yml'), 'utf8');
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
validatePublishWorkflow(publishWorkflow);

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
  if (json.homepage !== 'https://github.com/ajfisher/presso#readme') errors.push(`${id}: homepage must point to the repo README.`);
  if (json.bugs?.url !== 'https://github.com/ajfisher/presso/issues') errors.push(`${id}: bugs.url must point to the repo issues.`);
  validateKeywords(id, json.keywords);
  validateRepository(id, rel, json.repository);
  if (json.publishConfig?.access !== 'public') errors.push(`${id}: publishConfig.access must be public.`);
  validatePackageFiles(id, json.files);
  validatePackageDocs(id, dir);
  if (!json.scripts?.build) errors.push(`${id}: build script is required.`);

  validateExports(id, dir, json.exports);
  validateBin(id, dir, json.bin);
  validateDependencies(id, json.dependencies ?? {}, json.version);
  validateDependencies(id, json.optionalDependencies ?? {}, json.version);
  validateDependencies(id, json.peerDependencies ?? {}, json.version);
}

function validateKeywords(id, keywords) {
  if (!Array.isArray(keywords)) {
    errors.push(`${id}: keywords must be defined for npm discovery.`);
    return;
  }
  for (const keyword of requiredKeywords) {
    if (!keywords.includes(keyword)) errors.push(`${id}: keywords must include ${keyword}.`);
  }
}

function validatePackageFiles(id, files) {
  if (!Array.isArray(files)) {
    errors.push(`${id}: files must include ${requiredPackageFiles.join(', ')}.`);
    return;
  }
  for (const file of requiredPackageFiles) {
    if (!files.includes(file)) errors.push(`${id}: files must include ${file}.`);
  }
}

function validatePackageDocs(id, dir) {
  const readme = path.join(dir, 'README.md');
  if (!fileExists(readme)) {
    errors.push(`${id}: README.md is required for npm.`);
  } else {
    const contents = readFileSync(readme, 'utf8').trim();
    if (contents.length < 200) errors.push(`${id}: README.md must contain package-specific npm content.`);
    if (!contents.includes(id)) errors.push(`${id}: README.md must mention the package name.`);
  }

  if (!fileExists(path.join(dir, 'LICENSE'))) {
    errors.push(`${id}: LICENSE is required in the package tarball.`);
  }
}

function validateRepository(id, rel, repository) {
  if (repository?.type !== 'git') errors.push(`${id}: repository.type must be git.`);
  if (repository?.url !== 'https://github.com/ajfisher/presso.git') {
    errors.push(`${id}: repository.url must match https://github.com/ajfisher/presso.git for npm trusted publishing.`);
  }
  if (repository?.directory !== rel) errors.push(`${id}: repository.directory must be ${rel}.`);
}

function validatePublishWorkflow(contents) {
  if (!/id-token:\s*write/.test(contents)) {
    errors.push('publish-npm.yml: permissions.id-token must be write for npm trusted publishing.');
  }
  if (/NODE_AUTH_TOKEN|NPM_TOKEN/.test(contents)) {
    errors.push('publish-npm.yml: npm publishing must use trusted publishing, not NODE_AUTH_TOKEN or NPM_TOKEN.');
  }
  if (/cache:\s*npm/.test(contents)) {
    errors.push('publish-npm.yml: release publishing must not enable npm cache.');
  }
  if (!/package-manager-cache:\s*false/.test(contents)) {
    errors.push('publish-npm.yml: setup-node must set package-manager-cache: false for release publishing.');
  }
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
