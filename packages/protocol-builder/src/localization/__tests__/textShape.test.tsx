import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Form from '@codaco/fresco-ui/form/Form';
import {
  alterEdgeFormStage,
  alterFormStage,
  categoricalBinStage,
  dyadCensusStage,
  egoFormStage,
  familyPedigreeStage,
  FormFieldSchema,
  informationStage,
  type LocalizedTextShape,
  localizedTextShapeAt,
  nameGeneratorQuickAddStage,
  nameGeneratorRosterStage,
  nameGeneratorStage,
  oneToManyDyadCensusStage,
  ordinalBinStage,
  promptSchema,
  tieStrengthCensusStage,
} from '@codaco/protocol-validation';

import { LocalizedRichTextField } from '../../fields/LocalizedStringField.tsx';
import { ProtocolLocalizationProvider } from '../ProtocolLocalization.tsx';
import { markdownTextShapeAt, textFieldPropsFor } from '../textShape.ts';

describe('textFieldPropsFor', () => {
  it('turns a declared shape into the text field props', () => {
    expect(textFieldPropsFor({ format: 'plain', lines: 'single' })).toEqual({
      markdown: false,
      singleLine: true,
      assetBlocks: false,
    });
    expect(textFieldPropsFor({ format: 'markdown', lines: 'single' })).toEqual({
      markdown: true,
      singleLine: true,
      assetBlocks: false,
    });
    expect(
      textFieldPropsFor({ format: 'markdown', lines: 'multiple' }),
    ).toEqual({ markdown: true, singleLine: false, assetBlocks: false });
  });

  it('carries the blocks a field declares it can hold, and only then', () => {
    expect(
      textFieldPropsFor({
        format: 'markdown',
        lines: 'multiple',
        assetBlocks: true,
      }),
    ).toEqual({ markdown: true, singleLine: false, assetBlocks: true });
    expect(
      textFieldPropsFor({ format: 'markdown', lines: 'multiple' }),
    ).toHaveProperty('assetBlocks', false);
  });
});

describe('markdownTextShapeAt', () => {
  it('reads a markdown field’s declaration', () => {
    expect(markdownTextShapeAt(informationStage, ['content'])).toEqual({
      format: 'markdown',
      lines: 'multiple',
      assetBlocks: true,
    });
  });

  it('refuses a plain field, which is edited as plain text', () => {
    expect(() => markdownTextShapeAt(informationStage, ['label'])).toThrow(
      'The localized text at label is plain, not markdown.',
    );
  });
});

/**
 * An editor shared by several stages names one declaration, which stands for
 * the field in every stage it edits. Each must declare the field alike, or
 * the editor would offer one stage's shape for another's text.
 */
describe('editors shared between stages', () => {
  const agree = (
    named: LocalizedTextShape,
    edited: readonly [Parameters<typeof localizedTextShapeAt>[0], string][],
    path: readonly (string | number)[],
  ) => {
    for (const [schema, stage] of edited) {
      expect({ stage, shape: localizedTextShapeAt(schema, path) }).toEqual({
        stage,
        shape: named,
      });
    }
  };

  it('PromptTextField and NameGeneratorPromptsSection: a prompt’s text', () => {
    const prompt = localizedTextShapeAt(promptSchema, ['text']);
    agree(
      prompt,
      [
        [dyadCensusStage, 'DyadCensus'],
        [oneToManyDyadCensusStage, 'OneToManyDyadCensus'],
        [tieStrengthCensusStage, 'TieStrengthCensus'],
        [ordinalBinStage, 'OrdinalBin'],
        [categoricalBinStage, 'CategoricalBin'],
        [nameGeneratorStage, 'NameGenerator'],
        [nameGeneratorQuickAddStage, 'NameGeneratorQuickAdd'],
        [nameGeneratorRosterStage, 'NameGeneratorRoster'],
      ],
      ['prompts', 0, 'text'],
    );
    agree(
      prompt,
      [[familyPedigreeStage, 'FamilyPedigree']],
      ['nominationPrompts', 0, 'text'],
    );
  });

  it('a form field’s question and hint', () => {
    for (const field of ['prompt', 'hint']) {
      agree(
        localizedTextShapeAt(FormFieldSchema, [field]),
        [
          [egoFormStage, 'EgoForm'],
          [alterFormStage, 'AlterForm'],
          [alterEdgeFormStage, 'AlterEdgeForm'],
          [familyPedigreeStage, 'FamilyPedigree'],
        ],
        ['form', 'fields', 0, field],
      );
    }
  });
});

describe('LocalizedRichTextField', () => {
  const renderWithShape = (shape: ReturnType<typeof markdownTextShapeAt>) =>
    render(
      <ProtocolLocalizationProvider
        localization={{ defaultLocale: 'en', locales: ['en'] }}
      >
        <Form onSubmit={() => ({ success: true })}>
          <Field
            name="text"
            label="Text"
            component={LocalizedRichTextField}
            shape={shape}
            initialValue={{ en: 'Welcome' }}
          />
        </Form>
      </ProtocolLocalizationProvider>,
    );

  const toolbarButton = async (name: string) => {
    const toolbar = await screen.findByRole('toolbar');
    return within(toolbar).queryByRole('button', { name });
  };

  it('offers blocks for a field declared several lines', async () => {
    // Without files as blocks, which need the stage edit's resources: the
    // page's own declaration is exercised through its editor.
    renderWithShape({ format: 'markdown', lines: 'multiple' });
    expect(await toolbarButton('Bullet list')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveAttribute(
      'aria-multiline',
      'true',
    );
  });

  it('offers words only for a field declared one line', async () => {
    renderWithShape(markdownTextShapeAt(promptSchema, ['text']));
    expect(await toolbarButton('Bullet list')).toBeNull();
    expect(await toolbarButton('Add link')).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Text' })).toHaveAttribute(
      'aria-multiline',
      'false',
    );
  });
});
