import { describe, expect, it } from 'vitest';

import * as importProtocol from '../importProtocol';
import type { ImportRequest } from '../useProtocolImport';

describe('URL import is removed', () => {
  it('importProtocol.ts exposes no URL entry points', () => {
    const names = Object.keys(importProtocol);
    expect(names).not.toContain('importProtocolFromUrl');
    expect(names).not.toContain('deriveNameFromUrl');
  });

  it('ImportPhase no longer includes a network fetch phase', () => {
    // Exhaustiveness check: this object literal only type-checks if
    // `ImportPhase` is exactly `'extracting' | 'saving'`. Reintroducing
    // `'fetching'` (the URL-only phase) makes this fail to compile.
    const allPhases: Record<importProtocol.ImportPhase, true> = {
      extracting: true,
      saving: true,
    };
    expect(Object.keys(allPhases).toSorted()).toEqual(['extracting', 'saving']);
  });

  it('ImportRequest is file-only', () => {
    const request: ImportRequest = {
      source: 'file',
      file: new File([], 'x.netcanvas'),
      label: 'x.netcanvas',
    };
    // @ts-expect-error — url is no longer an allowed source
    const bad: ImportRequest = { source: 'url', url: 'https://x', label: 'x' };
    expect(request.source).toBe('file');
    expect(bad).toBeDefined();
  });
});
