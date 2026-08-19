import { describe, expect, it } from 'vitest';

import { canonicalize } from '@codaco/studio-sync/apply';

import { AssemblyError, assembleProtocol } from '../assemble.ts';
import { sectionizeProtocol } from '../sectionize.ts';
import { baseProtocol } from './helpers.ts';

describe('assembleProtocol', () => {
  it('is deterministic under section-map insertion order', () => {
    const sections = sectionizeProtocol(baseProtocol());
    const entries = Object.entries(sections);
    const shuffled = Object.fromEntries([...entries].toReversed());
    expect(canonicalize(assembleProtocol(shuffled))).toBe(
      canonicalize(assembleProtocol(sections)),
    );
  });

  it('orders stages from the stageOrder section', () => {
    const sections = sectionizeProtocol(baseProtocol());
    sections.stageOrder = { stages: ['sociogram1', 'nameGenerator1'] };
    const assembled = assembleProtocol(sections) as {
      stages: { id: string }[];
    };
    expect(assembled.stages.map((stage) => stage.id)).toEqual([
      'sociogram1',
      'nameGenerator1',
    ]);
  });

  it('rejects a missing settings section', () => {
    const sections = sectionizeProtocol(baseProtocol());
    delete sections.settings;
    expect(() => assembleProtocol(sections)).toThrow(AssemblyError);
  });

  it('rejects a stageOrder entry with no stage section', () => {
    const sections = sectionizeProtocol(baseProtocol());
    sections.stageOrder = { stages: ['nameGenerator1', 'ghost'] };
    expect(() => assembleProtocol(sections)).toThrow(/missing stage ghost/);
  });

  it('rejects a stage section absent from stageOrder', () => {
    const sections = sectionizeProtocol(baseProtocol());
    sections.stageOrder = { stages: ['nameGenerator1'] };
    expect(() => assembleProtocol(sections)).toThrow(
      /missing from stageOrder: sociogram1/,
    );
  });
});
