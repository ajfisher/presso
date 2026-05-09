import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { compileDeck, listMarkdownFiles, parseOrderFile, checkOrder, toPosixPath } from '@presso/core';
import { buildStatic, exportPdf, exportTranscript } from '@presso/export';
import { createDeck } from '@presso/create';

export async function addSlide(cwd = process.cwd()): Promise<string> {
  const slideDir = path.join(cwd, 'slides');
  await fs.mkdir(slideDir, { recursive: true });
  const files = await listMarkdownFiles(slideDir).catch(() => []);
  const max = files.reduce((highest, file) => {
    const match = path.basename(file).match(/^(\d+)/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  const next = String(max + 1).padStart(3, '0');
  const filePath = path.join(slideDir, `${next}-untitled.md`);
  await fs.writeFile(filePath, `---\nid: untitled-${next}\nlayout: statement\n---\n\n## Untitled\n\n:::notes\nAdd speaker notes here.\n:::\n`);
  return filePath;
}

export async function orderInit(cwd = process.cwd()): Promise<string> {
  const files = await listMarkdownFiles(path.join(cwd, 'slides'));
  const content = files.map((file) => toPosixPath(path.relative(cwd, file))).join('\n') + '\n';
  const orderPath = path.join(cwd, 'slides.order');
  await fs.writeFile(orderPath, content);
  return orderPath;
}

export async function orderAppend(cwd = process.cwd()): Promise<string> {
  const orderPath = path.join(cwd, 'slides.order');
  const files = await listMarkdownFiles(path.join(cwd, 'slides'));
  const existing = await fs.readFile(orderPath, 'utf8').catch(() => '');
  const ordered = new Set(parseOrderFile(existing).map((file) => path.resolve(cwd, file)));
  const append = files.filter((file) => !ordered.has(path.resolve(file))).map((file) => toPosixPath(path.relative(cwd, file)));
  await fs.appendFile(orderPath, append.length ? append.join('\n') + '\n' : '');
  return orderPath;
}

export async function orderCheck(cwd = process.cwd()): Promise<string> {
  const files = await listMarkdownFiles(path.join(cwd, 'slides'));
  const orderPath = path.join(cwd, 'slides.order');
  const order = parseOrderFile(await fs.readFile(orderPath, 'utf8'));
  const check = checkOrder(files, order.map((file) => path.resolve(cwd, file)));
  return JSON.stringify({
    missing: check.missing.map((file) => toPosixPath(path.relative(cwd, file))),
    duplicate: check.duplicate.map((file) => toPosixPath(path.relative(cwd, file))),
    orphaned: check.orphaned.map((file) => toPosixPath(path.relative(cwd, file)))
  }, null, 2);
}

export async function deploy(cwd = process.cwd(), dryRun = true): Promise<void> {
  const deck = await compileDeck(cwd);
  if (deck.config.deploy.target !== 's3' || !deck.config.deploy.bucket) {
    throw new Error('deploy.target must be \"s3\" and deploy.bucket must be configured.');
  }
  const dist = await buildStatic(cwd);
  const args = ['s3', 'sync', dist, `s3://${deck.config.deploy.bucket}/`, '--delete'];
  if (dryRun) args.push('--dryrun');
  await run('aws', args);
  if (!dryRun && deck.config.deploy.cloudfrontDistributionId) {
    await run('aws', ['cloudfront', 'create-invalidation', '--distribution-id', deck.config.deploy.cloudfrontDistributionId, '--paths', '/*']);
  }
}

export { buildStatic, createDeck, exportPdf, exportTranscript };

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit' });
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`${cmd} exited with ${code}`)));
  });
}
