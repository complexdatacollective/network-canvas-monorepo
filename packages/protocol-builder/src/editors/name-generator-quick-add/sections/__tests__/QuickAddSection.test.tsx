import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  attributeField,
  chooseAttributeById,
  offeredAttributes,
  openAttributePicker,
} from '../../../../testing/attributePicker.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../../testing/renderStageEditor.tsx';
import QuickAddSection from '../QuickAddSection.tsx';

const quickAdd = <QuickAddSection />;

/** The label of the field the quick-add attribute is chosen in. */
const LABEL = 'Select an attribute';

/**
 * The field the attribute is chosen in.
 *
 * A scope rather than a control: the choice is made in a window the field's
 * trigger opens, so everything a test does to the picker it does through here.
 */
const picker = (): HTMLElement => attributeField(LABEL);

/** The same, once the section has drawn it. */
const findPicker = async (): Promise<HTMLElement> => {
  await screen.findByText(LABEL, { selector: 'label' });
  return picker();
};

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

    // Waited for: the field is drawn before the stage's own value reaches it,
    // so a synchronous read can catch the picker holding nothing.
    const field = await findPicker();
    await waitFor(() => expect(within(field).getByText('name')).toBeVisible());
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
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    const offered = await offeredAttributes(harness.user, await findPicker());
    expect(offered).toContain('name');
    expect(offered).not.toContain('age');
    expect(offered).not.toContain('contactType');
    expect(offered).not.toContain('layout');
  });

  /**
   * Quick add honours the attribute's own rules as the participant types, so
   * it is a VALIDATED writer: an attribute something else stamps a fixed value
   * onto would mix checked and unchecked answers under one name in the export.
   */
  it('does not offer an attribute another stage writes unvalidated', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'quick-add-without-a-choice',
        // The family type rather than the person one, because the exclusion
        // can only be SEEN where an unvalidated writer and this control are
        // asking for the same kind of attribute. Every text attribute the
        // person type has is written validated, so a person-typed quick add
        // would prove no more than that a boolean is not offered — which the
        // single-box rule above already refuses on type alone.
        type: 'NameGeneratorQuickAdd',
        fields: {
          label: 'Quick add',
          subject: { entity: 'node', type: 'family_member' },
          quickAdd: 'fm_name',
          prompts: [{ id: 'prompt-1', text: 'Quickly add people you know' }],
        },
      },
      sections: quickAdd,
    });

    const offered = await offeredAttributes(harness.user, await findPicker());
    // `fm_name` is collected by a form elsewhere in the protocol, which is a
    // validated use and therefore allowed; `fm_relationship_to_ego` is text as
    // well, and is stamped by the family pedigree — so the same list must not
    // hold it.
    expect(offered).toContain('fm_name');
    expect(offered).not.toContain('fm_relationship_to_ego');
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

    await chooseAttributeById(
      harness.user,
      await findPicker(),
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

    const dialog = await openAttributePicker(harness.user, await findPicker());
    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      'nickname',
    );
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: 'Create new attribute called “nickname”.',
      }),
    );

    const created = await waitFor(() => {
      const variables = harness.hostCodebook().node?.person?.variables ?? {};
      const entry = Object.entries(variables).find(
        ([, variable]) => variable.name === 'nickname',
      );
      if (entry === undefined) throw new Error('nothing was created yet');
      return entry;
    });
    // Born required, as Architect creates it: what the participant types into
    // the quick-add box is the only thing they gave, and a node created
    // without it has no name at all. The validation section below mounts open
    // with the rule on, where the researcher can take it off deliberately.
    expect(created[1]).toEqual({
      name: 'nickname',
      type: 'text',
      validation: { required: true },
    });

    // What the field shows is the researcher's NAME for the attribute; that it
    // is the one just created — rather than another attribute of that name —
    // is what the id the save records below says.
    await waitFor(() =>
      expect(within(picker()).getByText('nickname')).toBeVisible(),
    );
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
        'Choose the attribute populated when a participant creates a node with Quick Add.',
      ),
    ).toBeInTheDocument();
    // Shown before a type has been chosen as well, so this one names nothing.
    expect(
      screen.getByText(
        "Select the attribute that is assigned a value when creating a new node using the Quick Add button. Use an attribute called 'name' here, unless you have a good reason not to. Interviewer will then automatically use this attribute as the label for the node in the interview.",
      ),
    ).toBeInTheDocument();
  });

  /** A collaborator adding an attribute has to reach the picker. */
  it('offers an attribute another session added', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    const field = await findPicker();
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

    await waitFor(async () =>
      expect(await offeredAttributes(harness.user, field)).toContain('alias'),
    );
  });
});

/**
 * Architect renders the chosen attribute's own validation editor beneath the
 * picker, as a nested section the researcher switches on
 * (`sections/QuickAdd/QuickAdd.tsx:109-116`), because quick add's whole
 * bargain is that the attribute's rules are honoured as the participant types.
 * All six of the rules a text attribute can carry are reachable there, in both
 * directions; the package offered one of them, once, behind an Alert.
 */
describe('the rules the quick-add attribute’s answers have to satisfy', () => {
  const validationSwitch = (): HTMLElement =>
    screen.getByRole('switch', { name: 'Validation' });

  it('offers them as a nested section rather than a one-way offer', async () => {
    renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    expect(
      await screen.findByRole('switch', { name: 'Validation' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('This attribute can be left empty'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Require an answer' }),
    ).not.toBeInTheDocument();
  });

  /**
   * Quick add can only ever have chosen a text attribute, so the rules on
   * offer are the schema's six for text, grouped as the codebook groups them.
   */
  it('offers every rule a text attribute can carry, in three groups', async () => {
    renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    // `name` already carries `unique`, so the section mounts open.
    await screen.findByRole('switch', { name: 'Validation' });
    for (const rule of [
      'Required answer',
      'Minimum text length',
      'Maximum text length',
      'Unique value',
      'Different from another attribute',
      'Same as another attribute',
    ]) {
      expect(screen.getByRole('switch', { name: rule })).toBeInTheDocument();
    }
    for (const heading of [
      'Requirements',
      'Limits',
      'Compare to another attribute',
    ]) {
      expect(screen.getByRole('group', { name: heading })).toBeInTheDocument();
    }
  });

  it('writes a rule switched on, and a rule switched off, to the codebook', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );
    // Merged over the rules the attribute already had rather than replacing
    // them: the researcher added one rule, not a rule map.
    await waitFor(() =>
      expect(personValidation(harness, 'name')).toEqual({
        unique: true,
        required: true,
      }),
    );

    await harness.user.click(
      screen.getByRole('switch', { name: 'Required answer' }),
    );
    await waitFor(() =>
      expect(personValidation(harness, 'name')).toEqual({ unique: true }),
    );
  });

  /**
   * A rule switched on with no number yet is kept on screen to be corrected
   * rather than written half-set, and the row says what is missing.
   */
  it('writes a number rule once it has a number, and not before', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    // Switching the rule on writes a length the attribute can satisfy, so the
    // map is never half-set by the act of switching it on.
    await harness.user.click(
      await screen.findByRole('switch', { name: 'Minimum text length' }),
    );
    await waitFor(() =>
      expect(personValidation(harness, 'name')).toEqual({
        unique: true,
        minLength: 1,
      }),
    );

    const value = screen.getByRole('spinbutton', {
      name: 'Minimum text length',
    });
    await harness.user.clear(value);
    await harness.user.tab();

    expect(
      await screen.findByText(
        'Enter a value for "Minimum text length", or switch the rule off.',
      ),
    ).toBeInTheDocument();
    // Nothing was written for the empty box: a rule with no value is kept on
    // screen to be corrected, and the codebook still holds what it last had.
    expect(personValidation(harness, 'name')).toEqual({
      unique: true,
      minLength: 1,
    });

    await harness.user.type(value, '2');
    await harness.user.tab();
    await waitFor(() =>
      expect(personValidation(harness, 'name')).toEqual({
        unique: true,
        minLength: 2,
      }),
    );
  });

  /**
   * Architect clears the attribute's rules silently when the section is
   * switched off, and its own end-to-end helper depends on that being one
   * click (`e2e/pageobjects/editor-sections/quick-add.ts`).
   */
  it('clears every rule when the section is switched off, without asking', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );

    await waitFor(() =>
      expect(
        harness.hostCodebook().node?.person?.variables?.name,
      ).not.toHaveProperty('validation'),
    );
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('mounts closed for an attribute carrying no rules', async () => {
    renderStageEditor({
      stage: {
        id: 'quick-add-without-rules',
        type: 'NameGeneratorQuickAdd',
        fields: {
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'relationship_to_ego',
          prompts: [{ id: 'prompt-1', text: 'Quickly add people you know' }],
        },
      },
      sections: quickAdd,
    });

    expect(
      await screen.findByRole('switch', { name: 'Validation' }),
    ).toHaveAttribute('aria-checked', 'false');
    expect(
      screen.queryByRole('switch', { name: 'Required answer' }),
    ).not.toBeInTheDocument();
  });

  /**
   * The rules belong to the codebook, not to the stage: they commit as they
   * are made and the stage document never carries them.
   */
  it('commits outside the stage draft', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Required answer' }),
    );
    await waitFor(() =>
      expect(personValidation(harness, 'name')).toEqual({
        unique: true,
        required: true,
      }),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).not.toHaveProperty('validation');

    await harness.cancel();
    expect(personValidation(harness, 'name')).toEqual({
      unique: true,
      required: true,
    });
  });

  /**
   * The same refusal, on the other codebook write this section makes — and the
   * name it is about was typed in the picker's window, which stays open on it.
   * A sentence left on this section would be under a modal, which is where the
   * researcher cannot read it, and would still be there after they recovered
   * by choosing an attribute that already exists.
   */
  it('says inside the window why the codebook refused the name', async () => {
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

    const dialog = await openAttributePicker(harness.user, await findPicker());
    await harness.user.type(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
      'nickname',
    );
    await harness.user.click(
      within(dialog).getByRole('option', {
        name: 'Create new attribute called “nickname”.',
      }),
    );

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Robin is currently editing a section needed for this change.',
    );
    // Still open on the name that was refused, which is what the sentence is
    // about and what the researcher has to correct.
    expect(
      within(dialog).getByRole('searchbox', {
        name: 'Find or create an attribute',
      }),
    ).toHaveValue('nickname');
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).not.toContain('nickname');
  });

  /**
   * A codebook write a colleague is holding up is not a fault — it lands once
   * they are finished — so it is said in the notice register, and the switch
   * stays where the researcher left it.
   */
  it('names the colleague holding the codebook, and leaves the switch alone', async () => {
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

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Validation' }),
    );

    expect(
      await screen.findByText(
        'Robin is currently editing a section needed for this change.',
      ),
    ).toBeInTheDocument();
    expect(personValidation(harness, 'name')).toEqual({ unique: true });
    expect(validationSwitch()).toHaveAttribute('aria-checked', 'true');
  });
});
