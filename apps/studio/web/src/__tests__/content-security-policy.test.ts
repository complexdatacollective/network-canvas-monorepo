import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const NGINX_CONF = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), '../../nginx.conf'),
  'utf8',
);

const POLICY = "connect-src 'self' https://api.mapbox.com";

const DOCUMENT_LOCATIONS = ['/', '= /index.html', '= /maintenance.html'];

const uncommented = NGINX_CONF.split('\n')
  .map((line) => line.replace(/#.*$/, ''))
  .join('\n');

const locationBlocks = (): Map<string, string> => {
  const blocks = new Map<string, string>();
  for (const match of uncommented.matchAll(
    /location\s+([^{]+?)\s*\{([^}]*)\}/g,
  )) {
    blocks.set(match[1]!.trim(), match[2]!);
  }
  return blocks;
};

const policiesIn = (block: string): string[] =>
  [
    ...block.matchAll(
      /add_header\s+Content-Security-Policy\s+"([^"]*)"\s+always;/g,
    ),
  ].map((match) => match[1]!);

describe('the content security policy the client is served with', () => {
  it('is set on every location that answers with a document', () => {
    const blocks = locationBlocks();
    for (const location of DOCUMENT_LOCATIONS) {
      expect(blocks.has(location), location).toBe(true);
      expect(policiesIn(blocks.get(location) ?? ''), location).toEqual([
        POLICY,
      ]);
    }
  });

  it('is never set at the server level, where a location’s own headers would drop it', () => {
    const serverLevel = uncommented.replace(/location\s+[^{]+\{[^}]*\}/g, '');
    expect(serverLevel).not.toMatch(/Content-Security-Policy/);
  });

  it('is the only security policy any location sets', () => {
    for (const [location, block] of locationBlocks()) {
      for (const policy of policiesIn(block)) {
        expect(policy, location).toBe(POLICY);
      }
    }
  });
});
