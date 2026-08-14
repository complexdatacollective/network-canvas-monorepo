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
});

describe('golden hashes', () => {
  // Pinned digests over an inline protocol: any change to canonical
  // serialization, the section taxonomy, or the version-hash recipe fails
  // here before it silently invalidates stored content hashes.
  it('section and version hashes are stable', () => {
    const sections = sectionizeProtocol(baseProtocol());
    const sectionHashes = Object.fromEntries(
      Object.entries(sections).map(([id, doc]) => [id, contentHash(doc)]),
    );
    expect(sectionHashes).toMatchInlineSnapshot(`
      {
        "codebook:edge:knows": "d10d93cc1b4c9ea77f4c6d750eb7a2e1da90346ad9a6b52b59c45a8c4f7aaadb",
        "codebook:node:person": "5b62bc580a031a23de667d9f7c0005e797a1f97b8e375362b9c5cd7c21375372",
        "settings": "33bcea42c6ed2254d837ad0b27e16e5fc5d2f796315a6428b8cd83afe987e191",
        "stage:nameGenerator1": "1265ee53d3b674bfade2198f10f9eade5de22d0fbd8252dc4ba151556ff3d1e3",
        "stage:sociogram1": "d0bb5c8d94f3b1cc558bd85a5905ca79e38713c8c145a924f0bf1a36f618b6c9",
        "stageOrder": "491ca26e923314c49ae7caba154c45712202c684d50a7f6b959267bd75e3a400",
      }
    `);
    expect(versionContentHash(sectionHashes)).toMatchInlineSnapshot(
      `"e31d7f8aa3ddf64f44068358772d8284725d2b21b4a4e121a66bfbb54a1ab054"`,
    );
  });
});
