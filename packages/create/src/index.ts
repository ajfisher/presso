import fs from 'node:fs/promises';
import path from 'node:path';

export async function createDeck(targetDir: string): Promise<void> {
  const root = path.resolve(targetDir);
  await fs.mkdir(path.join(root, 'slides'), { recursive: true });
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  await fs.writeFile(path.join(root, 'package.json'), JSON.stringify({
    name: path.basename(root),
    type: 'module',
    scripts: {
      dev: 'presso dev',
      build: 'presso build',
      pdf: 'presso pdf',
      transcript: 'presso transcript',
      deploy: 'presso deploy'
    },
    devDependencies: {
      '@presso/server': '^0.1.0'
    }
  }, null, 2) + '\\n');
  await fs.writeFile(path.join(root, 'presso.config.ts'), `export default {\n  title: 'New Presso Deck',\n  author: 'ajfisher',\n  source: { type: 'folder', path: './slides' },\n  theme: './theme.css',\n  notes: { public: 'toggle', defaultPrintLayout: 'page' }\n};\n`);
  await fs.writeFile(path.join(root, 'theme.css'), `:root { --presso-accent: #ff5e9a; }\n`);
  await fs.writeFile(path.join(root, 'slides/001-title.md'), `---\nid: title\nlayout: title\ntime: \"0:00\"\n---\n\n# New Presso Deck\n\n:::notes\nOpening notes go here.\n:::\n`);
  await fs.writeFile(path.join(root, 'slides/002-content.md'), `---\nid: content\nlayout: bullets\n---\n\n## Main idea\n\n- One\n- Two\n- Three\n\n:::notes\nTalk through the main idea.\n:::\n`);
  await fs.writeFile(path.join(root, 'slides/003-notes.md'), `---\nid: notes\nlayout: statement\n---\n\n## Notes are Markdown\n\n:::notes\nSpeaker notes support **Markdown**.\n:::\n`);
}

