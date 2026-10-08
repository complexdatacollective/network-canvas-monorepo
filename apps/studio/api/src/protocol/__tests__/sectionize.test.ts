import { describe, expect, it } from 'vitest';

import { validateProtocol } from '@codaco/protocol-validation';
import { contentHash } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { validateSection } from '@codaco/studio-sync/section-validation';

import { sectionizeProtocol } from '../sectionize.ts';
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

      const assembled = assembleProtocolSections(sections);
      expect(assembled).toEqual(protocol);

      const revalidated = await validateProtocol(assembled);
      expect(
        revalidated.success,
        JSON.stringify(revalidated.error?.issues ?? [], null, 2),
      ).toBe(true);
    });
  }

  it('round-trips the base protocol', () => {
    const protocol = baseProtocol();
    const assembled = assembleProtocolSections(sectionizeProtocol(protocol));
    expect(assembled).toEqual(protocol);
  });

  it('keeps the experiments setting in the settings section', () => {
    const protocol = { ...baseProtocol(), experiments: {} };
    const sections = sectionizeProtocol(protocol);

    expect(sections.settings).toHaveProperty('experiments', {});
    expect(assembleProtocolSections(sections)).toEqual(protocol);
  });

  it('round-trips a __proto__ entity type id without losing it', () => {
    const protocol = JSON.parse(
      JSON.stringify(baseProtocol()).replaceAll('"person"', '"__proto__"'),
    ) as ReturnType<typeof baseProtocol>;
    const assembled = assembleProtocolSections(
      sectionizeProtocol(protocol),
    ) as {
      codebook: { node: Record<string, unknown> };
    };
    expect(Object.hasOwn(assembled.codebook.node, '__proto__')).toBe(true);
    expect(assembled).toEqual(protocol);
  });

  it('rejects an empty stage id instead of emitting an unaddressable section', () => {
    const protocol = baseProtocol();
    protocol.stages[0]!.id = '';
    expect(() => sectionizeProtocol(protocol)).toThrow(/non-empty/);
  });
});

describe('golden hashes', () => {
  // Pinned digests: a change to canonical serialization, the taxonomy, or the
  // version-hash recipe fails here before it invalidates stored content hashes.
  // They are digests of baseProtocol(), so editing that fixture moves them too.
  it('section and version hashes are stable', () => {
    const sections = sectionizeProtocol(baseProtocol());
    const sectionHashes = Object.fromEntries(
      Object.entries(sections).map(([id, doc]) => [id, contentHash(doc)]),
    );
    expect(sectionHashes).toMatchInlineSnapshot(`
      {
        "assets": "44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a",
        "codebook:edge:knows": "96ba2dfdd02dc597536433e6debfbdaec16f3ffc1738b0377515198ddaa30193",
        "codebook:node:person": "508208bef9a636733579c7062b00429e206a0410d991a505b5da78b4be9c3fd9",
        "settings": "62eb33d43a79ad953fb8d44150ef3d9388bcecb0ec4ba390695b52cdaf43f3ae",
        "stage:nameGenerator1": "da989aa0f95cc6223c4ae6e1e8eecd53698a900bae557d0dae58ba43948f9511",
        "stage:sociogram1": "f20a610875c24d940f59bd6d68d52e3b0453fe778d1a4af9a3a09a7926b0e3a9",
        "stageOrder": "491ca26e923314c49ae7caba154c45712202c684d50a7f6b959267bd75e3a400",
      }
    `);
    expect(versionContentHash(sectionHashes)).toMatchInlineSnapshot(
      `"51bdcfc218096795c910804bbbc5841736961ef7293e6f92e2f88bafeef8d9dc"`,
    );
  });
});
