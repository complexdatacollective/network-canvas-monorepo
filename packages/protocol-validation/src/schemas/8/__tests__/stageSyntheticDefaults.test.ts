import { createRequire } from 'node:module';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CurrentProtocolSchema } from '../../index.ts';
import { stageSchema, type StageType } from '../stages/index.ts';
import { DEFAULT_RESPONSE_BURDEN } from '../synthetic/index.ts';

/**
 * Every stage schema supplies a `synthetic` descriptor when an author declares
 * none.
 *
 * `generateInterviews` treats a stage without one as a protocol that
 * was never parsed and refuses to generate, so a branch that quietly stopped
 * defaulting would turn a whole product's protocols away at generation time
 * rather than failing here. That has already happened once in development, a
 * descriptor landing on an Information stage's ITEM schema rather than on the
 * stage — which every hand-written check passed.
 *
 * Checked by PARSING rather than by reading the schema's shape, because the
 * three name generators resolve their descriptor in a stage-level transform
 * rather than on the field: a shape probe reports them as having no default at
 * all. The development protocol is the subject because it is the one protocol
 * that carries every stage type, is kept valid by the rest of the suite, and
 * declares no synthetic metadata of its own — so what comes out is exactly what
 * parsing put there.
 */

const require = createRequire(import.meta.url);

// A JSON fixture is an untyped boundary, crossed the way the other bundled
// protocol tests cross it.
const developmentProtocol: unknown = require('@codaco/protocols/development');

/**
 * Stages that put nothing into the network, whatever the participant does.
 *
 * Anonymisation belongs here despite asking the participant to do something:
 * the passphrase it collects is UI state that unlocks the session, and never
 * reaches any entity's attributes.
 */
const NO_DATA_STAGES = new Set<StageType>([
  'Anonymisation',
  'Information',
  'Narrative',
  'NarrativePedigree',
]);

/** The `type` literal each union branch accepts. */
const branchTypes = stageSchema.options.map((option) => {
  // A branch carrying a transform (a name generator, which resolves a default
  // count) is a pipe rather than an object.
  const node =
    option instanceof z.ZodPipe && option.in instanceof z.ZodObject
      ? option.in
      : option;
  if (!(node instanceof z.ZodObject)) {
    throw new Error('Stage branch is not an object schema');
  }
  const field: unknown = node.shape.type;
  if (!(field instanceof z.ZodLiteral)) {
    throw new Error('Stage branch has no literal type');
  }
  return String([...field.values][0]);
});

const parsed = CurrentProtocolSchema.parse(developmentProtocol);
const stagesByType = new Map(parsed.stages.map((stage) => [stage.type, stage]));

describe('synthetic defaults across every stage schema', () => {
  it('exercises every stage type the union offers', () => {
    // Without this the suite could quietly stop covering a stage — either one
    // newly added to the schema, or one dropped from the protocol.
    expect([...stagesByType.keys()].toSorted()).toEqual(
      [...branchTypes].toSorted(),
    );
  });

  it('starts from a protocol that declares no synthetic metadata', () => {
    // Everything below reads what PARSING supplied. An authored descriptor
    // would make the whole file pass without a single default existing.
    const authored = (
      developmentProtocol as { stages: Record<string, unknown>[] }
    ).stages.filter((stage) => stage.synthetic !== undefined);

    expect(authored).toEqual([]);
  });

  it.each([...stagesByType.keys()].toSorted())(
    '%s comes out carrying a descriptor',
    (type) => {
      expect(stagesByType.get(type)?.synthetic).toBeDefined();
    },
  );

  it.each([...stagesByType.keys()].toSorted())(
    '%s comes out priced at what its type costs',
    (type) => {
      // The parse-time counterpart of the type-level exhaustiveness assertion
      // in stages/index.ts: that one proves the table names every stage type,
      // this one proves every stage schema actually reaches for it. A shape
      // that forgot to carry the field would leave `undefined` here and turn
      // the accumulated burden into NaN at generation time.
      expect(stagesByType.get(type)?.synthetic.responseBurden).toBe(
        DEFAULT_RESPONSE_BURDEN[type],
      );
    },
  );

  it.each([...stagesByType.keys()].toSorted())(
    '%s says whether it generates data at all',
    (type) => {
      expect(stagesByType.get(type)?.synthetic.generatesData).toBe(
        !NO_DATA_STAGES.has(type),
      );
    },
  );

  it('names every stage that generates nothing', () => {
    // Guards the table above from being trivially satisfied by a set that has
    // drifted away from the schemas.
    const declared = [...stagesByType.values()]
      .filter((stage) => !stage.synthetic.generatesData)
      .map((stage) => stage.type)
      .toSorted();

    expect(declared).toEqual([...NO_DATA_STAGES].toSorted());
  });

  describe('the descriptors the defaults supply', () => {
    it('gives every name generator a count to draw from', () => {
      for (const type of [
        'NameGenerator',
        'NameGeneratorQuickAdd',
        'NameGeneratorRoster',
      ] as const) {
        const synthetic = stagesByType.get(type)?.synthetic;

        expect(synthetic).toEqual(
          expect.objectContaining({
            generatesData: true,
            count: expect.any(Object) as object,
          }),
        );
      }
    });

    it('gives every edge-creating stage a topology to draw from', () => {
      for (const type of [
        'DyadCensus',
        'OneToManyDyadCensus',
        'Sociogram',
        'TieStrengthCensus',
      ] as const) {
        const synthetic = stagesByType.get(type)?.synthetic;

        expect(synthetic).toEqual(
          expect.objectContaining({
            generatesData: true,
            topology: expect.any(Object) as object,
          }),
        );
      }
    });

    it('leaves a stage that generates nothing with nothing to draw', () => {
      for (const type of NO_DATA_STAGES) {
        // A response burden and nothing else: reading a narrative costs the
        // participant attention even where it leaves no trace in the network,
        // so the burden is the one field these stages still carry.
        expect(stagesByType.get(type)?.synthetic).toEqual({
          generatesData: false,
          responseBurden: DEFAULT_RESPONSE_BURDEN[type],
        });
      }
    });
  });
});
