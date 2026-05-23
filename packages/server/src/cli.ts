#!/usr/bin/env node
import path from 'node:path';
import { startDevServer } from './server.js';
import { addSlide, buildStatic, createDeck, deploy, exportPdf, exportPdfs, exportTranscript, migrateRevealDeck, orderAppend, orderCheck, orderInit } from './commands.js';
import { resolvePdfLayout } from '@ajfisher/presso-export';
import { resolveTranscriptProfile, type TranscriptProfile } from '@ajfisher/presso-runtime';

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
    const options = parsePdfArgs(args);
    if (options.all) {
      console.log((await exportPdfs(options.cwd)).join('\n'));
    } else {
      console.log(await exportPdf(options.cwd, options.layout, options.outFile));
    }
    return;
  }
  if (command === 'transcript') {
    const options = parseTranscriptArgs(args);
    console.log(await exportTranscript(options.cwd, options.outFile, {
      fragment: options.fragment,
      profile: options.profile
    }));
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
  if (command === 'migrate' && args[0] === 'reveal') {
    const source = args[1];
    const target = args[2];
    if (!source || !target) throw new Error('Usage: presso migrate reveal <source> <target>');
    console.log(await migrateRevealDeck(source, target));
    return;
  }
  printHelp();
  throw new Error(`Unknown command: ${command}`);
}

function resolveDeckDir(args: string[], startIndex = 0): string {
  const dir = args.slice(startIndex).find((arg) => !arg.startsWith('--'));
  return dir ? path.resolve(dir) : process.cwd();
}

function parsePdfArgs(args: string[]): { all: boolean; cwd: string; layout: string; outFile?: string } {
  let all = false;
  let layout = 'slides';
  let layoutExplicit = false;
  let outFile: string | undefined;
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--all') {
      all = true;
    } else if (arg === '--layout') {
      layout = requireValue(args, ++i, '--layout');
      layoutExplicit = true;
    } else if (arg.startsWith('--layout=')) {
      layout = arg.slice('--layout='.length);
      layoutExplicit = true;
    } else if (arg === '--out') {
      outFile = requireValue(args, ++i, '--out');
    } else if (arg.startsWith('--out=')) {
      outFile = arg.slice('--out='.length);
    } else if (arg === '--notes-side') {
      layout = 'handout';
      layoutExplicit = true;
    } else if (arg === '--notes-pages') {
      layout = 'speaker';
      layoutExplicit = true;
    } else if (arg === '--notes') {
      layout = 'notes';
      layoutExplicit = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown pdf option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  if (all && outFile) throw new Error('presso pdf --all cannot be used with --out.');
  if (all && layoutExplicit) throw new Error('presso pdf --all cannot be used with --layout or notes layout aliases.');
  return {
    all,
    cwd: positionals[0] ? path.resolve(positionals[0]) : process.cwd(),
    layout: resolvePdfLayout(layout),
    outFile
  };
}

function parseTranscriptArgs(args: string[]): { cwd: string; fragment: boolean; outFile: string; profile: TranscriptProfile } {
  let fragment = false;
  let outFile = 'transcript.md';
  let profile: TranscriptProfile = 'notes-visuals';
  const positionals: string[] = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--fragment') {
      fragment = true;
    } else if (arg === '--profile') {
      profile = resolveTranscriptProfile(requireValue(args, ++i, '--profile'));
    } else if (arg.startsWith('--profile=')) {
      profile = resolveTranscriptProfile(arg.slice('--profile='.length));
    } else if (arg === '--out') {
      outFile = requireValue(args, ++i, '--out');
    } else if (arg.startsWith('--out=')) {
      outFile = arg.slice('--out='.length);
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown transcript option: ${arg}`);
    } else {
      positionals.push(arg);
    }
  }

  return {
    cwd: positionals[0] ? path.resolve(positionals[0]) : process.cwd(),
    fragment,
    outFile,
    profile
  };
}

function requireValue(args: string[], index: number, flag: string): string {
  const value = args[index];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return value;
}

function printHelp(): void {
  console.log(`Presso commands:
  presso dev [deckDir] [--port=3030]
  presso build [deckDir]
  presso pdf [deckDir] [--layout=slides|notes|speaker|handout] [--all] [--out=file.pdf]
  presso transcript [deckDir] [--profile=full|notes|notes-visuals] [--fragment] [--out=file.md]
  presso deploy [deckDir] [--yes]
  presso slide add [deckDir]
  presso order init|check|append [deckDir]
  presso create <directory>
  presso migrate reveal <source> <target>`);
}
