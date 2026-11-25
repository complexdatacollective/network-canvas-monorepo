import { describe, expect, it } from 'vitest';

import type { Variables } from '@codaco/protocol-validation';

import type { VariablePickerOption } from '../../fields/VariablePickerField.tsx';
import { enIntl } from '../../testing/i18n.ts';
import { testVariableId } from '../../testing/testId.ts';
import {
  attributeChoices,
  availableOnly,
  formCannotCollectReason,
  markListed,
  markUnavailable,
  onlyTypeReason,
} from '../attributeAvailability.ts';

const POSITION = testVariableId('position');
const MARKED = testVariableId('marked');
const NAME = testVariableId('name');
const FUTURE = testVariableId('future');

const VARIABLES: Variables = {
  [POSITION]: { name: 'position', type: 'layout' },
  [MARKED]: { name: 'marked', type: 'boolean' },
  [NAME]: { name: 'name', type: 'text' },
};

describe('attributeChoices', () => {
  it('lists every attribute, marking the ones of another type for their type', () => {
    const choices = attributeChoices(
      VARIABLES,
      (type) => type === 'boolean',
      onlyTypeReason(enIntl, 'boolean'),
    );

    expect(choices).toEqual([
      { value: MARKED, label: 'marked', type: 'boolean' },
      {
        value: NAME,
        label: 'name',
        type: 'text',
        unavailableReason: 'Only Boolean attributes can be used here.',
        unavailableForType: true,
      },
      {
        value: POSITION,
        label: 'position',
        type: 'layout',
        unavailableReason: 'Only Boolean attributes can be used here.',
        unavailableForType: true,
      },
    ]);
  });

  it('names the type a form cannot collect', () => {
    const [position] = attributeChoices(
      { [POSITION]: { name: 'position', type: 'layout' } },
      (type) => type !== 'layout',
      formCannotCollectReason(enIntl),
    );
    expect(position?.unavailableReason).toBe(
      'A form cannot collect Layout attributes.',
    );
  });

  it('leaves out an attribute of a type the schema does not know', () => {
    const variables: Record<string, { name: string; type: string }> = {
      ...VARIABLES,
      [FUTURE]: { name: 'future', type: 'hologram' },
    };
    const choices = attributeChoices(
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- a protocol written for a later schema, which the codebook type cannot describe
      variables as unknown as Variables,
      () => true,
      () => 'unused',
    );
    expect(choices.map(({ value }) => value)).not.toContain(FUTURE);
    expect(choices).toHaveLength(3);
  });
});

describe('markUnavailable', () => {
  const options: VariablePickerOption[] = [
    { value: MARKED, label: 'marked' },
    { value: NAME, label: 'name' },
  ];

  it('gives the first reason applied and never replaces it', () => {
    const first = markListed(options, [MARKED], 'First reason.');
    const second = markListed(first, [MARKED, NAME], 'Second reason.');
    expect(second.map((option) => option.unavailableReason)).toEqual([
      'First reason.',
      'Second reason.',
    ]);
  });

  it('never marks a held attribute', () => {
    const marked = markUnavailable(options, () => 'Ruled out.', [NAME]);
    expect(marked.map((option) => option.unavailableReason)).toEqual([
      'Ruled out.',
      undefined,
    ]);
    expect(availableOnly(marked).map(({ value }) => value)).toEqual([NAME]);
  });
});
