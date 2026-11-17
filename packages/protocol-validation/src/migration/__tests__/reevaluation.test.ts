import { describe, expect, it } from 'vitest';

describe('migrate-protocol module re-evaluation', () => {
  it('evaluates a second time against the same migration/index.ts instance without throwing', async () => {
    // A dev server's hot reload re-evaluates migrate-protocol.ts when a schema
    // migration file changes, but keeps migration/index.ts, which it only
    // depends on. The query string gives this import a fresh module instance
    // while its own imports resolve to the instances already loaded, which is
    // exactly that situation.
    const first = await import('../migrate-protocol.ts');
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the query-suffixed specifier has no static type; it is the same module
    const second = (await import(
      // @ts-expect-error -- a query-suffixed specifier is resolved by Vite, not TypeScript
      '../migrate-protocol.ts?reevaluate'
    )) as typeof first;

    expect(second.protocolMigrations).not.toBe(first.protocolMigrations);
    expect(second.protocolMigrations.canMigrate(1, 9)).toBe(true);
  });
});
