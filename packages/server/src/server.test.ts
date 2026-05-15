import { describe, expect, it } from 'vitest';
import { clampStateIndex } from './server.js';

describe('dev server state', () => {
  it('clamps requested slide indexes to the deck bounds', () => {
    expect(clampStateIndex(2, 5)).toBe(2);
    expect(clampStateIndex(20, 5)).toBe(4);
    expect(clampStateIndex(-4, 5)).toBe(0);
    expect(clampStateIndex('3', 5)).toBe(3);
    expect(clampStateIndex('nope', 5, 2)).toBe(2);
  });
});
