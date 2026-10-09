import { describe, expect, it } from 'vitest';

import { validateProtocol } from '@codaco/protocol-validation';
import { contentHash } from '@codaco/studio-sync/apply';
import { assembleProtocolSections } from '@codaco/studio-sync/protocol-document';
import { validateSection } from '@codaco/studio-sync/section-validation';

import {
  emptyProtocol,
  NEW_PROTOCOL_FINISH_STAGE_ID,
  sectionizeProtocol,
} from '../sectionize.ts';
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

describe('a new protocol', () => {
  // A schema 9 interview has to end at a finish stage, so a protocol with no
  // stages at all is not one validation admits.
  it('starts with the supplied finish stage and validates', async () => {
    const protocol = emptyProtocol('New study');
    expect(protocol.stages).toEqual([
      expect.objectContaining({
        id: NEW_PROTOCOL_FINISH_STAGE_ID,
        type: 'FinishSession',
        finishLabel: { en: 'Finish' },
        finishConfirmation: {
          en: 'Are you sure you want to finish the interview?',
        },
        finishedNotice: {
          en: 'This interview is finished, and its answers can no longer be changed.',
        },
        finishFailed: {
          en: 'The interview could not be finished. Please try again. If the problem continues, contact the study organizer.',
        },
        outcome: 'completed',
      }),
    ]);
    expect(protocol.interfaceText?.interview).toBeDefined();
    expect(sectionizeProtocol(protocol).settings).toMatchObject({
      interfaceText: protocol.interfaceText,
    });
    const validated = await validateProtocol(protocol);
    expect(
      validated.success,
      JSON.stringify(validated.error?.issues ?? [], null, 2),
    ).toBe(true);
    expect(sectionizeProtocol(protocol).stageOrder).toEqual({
      stages: [NEW_PROTOCOL_FINISH_STAGE_ID],
    });
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
        "settings": "9a02dc3bd1395039c988f957e0080b5321610f3732dcaac69d2999578c0e5d7d",
        "stage:finish": "be81f328aa5affc07aa5d80f80fd090920c21934337aeba90383b1d507acb1be",
        "stage:nameGenerator1": "da989aa0f95cc6223c4ae6e1e8eecd53698a900bae557d0dae58ba43948f9511",
        "stage:sociogram1": "f20a610875c24d940f59bd6d68d52e3b0453fe778d1a4af9a3a09a7926b0e3a9",
        "stageOrder": "db26c1d9b0a06b6f2eaa8ffbc16226398ec945d3ce6168f4ad1d174e0621aa57",
      }
    `);
    expect(versionContentHash(sectionHashes)).toMatchInlineSnapshot(
      `"ac0de533e4816fb53225fe076b6c3d7e94db32a4360449f230675c59a28ebac7"`,
    );
  });
});
