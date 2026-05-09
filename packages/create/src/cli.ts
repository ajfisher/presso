#!/usr/bin/env node
import { createDeck } from './index.js';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm create @presso <directory>');
  process.exit(1);
}

await createDeck(target);
console.log(`Created Presso deck in ${target}`);

