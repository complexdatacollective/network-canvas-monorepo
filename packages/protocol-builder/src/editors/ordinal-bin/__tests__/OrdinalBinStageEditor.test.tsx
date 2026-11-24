import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  attributeField,
  chooseAttributeById,
  inventAttribute,
} from '../../../testing/attributePicker.ts';
import {
  fixtureStageIds,
  fixtureStageId,
  fixtureTypeId,
  fixtureVariableId,
} from '../../../testing/protocolFixture.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../__tests__/writeInto.ts';
import { ordinalBinStageEditor } from '../OrdinalBinStageEditor.ts';

const PERSON = fixtureTypeId('node', 'person');
const personVariable = (name: string) =>
  fixtureVariableId({ entity: 'node', typeName: 'person' }, name);
const CONTACT_FREQ = personVariable('contactFreq');

/** Where a host would insert a new one: over the stage the fixture holds. */
const ORDINAL_BIN_INDEX = fixtureStageIds().indexOf(
  fixtureStageId('ordinal-bin-1'),
);

const stageNameInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Stage name' });

/**
 * The field a prompt's scale is chosen in.
 *
 * A scope rather than a control: the scale is picked in a window the field's
 * trigger opens, so what the field itself shows is the attribute it holds.
 */
const attributePicker = (): HTMLElement => attributeField('Attribute');

/** The same, once the prompt has drawn it. */
const findAttributePicker = async (): Promise<HTMLElement> => {
  await screen.findByText('Attribute', { selector: 'label' });
  return attributePicker();
};

const prompts = (stage: Record<string, unknown>): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

/**
 * The whole journey a researcher makes to a saveable Ordinal Bin, which is
 * what this editor is FOR and what no section test can ask.
 *
 * The section order, the fixture round trip and the whole-schema round trip
 * are the family's, in `editors/__tests__/censusBinEditors.test.tsx`. What is
 * here is the sequence: what the stage collects, what it asks, and the scale
 * it is answered on — each chosen in a different section, and the last of them
 * only choosable once the first has been.
 */
describe('creating an ordinal bin stage', () => {
  it('saves the new stage once its prompt names a scale', async () => {
    const harness = renderStageEditor({
      create: { type: 'OrdinalBin', position: ORDINAL_BIN_INDEX },
      registry: ordinalBinStageEditor,
    });

    // Proposed, and unique in the interview: the fixture already holds a stage
    // called "Ordinal Bin", so an unqualified proposal would be a second.
    await waitFor(() => expect(stageNameInput()).toHaveValue('Ordinal Bin #2'));
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));

    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How often do you see them?',
    );
    await chooseAttributeById(
      harness.user,
      await findAttributePicker(),
      CONTACT_FREQ,
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'OrdinalBin',
      label: { 'en-US': 'Person Ordinal Bin' },
      subject: { entity: 'node', type: PERSON },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: { 'en-US': 'How often do you see them?' },
        variable: CONTACT_FREQ,
        color: 'ord-color-seq-1',
      },
    ]);
  });

  /**
   * The scale lives in the codebook rather than in the stage, so inventing one
   * from inside a prompt makes it part of the stage's draft first, the prompt
   * is pointed at it, and the one save writes both.
   *
   * Only the second half is asked here — that the pick reaches the STAGE save.
   * What the codebook is asked, and what it refuses, belongs to the codebook's
   * own editor and to `AttributeCodebookControls`.
   */
  it('saves a stage that names the scale it just created', async () => {
    const harness = renderStageEditor({
      stageId: 'ordinal-bin-1',
      registry: ordinalBinStageEditor,
    });

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    // An ordinal attribute IS its ordered values, and the schema refuses one
    // with fewer than two — which is why the picker's create row opens the
    // codebook's own editor on the typed name rather than writing it.
    await inventAttribute(
      harness.user,
      await waitFor(() => attributeField('Attribute')),
      'closenessBand',
    );
    expect(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
    ).toHaveValue('closenessBand');
    for (const [index, [label, value]] of [
      ['Near', '1'],
      ['Far', '2'],
    ].entries()) {
      const position = index + 1;
      await harness.user.click(
        screen.getByRole('button', { name: 'Create new option' }),
      );
      await writeInto(
        harness,
        screen.getByRole('textbox', { name: `Option ${position} label` }),
        label!,
      );
      await writeInto(
        harness,
        screen.getByRole('textbox', { name: `Option ${position} value` }),
        value!,
      );
    }
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    // The picker shows the researcher's NAME for it; that the prompt holds the
    // attribute just created — rather than another of that name — is what the
    // saved id below says.
    await waitFor(() =>
      expect(
        within(attributePicker()).getByText('closenessBand'),
      ).toBeVisible(),
    );

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    // The attribute is filed under a record key the researcher never sees, so
    // it is looked up by the name they typed. Saving the prompt made it the
    // stage's: the editor has it, the protocol does not until the stage is
    // saved.
    const created = Object.entries(
      harness.editorCodebook().node?.[PERSON]?.variables ?? {},
    ).find(([, variable]) => variable.name === 'closenessBand')?.[0];
    if (created === undefined) throw new Error('the attribute was not created');
    expect(harness.hostCodebook().node?.[PERSON]?.variables).not.toHaveProperty(
      created,
    );

    const request = await harness.submit();
    expect(harness.hostCodebook().node?.[PERSON]?.variables).toHaveProperty(
      created,
    );
    expect(prompts(request?.stageDocument ?? {})[0]?.variable).toBe(created);
  });
});
