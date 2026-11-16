import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentProtocol } from '@codaco/protocol-validation';
import { makeProtocol } from '~/protocolReview/__tests__/fixtures';

import {
  carryIntoOpenStage,
  registerOpenStage,
  stageChangeRewrite,
} from '../openStageChange';

describe('stageChangeRewrite', () => {
  const stored = () => ({
    label: { en: 'Names' },
    behaviours: { minNodes: 1 },
    prompts: [
      { id: 'p1', text: { en: 'Name people' } },
      { id: 'p2', text: { en: 'Name more' } },
    ],
    form: { fields: [{ variable: 'a' }, { variable: 'b' }] },
  });

  it('writes what the change wrote and keeps what the draft holds everywhere else', () => {
    const before = stored();
    const after = {
      ...stored(),
      prompts: [
        { id: 'p1', text: { en: 'Name everyone' } },
        { id: 'p2', text: { en: 'Name more' } },
      ],
    };
    const draft = {
      ...stored(),
      label: { en: 'Unsaved label' },
      prompts: [
        { id: 'p1', text: { en: 'Name people' } },
        { id: 'p2', text: { en: 'Unsaved prompt' } },
      ],
      onlyInDraft: true,
    };
    expect(stageChangeRewrite(before, after)(draft)).toEqual({
      ...draft,
      prompts: [
        { id: 'p1', text: { en: 'Name everyone' } },
        { id: 'p2', text: { en: 'Unsaved prompt' } },
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
        { id: 'p3', text: { en: 'New first' } },
        { id: 'p2', text: { en: 'Name more' } },
      ],
    };
    const draft = {
      ...stored(),
      prompts: [
        { id: 'p1', text: { en: 'Name people' } },
        { id: 'p2', text: { en: 'Unsaved prompt' } },
        { id: 'mine', text: { en: 'Added in the draft' } },
      ],
    };
    expect(stageChangeRewrite(before, after)(draft).prompts).toEqual([
      { id: 'p3', text: { en: 'New first' } },
      { id: 'p2', text: { en: 'Unsaved prompt' } },
      { id: 'mine', text: { en: 'Added in the draft' } },
    ]);
  });

  it('does not bring back a member the draft has deleted', () => {
    const before = stored();
    const after = {
      ...stored(),
      prompts: [
        { id: 'p2', text: { en: 'Name more' } },
        { id: 'p1', text: { en: 'Name people' } },
      ],
    };
    const draft = {
      ...stored(),
      prompts: [{ id: 'p2', text: { en: 'Name more' } }],
    };
    expect(stageChangeRewrite(before, after)(draft).prompts).toEqual([
      { id: 'p2', text: { en: 'Name more' } },
    ]);
  });

  it('takes a list whose members have no ids as the change left it', () => {
    const before = stored();
    const after = { ...stored(), form: { fields: [{ variable: 'a' }] } };
    const draft = {
      ...stored(),
      form: { fields: [{ variable: 'a' }, { variable: 'b' }], title: 'Kept' },
    };
    expect(stageChangeRewrite(before, after)(draft).form).toEqual({
      fields: [{ variable: 'a' }],
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
    unregister = registerOpenStage('welcome', carry);
    const protocol = makeProtocol();
    carryIntoOpenStage(protocol, retitled(protocol, 'names'));
    expect(carry).not.toHaveBeenCalled();
    carryIntoOpenStage(protocol, retitled(protocol, 'welcome'));
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
      carryIntoOpenStage(protocol, retitled(protocol, 'welcome')),
    ).not.toThrow();
    const carry = vi.fn();
    unregister = registerOpenStage('welcome', carry);
    carryIntoOpenStage(protocol, {
      ...protocol,
      stages: protocol.stages.filter((stage) => stage.id !== 'welcome'),
    });
    expect(carry).not.toHaveBeenCalled();
    unregister();
    carryIntoOpenStage(protocol, retitled(protocol, 'welcome'));
    expect(carry).not.toHaveBeenCalled();
  });
});
