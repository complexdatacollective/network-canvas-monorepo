import { beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { stageSchema } from '@codaco/protocol-validation';

import { buildSyntheticPayload } from '../helpers/synthetic-payload.js';
import { ALL_SUITES } from './all-scenarios.js';
import { OPTION_INVENTORY } from './option-inventory.js';
import { sharedSuiteClaims } from './shared-claims.js';

/**
 * Proves, per interface stage type, whether the protocol-validation Zod schema
 * ACCEPTS a stage-level `skipLogic` and a stage-level `filter`. This is the
 * schema-truth that must back every `<Interface>:skipLogic` /
 * `<Interface>:filter` claim in option-inventory.ts and shared-claims.ts.
 *
 * For each suite we build its smoke scenario's real protocol (validated by
 * CurrentProtocolSchema inside buildSyntheticPayload), extract the stage config
 * for the suite's interfaceType, then re-parse that config — unmodified, then
 * with a minimal skipLogic, then with a minimal filter — against the matching
 * member of the `stageSchema` discriminated union. Non-authorable interface
 * types (engine-appended stages with no schema-8 definition, e.g. FinishSession,
 * and the synthetic CrossCutting suite) carry neither key by construction.
 */

// A minimal, shape-valid FilterInput (type-level EXISTS rule). The stage schema
// validates filter/skipLogic SHAPE only — it does not cross-check the rule's
// `type` id against the codebook (that happens in the protocol-level
// superRefine, which we deliberately do not exercise here), so any node type id
// (or a plausible placeholder) is accepted.
const minFilter = (nodeTypeId: string) =>
  ({
    join: 'OR',
    rules: [
      {
        id: 'r',
        type: 'node',
        options: { type: nodeTypeId, operator: 'EXISTS' },
      },
    ],
  }) as const;

const minSkip = (nodeTypeId: string) =>
  ({
    action: 'SKIP',
    filter: minFilter(nodeTypeId),
  }) as const;

// Copied from coverage-manifest.test.ts: peel Optional/Nullable/pipe wrappers
// down to the underlying object schema.
const unwrap = (schema: z.ZodType): z.ZodType => {
  let current = schema;
  for (;;) {
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap() as z.ZodType;
      continue;
    }
    if ('in' in current && current.in instanceof z.ZodType) {
      current = current.in;
      continue;
    }
    return current;
  }
};

type StageSchemaOption = {
  /** the union member schema, used to safeParse a full stage config */
  schema: z.ZodType;
  /** whether the schema object declares a top-level `filter` key */
  definesFilter: boolean;
};

// Index the stageSchema union members by their `type` literal (same walk as
// coverage-manifest). Only authorable stages appear here.
const buildOptionIndex = (): Map<string, StageSchemaOption> => {
  const options: readonly z.ZodType[] =
    stageSchema instanceof z.ZodUnion ? stageSchema.options : [];
  const index = new Map<string, StageSchemaOption>();
  for (const option of options) {
    const objectSchema = unwrap(option);
    if (!(objectSchema instanceof z.ZodObject)) continue;
    const shape = objectSchema.shape as Record<string, z.ZodType>;
    const typeField = shape.type;
    const literal =
      typeField instanceof z.ZodLiteral ? String(typeField.value) : undefined;
    if (!literal) continue;
    index.set(literal, { schema: option, definesFilter: 'filter' in shape });
  }
  return index;
};

type SupportRow = {
  interfaceType: string;
  /** an authorable stage of this type exists in the built protocol */
  authorable: boolean;
  /** unmodified stage config validates against its schema member (control) */
  controlParses: boolean;
  /** schema member declares a top-level `filter` key (null when not authorable) */
  schemaDefinesFilter: boolean | null;
  acceptsSkipLogic: boolean;
  acceptsFilter: boolean;
};

const computeMatrix = (): SupportRow[] => {
  const optionIndex = buildOptionIndex();

  return ALL_SUITES.map((suite): SupportRow => {
    const iface = suite.interfaceType;
    const smoke = suite.scenarios.find((s) => s.smoke);
    if (!smoke) {
      throw new Error(`${iface} has no smoke scenario`);
    }

    const { protocol } = buildSyntheticPayload(smoke.build(), {
      protocolName: 'schema-support',
      assets: smoke.assets,
    });

    const stageConfig = protocol.stages.find((s) => s.type === iface);
    const option = optionIndex.get(iface);

    // Non-authorable interfaceType (no stage of this type in the built
    // protocol, or no schema member): it cannot carry either key.
    if (!stageConfig || !option) {
      return {
        interfaceType: iface,
        authorable: false,
        controlParses: false,
        schemaDefinesFilter: null,
        acceptsSkipLogic: false,
        acceptsFilter: false,
      };
    }

    const nodeTypeId =
      Object.keys(protocol.codebook.node ?? {})[0] ?? 'placeholder-node-type';

    return {
      interfaceType: iface,
      authorable: true,
      controlParses: option.schema.safeParse(stageConfig).success,
      schemaDefinesFilter: option.definesFilter,
      acceptsSkipLogic: option.schema.safeParse({
        ...stageConfig,
        skipLogic: minSkip(nodeTypeId),
      }).success,
      acceptsFilter: option.schema.safeParse({
        ...stageConfig,
        filter: minFilter(nodeTypeId),
      }).success,
    };
  });
};

describe('stage config schema support (skipLogic / filter)', () => {
  let matrix: SupportRow[] = [];

  beforeAll(() => {
    matrix = computeMatrix();
  });

  it('prints the observed skipLogic / filter support matrix', () => {
    console.table(
      matrix.map((r) => ({
        interfaceType: r.interfaceType,
        authorable: r.authorable,
        controlParses: r.authorable ? r.controlParses : '-',
        schemaDefinesFilter: r.schemaDefinesFilter ?? '-',
        acceptsSkipLogic: r.acceptsSkipLogic,
        acceptsFilter: r.acceptsFilter,
      })),
    );

    expect(matrix).toHaveLength(ALL_SUITES.length);
  });

  it('every skipLogic / filter inventory + shared claim is backed by schema acceptance', () => {
    const claimed = new Set<string>(sharedSuiteClaims);
    for (const [iface, keys] of Object.entries(OPTION_INVENTORY)) {
      for (const key of keys) {
        if (key === 'skipLogic' || key === 'filter') {
          claimed.add(`${iface}:${key}`);
        }
      }
    }
    const unbacked: string[] = [];
    for (const claim of claimed) {
      const splitAt = claim.indexOf(':');
      const iface = claim.slice(0, splitAt);
      const key = claim.slice(splitAt + 1);
      if (key !== 'skipLogic' && key !== 'filter') continue;
      const row = matrix.find((r) => r.interfaceType === iface);
      if (!row) continue; // interface not in ALL_SUITES; nothing to compare
      const accepted =
        key === 'skipLogic' ? row.acceptsSkipLogic : row.acceptsFilter;
      if (!accepted) unbacked.push(claim);
    }
    // A claim here that the schema rejects is a bogus config key (the former
    // `FinishSession:skipLogic` was exactly this) — fail rather than warn.
    expect(
      unbacked,
      `inventory/shared claims NOT backed by schema acceptance: ${unbacked.join(', ')}`,
    ).toEqual([]);
  });

  it('control: every authorable stage config validates unmodified', () => {
    const failures = matrix
      .filter((r) => r.authorable && !r.controlParses)
      .map((r) => r.interfaceType);
    expect(
      failures,
      `unmodified config failed to parse (extraction is wrong): ${failures.join(', ')}`,
    ).toEqual([]);
  });

  it('every authorable stage type accepts stage-level skipLogic', () => {
    const rejecting = matrix
      .filter((r) => r.authorable && !r.acceptsSkipLogic)
      .map((r) => r.interfaceType);
    expect(
      rejecting,
      `authorable stage types that unexpectedly REJECT skipLogic: ${rejecting.join(', ')}`,
    ).toEqual([]);
  });

  it('filter acceptance is consistent with the stage schema defining a filter key', () => {
    const inconsistent = matrix
      .filter((r) => r.authorable && r.acceptsFilter !== r.schemaDefinesFilter)
      .map(
        (r) =>
          `${r.interfaceType} (accepts=${r.acceptsFilter}, definesKey=${r.schemaDefinesFilter})`,
      );
    expect(
      inconsistent,
      `filter acceptance diverged from schema filter-key presence: ${inconsistent.join(', ')}`,
    ).toEqual([]);
  });

  it('non-authorable interface types carry neither skipLogic nor filter', () => {
    const nonAuthorable = matrix.filter((r) => !r.authorable);
    // FinishSession (engine-appended) and CrossCutting (synthetic suite) have
    // no schema-8 stage definition, so an author cannot attach either key.
    expect(nonAuthorable.map((r) => r.interfaceType).toSorted()).toEqual([
      'CrossCutting',
      'FinishSession',
    ]);
    for (const row of nonAuthorable) {
      expect(row.acceptsSkipLogic).toBe(false);
      expect(row.acceptsFilter).toBe(false);
    }
  });
});
