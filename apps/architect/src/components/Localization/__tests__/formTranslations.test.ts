import { describe, expect, it } from 'vitest';

import type { FormFieldDraft } from '@codaco/protocol-builder/sections/form-document/formDocumentValue';
import {
  type CurrentProtocol,
  fieldBlockMarkdown,
} from '@codaco/protocol-validation';

import { fieldsLeftOut, formVariables } from '../formTranslations';

const NAME: FormFieldDraft = {
  id: 'f-name',
  variable: 'name',
  prompt: { en: 'Name?', es: '¿Nombre?' },
};
const AGE: FormFieldDraft = {
  id: 'f-age',
  variable: 'age',
  prompt: { en: 'Age?' },
  hint: { en: 'In years', es: 'En años' },
};
describe('formVariables', () => {
  it("finds the attributes of the form's subject by the attributes its fields collect", () => {
    const person = { name: { name: 'name', type: 'text' } };
    const protocol = {
      codebook: {
        ego: { variables: { mood: { name: 'mood', type: 'text' } } },
        node: { person: { name: 'Person', variables: person } },
      },
    } as unknown as CurrentProtocol;

    expect(formVariables(protocol, [NAME])).toBe(person);
    expect(formVariables(protocol, [])).toEqual({});
  });
});

describe('fieldsLeftOut', () => {
  it('lists the fields that no language contains any more, among those that one did', () => {
    const stored = {
      en: [fieldBlockMarkdown(NAME.id), fieldBlockMarkdown(AGE.id)].join(
        '\n\n',
      ),
      es: fieldBlockMarkdown(NAME.id),
    };

    // The name field is still in the English text.
    expect(
      fieldsLeftOut([NAME, AGE], stored, { ...stored, es: 'Hola' }),
    ).toEqual([]);
    expect(
      fieldsLeftOut([NAME, AGE], stored, {
        ...stored,
        en: fieldBlockMarkdown(NAME.id),
      }),
    ).toEqual([AGE]);
  });
});
