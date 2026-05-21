import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createDeck } from './index.js';

describe('createDeck', () => {
  it('creates a numbered folder starter with runnable scripts', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-create-'));
    const target = path.join(dir, 'My Talk');

    await createDeck(target, {
      cwd: path.resolve('.')
    });

    const packageJson = JSON.parse(await fs.readFile(path.join(target, 'package.json'), 'utf8'));
    expect(packageJson.name).toBe('my-talk');
    expect(packageJson.scripts).toMatchObject({
      dev: 'presso dev',
      build: 'presso build',
      pdf: 'presso pdf',
      transcript: 'presso transcript',
      deploy: 'presso deploy'
    });
    expect(packageJson.devDependencies['@ajfisher/presso-server']).toMatch(/^file:/);

    const slides = await fs.readdir(path.join(target, 'slides'));
    expect(slides).toEqual(['001-title.md', '002-content.md', '003-notes.md']);
    await expect(fs.access(path.join(target, 'slides.order'))).rejects.toThrow();
  });

  it('uses the package version when no local workspace is available', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-create-'));
    await createDeck(dir, {
      cwd: os.tmpdir()
    });

    const packageJson = JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
    const createPackageJson = JSON.parse(await fs.readFile(path.resolve('packages/create/package.json'), 'utf8'));
    expect(packageJson.devDependencies['@ajfisher/presso-server']).toBe(`^${createPackageJson.version}`);
  });

  it('refuses to overwrite a non-empty target directory', async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'presso-create-'));
    await fs.writeFile(path.join(dir, 'existing.txt'), 'keep me\n');

    await expect(createDeck(dir)).rejects.toThrow('Target directory is not empty');
  });
});
