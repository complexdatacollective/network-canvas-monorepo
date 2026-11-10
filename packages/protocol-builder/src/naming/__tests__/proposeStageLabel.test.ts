import { describe, expect, it } from 'vitest';

import { STAGE_LABEL_MAX_LENGTH } from '@codaco/protocol-validation';
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
  localization: Readonly<{ defaultLocale: string; locales: string[] }> = {
    defaultLocale: 'en',
    locales: ['en', 'es'],
  },
): ProtocolBuilderProtocolContext =>
  protocolContextFromSections({
    [sectionId({ kind: 'settings' })]: { localization },
    [sectionId({ kind: 'stageOrder' })]: { stages: [] },
    [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
      name: 'Person',
      color: 'node-color-seq-1',
      shape: { default: 'circle' },
      variables: {
        diabetes: {
          name: 'Diabetes',
          type: 'boolean',
        },
        asthma: { name: 'Asthma', type: 'boolean' },
      },
    },
    [sectionId({ kind: 'codebookEdge', typeId: 'friendship' })]: {
      name: 'Friendship',
      variables: {
        closeness: {
          name: 'Closeness',
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

  it('names a finish stage after how the interview ends there', () => {
    expect(
      proposeStageLabel(
        {
          id: 'stage-1',
          type: 'FinishSession',
          mode: 'confirmation',
          outcome: 'completed',
        },
        contextWith(),
      ),
    ).toBe('Finish Screen (Completed)');
    expect(
      proposeStageLabel(
        {
          id: 'stage-1',
          type: 'FinishSession',
          mode: 'automatic',
          outcome: 'ineligible',
        },
        contextWith(),
      ),
    ).toBe('Finish Screen (Ineligible, Automatic)');
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

const inLanguage = (defaultLocale: string, locales = [defaultLocale]) => ({
  defaultLocale,
  locales,
});

describe('the language a proposal is in', () => {
  it('is the protocol’s default language when Network Canvas has wording in it', () => {
    expect(
      proposeStageLabel(
        {
          id: 'stage-1',
          type: 'NameGenerator',
          subject: { entity: 'node', type: 'person' },
        },
        contextWith({}, inLanguage('es', ['es', 'en'])),
      ),
    ).toBe('Generador de nombres (con formularios): Person');
    expect(
      proposeStageLabel(
        { id: 'stage-1', type: 'Sociogram' },
        contextWith({}, inLanguage('zh-Hant', ['zh-Hant', 'en'])),
      ),
    ).toBe('社會關係圖');
  });

  it('is the same wording for a region of the language it supplies', () => {
    for (const defaultLocale of ['es-ES', 'zh-TW', 'pt', 'en-US']) {
      expect(
        proposeStageLabel(
          { id: 'stage-1', type: 'Sociogram' },
          contextWith({}, inLanguage(defaultLocale)),
        ),
      ).toBeTypeOf('string');
    }
    expect(
      proposeStageLabel(
        { id: 'stage-1', type: 'Sociogram' },
        contextWith({}, inLanguage('pt')),
      ),
    ).toBe('Sociograma');
  });

  // Network Canvas supplies the wording for these languages as written for
  // one region, so another region of one, or any other language, has none.
  it('is none at all for a default language Network Canvas has no wording in', () => {
    for (const defaultLocale of ['sw', 'es-MX', 'en-GB', 'ar', 'hu']) {
      expect(
        proposeStageLabel(
          { id: 'stage-1', type: 'Sociogram' },
          // The protocol also has English; only the DEFAULT language counts.
          contextWith({}, inLanguage(defaultLocale, [defaultLocale, 'en'])),
        ),
      ).toBeUndefined();
    }
  });

  it('stays English when the protocol declares no languages', () => {
    const context = protocolContextFromSections({
      [sectionId({ kind: 'stageOrder' })]: { stages: [] },
    });
    expect(context.localization).toBeUndefined();
    expect(proposeStageLabel({ id: 'stage-1', type: 'EgoForm' }, context)).toBe(
      'Ego Form',
    );
  });

  it('words the qualifiers in that language too', () => {
    expect(
      proposeStageLabel(
        {
          id: 'stage-1',
          type: 'FinishSession',
          mode: 'automatic',
          outcome: 'terminated',
        },
        contextWith({}, inLanguage('de')),
      ),
    ).toBe(
      'Abschlussbildschirm – Interview vorzeitig beendet, ohne Bestätigungsabfrage',
    );
  });

  it('avoids a name already taken in the default language, not in another', () => {
    const context = (label: Readonly<Record<string, string>>) =>
      contextWith(
        ordered(informationStage('stage-other', label)),
        inLanguage('es', ['es', 'en']),
      );
    expect(
      proposeStageLabel(
        { id: 'stage-new', type: 'Information' },
        context({ es: 'información' }),
      ),
    ).toBe('Información #2');
    // The English text of another stage does not occupy the Spanish name.
    expect(
      proposeStageLabel(
        { id: 'stage-new', type: 'Information' },
        context({ es: 'Otra cosa', en: 'Información' }),
      ),
    ).toBe('Información');
  });

  it('holds to the schema’s limit in the language, dropping the subject that does not fit', () => {
    const longName = 'Persona'.repeat(20);
    const context = protocolContextFromSections({
      [sectionId({ kind: 'settings' })]: {
        localization: inLanguage('es'),
      },
      [sectionId({ kind: 'stageOrder' })]: { stages: [] },
      [sectionId({ kind: 'codebookNode', typeId: 'person' })]: {
        name: longName,
        color: 'node-color-seq-1',
        shape: { default: 'circle' },
        variables: {},
      },
    });
    const label = proposeStageLabel(
      {
        id: 'stage-1',
        type: 'NameGenerator',
        subject: { entity: 'node', type: 'person' },
      },
      context,
    );
    expect(label).toBe('Generador de nombres (con formularios)');
    expect(label?.length).toBeLessThanOrEqual(STAGE_LABEL_MAX_LENGTH);
  });
});
