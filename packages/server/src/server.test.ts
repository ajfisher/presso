import { describe, expect, it } from 'vitest';
import { clampStateIndex, controlUrlsFromTailscaleServeStatus } from './server.js';

describe('dev server state', () => {
  it('clamps requested slide indexes to the deck bounds', () => {
    expect(clampStateIndex(2, 5)).toBe(2);
    expect(clampStateIndex(20, 5)).toBe(4);
    expect(clampStateIndex(-4, 5)).toBe(0);
    expect(clampStateIndex('3', 5)).toBe(3);
    expect(clampStateIndex('nope', 5, 2)).toBe(2);
  });

  it('finds tailnet HTTPS controller URLs for the active dev server port', () => {
    const status = JSON.stringify({
      Foreground: {
        '233fb11d226b5e5c': {
          Web: {
            'minerva.taile5f2ff.ts.net:443': {
              Handlers: {
                '/': {
                  Proxy: 'http://127.0.0.1:3030'
                }
              }
            },
            'other.taile5f2ff.ts.net:443': {
              Handlers: {
                '/talk': {
                  Proxy: 'http://127.0.0.1:4040'
                }
              }
            }
          }
        }
      }
    });

    expect(controlUrlsFromTailscaleServeStatus(status, 3030)).toEqual([
      'https://minerva.taile5f2ff.ts.net/control'
    ]);
  });

  it('preserves a Tailscale Serve path prefix when building controller URLs', () => {
    const status = JSON.stringify({
      ServeConfig: {
        Web: {
          'minerva.taile5f2ff.ts.net:443': {
            Handlers: {
              '/presso': {
                Proxy: 'http://localhost:3030'
              }
            }
          }
        }
      }
    });

    expect(controlUrlsFromTailscaleServeStatus(status, 3030)).toEqual([
      'https://minerva.taile5f2ff.ts.net/presso/control'
    ]);
  });
});
