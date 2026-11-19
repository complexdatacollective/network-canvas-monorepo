import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  type CurrentProtocol,
  ProtocolObjectIdSchema,
} from '@codaco/protocol-validation';
import {
  makeProtocol,
  WELCOME_STAGE_ID,
  NAMES_STAGE_ID,
} from '~/protocolReview/__tests__/fixtures';

import {
  carryIntoOpenStage,
  registerOpenStage,
  stageChangeRewrite,
} from '../openStageChange';

const P1 = ProtocolObjectIdSchema.parse('0c1d2e3f-4a5b-4c6d-8e7f-000000000001');
const P2 = ProtocolObjectIdSchema.parse('0c1d2e3f-4a5b-4c6d-8e7f-000000000002');
const P3 = ProtocolObjectIdSchema.parse('0c1d2e3f-4a5b-4c6d-8e7f-000000000003');
const MINE = ProtocolObjectIdSchema.parse(
  '0c1d2e3f-4a5b-4c6d-8e7f-000000000004',
);
const FIELD_A = ProtocolObjectIdSchema.parse(
  '0c1d2e3f-4a5b-4c6d-8e7f-00000000000a',
);
const FIELD_B = ProtocolObjectIdSchema.parse(
  '0c1d2e3f-4a5b-4c6d-8e7f-00000000000b',
);

describe('stageChangeRewrite', () => {
  const stored = () => ({
    label: { en: 'Names' },
    behaviours: { minNodes: 1 },
    prompts: [
      { id: P1, text: { en: 'Name people' } },
      { id: P2, text: { en: 'Name more' } },
    ],
    form: {
      fields: [
        { id: FIELD_A, variable: 'a' },
        { id: FIELD_B, variable: 'b' },
      ],
    },
  });

  it('writes what the change wrote and keeps what the draft holds everywhere else', () => {
    const before = stored();
    const after = {
      ...stored(),
      prompts: [
        { id: P1, text: { en: 'Name everyone' } },
        { id: P2, text: { en: 'Name more' } },
      ],
    };
    const draft = {
      ...stored(),
      label: { en: 'Unsaved label' },
      prompts: [
        { id: P1, text: { en: 'Name people' } },
        { id: P2, text: { en: 'Unsaved prompt' } },
      ],
      onlyInDraft: true,
    };
    expect(stageChangeRewrite(before, after)(draft)).toEqual({
      ...draft,
      prompts: [
        { id: P1, text: { en: 'Name everyone' } },
        { id: P2, text: { en: 'Unsaved prompt' } },
      ],
    });
  });

  it('leaves a copy that already holds the change as it is', () => {
    const before = stored();
    const after = { ...stored(), label: { en: 'Better' } };
    expect(stageChangeRewrite(before, after)(after)).toEqual(after);
  });

  it('lets the change win where the draft wrote the same place', () => {
    const before = stored();
    const after = { ...stored(), label: { en: 'From the fix' } };
    const draft = { ...stored(), label: { en: 'Unsaved' } };
    expect(stageChangeRewrite(before, after)(draft).label).toEqual({
      en: 'From the fix',
    });
  });

  it('adds and removes keys the change added and removed', () => {
    const before = stored();
    const { behaviours: _behaviours, ...rest } = stored();
    const after = { ...rest, minNodesNotice: { en: 'Name one.' } };
    const next = stageChangeRewrite(before, after)(stored());
    expect(next).not.toHaveProperty('behaviours');
    expect(next.minNodesNotice).toEqual({ en: 'Name one.' });
  });

  it('adds, removes and reorders members with ids, keeping unsaved edits to those that stay', () => {
    const before = stored();
    const after = {
      ...stored(),
      prompts: [
        { id: P3, text: { en: 'New first' } },
        { id: P2, text: { en: 'Name more' } },
      ],
    };
    const draft = {
      ...stored(),
      prompts: [
        { id: P1, text: { en: 'Name people' } },
        { id: P2, text: { en: 'Unsaved prompt' } },
        { id: MINE, text: { en: 'Added in the draft' } },
      ],
    };
    expect(stageChangeRewrite(before, after)(draft).prompts).toEqual([
      { id: P3, text: { en: 'New first' } },
      { id: P2, text: { en: 'Unsaved prompt' } },
      { id: MINE, text: { en: 'Added in the draft' } },
    ]);
  });

  it('does not bring back a member the draft has deleted', () => {
    const before = stored();
    const after = {
      ...stored(),
      prompts: [
        { id: P2, text: { en: 'Name more' } },
        { id: P1, text: { en: 'Name people' } },
      ],
    };
    const draft = {
      ...stored(),
      prompts: [{ id: P2, text: { en: 'Name more' } }],
    };
    expect(stageChangeRewrite(before, after)(draft).prompts).toEqual([
      { id: P2, text: { en: 'Name more' } },
    ]);
  });

  it('keeps an unsaved edit to one field when the change edits another, matching fields by id', () => {
    const before = {
      form: {
        fields: [
          { id: FIELD_A, variable: 'a', prompt: 'A?' },
          { id: FIELD_B, variable: 'b', prompt: 'B?' },
        ],
      },
    };
    const after = {
      form: {
        fields: [
          { id: FIELD_A, variable: 'a', prompt: 'A, now?' },
          { id: FIELD_B, variable: 'b', prompt: 'B?' },
        ],
      },
    };
    const draft = {
      form: {
        fields: [
          { id: FIELD_A, variable: 'a', prompt: 'A?' },
          { id: FIELD_B, variable: 'b', prompt: 'B, edited' },
        ],
      },
    };
    expect(stageChangeRewrite(before, after)(draft).form).toEqual({
      fields: [
        { id: FIELD_A, variable: 'a', prompt: 'A, now?' },
        { id: FIELD_B, variable: 'b', prompt: 'B, edited' },
      ],
    });
  });

  it('matches answer options by the value they stand for', () => {
    const before = {
      options: [
        { label: 'Yes', value: 1 },
        { label: 'No', value: 0 },
      ],
    };
    const after = {
      options: [
        { label: 'Yes, always', value: 1 },
        { label: 'No', value: 0 },
      ],
    };
    const draft = {
      options: [
        { label: 'Yes', value: 1 },
        { label: 'No, never', value: 0 },
      ],
    };
    expect(stageChangeRewrite(before, after)(draft).options).toEqual([
      { label: 'Yes, always', value: 1 },
      { label: 'No, never', value: 0 },
    ]);
  });

  it('does not match members of a list nothing identifies by their position', () => {
    const before = { items: [{ text: 'one' }, { text: 'two' }] };
    const after = { items: [{ text: 'ONE' }, { text: 'two' }] };
    const draft = { items: [{ text: 'one' }, { text: 'two, edited' }] };
    expect(stageChangeRewrite(before, after)(draft).items).toEqual(draft.items);
  });

  it('merges a list of plain values as a set, keeping what the draft added', () => {
    const before = { matchProperties: ['name', 'age'] };
    const after = { matchProperties: ['name', 'email'] };
    const draft = { matchProperties: ['name', 'age', 'nickname'] };
    expect(stageChangeRewrite(before, after)(draft).matchProperties).toEqual([
      'name',
      'email',
      'nickname',
    ]);
  });

  it('keeps the draft’s own list when nothing matches its members to the change', () => {
    const before = { items: [{ text: 'one' }, { text: 'two' }] };
    const after = { items: [{ text: 'ONE' }] };
    const draft = {
      items: [{ text: 'one' }, { text: 'two' }, { text: 'three' }],
    };
    expect(stageChangeRewrite(before, after)(draft).items).toEqual(draft.items);
    // A list the draft has not changed takes the change.
    expect(stageChangeRewrite(before, after)(before).items).toEqual(
      after.items,
    );
  });

  it('removes a field the change removed, keeping the rest of the form as the draft holds it', () => {
    const before = stored();
    const after = {
      ...stored(),
      form: { fields: [{ id: FIELD_A, variable: 'a' }] },
    };
    const draft = {
      ...stored(),
      form: { ...stored().form, title: 'Kept' },
    };
    expect(stageChangeRewrite(before, after)(draft).form).toEqual({
      fields: [{ id: FIELD_A, variable: 'a' }],
      title: 'Kept',
    });
  });
});

describe('carryIntoOpenStage', () => {
  let unregister: (() => void) | undefined;

  afterEach(() => {
    unregister?.();
    unregister = undefined;
  });

  const retitled = (protocol: CurrentProtocol, stageId: string) => ({
    ...protocol,
    stages: protocol.stages.map((stage) =>
      stage.id === stageId ? { ...stage, label: { en: 'Changed' } } : stage,
    ),
  });

  it('hands the open stage the change to it, and nothing for a change elsewhere', () => {
    const carry = vi.fn();
    unregister = registerOpenStage(WELCOME_STAGE_ID, carry);
    const protocol = makeProtocol();
    carryIntoOpenStage(protocol, retitled(protocol, NAMES_STAGE_ID));
    expect(carry).not.toHaveBeenCalled();
    carryIntoOpenStage(protocol, retitled(protocol, WELCOME_STAGE_ID));
    expect(carry).toHaveBeenCalledTimes(1);
    const rewrite = carry.mock.calls[0]?.[0] as (
      fields: Record<string, unknown>,
    ) => Record<string, unknown>;
    expect(rewrite({ label: { en: 'Welcome' }, mine: 1 })).toEqual({
      label: { en: 'Changed' },
      mine: 1,
    });
  });

  it('carries nothing with no editor open, or for a stage the change removed', () => {
    const protocol = makeProtocol();
    expect(() =>
      carryIntoOpenStage(protocol, retitled(protocol, WELCOME_STAGE_ID)),
    ).not.toThrow();
    const carry = vi.fn();
    unregister = registerOpenStage(WELCOME_STAGE_ID, carry);
    carryIntoOpenStage(protocol, {
      ...protocol,
      stages: protocol.stages.filter((stage) => stage.id !== WELCOME_STAGE_ID),
    });
    expect(carry).not.toHaveBeenCalled();
    unregister();
    carryIntoOpenStage(protocol, retitled(protocol, WELCOME_STAGE_ID));
    expect(carry).not.toHaveBeenCalled();
  });
});
