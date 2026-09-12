import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { composerHolding } from './composerFixtures.tsx';

/**
 * Parity spec §3.4 item 4: the composer's editable-attributes list hides its
 * label, because the section around it already says the words.
 *
 * Architect sets `labelHidden` on both mounts of `EditableAttributesList`
 * (`Form/arrayFields/EditableAttributesList.tsx:312,341` at `74a07e626`); the
 * package showed a second, differently worded label ("Form fields") under the
 * section, which P1c renamed to Architect's own "Editable attributes".
 */
describe('the composer’s node attribute list', () => {
  /** A composer whose node form already holds a field, so the section is open. */
  const openNodeAttributes = async () => {
    renderStageEditor(
      composerHolding({
        nodeForm: {
          fields: [{ id: 'field-1', variable: 'age', component: 'Number' }],
        },
      }),
    );
    return await screen.findByRole('list', { name: 'Editable attributes' });
  };

  it('is named after the section that holds it', async () => {
    // The name has to exist: it is what the editor outline and a host's
    // problem panel call this field, and what names the list to a screen
    // reader. `findByRole` with a name is that assertion.
    expect(await openNodeAttributes()).toBeInTheDocument();
  });

  it('shows that label to nobody, and says it only once', async () => {
    const list = await openNodeAttributes();
    const field = list.closest('[data-field-name="nodeForm.fields"]');
    expect(field).not.toBeNull();

    // `sr-only` is how fresco-ui hides a label it still publishes, so this
    // asserts the label element carries it — not that the words are absent,
    // which would also pass if the field lost its accessible name.
    expect(
      within(field as HTMLElement).getByText('Editable attributes', {
        selector: 'label',
      }),
    ).toHaveClass('sr-only');

    // And the second, differently worded label is gone from the field.
    expect(
      within(field as HTMLElement).queryByText('Form fields'),
    ).not.toBeInTheDocument();
  });
});
