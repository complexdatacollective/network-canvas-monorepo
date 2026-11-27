import { describe, expect, it } from 'vitest';

import { fieldBlockMarkdown } from '../../../localization/fieldBlock.ts';
import { convertFormsToDocuments } from '../form-document-migration.ts';
import { textsWrittenAsStandard } from '../legacy-markdown.ts';
import { isProtocolObjectId } from '../protocol-object-id.ts';

type Fields = Record<string, unknown>;

const ENGLISH = { defaultLocale: 'en', locales: ['en'] };

/** `stages` converted, with what the conversion recorded as standard markdown. */
const converted = (stages: Fields[], localization = ENGLISH) => {
  const protocol = { stages: structuredClone(stages) };
  const written = textsWrittenAsStandard();
  convertFormsToDocuments(protocol, localization, written);
  return { stages: protocol.stages, written };
};

const formOf = (stage: Fields | undefined) => stage?.form as Fields;

const fieldIdsOf = (form: Fields) =>
  (form.fields as Fields[]).map((field) => field.id);

const fieldsDocument = (form: Fields) =>
  (form.fields as Fields[])
    .map((field) => fieldBlockMarkdown(String(field.id)))
    .join('\n\n');

const fields = [
  { variable: 'name', prompt: { en: 'Name?' } },
  { id: 'kept', variable: 'age', prompt: { en: 'Age?' } },
];

describe('convertFormsToDocuments', () => {
  it.each(['AlterForm', 'AlterEdgeForm', 'NameGenerator', 'FamilyPedigree'])(
    'writes the fields of a %s form as field blocks, in the order the form showed them',
    (type) => {
      const { stages, written } = converted([
        { type, form: { fields: structuredClone(fields) } },
      ]);
      const form = formOf(stages[0]);
      const ids = fieldIdsOf(form);
      expect(ids.every(isProtocolObjectId)).toBe(true);
      expect(new Set(ids).size).toBe(2);
      expect(form.content).toBe(fieldsDocument(form));
      expect(written.has(form, 'content')).toBe(true);
    },
  );

  it('writes a form as its title, its document and then its fields', () => {
    const { stages } = converted([
      {
        type: 'NameGenerator',
        form: { fields: structuredClone(fields), title: 'Add a person' },
      },
    ]);
    expect(Object.keys(formOf(stages[0]))).toEqual([
      'title',
      'content',
      'fields',
    ]);
  });

  it("writes an Ego Form's introduction panel as the heading and text at the top of its form", () => {
    const { stages } = converted([
      {
        type: 'EgoForm',
        introductionPanel: { title: 'About you', text: 'Please answer.' },
        form: { fields: structuredClone(fields) },
      },
    ]);
    const stage = stages[0];
    const form = formOf(stage);
    expect(form.content).toBe(
      `# About you\n\nPlease answer.\n\n${fieldsDocument(form)}`,
    );
    expect(stage).not.toHaveProperty('introductionPanel');
  });

  it('writes a panel with only a title as only a heading', () => {
    const { stages } = converted([
      {
        type: 'EgoForm',
        introductionPanel: { title: 'About you' },
        form: { fields: structuredClone(fields) },
      },
    ]);
    const form = formOf(stages[0]);
    expect(form.content).toBe(`# About you\n\n${fieldsDocument(form)}`);
  });

  it("writes the panel's text as standard markdown, which schema 8 read the legacy way", () => {
    const { stages } = converted([
      {
        type: 'EgoForm',
        introductionPanel: { title: 'About you', text: 'Line one<br>two' },
        form: { fields: structuredClone(fields) },
      },
    ]);
    expect(String(formOf(stages[0]).content)).not.toContain('<br>');
  });

  it('writes a document for each language of a panel that is already localized', () => {
    const { stages } = converted(
      [
        {
          type: 'EgoForm',
          introductionPanel: {
            title: { en: 'About you', fr: 'À propos de vous' },
          },
          form: { fields: structuredClone(fields) },
        },
      ],
      { defaultLocale: 'en', locales: ['en', 'fr'] },
    );
    const form = formOf(stages[0]);
    expect(form.content).toEqual({
      en: `# About you\n\n${fieldsDocument(form)}`,
      fr: `# À propos de vous\n\n${fieldsDocument(form)}`,
    });
  });

  it('leaves the forms of a Network Composer as lists of fields', () => {
    const composer = {
      type: 'NetworkComposer',
      nodeForm: { fields: structuredClone(fields) },
      form: { fields: structuredClone(fields) },
    };
    const { stages } = converted([composer]);
    expect(stages[0]).toEqual(composer);
  });

  // Nothing is invented: validation reports a form that places no field.
  it('leaves a form with no fields and no introduction for validation to report', () => {
    const { stages } = converted([{ type: 'AlterForm', form: { fields: [] } }]);
    expect(formOf(stages[0])).toEqual({ fields: [] });
  });

  it('writes the introduction of an Ego Form with no fields, and invents no field', () => {
    const { stages } = converted([
      {
        type: 'EgoForm',
        introductionPanel: { title: 'About you' },
        form: { fields: [] },
      },
    ]);
    expect(formOf(stages[0])).toEqual({ content: '# About you', fields: [] });
  });
});
