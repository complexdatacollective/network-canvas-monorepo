import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { CommitSectionInputSchema } from '@codaco/studio-rpc';
import { applyCommand, type Command } from '@codaco/studio-sync/apply';

// @codaco/studio-rpc carries no test runner of its own; its command schema is
// exercised here, in the suite of the deployable that validates every commit
// against it.
//
// A section command addresses either a top-level key (`"prompts"`) or a path of
// object keys into the document (`["nodeConfig", "form"]`). The path form is
// newer than the deployed servers that will receive it, and commands outlive
// the release that wrote them: they are kept in `command_log` and replayed. So
// what a server built BEFORE nested addressing does with a nested command is a
// property this boundary owes, and the answer has to be "refuses it" rather
// than "applies it somewhere else".

const COMMIT_INPUT = {
  teamId: '00000000-0000-4000-8000-000000000001',
  protocolId: '00000000-0000-4000-8000-000000000002',
  draftId: '00000000-0000-4000-8000-000000000003',
  sectionId: 'stage:stage-1',
  clientId: '00000000-0000-4000-8000-000000000004',
  leaseEpoch: '1',
  clientSequence: '1',
};

const commit = (commands: readonly unknown[]) => ({
  ...COMMIT_INPUT,
  commands,
});

/**
 * The command schema as it stood before a command could address a nested path,
 * frozen here rather than imported: what a deployed older server accepts is a
 * fact about the code it was built from, and a copy that moved with this one
 * would stop being able to state it.
 */
const LegacyCommandSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('set'), key: z.string(), value: z.unknown() }),
  z.object({ op: z.literal('unset'), key: z.string() }),
  z.object({
    op: z.literal('insertItem'),
    key: z.string(),
    index: z.number().int().nonnegative(),
    item: z.unknown(),
  }),
  z.object({
    op: z.literal('removeItem'),
    key: z.string(),
    index: z.number().int().nonnegative(),
  }),
  z.object({
    op: z.literal('moveItem'),
    key: z.string(),
    from: z.number().int().nonnegative(),
    to: z.number().int().nonnegative(),
  }),
]);

/** Every command a list editor emits for a list held at a top-level key. */
const TOP_LEVEL_COMMANDS: Command[] = [
  { op: 'set', key: 'label', value: 'People you know' },
  { op: 'unset', key: 'quickAdd' },
  { op: 'insertItem', key: 'prompts', index: 0, item: { id: 'p1' } },
  { op: 'removeItem', key: 'prompts', index: 0 },
  { op: 'moveItem', key: 'prompts', from: 1, to: 0 },
];

/** The same five, addressed at a Family Pedigree's family-member form. */
const NESTED_COMMANDS: Command[] = [
  { op: 'set', key: ['nodeConfig', 'form'], value: [] },
  { op: 'unset', key: ['nodeConfig', 'form'] },
  {
    op: 'insertItem',
    key: ['nodeConfig', 'form'],
    index: 0,
    item: { variable: 'fm_name' },
  },
  { op: 'removeItem', key: ['nodeConfig', 'form'], index: 0 },
  { op: 'moveItem', key: ['nodeConfig', 'form'], from: 1, to: 0 },
];

describe('a command a server built before nested addressing receives', () => {
  it('accepts every command the editors could already emit, unchanged', () => {
    for (const command of TOP_LEVEL_COMMANDS) {
      expect(LegacyCommandSchema.safeParse(command).success).toBe(true);
    }
  });

  it('refuses a nested one outright rather than applying it elsewhere', () => {
    // The reason the path form is an array and not a dotted string. A
    // `"nodeConfig.form"` would parse here as a top-level key of that name,
    // and the old apply engine would write the list to a key the document does
    // not have — silently, and permanently, since the log is replayed.
    for (const command of NESTED_COMMANDS) {
      expect(LegacyCommandSchema.safeParse(command).success).toBe(false);
    }
    expect(
      LegacyCommandSchema.safeParse({
        op: 'insertItem',
        key: 'nodeConfig.form',
        index: 0,
        item: {},
      }).success,
    ).toBe(true);
  });
});

describe('the commit input this server validates against', () => {
  it('takes both forms of address', () => {
    expect(
      CommitSectionInputSchema.safeParse(commit(TOP_LEVEL_COMMANDS)).success,
    ).toBe(true);
    expect(
      CommitSectionInputSchema.safeParse(commit(NESTED_COMMANDS)).success,
    ).toBe(true);
  });

  it('refuses a path the apply engine would refuse to follow', () => {
    // Rejected at the boundary rather than part-way through the commit
    // transaction, which is where `ApplyError` would surface otherwise — after
    // the draft head has been locked, and as a fault rather than a bad request.
    const tooDeep = Array.from({ length: 17 }, (_, depth) => `k${depth}`);
    const refused = [
      { op: 'set', key: [], value: 1 },
      { op: 'set', key: [''], value: 1 },
      { op: 'set', key: ['nodeConfig', '__proto__'], value: 1 },
      { op: 'set', key: tooDeep, value: 1 },
    ];
    for (const command of refused) {
      expect(
        CommitSectionInputSchema.safeParse(commit([command])).success,
      ).toBe(false);
    }
  });

  it('refuses the same paths written as a bare key', () => {
    // A one-segment path is written as the plain string — `commandTarget`
    // answers `"prompts"`, not `["prompts"]` — so the string form carries every
    // one-segment address there is, and the same two rules have to hold of it.
    // Applying them only to the array form left `""` and `"__proto__"` through
    // the boundary to `targetPath`, which throws inside the commit: after the
    // draft head is locked, and as an unclassified server fault rather than the
    // bad request it is.
    for (const key of ['', '__proto__', 'constructor', 'prototype']) {
      expect(
        CommitSectionInputSchema.safeParse(
          commit([{ op: 'set', key, value: 1 }]),
        ).success,
      ).toBe(false);
    }
    // An ordinary key still parses, whichever form it is written in.
    expect(
      CommitSectionInputSchema.safeParse(
        commit([{ op: 'set', key: 'prompts', value: [] }]),
      ).success,
    ).toBe(true);
  });

  it('hands the apply engine exactly the address it parsed', () => {
    // The parse must not reshape an address on its way through: a schema that
    // coerced the array to a string would put the boundary and the engine into
    // disagreement about where a command lands.
    const [insert] = CommitSectionInputSchema.parse(
      commit([NESTED_COMMANDS[2]]),
    ).commands;

    expect(
      applyCommand({ nodeConfig: { type: 'family_member' } }, insert!),
    ).toEqual({
      nodeConfig: { type: 'family_member', form: [{ variable: 'fm_name' }] },
    });
  });
});
