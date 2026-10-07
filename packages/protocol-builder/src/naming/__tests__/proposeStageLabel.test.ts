import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  type ProtocolBuilderProtocolContext,
  protocolContextFromSections,
} from '../../protocol-context.ts';
import { proposeStageLabel } from '../proposeStageLabel.ts';

const informationStage = (
  id: string,
  label: Readonly<Record<string, string>>,
): SectionDoc => ({
  id,
  type: 'Information',
  label,
  title: label,
  items: [],
});

/**
 * A protocol context built the way a host produces one — from section
 * documents, through the package's own reader — rather than assembled by hand.
 * A proposal reads the codebook, the asset manifest and the stage order, and a
 * hand-built context could hold a shape no host can serve.
 */
const contextWith = (
  sections: Readonly<Record<string, SectionDoc>> = {},
): ProtocolBuilderProtocolContext =>
  protocolContextFromSections({
    [sectionId({ kind: 'settings' })]: {
      localization: { defaultLocale: 'en', locales: ['en', 'es'] },
    },
    [sectionId({ kind: 'stageOrder' })]: { stages: [] },
    [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
      name: 'Person',
      label: { en: 'Person' },
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        diabetes: {
          name: 'Diabetes',
          label: 'Diabetes',
          type: 'boolean',
        },
        asthma: { name: 'Asthma', label: 'Asthma', type: 'boolean' },
      },
    },
    [sectionId({ kind: 'codebookEdge', typeId: 'friendship' })]: {
      name: 'Friendship',
      label: { en: 'Friendship' },
      variables: {
        closeness: {
          name: 'Closeness',
          label: 'Closeness',
          type: 'scalar',
        },
      },
    },
    ...sections,
  });

const ordered = (...stages: SectionDoc[]): Record<string, SectionDoc> => ({
  [sectionId({ kind: 'stageOrder' })]: {
    stages: stages.map((stage) => stage.id),
  },
  ...Object.fromEntries(
    stages.map((stage) => [
      sectionId({ kind: 'stage', stageId: String(stage.id) }),
      stage,
    ]),
  ),
});

describe('proposeStageLabel', () => {
  it('names a stage after its interface when nothing else is decided', () => {
    expect(
      proposeStageLabel(
        { id: 'stage-1', type: 'NameGenerator' },
        contextWith(),
      ),
    ).toBe('Form Name Generator');
  });

  it('refines the name from the subject the stage collects', () => {
    expect(
      proposeStageLabel(
        {
          id: 'stage-1',
          type: 'NameGenerator',
          subject: { entity: 'node', type: 'person' },
        },
        contextWith(),
      ),
    ).toBe('Person Form Name Generator');
  });

  it('qualifies a name generator by where its panels draw their people from', () => {
    expect(
      proposeStageLabel(
        {
          id: 'stage-1',
          type: 'NameGenerator',
          panels: [{ dataSource: 'existing' }, { dataSource: 'roster-asset' }],
        },
        contextWith(),
      ),
    ).toBe('Form Name Generator with Panels');
  });

  it('qualifies an Information stage from the asset manifest', () => {
    expect(
      proposeStageLabel(
        {
          id: 'stage-1',
          type: 'Information',
          items: [
            { id: 'item-1', type: 'asset', content: 'asset-video' },
            { id: 'item-2', type: 'asset', content: 'asset-image' },
            { id: 'item-3', type: 'text', content: { en: 'Some prose' } },
          ],
        },
        contextWith({
          [sectionId({ kind: 'assets' })]: {
            'asset-video': {
              name: 'A film',
              type: 'video',
              source: 'film.mp4',
            },
            'asset-image': {
              name: 'A photo',
              type: 'image',
              source: 'photo.png',
            },
          },
        }),
      ),
    ).toBe('Information with Image & Video');
  });

  it('avoids a name another stage in the interview already has', () => {
    expect(
      proposeStageLabel(
        { id: 'stage-new', type: 'Information' },
        contextWith(
          ordered(informationStage('stage-other', { en: 'Information' })),
        ),
      ),
    ).toBe('Information #2');
  });

  /**
   * A proposal is written as the default-language translation, so only that
   * translation of another stage's name can collide with it.
   */
  it('compares names in the default language only', () => {
    expect(
      proposeStageLabel(
        { id: 'stage-new', type: 'Information' },
        contextWith(
          ordered(
            informationStage('stage-translated', {
              en: 'About the study',
              es: 'Information',
            }),
          ),
        ),
      ),
    ).toBe('Information');
    expect(
      proposeStageLabel(
        { id: 'stage-new', type: 'Information' },
        contextWith(
          ordered(
            informationStage('stage-other', {
              en: 'Information',
              es: 'Información',
            }),
          ),
        ),
      ),
    ).toBe('Information #2');
  });

  /**
   * A host that has already written the stage into the protocol would
   * otherwise have every proposal collide with the stage's own last accepted
   * name and come back suffixed ` #2`, then ` #3`.
   */
  it('does not collide a stage with the name it already holds', () => {
    expect(
      proposeStageLabel(
        { id: 'stage-edited', type: 'Information' },
        contextWith(
          ordered(
            informationStage('stage-other', { en: 'Something else' }),
            informationStage('stage-edited', { en: 'Information' }),
          ),
        ),
      ),
    ).toBe('Information');
  });
});
