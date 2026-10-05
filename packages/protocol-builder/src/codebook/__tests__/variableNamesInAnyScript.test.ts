import { describe, expect, it } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';

import type { ProtocolBuilderProtocolContext } from '../../protocol-context.ts';
import {
  ExportColumnConflictError,
  DuplicateVariableNameError,
  documentWithCreatedVariable,
} from '../editing.ts';

const CONTEXT: ProtocolBuilderProtocolContext = {
  codebook: {},
  assets: {},
  orderedStages: [],
  issues: [],
  localization: { defaultLocale: 'en', locales: ['en'] },
};

const sectionOf = (variables: Record<string, unknown>): SectionDoc => ({
  name: 'Person',
  label: { en: 'Person' },
  color: 'node-color-seq-1',
  shape: { default: 'circle' },
  variables,
});

const text = (name: string) => ({
  name,
  label: { en: name },
  type: 'text',
  component: 'Text',
});

const categorical = (name: string, values: readonly string[]) => ({
  name,
  label: { en: name },
  type: 'categorical',
  component: 'CheckboxGroup',
  options: values.map((value) => ({ label: { en: value }, value })),
});

const create = (
  authoritativeDocument: SectionDoc,
  draft: Record<string, unknown>,
) =>
  documentWithCreatedVariable({
    subject: { entity: 'node', type: 'person' },
    authoritativeDocument,
    variableId: 'new-variable',
    protocolContext: CONTEXT,
    draft,
  });

const storedVariable = (document: SectionDoc, variableId: string): unknown => {
  const variables: unknown = document.variables;
  return typeof variables === 'object' && variables !== null
    ? Reflect.get(variables, variableId)
    : undefined;
};

/*
 * These pass only once the protocol schema accepts a variable name that
 * `CodebookNameSchema` accepts (schema 9): until then `VariableSchema` still
 * holds `name` to the identifier alphabet, whatever this package would allow.
 */
describe('an attribute named in another script, once the schema allows it', () => {
  it.each(['友人', 'amigo cercano', 'Collègue'])(
    'creates an attribute named %j',
    (name) => {
      const written = create(sectionOf({}), text(name));
      expect(storedVariable(written, 'new-variable')).toMatchObject({ name });
    },
  );

  it('refuses a name held by another attribute in another case', () => {
    const section = sectionOf({ colleague: text('Collègue') });
    expect(() => create(section, text('COLLÈGUE'))).toThrow(
      DuplicateVariableNameError,
    );
  });

  it('refuses a name that is the column of an option written in another script', () => {
    const section = sectionOf({ ami: categorical('友人', ['近い', '遠い']) });
    expect(() => create(section, text('友人_近い'))).toThrow(
      ExportColumnConflictError,
    );
  });
});
