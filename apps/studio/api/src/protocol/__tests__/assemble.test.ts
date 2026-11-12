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
  // text, so the assembled protocol brings that text up to date: it holds the
  // researcher's own wording for the entries the stages it has now show, and
  // none of Network Canvas's, which the interview shows by itself.
  it('holds the interface text for the stages it has now', () => {
    const sections = sectionizeProtocol(emptyProtocol('Study'));
    sections.settings = {
      ...sections.settings,
      interfaceText: {
        forms: { discardChangesTitle: { en: 'Throw this away?' } },
        buttons: { cancel: { en: 'Cancel' } },
      },
    };
    const held = () =>
      (
        assembleProtocolSections(sections) as {
          interfaceText?: Record<string, unknown>;
        }
      ).interfaceText;
    // No stage shows the forms group, and Cancel reads as Network Canvas's.
    expect(held()).toBeUndefined();

    sections['stage:form'] = {
      id: 'form',
      type: 'EgoForm',
      label: { en: 'About you' },
      form: { fields: [] },
    };
    sections.stageOrder = { stages: ['form', 'finish'] };
    // An Ego Form can ask whether to discard changes.
    expect(held()).toEqual({
      forms: { discardChangesTitle: { en: 'Throw this away?' } },
    });

    sections.stageOrder = { stages: ['finish'] };
    delete sections['stage:form'];
    expect(held()).toBeUndefined();
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
