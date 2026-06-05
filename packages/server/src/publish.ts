import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface PublishS3CliOptions {
  bucket: string;
  excludeFile?: string;
  sourceDir: string;
}

export interface PublishS3Options extends Omit<PublishS3CliOptions, 'sourceDir'> {
  cwd?: string;
  dryRun?: boolean;
  runner?: CommandRunner;
  sourceDir?: string;
}

export type CommandRunner = (cmd: string, args: string[]) => Promise<void>;

export async function publishS3(options: PublishS3Options): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const sourceDir = path.resolve(cwd, options.sourceDir ?? 'dist');
  const stat = await fs.stat(sourceDir).catch(() => undefined);
  if (!stat?.isDirectory()) {
    throw new Error(`Publish source directory does not exist: ${sourceDir}`);
  }

  const args = ['s3', 'sync', sourceDir, `s3://${options.bucket}/`, '--delete'];
  if (options.dryRun) args.push('--dryrun');
  if (options.excludeFile) {
    for (const pattern of await readExcludeFile(path.resolve(cwd, options.excludeFile))) {
      args.push('--exclude', pattern);
    }
  }

  await (options.runner ?? run)('aws', args);
}

export function parsePublishArgs(args: string[]): { provider: 's3'; options: PublishS3CliOptions } {
  const provider = args[0];
  if (!provider) throw new Error('Usage: presso publish s3 <bucket-name> [directory] [--exclude-file file]');
  if (provider !== 's3') throw new Error(`Unknown publish provider: ${provider}`);

  let excludeFile: string | undefined;
  const positionals: string[] = [];
  for (let i = 1; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--exclude-file') {
      excludeFile = requireValue(args, ++i, '--exclude-file');
    } else if (arg.startsWith('--exclude-file=')) {
      excludeFile = arg.slice('--exclude-file='.length);
      if (!excludeFile) throw new Error('--exclude-file requires a value.');
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown publish option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  const bucket = positionals[0];
  if (!bucket) throw new Error('Usage: presso publish s3 <bucket-name> [directory] [--exclude-file file]');
  if (positionals.length > 2) throw new Error(`Unexpected publish argument: ${positionals[2]}`);

  return {
    provider: 's3',
    options: {
      bucket,
      excludeFile,
      sourceDir: positionals[1] ?? 'dist'
    }
  };
}

export async function readExcludeFile(filePath: string): Promise<string[]> {
  let content: string;
  try {
    content = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    throw new Error(`Unable to read publish exclude file ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
  });
}
