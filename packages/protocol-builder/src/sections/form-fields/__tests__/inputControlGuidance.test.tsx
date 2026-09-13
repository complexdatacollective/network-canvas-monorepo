import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { protocolAuthoringLinks } from '../../../interfaces/documentation.ts';
import {
  attributeField,
  chooseAttributeById,
} from '../../../testing/attributePicker.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { exactlyText } from '../../../testing/text.ts';
import FormFieldsSection from '../FormFieldsSection.tsx';

/**
 * Why the list of input controls is as long as it is, and where to read more
 * about the controls themselves.
 *
 * Architect 8.2.5 puts three things under this one control, and the package
 * had dropped all three: a link into the input-controls documentation, a
 * warning that an attribute which already exists cannot change its type, and —
 * for an attribute being invented — a notice saying which type the chosen
 * control will fix it as. Without them the list simply looks short, and the
 * researcher is given no way to find out why, or to learn that the decision
 * they are about to make is permanent.
 */

/** The picker option standing for an attribute that does not exist yet. */
const CREATE_NEW_ATTRIBUTE = '#create-new-attribute';

const openAlterForm = () => ({
  stageId: 'alter-form-1' as const,
  sections: <FormFieldsSection subject="node" />,
});

const openField = async (
  harness: ReturnType<typeof renderStageEditor>,
  name: string,
) => {
  await harness.user.click(screen.getAllByRole('button', { name })[0]!);
  // The element as well as its queries: the attribute picker's window opens
  // over this dialog, and a helper reaching into the row has to say which of
  // the two it means.
  const element = await screen.findByRole('dialog');
  return { ...within(element), element };
};

/**
 * The alert this heading belongs to.
 *
 * Read from the heading outwards rather than by picking a live region out of
 * the dialog, so the title and the sentence under it are asserted to be parts
 * of the same alert — two separate `getByText` calls would pass with the body
 * of one alert sitting under the title of another.
 */
const alertTitled = (dialog: ReturnType<typeof within>, title: string) => {
  const region = dialog
    .getByRole('heading', { name: title })
    .closest('[role="status"]');
  if (region === null) {
    throw new Error(`“${title}” is not inside an alert.`);
  }
  return within(region);
};

describe('the guidance under the input control', () => {
  it('sends the researcher to the documentation about input controls', async () => {
    const harness = renderStageEditor(openAlterForm());
    const dialog = await openField(harness, 'Edit field');

    const link = dialog.getByRole('link', { name: 'documentation' });
    expect(link).toHaveAttribute('href', protocolAuthoringLinks.inputControls);
    // The whole sentence, so a link left dangling off a hint that no longer
    // says what it links to still fails.
    expect(
      dialog.getByText(
        exactlyText(
          'How the answer is collected. For detailed information about these options, see our documentation.',
        ),
      ),
    ).toBeVisible();
  });

  /**
   * `relationship_to_ego` is a `text` attribute the codebook already holds, so
   * the list above offers only the controls a `text` attribute can be
   * collected with — and the researcher is told so, and told what to do
   * instead.
   */
  it('says why the list is short for an attribute that already exists', async () => {
    const harness = renderStageEditor(openAlterForm());
    const dialog = await openField(harness, 'Edit field');

    const alert = alertTitled(dialog, 'Attribute type is locked');
    expect(
      alert.getByText(
        exactlyText(
          'A pre-existing attribute is currently selected. You cannot change an attribute type after it has been created, so only Text compatible input controls can be selected above. If you would like to use a different input control type, you will need to create a new attribute.',
        ),
      ),
    ).toBeVisible();
    // The other half of the pair is about an attribute being invented, and
    // this row is not inventing one.
    expect(
      dialog.queryByText('The selected input control will cause this', {
        exact: false,
      }),
    ).not.toBeInTheDocument();
  });

  /**
   * The invented attribute has no type yet, so the control the researcher
   * picks here is what fixes it — permanently, for every form that ever
   * collects it.
   */
  it('says what type the chosen control will fix a new attribute as', async () => {
    const harness = renderStageEditor(openAlterForm());
    const dialog = await openField(harness, 'Create new form field');

    await chooseAttributeById(
      harness.user,
      attributeField('Attribute', dialog.element),
      CREATE_NEW_ATTRIBUTE,
    );
    await harness.user.type(
      await dialog.findByRole('textbox', { name: 'Attribute name' }),
      'nickname',
    );
    await harness.user.selectOptions(
      dialog.getByRole('combobox', { name: 'Kind of answer' }),
      'text',
    );

    expect(
      await dialog.findByText(
        exactlyText(
          'The selected input control will cause this attribute to be defined as type Text. Once set, this cannot be changed (although you may change the input control within this type).',
        ),
      ),
    ).toBeVisible();
    // Nothing is locked: this attribute does not exist yet.
    expect(
      dialog.queryByRole('heading', { name: 'Attribute type is locked' }),
    ).not.toBeInTheDocument();
  });
});
