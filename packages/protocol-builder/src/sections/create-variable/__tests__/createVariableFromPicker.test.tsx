import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import Field from '@codaco/fresco-ui/form/Field/Field';
import Section from '@codaco/fresco-ui/Section';

import VariablePickerField from '../../../fields/VariablePickerField.tsx';
import { useStageEditorForm } from '../../../form/stageEditorContext.ts';
import { useStageValue } from '../../../form/stageFormHooks.ts';
import {
  variablesForSubject,
  type CodebookSubject,
} from '../../../protocol-context.ts';
import { useProtocolContext } from '../../../state/protocolContext.ts';
import {
  attributeField,
  openAttributePicker,
} from '../../../testing/attributePicker.ts';
import { renderStageEditor } from '../../../testing/renderStageEditor.tsx';
import { useCreateVariableEditor } from '../useCreateVariableEditor.tsx';

const SUBJECT: CodebookSubject = { entity: 'node', type: 'person' };
const SLOT = 'nodeConfig.egoVariable';
const LABEL = 'Attribute the bins sort by';

/**
 * A slot whose attribute cannot be made from a name.
 *
 * An ordinal attribute IS its list of answers, so the create row cannot write
 * one and hand it back: it opens the codebook's own editor on the name that
 * was typed, and the attribute the researcher finishes there is the one the
 * slot takes. This is the shape every slot that needs a value set — ordinal,
 * categorical, and the pedigree slots whose options the interface owns — is
 * wired in, and is what makes those sections' sibling create buttons
 * redundant.
 */
function OrdinalSlot() {
  const held = useStageValue(SLOT);
  const { storeApi } = useStageEditorForm();
  // Read live from the codebook, as every section that mounts a picker reads
  // its own: an attribute invented through the escalation editor is not in
  // this list until it exists, and the pill the slot then shows is how a
  // reader can tell WHICH attribute it took.
  const protocolContext = useProtocolContext();
  const options = Object.entries(
    variablesForSubject(protocolContext, SUBJECT),
  ).map(([value, variable]) => ({
    value,
    label: variable.name,
    type: variable.type,
  }));
  const { createOption, editor } = useCreateVariableEditor({
    subject: SUBJECT,
    variableTypes: ['ordinal'],
    title: 'Create a new ordinal attribute',
    // Written onto the slot, as every real caller of this hook writes it
    // (`SlotVariableField.tsx:135`, `ComposerFormFields.tsx:651`). A fixture
    // that dropped the id would leave the only thing the escalation path
    // exists to deliver — which attribute the slot ends up naming —
    // unasserted.
    onCreated: (variableId) =>
      storeApi.getState().setFieldValue(SLOT, variableId),
  });

  return (
    <Section title="What the bins sort by">
      <Field<typeof VariablePickerField>
        name={SLOT}
        component={VariablePickerField}
        label={LABEL}
        options={options}
        emptyMessage="This type has no ordinal attribute yet."
        onCreateOption={createOption}
        initialValue={typeof held === 'string' ? held : undefined}
      />
      {editor}
    </Section>
  );
}

describe('a slot whose attribute needs more than a name', () => {
  it('opens the codebook editor on the typed name, and takes what it creates', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <OrdinalSlot />,
    });
    await harness.opened();

    const field = attributeField(LABEL);
    const dialog = await openAttributePicker(harness.user, field);
    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      'closeness',
    );
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: 'Create new attribute called “closeness”.',
      }),
    );

    const editor = await screen.findByRole('dialog', {
      name: 'Create a new ordinal attribute',
    });
    // Seeded with what they typed, so the name is asked for once.
    expect(
      within(editor).getByRole('textbox', { name: 'Attribute name' }),
    ).toHaveValue('closeness');

    await harness.user.click(
      within(editor).getByRole('button', { name: 'Create new option' }),
    );
    await harness.user.type(
      within(editor).getByRole('textbox', { name: 'Option 1 label' }),
      'Very close',
    );
    await harness.user.type(
      within(editor).getByRole('textbox', { name: 'Option 1 value' }),
      '1',
    );
    // An ordinal is an ORDER, so one answer is not one: the schema refuses a
    // list with nothing to rank against.
    await harness.user.click(
      within(editor).getByRole('button', { name: 'Create new option' }),
    );
    await harness.user.type(
      within(editor).getByRole('textbox', { name: 'Option 2 label' }),
      'Not close',
    );
    await harness.user.type(
      within(editor).getByRole('textbox', { name: 'Option 2 value' }),
      '2',
    );
    await harness.user.click(
      within(editor).getByRole('button', { name: 'Create attribute' }),
    );

    // Both windows go: the attribute exists, so there is nothing left to ask.
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const variables = harness.hostCodebook().node?.person?.variables ?? {};
    const created = Object.values(variables).find(
      (variable) => variable.name === 'closeness',
    );
    expect(created).toMatchObject({ name: 'closeness', type: 'ordinal' });

    // And the slot took it. The codebook holding the attribute is only half of
    // what the create row promised — the other half is that the control the
    // researcher started from now names it, under the id the codebook filed it
    // under rather than under its name.
    const createdId = Object.entries(variables).find(
      ([, variable]) => variable.name === 'closeness',
    )?.[0];
    expect(createdId).toEqual(expect.any(String));
    // And the slot took it, under the id the codebook filed it under: the
    // attribute existing is only half of what the create row promised, and the
    // control the researcher started from is where the other half is read.
    expect(
      within(attributeField(LABEL)).getByText('closeness'),
    ).toBeInTheDocument();
  });

  /**
   * The editor opens OVER this window, which stays open underneath it waiting
   * for an answer — so nothing on the window may raise it above a dialog
   * opened after it. jsdom has no stylesheet to paint with, so what is read
   * here is the raise itself; `fields/VariableSpotlight.stories.tsx`'s "The
   * editor it opens" story is where the stacking is measured in a browser.
   */
  it('leaves the editor it opened on top of it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <OrdinalSlot />,
    });
    await harness.opened();

    const dialog = await openAttributePicker(
      harness.user,
      attributeField(LABEL),
    );
    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      'closeness',
    );
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: 'Create new attribute called “closeness”.',
      }),
    );

    const editor = await screen.findByRole('dialog', {
      name: 'Create a new ordinal attribute',
    });

    const spotlight = document.querySelector<HTMLElement>(
      '[data-variable-spotlight]',
    );
    if (spotlight === null) {
      throw new Error('the window closed, so there is nothing to be under');
    }
    // The editor is the later of the two, which is the order the rest depends
    // on.
    expect(
      spotlight.compareDocumentPosition(editor) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(spotlight.className).not.toMatch(/(?:^|[\s:])-?z-/u);
    expect(spotlight.style.zIndex).toBe('');
  });

  /**
   * Closing the editor without saving wrote nothing, which is exactly what the
   * create that opened it was waiting to hear: the researcher gets their name
   * back, in the box they typed it into.
   */
  it('gives the name back when the editor is closed without saving', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-1',
      sections: <OrdinalSlot />,
    });
    await harness.opened();

    const field = attributeField(LABEL);
    const dialog = await openAttributePicker(harness.user, field);
    const box = within(dialog).getByRole('searchbox', {
      name: 'Find or create an attribute',
    });
    await harness.user.type(box, 'closeness');
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: 'Create new attribute called “closeness”.',
      }),
    );

    const editor = await screen.findByRole('dialog', {
      name: 'Create a new ordinal attribute',
    });
    await harness.user.keyboard('{Escape}');
    await waitFor(() => expect(editor).not.toBeInTheDocument());

    expect(
      await screen.findByRole('dialog', { name: LABEL }),
    ).toBeInTheDocument();
    expect(box).toHaveValue('closeness');
    // And the window is USABLE again, not stuck waiting on an answer that
    // never came: the row offers the create rather than saying it is making
    // one, and it is not switched off.
    const offer = within(document.body).getByRole('option', {
      name: 'Create new attribute called “closeness”.',
    });
    expect(offer).not.toHaveAttribute('aria-disabled');
    expect(box).toBeEnabled();
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).not.toContain('closeness');
  });
});
