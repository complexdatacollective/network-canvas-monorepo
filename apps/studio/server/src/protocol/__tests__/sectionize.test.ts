import { describe, expect, it } from 'vitest';

import {
  type VersionedProtocol,
  validateProtocol,
} from '@codaco/protocol-validation';
import { contentHash } from '@codaco/studio-sync/apply';

import { assembleProtocol } from '../assemble.ts';
import { sectionizeProtocol } from '../sectionize.ts';
import { validateSection } from '../validate.ts';
import { versionContentHash } from '../version-hash.ts';
import { FIXTURES, baseProtocol, readFixtureProtocol } from './helpers.ts';

describe('sectionize/assemble round trip', () => {
  for (const fixture of FIXTURES) {
    it(`round-trips ${fixture}`, async () => {
      const protocol = readFixtureProtocol(fixture);
      const sections = sectionizeProtocol(protocol);

      for (const [id, doc] of Object.entries(sections)) {
        const result = validateSection(id, doc);
        expect(
          result.success,
          `section ${id}: ${JSON.stringify(result.success ? [] : result.issues)}`,
        ).toBe(true);
      }

      const assembled = assembleProtocol(sections);
      expect(assembled).toEqual(protocol);

      const revalidated = await validateProtocol(
        assembled as VersionedProtocol,
      );
      expect(
        revalidated.success,
        JSON.stringify(revalidated.error?.issues ?? [], null, 2),
      ).toBe(true);
    });
  }

  it('round-trips the base protocol', () => {
    const protocol = baseProtocol();
    const assembled = assembleProtocol(sectionizeProtocol(protocol));
    expect(assembled).toEqual(protocol);
  });

  it('round-trips a __proto__ entity type id without losing it', () => {
    const protocol = JSON.parse(
      JSON.stringify(baseProtocol()).replaceAll('"person"', '"__proto__"'),
    ) as ReturnType<typeof baseProtocol>;
    const assembled = assembleProtocol(sectionizeProtocol(protocol)) as {
      codebook: { node: Record<string, unknown> };
    };
    expect(Object.hasOwn(assembled.codebook.node, '__proto__')).toBe(true);
    expect(assembled).toEqual(protocol);
  });

  it('rejects an empty stage id instead of emitting an unaddressable section', () => {
    const protocol = baseProtocol();
    (protocol.stages[0] as { id: string }).id = '';
    expect(() => sectionizeProtocol(protocol)).toThrow(/non-empty/);
  });
});

describe('golden hashes', () => {
  // Pinned digests: a change to canonical serialization, the taxonomy, or the
  // version-hash recipe fails here before it invalidates stored content hashes.
  it('section and version hashes are stable', () => {
    const sections = sectionizeProtocol(baseProtocol());
    const sectionHashes = Object.fromEntries(
      Object.entries(sections).map(([id, doc]) => [id, contentHash(doc)]),
    );
    expect(sectionHashes).toMatchInlineSnapshot(`
      {
        "assets": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "codebook:edge:knows": "d10d93cc1b4c9ea77f4c6d750eb7a2e1da90346ad9a6b52b59c45a8c4f7aaadb",
        "codebook:node:person": "5b62bc580a031a23de667d9f7c0005e797a1f97b8e375362b9c5cd7c21375372",
        "settings": "33bcea42c6ed2254d837ad0b27e16e5fc5d2f796315a6428b8cd83afe987e191",
        "stage:nameGenerator1": "1265ee53d3b674bfade2198f10f9eade5de22d0fbd8252dc4ba151556ff3d1e3",
        "stage:sociogram1": "d0bb5c8d94f3b1cc558bd85a5905ca79e38713c8c145a924f0bf1a36f618b6c9",
        "stageOrder": "491ca26e923314c49ae7caba154c45712202c684d50a7f6b959267bd75e3a400",
      }
    `);
    expect(versionContentHash(sectionHashes)).toMatchInlineSnapshot(
      `"d9436b37cd02263b026e25ac357fe89f0ebef0a9da97e9e1812511a46e1ea056"`,
    );
  });
});
