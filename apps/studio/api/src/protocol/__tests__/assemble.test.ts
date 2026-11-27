import { describe, expect, it } from 'vitest';

import { createEmptyProtocol } from '@codaco/protocol-builder-core/empty-protocol';
import { canonicalize } from '@codaco/studio-sync/apply';
import {
  assembleProtocolSections,
  ProtocolAssemblyError,
} from '@codaco/studio-sync/protocol-document';

import { sectionizeProtocol } from '../sectionize.ts';
import { BASE_PROTOCOL_IDS, baseProtocol } from './helpers.ts';

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
      stages: [
        BASE_PROTOCOL_IDS.sociogram,
        BASE_PROTOCOL_IDS.nameGenerator,
        BASE_PROTOCOL_IDS.finish,
      ],
    };
    const assembled = assembleProtocolSections(sections) as {
      stages: { id: string }[];
    };
    expect(assembled.stages.map((stage) => stage.id)).toEqual([
      BASE_PROTOCOL_IDS.sociogram,
      BASE_PROTOCOL_IDS.nameGenerator,
      BASE_PROTOCOL_IDS.finish,
    ]);
  });

  // Studio commits a stage without the settings that hold the interface
  // text, so the assembled protocol brings that text up to date: it holds the
  // researcher's own wording for the entries the stages it has now show, and
  // none of Network Canvas's, which the interview shows by itself.
  it('holds the interface text for the stages it has now', () => {
    const protocol = createEmptyProtocol({ name: 'Study' });
    const finishStageId = protocol.stages[0]?.id;
    const sections = sectionizeProtocol(protocol);
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
      form: { content: { en: '' }, fields: [] },
    };
    sections.stageOrder = { stages: ['form', finishStageId] };
    // An Ego Form can ask whether to discard changes.
    expect(held()).toEqual({
      forms: { discardChangesTitle: { en: 'Throw this away?' } },
    });

    sections.stageOrder = { stages: [finishStageId] };
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
    sections.stageOrder = {
      stages: [BASE_PROTOCOL_IDS.nameGenerator, 'ghost'],
    };
    expect(() => assembleProtocolSections(sections)).toThrow(
      /missing stage ghost/,
    );
  });

  it('rejects a stage section absent from stageOrder', () => {
    const sections = sectionizeProtocol(baseProtocol());
    sections.stageOrder = { stages: [BASE_PROTOCOL_IDS.nameGenerator] };
    expect(() => assembleProtocolSections(sections)).toThrow(
      new RegExp(`missing from stageOrder: ${BASE_PROTOCOL_IDS.sociogram}`),
    );
  });
});
