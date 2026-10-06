import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolLocalization } from '../../localization/localizedText.ts';
import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import {
  documentForNewEntity,
  documentWithCreatedVariable,
} from '../editing.ts';

const SPANISH_FIRST: ProtocolLocalization = {
  defaultLocale: 'es',
  locales: ['es', 'en'],
};

const CONTEXT: ProtocolBuilderProtocolContext = {
  codebook: {},
  assets: {},
  orderedStages: [],
  issues: [],
  localization: SPANISH_FIRST,
};

const PERSON: SectionDoc = {
  name: 'Persona',
  label: { es: 'Persona' },
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables: {},
};

const createdVariable = (draft: Record<string, unknown>) => {
  const document = documentWithCreatedVariable({
    subject: { entity: 'node', type: 'person' },
    authoritativeDocument: PERSON,
    variableId: 'new-variable',
    protocolContext: CONTEXT,
    draft,
  });
  const variables = document.variables;
  if (variables === null || typeof variables !== 'object') {
    throw new Error('expected the variables map');
  }
  return Object.entries(variables).find(([id]) => id === 'new-variable')?.[1];
};

describe('the label a new attribute is created with', () => {
  it('is its name, as plain text', () => {
    expect(createdVariable({ name: '  cercanía ', type: 'text' })).toEqual({
      name: 'cercanía',
      label: 'cercanía',
      type: 'text',
    });
  });

  it('is the one the researcher wrote, when they wrote one', () => {
    expect(
      createdVariable({ name: 'cercania', label: 'Cercanía', type: 'text' }),
    ).toMatchObject({ label: 'Cercanía' });
  });
});

describe('the label a new entity type is created with', () => {
  it('is a node type’s name, written in the protocol’s default language', () => {
    expect(
      documentForNewEntity({
        subject: { entity: 'node', type: 'friend' },
        draft: {
          name: 'Amigo',
          color: 'node-color-seq-2',
          shape: { default: 'circle' },
        },
        localization: SPANISH_FIRST,
      }).label,
    ).toEqual({ es: 'Amigo' });
  });

  it('is an edge type’s name, written in the protocol’s default language', () => {
    expect(
      documentForNewEntity({
        subject: { entity: 'edge', type: 'knows' },
        draft: { name: 'Conoce', color: 'edge-color-seq-1' },
        localization: SPANISH_FIRST,
      }).label,
    ).toEqual({ es: 'Conoce' });
  });

  it('is not given to the ego, which has no name to show', () => {
    expect(
      Object.hasOwn(
        documentForNewEntity({
          subject: { entity: 'ego' },
          draft: {},
          localization: SPANISH_FIRST,
        }),
        'label',
      ),
    ).toBe(false);
  });
});
