import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../../testing/renderStageEditor.tsx';
import { writeInto } from '../../../__tests__/writeInto.ts';
import QuickAddSection from '../QuickAddSection.tsx';

const quickAdd = <QuickAddSection />;

const picker = (): HTMLElement =>
  screen.getByRole('combobox', { name: /Attribute filled in/ });

const offered = () =>
  within(picker())
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

/** The rules the protocol records for one of the person type's attributes. */
const personValidation = (
  harness: StageEditorHarness,
  variableId: string,
): Record<string, unknown> | undefined => {
  const variable = harness.hostCodebook().node?.person?.variables?.[variableId];
  const validation =
    variable === undefined ? undefined : Reflect.get(variable, 'validation');
  return typeof validation === 'object' && validation !== null
    ? (validation as Record<string, unknown>)
    : undefined;
};

describe('what a quick-add name generator records', () => {
  it('shows the attribute the stage fills in, and saves it unchanged', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    expect(
      await screen.findByRole('combobox', { name: /Attribute filled in/ }),
    ).toHaveValue('name');
    // The stage's name, the type it nominates and what it asks belong to
    // sections this mount does not include.
    await harness.roundTrip({ unowned: ['label', 'subject', 'prompts'] });
  });

  /**
   * One box, one thing typed into it: only a text attribute can hold what the
   * participant types, and `layout` or a categorical would be asked for with a
   * control quick add does not have.
   */
  it('offers only attributes a single box could fill in', async () => {
    renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await screen.findByRole('combobox', { name: /Attribute filled in/ });
    expect(offered()).toContain('name');
    expect(offered()).not.toContain('age');
    expect(offered()).not.toContain('contactType');
    expect(offered()).not.toContain('layout');
  });

  /**
   * Quick add honours the attribute's own rules as the participant types, so
   * it is a VALIDATED writer: an attribute something else stamps a fixed value
   * onto would mix checked and unchecked answers under one name in the export.
   */
  it('does not offer an attribute another stage writes unvalidated', async () => {
    renderStageEditor({
      stage: {
        id: 'quick-add-without-a-choice',
        type: 'NameGeneratorQuickAdd',
        fields: {
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          prompts: [{ id: 'prompt-1', text: 'Quickly add people you know' }],
        },
      },
      sections: quickAdd,
    });

    await screen.findByRole('combobox', { name: /Attribute filled in/ });
    // `composerName` is collected by a Network Composer form elsewhere in the
    // protocol, which is a validated use and therefore allowed; the same list
    // must not hold an attribute a prompt stamps.
    expect(offered()).toContain('composerName');
    expect(offered()).not.toContain('highlighted');
  });

  /**
   * A quick-add stage with nothing to fill in creates people with no name at
   * all, and the schema refuses it — as a path, long after the researcher has
   * moved on.
   */
  it('refuses to save a stage with nothing to fill in', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'quick-add-with-no-attribute',
        type: 'NameGeneratorQuickAdd',
        fields: {
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          prompts: [{ id: 'prompt-1', text: 'Quickly add people you know' }],
        },
      },
      sections: quickAdd,
    });

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText('Choose the attribute quick add fills in.'),
    ).toBeInTheDocument();
  });

  it('records the attribute the researcher chose', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await harness.user.selectOptions(
      await screen.findByRole('combobox', { name: /Attribute filled in/ }),
      'relationship_to_ego',
    );

    const request = await harness.submit();
    expect(request?.stageDocument.quickAdd).toBe('relationship_to_ego');
  });

  /**
   * The attribute exists in the codebook the moment it is created, and the
   * stage that names it is then pointed at it — which is the point of
   * inventing one here rather than sending the researcher to the codebook and
   * back.
   */
  it('creates an attribute for the stage to fill in, and selects it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await writeInto(
      harness,
      await screen.findByRole('textbox', { name: /Create a new attribute/ }),
      'nickname',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    const created = await waitFor(() => {
      const variables = harness.hostCodebook().node?.person?.variables ?? {};
      const entry = Object.entries(variables).find(
        ([, variable]) => variable.name === 'nickname',
      );
      if (entry === undefined) throw new Error('nothing was created yet');
      return entry;
    });
    // Created with the rule its role requires: the typed value is the only
    // thing the participant gave, so it may not be left empty.
    expect(created[1]).toMatchObject({
      name: 'nickname',
      type: 'text',
      validation: { required: true },
    });

    await waitFor(() => expect(picker()).toHaveValue(created[0]));
    const request = await harness.submit();
    expect(request?.stageDocument.quickAdd).toBe(created[0]);
  });

  /**
   * A quick-add name generator adds whatever node type its stage is about —
   * the repository's own development protocol uses this interface for a venue
   * — so copy calling what the participant adds "someone", and the attribute
   * "a person's name", was wrong for every study that is not about people.
   * Every sentence naming what the stage adds says it in the researcher's own
   * word for the type.
   */
  it('names what the stage adds in the researcher’s own words', async () => {
    renderStageEditor({
      stage: {
        id: 'quick-add-family-members',
        type: 'NameGeneratorQuickAdd',
        fields: {
          label: 'Quick add',
          subject: { entity: 'node', type: 'family_member' },
          quickAdd: 'fm_name',
          prompts: [{ id: 'prompt-1', text: 'Add your relatives' }],
        },
      },
      sections: quickAdd,
    });

    expect(
      await screen.findByText(
        'Choose the attribute the participant fills in when they add a “family member” with a single box.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'What the participant types here is the only thing they gave, so a “family member” added without it has no name. Requiring an answer changes the attribute everywhere the protocol uses it.',
      ),
    ).toBeInTheDocument();
    // Shown before a type has been chosen as well, so this one names nothing.
    expect(
      screen.getByText(
        'What the participant types goes here. Use the attribute holding the name unless you have a reason not to — the interview labels what it creates by it.',
      ),
    ).toBeInTheDocument();
  });

  /** A collaborator adding an attribute has to reach the picker. */
  it('offers an attribute another session added', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await screen.findByRole('combobox', { name: /Attribute filled in/ });
    harness.receiveCodebookUpdate({
      node: {
        person: {
          name: 'person',
          color: 'node-color-seq-1',
          icon: 'add-a-person',
          shape: { default: 'circle' },
          variables: {
            name: { name: 'name', type: 'text', component: 'Text' },
            alias: { name: 'alias', type: 'text', component: 'Text' },
          },
        },
      },
    });

    await waitFor(() => expect(offered()).toContain('alias'));
  });
});

/**
 * Architect renders the chosen attribute's own validation editor beneath the
 * picker (`sections/QuickAdd/QuickAdd.tsx`), because quick add's whole bargain
 * is that the attribute's rules are honoured as the participant types. The one
 * rule the ROLE itself requires is that the answer exists at all: the typed
 * value is everything the participant gave, and a node created without it has
 * no name.
 *
 * So the section states that rule where the choice is made, rather than
 * leaving the researcher to notice it in the codebook — and offers to add it,
 * as the codebook write it has to be.
 */
describe('a quick-add attribute that need not be answered', () => {
  it('says so, and adds the rule when the researcher accepts', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    expect(
      await screen.findByText('This attribute can be left empty'),
    ).toBeInTheDocument();

    await harness.user.click(
      screen.getByRole('button', { name: 'Require an answer' }),
    );

    await waitFor(() =>
      // The rule it already carried survives: this adds one, it does not
      // replace the attribute's rules with its own.
      expect(personValidation(harness, 'name')).toEqual({
        unique: true,
        required: true,
      }),
    );
    expect(
      screen.queryByText('This attribute can be left empty'),
    ).not.toBeInTheDocument();
  });

  /**
   * The rule belongs to the codebook rather than to this stage, so adding it
   * is a codebook write and a colleague holding the type refuses it. Said in
   * the researcher's terms, and said outside the offer: the offer is about an
   * attribute that can be left empty, so a refusal rendered inside it would go
   * with the warning the moment the attribute changed, leaving whoever pressed
   * the button with no account of what happened.
   */
  it('names the colleague who refused the rule, and leaves the offer standing', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
      heldSections: [
        {
          sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
          displayName: 'Robin',
        },
      ],
    });

    await screen.findByText('This attribute can be left empty');
    await harness.user.click(
      screen.getByRole('button', { name: 'Require an answer' }),
    );

    expect(
      await screen.findByText(
        'Robin is currently editing a section needed for this change.',
      ),
    ).toBeInTheDocument();
    // Nothing was written, which is what makes the sentence true — and the
    // offer is still there to be accepted once the colleague lets go.
    expect(personValidation(harness, 'name')).toEqual({ unique: true });
    expect(
      screen.getByRole('button', { name: 'Require an answer' }),
    ).toBeEnabled();
  });

  /**
   * Accepting the offer destroys the control that was pressed: the warning it
   * sits in is about an attribute that can be left empty, and the attribute no
   * longer can. Focus fell to `<body>` with it, so a researcher working from
   * the keyboard was returned to the top of the document with nothing said,
   * and a screen-reader user was told nothing had happened at all.
   */
  it('hands the researcher back to the picker, and says what changed', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await screen.findByText('This attribute can be left empty');
    const accept = screen.getByRole('button', { name: 'Require an answer' });
    accept.focus();
    await harness.user.click(accept);

    await waitFor(() =>
      expect(
        screen.queryByText('This attribute can be left empty'),
      ).not.toBeInTheDocument(),
    );
    expect(picker()).toBe(document.activeElement);
    // Reached through the sentence rather than through the region, because the
    // picker beside this one keeps a live region of its own mounted whether it
    // is saying anything or not. Still a claim about the region: this is what
    // makes the sentence reach a screen reader at all.
    expect(
      (
        await screen.findByText(
          'This attribute now has to be answered, everywhere the protocol uses it.',
        )
      ).closest('[role="status"]'),
    ).not.toBeNull();
  });

  it('says nothing about an attribute that already requires an answer', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await screen.findByRole('combobox', { name: /Attribute filled in/ });
    harness.receiveCodebookUpdate({
      node: {
        person: {
          name: 'person',
          color: 'node-color-seq-1',
          icon: 'add-a-person',
          shape: { default: 'circle' },
          variables: {
            name: {
              name: 'name',
              type: 'text',
              component: 'Text',
              validation: { required: true },
            },
          },
        },
      },
    });

    await waitFor(() =>
      expect(
        screen.queryByText('This attribute can be left empty'),
      ).not.toBeInTheDocument(),
    );
  });

  /**
   * The offer is about the attribute the picker holds, so moving the picker
   * asks a different question — and the answer to the old one is said rather
   * than swallowed, because the rule was really added to the attribute it was
   * asked about.
   */
  it('says where a rule went when the picker moved off the attribute', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await screen.findByText('This attribute can be left empty');
    await harness.user.click(
      screen.getByRole('button', { name: 'Require an answer' }),
    );
    await screen.findByText(
      'This attribute now has to be answered, everywhere the protocol uses it.',
    );

    await harness.user.selectOptions(picker(), 'relationship_to_ego');

    // The sentence about the attribute the picker still held is no longer
    // true of it, and nothing is said about a choice the researcher has since
    // made.
    await waitFor(() =>
      expect(
        screen.queryByText(
          'This attribute now has to be answered, everywhere the protocol uses it.',
        ),
      ).not.toBeInTheDocument(),
    );
  });
});
