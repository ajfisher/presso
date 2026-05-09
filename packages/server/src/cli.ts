#!/usr/bin/env node
import path from 'node:path';
import { startDevServer } from './server.js';
import { addSlide, buildStatic, createDeck, deploy, exportPdf, exportTranscript, orderAppend, orderCheck, orderInit } from './commands.js';

const [, , command, ...args] = process.argv;

try {
  await main(command, args);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

async function main(command = 'help', args: string[]): Promise<void> {
  if (command === 'help' || command === '--help' || command === '-h') {
    printHelp();
    return;
  }
  if (command === 'dev') {
    const cwd = resolveDeckDir(args);
    const portArg = args.find((arg) => arg.startsWith('--port='));
    await startDevServer(cwd, portArg ? Number(portArg.split('=')[1]) : 3030);
    return;
  }
  if (command === 'build') {
    const cwd = resolveDeckDir(args);
    console.log(await buildStatic(cwd));
    return;
  }
  if (command === 'pdf') {
    const cwd = resolveDeckDir(args);
    const mode = args.includes('--notes-side') ? 'print-notes-side' : args.includes('--notes-pages') ? 'print-notes-pages' : 'print-slides';
    console.log(await exportPdf(cwd, mode));
    return;
  }
  if (command === 'transcript') {
    const cwd = resolveDeckDir(args);
    console.log(await exportTranscript(cwd));
    return;
  }
  if (command === 'deploy') {
    const cwd = resolveDeckDir(args);
    await deploy(cwd, !args.includes('--yes'));
    return;
  }
  if (command === 'slide' && args[0] === 'add') {
    const cwd = resolveDeckDir(args, 1);
    console.log(await addSlide(cwd));
    return;
  }
  if (command === 'order' && args[0] === 'init') {
    const cwd = resolveDeckDir(args, 1);
    console.log(await orderInit(cwd));
    return;
  }
  if (command === 'order' && args[0] === 'check') {
    const cwd = resolveDeckDir(args, 1);
    console.log(await orderCheck(cwd));
    return;
  }
  if (command === 'order' && args[0] === 'append') {
    const cwd = resolveDeckDir(args, 1);
    console.log(await orderAppend(cwd));
    return;
  }
  if (command === 'create') {
    const target = args[0];
    if (!target) throw new Error('Usage: presso create <directory>');
    await createDeck(target);
    return;
  }
  printHelp();
  throw new Error(`Unknown command: ${command}`);
}

function resolveDeckDir(args: string[], startIndex = 0): string {
  const dir = args.slice(startIndex).find((arg) => !arg.startsWith('--'));
  return dir ? path.resolve(dir) : process.cwd();
}

function printHelp(): void {
  console.log(`Presso commands:
  presso dev [deckDir] [--port=3030]
  presso build [deckDir]
  presso pdf [deckDir] [--notes-side|--notes-pages]
  presso transcript [deckDir]
  presso deploy [deckDir] [--yes]
  presso slide add [deckDir]
  presso order init|check|append [deckDir]
  presso create <directory>`);
}
