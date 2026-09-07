import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import QuickAddSection from '../QuickAddSection.tsx';

const quickAdd = <QuickAddSection />;

const offered = () =>
  within(screen.getByRole('combobox', { name: /Attribute filled in/ }))
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

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
   * The attribute and the stage that references it must land together or not
   * at all, which is why creating one is a compound edit — and why the new
   * attribute is selected here rather than left for the researcher to find.
   */
  it('creates an attribute for the stage to fill in, and selects it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await harness.user.type(
      await screen.findByRole('textbox', { name: /Create a new attribute/ }),
      'nickname',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    const person = await waitFor(() => {
      const document =
        harness.host.getSnapshot().protocolSections['codebook:node:person'];
      const variables =
        typeof document === 'object' && document !== null
          ? Reflect.get(document, 'variables')
          : undefined;
      const created = Object.entries(
        (variables ?? {}) as Record<string, { name?: string }>,
      ).find(([, variable]) => variable.name === 'nickname');
      if (created === undefined) throw new Error('nothing was created yet');
      return created;
    });

    // Created with the rule its role requires: the typed value is the only
    // thing the participant gave, so it may not be left empty.
    expect(person[1]).toMatchObject({
      name: 'nickname',
      type: 'text',
      validation: { required: true },
    });

    const request = await harness.submit();
    expect(request?.stageDocument.quickAdd).toBe(person[0]);
  });

  /**
   * A collaborator adding an attribute is not this session's edit. It has to
   * reach the picker, and it must not be echoed back as a command of ours.
   */
  it('offers an attribute another session added, without claiming it', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await screen.findByRole('combobox', { name: /Attribute filled in/ });
    const before = harness.pendingCommands().length;
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
    expect(harness.pendingCommands()).toHaveLength(before);
  });
});

/**
 * Architect renders the chosen attribute's own validation editor beneath the
 * picker (`sections/QuickAdd/QuickAdd.tsx`), because quick add's whole
 * bargain is that the attribute's rules are honoured as the participant types.
 * The one rule the ROLE itself requires is that the answer exists at all: the
 * typed value is everything the participant gave, and a node created without
 * it has no name.
 *
 * So the section states that rule where the choice is made, rather than
 * leaving the researcher to notice it in the codebook — and offers to add it,
 * as the compound edit a codebook write from a stage editor has to be.
 */
describe('a quick-add attribute that need not be answered', () => {
  const personVariable = (
    harness: ReturnType<typeof renderStageEditor>,
    variableId: string,
  ) => {
    const person =
      harness.session.getSnapshot().protocolSections[
        sectionId({ kind: 'codebookNode', typeId: 'person' })
      ];
    if (person === undefined) throw new Error('the person type is gone');
    return (
      person.variables as Record<
        string,
        { validation?: Record<string, unknown> }
      >
    )[variableId];
  };

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
      expect(personVariable(harness, 'name')).toMatchObject({
        // The rule it already carried survives: this adds one, it does not
        // replace the attribute's rules with its own.
        validation: { unique: true, required: true },
      }),
    );
    expect(
      screen.queryByText('This attribute can be left empty'),
    ).not.toBeInTheDocument();
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
    expect(screen.getByRole('combobox', { name: /Attribute filled in/ })).toBe(
      document.activeElement,
    );
    expect(
      within(await screen.findByRole('status')).getByText(
        'This attribute now has to be answered, everywhere the protocol uses it.',
      ),
    ).toBeInTheDocument();
  });

  it('says nothing about an attribute that already requires an answer', async () => {
    const harness = renderStageEditor({
      stage: {
        id: 'quick-add-already-required',
        type: 'NameGeneratorQuickAdd',
        fields: {
          label: 'Quick add',
          subject: { entity: 'node', type: 'person' },
          quickAdd: 'name',
          prompts: [{ id: 'prompt-1', text: 'Add someone' }],
        },
      },
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
});
