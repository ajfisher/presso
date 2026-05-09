import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { pathExists } from './fs.js';
import type { PressoConfigInput, ResolvedPressoConfig } from './types.js';

const CONFIG_FILES = [
  'presso.config.ts',
  'presso.config.mjs',
  'presso.config.js'
];

export async function loadConfig(cwd = process.cwd()): Promise<ResolvedPressoConfig> {
  const rootDir = path.resolve(cwd);
  const configPath = await findConfig(rootDir);
  const input = configPath ? await importConfig(configPath) : {};
  return resolveConfig(input, rootDir);
}

export function resolveConfig(input: PressoConfigInput, rootDir: string): ResolvedPressoConfig {
  const source = resolveSource(input, rootDir);
  const width = input.size?.width ?? 1280;
  const height = input.size?.height ?? 720;

  if (width <= 0 || height <= 0) {
    throw new Error('Deck size must define positive width and height values.');
  }

  return {
    rootDir,
    title: input.title ?? 'Untitled Presso Deck',
    event: input.event,
    date: input.date,
    author: input.author ?? 'ajfisher',
    excerpt: input.excerpt,
    tags: input.tags ?? [],
    featureImage: input.featureImage,
    baseUrl: input.baseUrl,
    aspectRatio: input.aspectRatio ?? '16:9',
    size: { width, height },
    source,
    theme: input.theme ?? './theme.css',
    rawHtml: input.rawHtml ?? true,
    notes: {
      public: input.notes?.public ?? false,
      defaultPrintLayout: input.notes?.defaultPrintLayout ?? 'page'
    },
    deploy: input.deploy ?? {}
  };
}

async function findConfig(rootDir: string): Promise<string | undefined> {
  for (const name of CONFIG_FILES) {
    const filePath = path.join(rootDir, name);
    if (await pathExists(filePath)) {
      return filePath;
    }
  }
  return undefined;
}

async function importConfig(configPath: string): Promise<PressoConfigInput> {
  const url = pathToFileURL(configPath);
  url.searchParams.set('t', String(Date.now()));
  const mod = await import(url.href);
  const config = mod.default ?? mod.config ?? mod;
  if (!config || typeof config !== 'object') {
    throw new Error(`Config file ${configPath} must export an object.`);
  }
  return config as PressoConfigInput;
}

function resolveSource(input: PressoConfigInput, rootDir: string) {
  const sourceType = input.source?.type;
  const sourcePath = input.source?.path;

  if (sourceType && sourceType !== 'folder' && sourceType !== 'file') {
    throw new Error(`Unsupported source type "${sourceType}". Expected "folder" or "file".`);
  }

  if (sourceType && !sourcePath) {
    throw new Error('Config source.path is required when source.type is provided.');
  }

  if (sourceType && sourcePath) {
    return { type: sourceType, path: sourcePath };
  }

  if (sourcePath) {
    return {
      type: sourcePath.endsWith('.md') ? 'file' as const : 'folder' as const,
      path: sourcePath
    };
  }

  return {
    type: 'folder' as const,
    path: './slides'
  };
}

