import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createDeck } from '@ajfisher/presso-create';
import { deploy } from './commands.js';
import { parsePublishArgs, publishS3, readExcludeFile, type CommandRunner } from './publish.js';

const tmpRoots: string[] = [];

describe('publish command parsing', () => {
  it('parses an S3 bucket with the default dist directory', () => {
    expect(parsePublishArgs(['s3', 'talk.example.test'])).toEqual({
      provider: 's3',
      options: {
        bucket: 'talk.example.test',
        sourceDir: 'dist'
      }
    });
  });

  it('parses an S3 bucket with a custom source directory', () => {
    expect(parsePublishArgs(['s3', 'talk.example.test', 'custom-dist'])).toEqual({
      provider: 's3',
      options: {
        bucket: 'talk.example.test',
        sourceDir: 'custom-dist'
      }
    });
  });

  it('parses exclude file options in both supported forms', () => {
    expect(parsePublishArgs(['s3', 'talk.example.test', '--exclude-file', '.presso-publishignore'])).toEqual({
      provider: 's3',
      options: {
        bucket: 'talk.example.test',
        excludeFile: '.presso-publishignore',
        sourceDir: 'dist'
      }
    });
    expect(parsePublishArgs(['s3', 'talk.example.test', '--exclude-file=.presso-publishignore'])).toEqual({
      provider: 's3',
      options: {
        bucket: 'talk.example.test',
        excludeFile: '.presso-publishignore',
        sourceDir: 'dist'
      }
    });
  });

  it('rejects invalid publish arguments', () => {
    expect(() => parsePublishArgs([])).toThrow('Usage: presso publish s3 <bucket-name>');
    expect(() => parsePublishArgs(['r2', 'talk.example.test'])).toThrow('Unknown publish provider: r2');
    expect(() => parsePublishArgs(['s3'])).toThrow('Usage: presso publish s3 <bucket-name>');
    expect(() => parsePublishArgs(['s3', 'talk.example.test', '--profile', 'prod'])).toThrow('Unknown publish option: --profile');
    expect(() => parsePublishArgs(['s3', 'talk.example.test', '--exclude-file'])).toThrow('--exclude-file requires a value.');
  });
});

describe('S3 publish provider', () => {
  afterEach(async () => {
    await Promise.all(tmpRoots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
  });

  it('reads publish exclude files as S3 exclude patterns', async () => {
    const root = await tempDir('presso-publish-excludes-');
    const excludeFile = path.join(root, '.presso-publishignore');
    await fs.writeFile(excludeFile, '\n# local files\n *DS_Store \n.cache/*\n\n', 'utf8');

    await expect(readExcludeFile(excludeFile)).resolves.toEqual(['*DS_Store', '.cache/*']);
  });

  it('syncs the default dist directory to S3 with delete enabled', async () => {
    const root = await tempDir('presso-publish-s3-');
    await fs.mkdir(path.join(root, 'dist'));
    const calls = recordCommands();

    await publishS3({
      bucket: 'talk.example.test',
      cwd: root,
      runner: calls.runner
    });

    expect(calls.commands).toEqual([{
      cmd: 'aws',
      args: ['s3', 'sync', path.join(root, 'dist'), 's3://talk.example.test/', '--delete']
    }]);
  });

  it('passes exclude file entries to aws s3 sync', async () => {
    const root = await tempDir('presso-publish-exclude-sync-');
    await fs.mkdir(path.join(root, 'dist'));
    await fs.writeFile(path.join(root, '.presso-publishignore'), '# comment\n*DS_Store\n.cache/*\n', 'utf8');
    const calls = recordCommands();

    await publishS3({
      bucket: 'talk.example.test',
      cwd: root,
      excludeFile: '.presso-publishignore',
      runner: calls.runner
    });

    expect(calls.commands[0]?.args).toEqual([
      's3',
      'sync',
      path.join(root, 'dist'),
      's3://talk.example.test/',
      '--delete',
      '--exclude',
      '*DS_Store',
      '--exclude',
      '.cache/*'
    ]);
  });

  it('rejects missing source directories before invoking aws', async () => {
    const root = await tempDir('presso-publish-missing-');
    const calls = recordCommands();

    await expect(publishS3({
      bucket: 'talk.example.test',
      cwd: root,
      runner: calls.runner
    })).rejects.toThrow('Publish source directory does not exist');
    expect(calls.commands).toEqual([]);
  });

  it('rejects unreadable exclude files before invoking aws', async () => {
    const root = await tempDir('presso-publish-missing-exclude-');
    await fs.mkdir(path.join(root, 'dist'));
    const calls = recordCommands();

    await expect(publishS3({
      bucket: 'talk.example.test',
      cwd: root,
      excludeFile: '.missing-excludes',
      runner: calls.runner
    })).rejects.toThrow('Unable to read publish exclude file');
    expect(calls.commands).toEqual([]);
  });

  it('keeps deploy compatible by building and routing through S3 publish', async () => {
    const root = await tempDir('presso-deploy-s3-');
    await createDeck(root);
    await fs.writeFile(path.join(root, 'presso.config.ts'), `export default {
  title: 'Deploy Test',
  author: 'ajfisher',
  source: { type: 'folder', path: './slides' },
  theme: './theme.css',
  deploy: {
    target: 's3',
    bucket: 'talk.example.test',
    cloudfrontDistributionId: 'DIST123'
  }
};
`);
    const calls = recordCommands();

    await deploy(root, true, calls.runner);
    expect(calls.commands).toEqual([{
      cmd: 'aws',
      args: ['s3', 'sync', path.join(root, 'dist'), 's3://talk.example.test/', '--delete', '--dryrun']
    }]);

    calls.commands.length = 0;
    await deploy(root, false, calls.runner);
    expect(calls.commands).toEqual([
      {
        cmd: 'aws',
        args: ['s3', 'sync', path.join(root, 'dist'), 's3://talk.example.test/', '--delete']
      },
      {
        cmd: 'aws',
        args: ['cloudfront', 'create-invalidation', '--distribution-id', 'DIST123', '--paths', '/*']
      }
    ]);
  });
});

async function tempDir(prefix: string): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tmpRoots.push(root);
  return root;
}

function recordCommands(): { commands: Array<{ args: string[]; cmd: string }>; runner: CommandRunner } {
  const commands: Array<{ args: string[]; cmd: string }> = [];
  return {
    commands,
    runner: async (cmd, args) => {
      commands.push({ cmd, args });
    }
  };
}
