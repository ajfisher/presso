import fs from 'node:fs/promises';
import path from 'node:path';

export interface CreateDeckOptions {
  cwd?: string;
  serverDependency?: string;
}

export async function createDeck(targetDir: string, options: CreateDeckOptions = {}): Promise<void> {
  const root = path.resolve(targetDir);
  const existing = await fs.readdir(root).catch(() => undefined);
  if (existing && existing.length > 0) {
    throw new Error(`Target directory is not empty: ${root}`);
  }
  await fs.mkdir(path.join(root, 'slides'), { recursive: true });
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  const serverDependency = options.serverDependency ?? await resolveServerDependency(root, options.cwd ?? process.cwd());
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: packageName(path.basename(root)),
    type: 'module',
    scripts: {
      dev: 'presso dev',
      build: 'presso build',
      pdf: 'presso pdf',
      transcript: 'presso transcript',
      deploy: 'presso deploy'
    },
    devDependencies: {
      '@presso/server': serverDependency
    }
  }, null, 2) + '\n');
  await fs.writeFile(path.join(root, 'presso.config.ts'), `export default {\n  title: 'New Presso Deck',\n  author: 'ajfisher',\n  source: { type: 'folder', path: './slides' },\n  theme: './theme.css',\n  notes: { public: 'toggle', defaultPrintLayout: 'page' }\n};\n`);
  await fs.writeFile(path.join(root, 'theme.css'), `:root { --presso-accent: #ff5e9a; }\n`);
  await fs.writeFile(path.join(root, 'slides/001-title.md'), `---\nid: title\nlayout: title\ntime: \"0:00\"\n---\n\n# New Presso Deck\n\n:::notes\nOpening notes go here.\n:::\n`);
  await fs.writeFile(path.join(root, 'slides/002-content.md'), `---\nid: content\nlayout: bullets\n---\n\n## Main idea\n\n- One\n- Two\n- Three\n\n:::notes\nTalk through the main idea.\n:::\n`);
  await fs.writeFile(path.join(root, 'slides/003-notes.md'), `---\nid: notes\nlayout: statement\n---\n\n## Notes are Markdown\n\n:::notes\nSpeaker notes support **Markdown**.\n:::\n`);
  await fs.writeFile(path.join(root, 'README.md'), `# New Presso Deck\n\n\`\`\`bash\nnpm install\nnpm run dev\n\`\`\`\n\nSlides live in \`slides/\` and use numeric filenames for ordering. No \`slides.order\` file is required unless you want manual ordering later.\n`);
}

async function resolveServerDependency(targetDir: string, cwd: string): Promise<string> {
  const workspaceRoot = await findWorkspaceRoot(cwd);
  if (!workspaceRoot) {
    return `^${await packageVersion()}`;
  }
  const serverPackage = path.join(workspaceRoot, 'packages/server');
  const stat = await fs.stat(serverPackage).catch(() => undefined);
  if (!stat?.isDirectory()) {
    return `^${await packageVersion()}`;
  }
  return `file:${toPackageRelativePath(path.relative(targetDir, serverPackage))}`;
}

async function packageVersion(): Promise<string> {
  const packageJson = JSON.parse(await fs.readFile(new URL('../package.json', import.meta.url), 'utf8')) as { version?: string };
  if (!packageJson.version) throw new Error('@presso/create package.json must define a version.');
  return packageJson.version;
}

async function findWorkspaceRoot(startDir: string): Promise<string | undefined> {
  let current = path.resolve(startDir);
  while (true) {
    const packageJsonPath = path.join(current, 'package.json');
    const packageJson = await fs.readFile(packageJsonPath, 'utf8').catch(() => undefined);
    if (packageJson) {
      const parsed = JSON.parse(packageJson) as { workspaces?: unknown };
      if (Array.isArray(parsed.workspaces) && parsed.workspaces.includes('packages/*')) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return undefined;
    }
    current = parent;
  }
}

function packageName(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'presso-deck';
}

function toPackageRelativePath(value: string): string {
  const relative = value.split(path.sep).join('/');
  return relative.startsWith('.') ? relative : `./${relative}`;
}
