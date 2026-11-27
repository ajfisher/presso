#!/usr/bin/env node
import { createDeck } from '@ajfisher/presso-create';

const target = process.argv[2];
if (!target) {
  console.error('Usage: npm create presso@latest <directory>');
  process.exit(1);
}

await createDeck(target);
console.log(`Created Presso deck in ${target}`);
