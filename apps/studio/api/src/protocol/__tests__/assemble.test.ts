import { describe, expect, it } from 'vitest';

import { canonicalize } from '@codaco/studio-sync/apply';
import {
  assembleProtocolSections,
  ProtocolAssemblyError,
} from '@codaco/studio-sync/protocol-document';

import { emptyProtocol, sectionizeProtocol } from '../sectionize.ts';
import { baseProtocol } from './helpers.ts';

describe('assembleProtocolSections', () => {
  it('is deterministic under section-map insertion order', () => {
    const sections = sectionizeProtocol(baseProtocol());
    const entries = Object.entries(sections);
    const shuffled = Object.fromEntries([...entries].toReversed());
    expect(canonicalize(assembleProtocolSections(shuffled))).toBe(
      canonicalize(assembleProtocolSections(sections)),
    );
  });

  it('orders stages from the stageOrder section', () => {
    const sections = sectionizeProtocol(baseProtocol());
    sections.stageOrder = {
      stages: ['sociogram1', 'nameGenerator1', 'finish'],
    };
    const assembled = assembleProtocolSections(sections) as {
      stages: { id: string }[];
    };
    expect(assembled.stages.map((stage) => stage.id)).toEqual([
      'sociogram1',
      'nameGenerator1',
      'finish',
    ]);
  });

  // Studio commits a stage without the settings that hold the interface
  // text, so the assembled protocol brings that text up to date.
  it('holds the interface text for the stages it has now', () => {
    const sections = sectionizeProtocol(emptyProtocol('Study'));
    const groups = () =>
      Object.keys(
        (
          assembleProtocolSections(sections) as {
            interfaceText?: Record<string, unknown>;
          }
        ).interfaceText ?? {},
      );
    expect(groups()).toEqual(['interview']);

    sections['stage:form'] = {
      id: 'form',
      type: 'EgoForm',
      label: { en: 'About you' },
      form: { fields: [] },
    };
    sections.stageOrder = { stages: ['form', 'finish'] };
    expect(groups()).toEqual(['interview', 'forms']);

    sections.stageOrder = { stages: ['finish'] };
    delete sections['stage:form'];
    expect(groups()).toEqual(['interview']);
  });

  it('rejects a missing settings section', () => {
    const sections = sectionizeProtocol(baseProtocol());
    delete sections.settings;
    expect(() => assembleProtocolSections(sections)).toThrow(
      ProtocolAssemblyError,
    );
  });

  it('rejects a stageOrder entry with no stage section', () => {
    const sections = sectionizeProtocol(baseProtocol());
    sections.stageOrder = { stages: ['nameGenerator1', 'ghost'] };
    expect(() => assembleProtocolSections(sections)).toThrow(
      /missing stage ghost/,
    );
  });

  it('rejects a stage section absent from stageOrder', () => {
    const sections = sectionizeProtocol(baseProtocol());
    sections.stageOrder = { stages: ['nameGenerator1'] };
    expect(() => assembleProtocolSections(sections)).toThrow(
      /missing from stageOrder: sociogram1/,
    );
  });
});
