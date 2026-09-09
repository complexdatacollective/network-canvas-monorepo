import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import { renderStageEditor } from '../../testing/renderStageEditor.tsx';
import QuickAddSection from '../QuickAddSection.tsx';
import SubjectSection from '../SubjectSection.tsx';
import { changeSubjectTo } from './changeSubject.ts';
import { holdTheHost } from './holdTheHost.ts';

const quickAdd = <QuickAddSection />;

const offered = () =>
  within(screen.getByRole('combobox', { name: /Attribute filled in/ }))
    .getAllByRole('option')
    .map((option) => (option as HTMLOptionElement).value);

/**
 * A control pressed in the window between the host taking editing away and
 * React drawing that fact.
 *
 * Access arrives as a message from the host, and the section is not redrawn
 * until React gets to the update — so the control the researcher is looking at
 * is still the enabled one, and the click that was already on its way reaches
 * a handler the session is about to refuse by throwing. The harness's own
 * `setReadOnly` flushes that render before it returns, which is the one state
 * this scenario is not about, so the access change is made straight on the
 * session and the click is dispatched before anything is flushed. React warns
 * that the update was not wrapped in `act`, which is the point: wrapping it
 * would draw the disabled control this window exists to be in front of.
 */
const clickAsEditingIsRevoked = async (
  harness: ReturnType<typeof renderStageEditor>,
  control: HTMLElement,
): Promise<void> => {
  harness.session.setAccess({ mode: 'readOnly', reason: 'lease-lost' });
  control.dispatchEvent(
    new MouseEvent('click', { bubbles: true, cancelable: true }),
  );
  await act(async () => {
    await Promise.resolve();
  });
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
   * This box is inside the stage's own form, and the form's default button is
   * the host's Save — associated by `form=`, which makes it the default button
   * wherever the host renders it. So Enter, which is what anyone typing a name
   * into a box beside a Create button presses, ran the browser's implicit
   * submission: the stage saved and closed, the attribute was never created,
   * and the name went with the editor.
   *
   * Driven as a real key press rather than through `userEvent`, which looks
   * for a submit button INSIDE the form and so never performs the submission
   * this is about — the assertion is that the event is answered here and does
   * not go on to the form.
   */
  it('creates the attribute when Enter is pressed in the name box', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    const box = await screen.findByRole('textbox', {
      name: /Create a new attribute/,
    });
    await harness.user.type(box, 'nickname');
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    await act(async () => {
      box.dispatchEvent(enter);
    });

    expect(enter.defaultPrevented).toBe(true);
    await waitFor(() =>
      expect(
        Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
          (variable) => variable.name,
        ),
      ).toContain('nickname'),
    );
    expect(
      screen.getByRole('combobox', { name: /Attribute filled in/ }),
    ).not.toHaveValue('name');
  });

  /**
   * The create submits the name as it was when the button was pressed, so a
   * name typed while the answer was on its way is not the one the answer is
   * about: the success erased it and a refusal would have contradicted it. The
   * button was held for that whole window and the box was not.
   */
  it('holds the name box while the write is in flight', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });
    const settle = holdTheHost(harness);

    const box = await screen.findByRole('textbox', {
      name: /Create a new attribute/,
    });
    await harness.user.type(box, 'nickname');
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    expect(box).toBeDisabled();
    await settle();
    // Back, and empty: the codebook holds "nickname" now, and asking for it a
    // second time is refused for a duplicate the researcher did not ask for.
    expect(box).toBeEnabled();
    expect(box).toHaveValue('');
  });

  /**
   * A codebook write is a round trip to the host, and the researcher can
   * change the stage's node type while it is on its way. The attribute lands
   * on the type the request names — the one that was current when they asked —
   * so filling the picker in with it afterwards left `quickAdd` naming an
   * attribute the new type does not have: a reference nothing can save,
   * against a stage they had already moved on from.
   */
  it('does not select an attribute created onto the type the stage has left', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: (
        <>
          <SubjectSection entity="node" />
          <QuickAddSection />
        </>
      ),
    });
    const settle = holdTheHost(harness);

    await harness.user.type(
      await screen.findByRole('textbox', { name: /Create a new attribute/ }),
      'nickname',
    );
    await harness.user.click(
      screen.getByRole('button', { name: 'Create the attribute' }),
    );
    await changeSubjectTo(harness.user, 'family member');
    await settle();

    // The write landed where it was addressed, and the researcher is told so
    // rather than left to find an attribute they cannot see from here.
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).toContain('nickname');
    expect(
      screen
        .getByText(
          '“nickname” was added to the type this stage was about when you asked for it. This stage is about a different type now, so it has not been selected here.',
        )
        .closest('[role="status"]'),
    ).not.toBeNull();
    // Nothing the family-member type does not have was written into the stage.
    expect(
      screen.getByRole('combobox', { name: /Attribute filled in/ }),
    ).toHaveValue('');
    expect(offered()).toEqual(['', 'fm_name']);
  });

  /**
   * The Create button is disabled while the codebook write is in flight, so a
   * write that never answers is a control that never comes back: the
   * researcher is left with a dead button and the name they typed, and taking
   * editing back does not revive it.
   *
   * The session refuses a request it cannot carry by throwing rather than by
   * answering, and that is the one answer the create did not have a path for.
   */
  it('gives the Create button back when the session refuses the write outright', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await harness.user.type(
      await screen.findByRole('textbox', { name: /Create a new attribute/ }),
      'nickname',
    );
    await clickAsEditingIsRevoked(
      harness,
      screen.getByRole('button', { name: 'Create the attribute' }),
    );

    harness.setReadOnly(false);
    expect(
      screen.getByRole('button', { name: 'Create the attribute' }),
    ).toBeEnabled();
    // Nothing was written, and the name is still there to try again with.
    expect(
      Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
        (variable) => variable.name,
      ),
    ).not.toContain('nickname');
    expect(
      screen.getByRole('textbox', { name: /Create a new attribute/ }),
    ).toHaveValue('nickname');
  });

  /**
   * A quick-add name generator adds whatever node type its stage is about —
   * the repository's own development protocol uses this interface for a venue
   * — so copy calling what the participant adds "someone", and the attribute
   * "a person's name", was wrong for every study that is not about people.
   * Every sentence naming what the stage adds now says it in the researcher's
   * own word for the type.
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
    // Reached through the sentence rather than through the region, because the
    // create beside this one keeps a live region of its own mounted whether it
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

  /**
   * The offer's own button carries the same guard as the create beside it, and
   * for the same reason: it is disabled while the codebook write is in flight,
   * so a write that throws instead of answering leaves the offer on screen
   * with no way to accept it.
   */
  it('gives the offer back when the session refuses the write outright', async () => {
    const harness = renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: quickAdd,
    });

    await screen.findByText('This attribute can be left empty');
    await clickAsEditingIsRevoked(
      harness,
      screen.getByRole('button', { name: 'Require an answer' }),
    );

    harness.setReadOnly(false);
    expect(
      screen.getByRole('button', { name: 'Require an answer' }),
    ).toBeEnabled();
    expect(personVariable(harness, 'name')).not.toMatchObject({
      validation: { required: true },
    });
    expect(
      screen.getByText(
        'This attribute could not be changed, so nothing was changed. Try again.',
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

/**
 * Every codebook write this section asks for is a round trip to the host, and
 * the researcher can act inside it: the attribute picker stays live while an
 * answer is on its way, and so does the type picker above it. One rule covers
 * every one of those interleavings — the write itself is never undone, but it
 * is applied HERE only if the section is still pointed at what the request was
 * asked about, and where it is not, what happened is SAID rather than silently
 * done or silently dropped.
 *
 * Enumerated as a table because the failures were found one interleaving at a
 * time: the type repointed, the picker re-answered, the attribute removed by a
 * collaborator, editing taken away. They are the same defect, and a rule that
 * held for one of them and not the others is not a rule.
 */
describe('an answer that arrives after the section has moved on', () => {
  const picker = () =>
    screen.getByRole('combobox', { name: /Attribute filled in/ });

  /**
   * The live regions on the page right now, as element identities.
   *
   * A screen reader announces a change to a region it was already watching; a
   * region inserted with its content already in it is not reliably announced
   * at all. So "was this said?" is two questions — is the sentence there, and
   * was the region holding it on the page BEFORE the sentence arrived — and
   * the identities are what answers the second.
   */
  const liveRegions = () => new Set(screen.queryAllByRole('status'));

  /**
   * The live region a sentence is being said in, which is the claim that it
   * reaches a screen reader at all.
   */
  const said = (sentence: string): Element => {
    const region = screen.getByText(sentence).closest('[role="status"]');
    if (region === null) {
      throw new Error(`“${sentence}” is not being said in a live region`);
    }
    return region;
  };

  const openEditor = () =>
    renderStageEditor({
      stageId: 'name-generator-quick-add-1',
      sections: (
        <>
          <SubjectSection entity="node" />
          <QuickAddSection />
        </>
      ),
    });

  /** The record key the codebook gave an attribute of the person type. */
  const personVariableNamed = (
    harness: ReturnType<typeof renderStageEditor>,
    name: string,
  ): string => {
    const found = Object.entries(
      harness.hostCodebook().node?.person?.variables ?? {},
    ).find(([, variable]) => variable.name === name);
    if (found === undefined) {
      throw new Error(`the codebook holds no attribute called ${name}`);
    }
    return found[0];
  };

  type Interleaving = Readonly<{
    /** What happens while the request is in flight. */
    what: string;
    happens: (harness: ReturnType<typeof renderStageEditor>) => Promise<void>;
    /** What the section says once the answer has landed. */
    says: string;
    /**
     * What the attribute picker holds afterwards — `'created'` for the
     * attribute the request created, which has no id until it exists.
     */
    fillsIn: string;
  }>;

  const createInterleavings: readonly Interleaving[] = [
    {
      what: 'nothing moves underneath it',
      happens: async () => undefined,
      says: '',
      fillsIn: 'created',
    },
    {
      what: 'the researcher changes the node type',
      happens: (harness) => changeSubjectTo(harness.user, 'family member'),
      says: '“nickname” was added to the type this stage was about when you asked for it. This stage is about a different type now, so it has not been selected here.',
      fillsIn: '',
    },
    {
      what: 'the researcher chooses another attribute',
      happens: (harness) =>
        harness.user.selectOptions(picker(), 'relationship_to_ego'),
      says: '“nickname” was added to the codebook. You have chosen a different attribute here since you asked for it, so it has not been selected.',
      fillsIn: 'relationship_to_ego',
    },
  ];

  it.each(createInterleavings)(
    'adds the attribute, and selects it only if $what',
    async ({ happens, says, fillsIn }) => {
      const harness = openEditor();
      const settle = holdTheHost(harness);

      await harness.user.type(
        await screen.findByRole('textbox', { name: /Create a new attribute/ }),
        'nickname',
      );
      await harness.user.click(
        screen.getByRole('button', { name: 'Create the attribute' }),
      );
      await happens(harness);
      const watched = liveRegions();
      await settle();

      // The write landed where it was addressed, whatever became of it here.
      expect(
        Object.values(harness.hostCodebook().node?.person?.variables ?? {}).map(
          (variable) => variable.name,
        ),
      ).toContain('nickname');
      expect(picker()).toHaveValue(
        fillsIn === 'created'
          ? personVariableNamed(harness, 'nickname')
          : fillsIn,
      );
      if (says === '') return;
      expect(watched).toContain(said(says));
    },
  );

  const requireInterleavings: readonly Interleaving[] = [
    {
      what: 'nothing moves underneath it',
      happens: async () => undefined,
      says: 'This attribute now has to be answered, everywhere the protocol uses it.',
      fillsIn: 'name',
    },
    {
      what: 'the researcher changes the node type',
      happens: (harness) => changeSubjectTo(harness.user, 'family member'),
      says: '“name” now has to be answered, everywhere the protocol uses it. It is not the attribute this stage fills in any more.',
      fillsIn: '',
    },
    {
      what: 'the researcher chooses another attribute',
      happens: (harness) =>
        harness.user.selectOptions(picker(), 'relationship_to_ego'),
      says: '“name” now has to be answered, everywhere the protocol uses it. It is not the attribute this stage fills in any more.',
      fillsIn: 'relationship_to_ego',
    },
  ];

  it.each(requireInterleavings)(
    'requires the answer, and says so where the researcher is looking when $what',
    async ({ happens, says, fillsIn }) => {
      const harness = openEditor();
      const settle = holdTheHost(harness);

      await screen.findByText('This attribute can be left empty');
      await harness.user.click(
        screen.getByRole('button', { name: 'Require an answer' }),
      );
      await happens(harness);
      const watched = liveRegions();
      await settle();

      expect(
        harness.hostCodebook().node?.person?.variables?.name,
      ).toMatchObject({ validation: { required: true } });
      expect(picker()).toHaveValue(fillsIn);
      expect(watched).toContain(said(says));
    },
  );

  /**
   * A collaborator deleting the attribute under the request is the one
   * interleaving where nothing is written at all. The refusal used to be shown
   * inside the warning the offer sits in — and that warning is about an
   * attribute that is no longer there, so it went with it, leaving a
   * researcher who pressed a button with no account of what happened.
   */
  it('says a requirement was refused even when the attribute it was about is gone', async () => {
    const harness = openEditor();
    const settle = holdTheHost(harness);

    await screen.findByText('This attribute can be left empty');
    await harness.user.click(
      screen.getByRole('button', { name: 'Require an answer' }),
    );
    harness.receiveCodebookUpdate({
      node: {
        person: {
          name: 'person',
          color: 'node-color-seq-1',
          icon: 'add-a-person',
          shape: { default: 'circle' },
          variables: {
            relationship_to_ego: {
              name: 'relationship_to_ego',
              type: 'text',
              component: 'Text',
            },
          },
        },
      },
    });
    await settle();

    expect(
      screen.getByText(
        'Someone else changed this while you were editing it, so nothing was saved. Close and reopen this editor to load their version, then make your change again.',
      ),
    ).toBeInTheDocument();
  });
});
