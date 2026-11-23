import { describe, expect, it } from 'vitest';

import { withInterfaceText } from '@codaco/interview/supplied-wording';
import { createEmptyProtocol } from '@codaco/protocol-builder-core/empty-protocol';
import {
  isProtocolObjectId,
  validateProtocol,
} from '@codaco/protocol-validation';
import { contentHash } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { validateSection } from '@codaco/studio-sync/section-validation';

import { sectionizeProtocol } from '../sectionize.ts';
import { versionContentHash } from '../version-hash.ts';
import {
  BASE_CODEBOOK_IDS,
  FIXTURES,
  baseProtocol,
  readFixtureProtocol,
} from './helpers.ts';

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

      // Assembling brings the interface text up to date: the protocol holds
      // only the researcher's own wording, not Network Canvas's.
      const assembled = assembleProtocolSections(sections);
      expect(assembled).toEqual(withInterfaceText(protocol));

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
      JSON.stringify(baseProtocol()).replaceAll(
        JSON.stringify(BASE_CODEBOOK_IDS.person),
        '"__proto__"',
      ),
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
    // A branded id cannot be empty, so the empty one is set past the type.
    Reflect.set(protocol.stages[0]!, 'id', '');
    expect(() => sectionizeProtocol(protocol)).toThrow(/non-empty/);
  });
});

describe('a new protocol', () => {
  // A schema 9 interview has to end at a finish stage, so a protocol with no
  // stages at all is not one validation admits.
  it('starts with the supplied finish stage and validates', async () => {
    const protocol = createEmptyProtocol({ name: 'New study' });
    const finishStageId = protocol.stages[0]?.id;
    expect(protocol.stages).toEqual([
      expect.objectContaining({
        id: expect.toSatisfy(isProtocolObjectId),
        type: 'FinishSession',
        mode: 'confirmation',
        finishedContent: {
          en: '# Interview Finished\n\nThank you for participating!',
        },
        outcome: 'completed',
      }),
    ]);
    // It holds none of the wording Network Canvas supplies.
    expect(protocol.stages[0]).not.toHaveProperty('finishLabel');
    expect(protocol).not.toHaveProperty('interfaceText');
    expect(sectionizeProtocol(protocol).settings).not.toHaveProperty(
      'interfaceText',
    );
    const validated = await validateProtocol(protocol);
    expect(
      validated.success,
      JSON.stringify(validated.error?.issues ?? [], null, 2),
    ).toBe(true);
    expect(sectionizeProtocol(protocol).stageOrder).toEqual({
      stages: [finishStageId],
    });
  });

  // Studio stores a protocol as sections, so each one the new protocol is
  // split into has to be one the host will hold.
  it('splits into sections that each validate', () => {
    for (const [id, doc] of Object.entries(
      sectionizeProtocol(createEmptyProtocol({ name: 'New study' })),
    )) {
      const result = validateSection(id, doc);
      expect(
        result.success,
        `section ${id}: ${JSON.stringify(result.success ? [] : result.issues)}`,
      ).toBe(true);
    }
  });

  it('gives each new protocol its own finish stage id', () => {
    expect(createEmptyProtocol({ name: 'One' }).stages[0]?.id).not.toBe(
      createEmptyProtocol({ name: 'Two' }).stages[0]?.id,
    );
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
        "codebook:edge:1d966f2b-32fc-51de-8d8d-334de4009e6c": "d10d93cc1b4c9ea77f4c6d750eb7a2e1da90346ad9a6b52b59c45a8c4f7aaadb",
        "codebook:node:62c26eae-2583-582b-9355-1a478554b68c": "3d71952a42cd3a858e8bcb56a81fe8e394502eddc45a765add99e133598ad8af",
        "settings": "62eb33d43a79ad953fb8d44150ef3d9388bcecb0ec4ba390695b52cdaf43f3ae",
        "stage:3c07e726-388f-4af2-99ce-bbe2aa1b31eb": "5818e8726f9c896a11a5a781d9e79490bf5d27aa07bb34fb34f22ede254fbc88",
        "stage:7f96f8ac-4f56-4f34-9195-dae7858b93f7": "b549964db19173f76c1720556b9d76e08c8a8d186768ac92667b03b05f4d4004",
        "stage:8f480b11-39d0-4912-ade7-1d5040bf1f71": "954ea2a1e6a8b5428c4178f2b616631a0bdd4551b60174670fadc1ee29f55657",
        "stageOrder": "4c49e64f198d60f8f899dc13a92ef3c31f737dd35a89760449b611a107c4b814",
      }
    `);
    expect(versionContentHash(sectionHashes)).toMatchInlineSnapshot(
      `"9e1b79bde5e64b64d9b9e1be1125fe80063cf41f9c323ab5c42422bd2387e9bc"`,
    );
  });
});
