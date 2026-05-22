import fs from 'node:fs/promises';
import path from 'node:path';
import { slugify, toPosixPath } from '@ajfisher/presso-core';

interface RevealSlide {
  bodyMarkdown: string;
  classNames: string[];
  dataBackground?: string;
  dataTiming?: string;
  elementComments: string[];
  manualItems: string[];
  notesMarkdown: string;
  title: string;
}

interface MigrationReport {
  assetsCopied: string[];
  backgrounds: string[];
  elementComments: string[];
  manualItems: string[];
  notesConverted: number;
  slidesGenerated: number;
  sourceDeck: string;
  sourceSlides: string;
  staticCopied: string[];
  timing: string[];
}

interface MigrationPaths {
  assetRoot: string;
  sourceDeck: string;
  slidesPath: string;
}

export async function migrateRevealDeck(source: string, target: string): Promise<string> {
  const paths = await resolveMigrationPaths(source);
  await assertWritableTarget(target);
  await fs.mkdir(target, { recursive: true });

  const rawSlides = splitRevealSlides(await fs.readFile(paths.slidesPath, 'utf8'));
  const slides = rawSlides.map(parseRevealSlide);
  const usedIds = new Map<string, number>();
  let cumulativeTime = 0;
  const report: MigrationReport = {
    assetsCopied: [],
    backgrounds: [],
    elementComments: [],
    manualItems: [],
    notesConverted: slides.filter((slide) => slide.notesMarkdown.trim()).length,
    slidesGenerated: slides.length,
    sourceDeck: paths.sourceDeck,
    sourceSlides: paths.slidesPath,
    staticCopied: [],
    timing: []
  };

  await copyKnownDirectory(path.join(paths.assetRoot, 'images'), path.join(target, 'assets', 'images'), report.assetsCopied);
  await copyKnownDirectory(path.join(paths.assetRoot, 'static'), path.join(target, 'public', 'static'), report.staticCopied);
  await fs.mkdir(path.join(target, 'slides'), { recursive: true });

  for (const [index, slide] of slides.entries()) {
    const id = uniqueId(slugify(slide.title || `slide-${index + 1}`), usedIds);
    const layout = inferLayout(slide);
    const background = migrateBackground(slide.dataBackground);
    if (background) report.backgrounds.push(`Slide ${index + 1}: ${slide.dataBackground} -> ${background.summary}`);
    if (slide.dataTiming) {
      cumulativeTime += Number(slide.dataTiming);
      report.timing.push(`Slide ${index + 1}: data-timing="${slide.dataTiming}" -> time "${secondsToClock(cumulativeTime)}"`);
    }
    for (const comment of slide.elementComments) {
      report.elementComments.push(`Slide ${index + 1}: ${comment}`);
    }
    for (const item of slide.manualItems) {
      report.manualItems.push(`Slide ${index + 1}: ${item}`);
    }

    const number = String(index + 1).padStart(3, '0');
    const filePath = path.join(target, 'slides', `${number}-${id}.md`);
    const metadata = [
      ['id', id],
      ['layout', layout],
      slide.classNames.length ? ['class', slide.classNames] : undefined,
      background ? ['background', background.value] : undefined,
      slide.dataTiming ? ['time', secondsToClock(cumulativeTime)] : undefined
    ].filter(Boolean) as Array<[string, string | string[] | Record<string, string>]>;
    await fs.writeFile(filePath, composeSlide(metadata, slide.bodyMarkdown, slide.notesMarkdown), 'utf8');
  }

  await fs.writeFile(path.join(target, 'presso.config.ts'), pressoConfig(slides[0]?.title ?? 'Migrated Reveal deck'), 'utf8');
  await fs.writeFile(path.join(target, 'theme.css'), starterTheme(), 'utf8');
  await fs.writeFile(path.join(target, 'Makefile'), starterMakefile(), 'utf8');
  await fs.writeFile(path.join(target, 'package.json'), packageJson(path.basename(target)), 'utf8');
  await fs.writeFile(path.join(target, 'MIGRATION.md'), migrationReport(report), 'utf8');
  return target;
}

export function splitRevealSlides(content: string): string[] {
  return content
    .split(/^\s*---\s*$/m)
    .map((slide) => slide.trim())
    .filter(Boolean);
}

export function parseRevealSlide(content: string): RevealSlide {
  let body = content;
  const slideComment = body.match(/<!--\s*\.slide:\s*([\s\S]*?)-->/);
  const slideAttrs = slideComment ? parseRevealAttrs(slideComment[1] ?? '') : {};
  if (slideComment) body = body.replace(slideComment[0], '').trim();
  const elementComments = [...body.matchAll(/<!--\s*\.element:?\s*([\s\S]*?)-->/g)].map((match) => match[0]);
  body = body.replace(/<!--\s*\.element:?\s*[\s\S]*?-->/g, '').trim();

  const notes = body.match(/^Notes:\s*$/m);
  const notesMarkdown = notes ? body.slice((notes.index ?? 0) + notes[0].length).trim() : '';
  body = notes ? body.slice(0, notes.index).trim() : body;
  const migratedBody = migrateCommonBodyPatterns(body, slideAttrs.class ?? '');
  body = rewriteRevealAssetReferences(migratedBody.markdown);
  const migratedNotes = rewriteRevealAssetReferences(notesMarkdown);
  return {
    bodyMarkdown: body,
    classNames: (slideAttrs.class ?? '').split(/\s+/).filter(Boolean),
    dataBackground: slideAttrs['data-background'],
    dataTiming: slideAttrs['data-timing'],
    elementComments,
    manualItems: migratedBody.manualItems,
    notesMarkdown: migratedNotes,
    title: firstHeading(body)
  };
}

function rewriteRevealAssetReferences(markdown: string): string {
  return markdown
    .replace(/\]\((["']?)\/images\//g, ']($1./assets/images/')
    .replace(/\bsrc=(["'])\/images\//g, 'src=$1./assets/images/');
}

function parseRevealAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s]+)))?/g;
  for (const match of raw.matchAll(attrRe)) {
    const key = match[1];
    if (!key) continue;
    attrs[key] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attrs;
}

function migrateCommonBodyPatterns(body: string, className: string): { manualItems: string[]; markdown: string } {
  const manualItems: string[] = [];
  let output = body.replace(/<div\s+class=["']twocolumn["']>\s*([\s\S]*?)\s*<\/div>/gi, (full, content: string) => {
    const columns = migrateTwoColumnContent(content);
    if (columns) return columns;
    manualItems.push('Ambiguous twocolumn wrapper left as raw HTML for manual column cleanup.');
    return full;
  });
  if (className.split(/\s+/).includes('brands') && !output.includes(':::logos')) {
    const lines = output.split(/\r?\n/);
    const imageLines = lines.filter((line) => line.trim().startsWith('!['));
    if (imageLines.length > 1) {
      const otherLines = lines.filter((line) => !line.trim().startsWith('![')).join('\n').trim();
      output = `${otherLines}\n\n:::logos\n${imageLines.join('\n')}\n:::`.trim();
    }
  }
  return { manualItems, markdown: output };
}

function migrateTwoColumnContent(content: string): string | undefined {
  const blocks = splitMarkdownBlocks(content);
  if (blocks.length >= 2 && isMarkdownImageBlock(blocks[0] ?? '')) {
    return nestedColumns(blocks[0]!, blocks.slice(1).join('\n\n'));
  }
  const childDivs = [...content.matchAll(/<div(?:\s[^>]*)?>\s*([\s\S]*?)\s*<\/div>/gi)].map((match) => match[1]?.trim() ?? '').filter(Boolean);
  if (childDivs.length === 2) {
    return nestedColumns(childDivs[0]!, childDivs[1]!);
  }
  return undefined;
}

function splitMarkdownBlocks(content: string): string[] {
  return content.trim().split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
}

function isMarkdownImageBlock(block: string): boolean {
  return /^!\[[^\]]*]\([^)]+\)$/m.test(block.trim());
}

function nestedColumns(left: string, right: string): string {
  return `:::columns
:::column
${left.trim()}
:::

:::column
${right.trim()}
:::
:::`;
}

function migrateBackground(value: string | undefined): { summary: string; value: Record<string, string> } | undefined {
  if (!value) return undefined;
  if (value.startsWith('#') || /^(?:rgb|hsl)a?\(/i.test(value) || value === 'white' || value === 'black') {
    return { summary: `background.color`, value: { color: value } };
  }
  return {
    summary: 'background.image',
    value: { image: revealAssetPath(value) }
  };
}

function revealAssetPath(value: string): string {
  return value.replace(/^\/?images\//, './assets/images/').replace(/^\.\//, './');
}

function inferLayout(slide: RevealSlide): string {
  if (slide.classNames.includes('title')) return 'title';
  if (slide.classNames.includes('brands')) return 'logos';
  if (slide.bodyMarkdown.includes(':::columns')) return 'two-column';
  if (slide.dataBackground && !migrateBackground(slide.dataBackground)?.value.color) return 'image-title';
  return 'statement';
}

function firstHeading(markdown: string): string {
  return markdown.match(/^#{1,6}\s+(.+?)\s*#*\s*$/m)?.[1]?.trim() ?? 'Untitled';
}

function uniqueId(base: string, used: Map<string, number>): string {
  const clean = base || 'slide';
  const count = used.get(clean) ?? 0;
  used.set(clean, count + 1);
  return count === 0 ? clean : `${clean}-${count + 1}`;
}

function composeSlide(metadata: Array<[string, string | string[] | Record<string, string>]>, body: string, notes: string): string {
  const yaml = metadata.flatMap(([key, value]) => yamlLines(key, value)).join('\n');
  const notesBlock = notes.trim() ? `\n\n:::notes\n${notes.trim()}\n:::` : '';
  return `---\n${yaml}\n---\n\n${body.trim()}${notesBlock}\n`;
}

function yamlLines(key: string, value: string | string[] | Record<string, string>): string[] {
  if (typeof value === 'string') return [`${key}: ${quoteYaml(value)}`];
  if (Array.isArray(value)) return [`${key}:`, ...value.map((item) => `  - ${quoteYaml(item)}`)];
  return [`${key}:`, ...Object.entries(value).map(([childKey, childValue]) => `  ${childKey}: ${quoteYaml(childValue)}`)];
}

function quoteYaml(value: string): string {
  return JSON.stringify(value);
}

async function resolveMigrationPaths(source: string): Promise<MigrationPaths> {
  const sourcePath = path.resolve(source);
  const stat = await fs.stat(sourcePath);
  if (stat.isFile()) {
    return {
      assetRoot: path.dirname(sourcePath),
      sourceDeck: path.dirname(path.dirname(sourcePath)),
      slidesPath: sourcePath
    };
  }
  const slidesPath = path.join(sourcePath, 'src', 'slides.md');
  await fs.access(slidesPath);
  return {
    assetRoot: path.dirname(slidesPath),
    sourceDeck: sourcePath,
    slidesPath
  };
}

async function assertWritableTarget(target: string): Promise<void> {
  const existing = await fs.readdir(target).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (existing && existing.length > 0) {
    throw new Error(`Migration target must be empty or not exist: ${target}`);
  }
}

async function copyKnownDirectory(source: string, target: string, copied: string[]): Promise<void> {
  const stat = await fs.stat(source).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  });
  if (!stat?.isDirectory()) return;
  await fs.cp(source, target, { recursive: true });
  copied.push(toPosixPath(path.relative(path.dirname(target), target)));
}

function secondsToClock(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = String(seconds % 60).padStart(2, '0');
  return `${mins}:${secs}`;
}

function pressoConfig(title: string): string {
  return `export default {
  title: ${JSON.stringify(title)},
  author: 'AJ Fisher',
  tags: ['presentation', 'presso', 'migrated'],
  source: {
    type: 'folder',
    path: './slides'
  },
  theme: './theme.css',
  notes: {
    public: 'toggle'
  }
};
`;
}

function starterTheme(): string {
  return `@layer presso.theme {
  :root {
    --presso-bg: #262626;
    --presso-fg: #ffffff;
    --presso-accent: #fc307b;
  }

  .presso-slide {
    color: var(--presso-fg);
    background-color: var(--presso-bg-color, var(--presso-bg));
  }

  .presso-slide[data-background~="color"] {
    color: #222222;
  }
}
`;
}

function starterMakefile(): string {
  return `.PHONY: dev build transcript pdf

PORT ?= 3030
PRESSO ?= ./node_modules/.bin/presso

dev:
\t$(PRESSO) dev . --port=$(PORT)

build:
\t$(PRESSO) build .

transcript:
\t$(PRESSO) transcript .

pdf:
\t$(PRESSO) pdf .
`;
}

function packageJson(name: string): string {
  return `${JSON.stringify({
    name: slugify(name || 'migrated-presso-deck'),
    private: true,
    type: 'module',
    scripts: {
      dev: 'presso dev',
      build: 'presso build',
      transcript: 'presso transcript',
      pdf: 'presso pdf'
    },
    dependencies: {
      '@ajfisher/presso-server': '^0.2.0'
    }
  }, null, 2)}\n`;
}

function migrationReport(report: MigrationReport): string {
  return `# Reveal Migration Report

Source deck: \`${report.sourceDeck}\`
Source slides: \`${report.sourceSlides}\`

## Converted

- Generated ${report.slidesGenerated} numbered folder-mode slides.
- Converted ${report.notesConverted} \`Notes:\` blocks to \`:::notes\`.
- Copied assets: ${report.assetsCopied.length ? report.assetsCopied.join(', ') : 'none found'}.
- Copied static files: ${report.staticCopied.length ? report.staticCopied.join(', ') : 'none found'}.

## Backgrounds

${report.backgrounds.length ? report.backgrounds.map((item) => `- ${item}`).join('\n') : '- No slide backgrounds found.'}

## Timing

${report.timing.length ? report.timing.map((item) => `- ${item}`).join('\n') : '- No Reveal data-timing values found.'}

## Manual Follow-Up

${report.elementComments.length ? report.elementComments.map((item) => `- Unsupported Reveal element comment: ${item}`).join('\n') : '- No unsupported Reveal element comments found.'}
${report.manualItems.length ? report.manualItems.map((item) => `- ${item}`).join('\n') : '- No ambiguous migration items found.'}
- Review migrated theme CSS; this command does not attempt Reveal theme compatibility.
- Review any raw HTML, icon markup, or plugin-dependent content manually.
`;
}
