import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { InMemoryClient } from '../../../testing/host/createInMemoryHost.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { anonymisationStageEditor } from '../AnonymisationStageEditor.ts';
import {
  alreadyProtecting,
  attributeCheckbox,
  personDocument,
  personVariable,
  switchOnType,
} from './anonymisationFixtures.tsx';

const openEditor = (): StageEditorHarness =>
  renderStageEditor({
    stageId: 'anonymisation-1',
    registry: anonymisationStageEditor,
  });

describe('the sections of an anonymisation stage', () => {
  it('reports each decision the stage holds separately', async () => {
    const harness = openEditor();

    await waitFor(() => expect(harness.outline()).toHaveLength(6));
    expect(harness.outline().slice(0, 4)).toEqual([
      { title: 'Stage name', state: 'Finished' },
      { title: 'Passphrase explanation', state: 'Finished' },
      { title: 'Passphrase rules', state: 'Finished' },
      { title: 'Encrypted attributes', state: 'Finished' },
    ]);
  });

  it('saves a rewritten explanation', async () => {
    const harness = openEditor();

    const heading = await screen.findByRole('textbox', {
      name: 'Explanation heading',
    });
    await harness.user.clear(heading);
    await harness.user.type(heading, 'Your answers are protected');

    const saved = await harness.submit();
    expect(saved?.stageDocument.explanationText).toEqual({
      title: 'Your answers are protected',
      body: expect.stringContaining('encrypt the names of people'),
    });
  });

  /**
   * The schema refuses an explanation with no heading, but only once the save
   * has been attempted and only against a path. The section has to refuse it
   * where the researcher is looking.
   */
  it('refuses to save an explanation with no heading', async () => {
    const harness = openEditor();

    await harness.user.clear(
      await screen.findByRole('textbox', { name: 'Explanation heading' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByRole('textbox', { name: 'Explanation heading' }),
    ).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses passphrase rules whose shortest allowed length exceeds its longest', async () => {
    const harness = openEditor();

    const minimum = await screen.findByRole('spinbutton', {
      name: /minimum length/i,
    });
    await harness.user.clear(minimum);
    await harness.user.type(minimum, '40');
    const maximum = await screen.findByRole('spinbutton', {
      name: /maximum length/i,
    });
    await harness.user.clear(maximum);
    await harness.user.type(maximum, '5');

    expect(await harness.submit()).toBeNull();
    const refusal =
      'The shortest passphrase you allow cannot be longer than the longest one.';
    expect(await screen.findByText(refusal)).toBeInTheDocument();
    // One sentence, and the translated one. The rule editor's own verdict for
    // this map is the contradiction analyser's untranslated wording
    // (`minLength (40) is greater than maxLength (5)`), so it stands down for
    // the refusal the field is stating rather than adding a second sentence.
    expect(screen.getAllByText(refusal)).toHaveLength(1);
    expect(screen.queryByText(/is greater than maxLength/)).toBeNull();
    // And the control the field marks invalid describes that sentence: the
    // editor's root carries the field's `aria-invalid`, so dropping the
    // field's `aria-describedby` left the only refused element on screen
    // describing nothing at all.
    const refused = document.querySelector(
      '[data-field-name="validation"] [aria-invalid="true"]',
    );
    expect(refused).not.toBeNull();
    expect(refused).toHaveAccessibleDescription(new RegExp(refusal));
  });

  /**
   * The interview asks every participant for a passphrase and refuses an empty
   * one, so a maximum of zero is a length no passphrase can have: the stage
   * would render, refuse everything the participant types, and the interview
   * could never be finished. Both halves of that are this stage's own rules,
   * so this stage is where it is refused.
   */
  it('refuses a longest passphrase of no characters at all', async () => {
    const harness = openEditor();

    // The minimum rule off, so this is about the maximum alone rather than
    // about a minimum that now exceeds it.
    await harness.user.click(
      await screen.findByRole('checkbox', { name: 'Minimum length' }),
    );
    const maximum = await screen.findByRole('spinbutton', {
      name: /maximum length/i,
    });
    await harness.user.clear(maximum);
    await harness.user.type(maximum, '0');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'The longest passphrase you allow must be at least one character.',
      ),
    ).toBeInTheDocument();
    // And reported where a researcher goes looking for what to correct.
    expect(
      harness.outline().find((section) => section.title === 'Passphrase rules'),
    ).toEqual({ title: 'Passphrase rules', state: 'Has a problem' });
  });

  /**
   * A rule switched on and left empty is kept as `null` rather than quietly
   * dropped, so the researcher can go back and finish it — which means
   * something has to refuse the SAVE while it is there. The rule editor states
   * the problem at the control for itself; this section passes the same
   * verdict through as the field's own validation, which is what marks the
   * control invalid, blocks the submit and lets the outline name the section
   * to go back to. Without the passthrough the stage saves, and the protocol
   * schema rejects it afterwards against a path.
   */
  it('refuses a passphrase rule that was switched on and left empty', async () => {
    const harness = openEditor();

    await harness.user.clear(
      await screen.findByRole('spinbutton', { name: 'Minimum length' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      harness.outline().find((section) => section.title === 'Passphrase rules'),
    ).toEqual({ title: 'Passphrase rules', state: 'Has a problem' });
    // Once on screen. The rule editor states a verdict for itself where it has
    // no host to state it, but here the field's error region — an `aria-live`
    // region, beside the control the editor marks invalid — is already saying
    // this one, so the editor's own alert stands down rather than repeating it.
    expect(
      await screen.findAllByText(
        'Enter a value for "Minimum length", or switch the rule off.',
      ),
    ).toHaveLength(1);
    expect(
      screen.getByRole('spinbutton', { name: 'Minimum length' }),
    ).toHaveAttribute('aria-invalid', 'true');
  });

  /**
   * Absence is how the schema spells "no rules", so switching the capability
   * off has to remove the key rather than store an empty object.
   */
  it('removes the passphrase rules when they are switched off', async () => {
    const harness = openEditor();

    await harness.user.click(
      await screen.findByRole('switch', { name: 'Passphrase rules' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove the rules' }),
    );

    const saved = await harness.submit();
    expect(saved).not.toBeNull();
    expect(Object.hasOwn(saved?.stageDocument ?? {}, 'validation')).toBe(false);
  });
});

describe('the attributes a passphrase protects', () => {
  it('offers the text attributes of each type, and nothing else', async () => {
    const harness = openEditor();
    await switchOnType(harness, 'person');
    await switchOnType(harness, 'family member');

    const person = within(
      screen.getByRole('group', {
        name: 'Encrypted attributes for person',
      }),
    );
    for (const text of ['composerName', 'name', 'relationship_to_ego']) {
      expect(person.getByRole('checkbox', { name: text })).toBeInTheDocument();
    }
    // `age` is a number and `flagged` a boolean: encrypting either would store
    // it in the clear while telling the researcher otherwise.
    for (const other of ['age', 'flagged', 'contactType', 'location']) {
      expect(person.queryByRole('checkbox', { name: other })).toBeNull();
    }
    // Each type is asked separately, so an attribute of one is never offered
    // under another.
    expect(
      within(
        screen.getByRole('group', {
          name: 'Encrypted attributes for family member',
        }),
      ).queryByRole('checkbox', { name: 'name' }),
    ).toBeNull();
  });

  /**
   * `encrypted` belongs to the codebook attribute, not to this stage, so the
   * toggle is a codebook edit taken under that section's own lock and
   * committed at once — never part of the stage's save.
   */
  it('writes the flag to the codebook, and puts nothing on the stage', async () => {
    const harness = openEditor();
    await switchOnType(harness, 'person');

    await harness.user.click(attributeCheckbox('person', 'name'));

    await waitFor(() =>
      expect(personVariable(harness, 'name').encrypted).toBe(true),
    );
    // The stage itself is untouched: the flag is not a stage field, and the
    // stage still saves as the stage it opened.
    await harness.roundTrip();
  });

  /** Absence is how the schema spells "not encrypted". */
  it('removes the flag rather than storing false', async () => {
    const harness = openEditor();
    await switchOnType(harness, 'person');

    await harness.user.click(attributeCheckbox('person', 'name'));
    await waitFor(() =>
      expect(personVariable(harness, 'name').encrypted).toBe(true),
    );

    await harness.user.click(attributeCheckbox('person', 'name'));
    await waitFor(() =>
      expect(Object.hasOwn(personVariable(harness, 'name'), 'encrypted')).toBe(
        false,
      ),
    );
  });

  /**
   * The codebook edit commits on its own, so an edit the researcher has in
   * progress on the stage has to be untouched by it — ticking a box must not
   * discard the sentence they were part way through writing.
   */
  it('keeps an unsaved stage edit made before the toggle', async () => {
    const harness = openEditor();
    const heading = await screen.findByRole('textbox', {
      name: 'Explanation heading',
    });
    await harness.user.clear(heading);
    await harness.user.type(heading, 'Rewritten heading');
    await switchOnType(harness, 'person');

    await harness.user.click(attributeCheckbox('person', 'name'));
    await waitFor(() =>
      expect(attributeCheckbox('person', 'name')).toBeChecked(),
    );

    expect(
      screen.getByRole('textbox', { name: 'Explanation heading' }),
    ).toHaveValue('Rewritten heading');
    const saved = await harness.submit();
    expect(saved?.stageDocument.explanationText).toMatchObject({
      title: 'Rewritten heading',
    });
  });

  it('shows the flag as the codebook holds it, not as this section left it', async () => {
    const harness = openEditor();
    await switchOnType(harness, 'person');

    await harness.user.click(attributeCheckbox('person', 'name'));

    await waitFor(() =>
      expect(attributeCheckbox('person', 'name')).toBeChecked(),
    );
    expect(
      attributeCheckbox('person', 'relationship_to_ego'),
    ).not.toBeChecked();
  });

  /**
   * An attribute that stops being text stops being encryptable. This section
   * is not a party to that edit and must not answer it with one of its own:
   * the stage still saves as the stage it opened.
   */
  it('follows a collaborator changing an attribute out of text, without echoing it', async () => {
    const harness = openEditor();
    await switchOnType(harness, 'person');
    const person = personDocument(harness);
    const variables = {
      ...(person.variables as Record<string, unknown>),
      name: { name: 'name', type: 'number' },
    };

    harness.receiveCodebookUpdate({
      node: { person: { ...person, variables } },
    });

    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'name' })).toBeNull(),
    );
    await harness.roundTrip();
  });

  it('says so when a type has nothing that can be encrypted', async () => {
    const harness = openEditor();
    await switchOnType(harness, 'person');
    const person = personDocument(harness);

    harness.receiveCodebookUpdate({
      node: { person: { ...person, variables: {} } },
    });

    expect(
      await screen.findByText(
        'This type has no text attributes, so it has nothing that can be encrypted.',
      ),
    ).toBeInTheDocument();
  });

  /**
   * The codebook section is locked before it is written, so a collaborator
   * holding the type is refused by name rather than silently ignored — and
   * the codebook is left exactly as they have it.
   */
  it('refuses the change, naming whoever holds the type', async () => {
    const harness = renderStageEditor({
      stageId: 'anonymisation-1',
      registry: anonymisationStageEditor,
      heldSections: [
        {
          sectionId: sectionId({ kind: 'codebookNode', typeId: 'person' }),
          displayName: 'Robin',
        },
      ],
    });
    await switchOnType(harness, 'person');

    await harness.user.click(attributeCheckbox('person', 'name'));

    const refusal = await screen.findByText(/Robin/);
    // A notice rather than an alert, as every other codebook writer says it:
    // a section somebody else is holding is not a fault, and the change lands
    // once they are finished.
    expect(refusal.closest('[role]')).toHaveAttribute('role', 'status');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(Object.hasOwn(personVariable(harness, 'name'), 'encrypted')).toBe(
      false,
    );
  });

  /**
   * Every checkbox here goes disabled while a codebook write is in flight, so
   * a tick made in that window reaches nothing. Saying the section is saving
   * is what keeps that from being silent: without it the researcher ticks a
   * second attribute, watches the box refuse to move, and is told nothing
   * about why or about the change that is already on its way.
   */
  it('says a change is in flight, so a tick the section drops is not silent', async () => {
    const gate = Promise.withResolvers<void>();
    const harness = renderStageEditor({
      stageId: 'anonymisation-1',
      registry: anonymisationStageEditor,
      client: (host) => {
        const submit: InMemoryClient['submit'] = async (
          ...args: Parameters<InMemoryClient['submit']>
        ) => {
          await gate.promise;
          return host.client.submit(...args);
        };
        return new Proxy(host.client, {
          get: (target, property) =>
            property === 'submit' ? submit : Reflect.get(target, property),
        });
      },
    });
    await switchOnType(harness, 'person');

    await harness.user.click(attributeCheckbox('person', 'name'));

    // On screen while the protocol has the write and has not answered.
    expect(await screen.findByText('Saving…')).toBeInTheDocument();
    expect(attributeCheckbox('person', 'relationship_to_ego')).toHaveAttribute(
      'aria-disabled',
      'true',
    );

    await harness.user.click(
      attributeCheckbox('person', 'relationship_to_ego'),
    );
    gate.resolve();

    await waitFor(() =>
      expect(personVariable(harness, 'name').encrypted).toBe(true),
    );
    await waitFor(() => expect(screen.queryByText('Saving…')).toBeNull());
    // The second tick was dropped, and nothing on screen claims otherwise.
    expect(
      Object.hasOwn(
        personVariable(harness, 'relationship_to_ego'),
        'encrypted',
      ),
    ).toBe(false);
    expect(
      attributeCheckbox('person', 'relationship_to_ego'),
    ).not.toBeChecked();
  });

  /**
   * Switching a whole type off is one decision, and it is the only affordance
   * that can reach every attribute of that type at once.
   *
   * A study protecting a dozen attributes of a type is otherwise a dozen
   * clicks to stop protecting, each its own codebook write; and an attribute
   * retyped away from text is not among the checkboxes at all, so nothing else
   * on screen can take its flag off.
   */
  describe('switching a whole type off', () => {
    const openProtecting = (): StageEditorHarness =>
      renderStageEditor({
        stageId: 'anonymisation-1',
        registry: anonymisationStageEditor,
        client: alreadyProtecting('name'),
      });

    /** The confirmation this loss is worth, answered. */
    const confirmClear = async (harness: StageEditorHarness): Promise<void> => {
      await harness.user.click(
        await screen.findByRole('button', {
          name: 'Clear encrypted attributes',
        }),
      );
    };

    it('stands open on a type that already protects something', async () => {
      const harness = openProtecting();
      await harness.opened();

      expect(screen.getByRole('switch', { name: 'person' })).toBeChecked();
      await waitFor(() =>
        expect(attributeCheckbox('person', 'name')).toBeChecked(),
      );
    });

    it('un-encrypts every attribute of that type at once', async () => {
      const harness = openProtecting();
      await waitFor(() =>
        expect(attributeCheckbox('person', 'name')).toBeChecked(),
      );
      await harness.user.click(
        attributeCheckbox('person', 'relationship_to_ego'),
      );
      await waitFor(() =>
        expect(personVariable(harness, 'relationship_to_ego').encrypted).toBe(
          true,
        ),
      );

      await harness.user.click(screen.getByRole('switch', { name: 'person' }));
      await confirmClear(harness);

      await waitFor(() =>
        expect(
          Object.hasOwn(personVariable(harness, 'name'), 'encrypted'),
        ).toBe(false),
      );
      expect(
        Object.hasOwn(
          personVariable(harness, 'relationship_to_ego'),
          'encrypted',
        ),
      ).toBe(false);
      // The panel goes with them: there is nothing left for it to show.
      await waitFor(() =>
        expect(
          screen.queryByRole('group', {
            name: 'Encrypted attributes for person',
          }),
        ).toBeNull(),
      );
    });

    it('leaves them encrypted when the researcher declines', async () => {
      const harness = openProtecting();
      await waitFor(() =>
        expect(attributeCheckbox('person', 'name')).toBeChecked(),
      );

      await harness.user.click(screen.getByRole('switch', { name: 'person' }));
      await harness.user.click(
        await screen.findByRole('button', { name: 'Cancel' }),
      );

      await waitFor(() =>
        expect(
          screen.queryByRole('button', {
            name: 'Clear encrypted attributes',
          }),
        ).toBeNull(),
      );
      expect(personVariable(harness, 'name').encrypted).toBe(true);
      expect(attributeCheckbox('person', 'name')).toBeChecked();
    });

    /**
     * The sweep is written against the codebook as it stands when the lock is
     * taken, not against the boxes the researcher was looking at.
     *
     * A collaborator encrypting an attribute while the confirmation is on
     * screen is the case: the researcher has just said no attribute of this
     * type should be encrypted, and a sweep built from the stale view would
     * close the switch over one that still is.
     */
    it('reaches an attribute encrypted while the confirmation was open', async () => {
      const harness = openProtecting();
      await waitFor(() =>
        expect(attributeCheckbox('person', 'name')).toBeChecked(),
      );

      await harness.user.click(screen.getByRole('switch', { name: 'person' }));
      await screen.findByRole('button', {
        name: 'Clear encrypted attributes',
      });

      const person = personDocument(harness);
      harness.receiveCodebookUpdate({
        node: {
          person: {
            ...person,
            variables: {
              ...(person.variables as Record<string, unknown>),
              relationship_to_ego: {
                name: 'relationship_to_ego',
                type: 'text',
                encrypted: true,
              },
            },
          },
        },
      });
      await confirmClear(harness);

      await waitFor(() =>
        expect(
          Object.hasOwn(
            personVariable(harness, 'relationship_to_ego'),
            'encrypted',
          ),
        ).toBe(false),
      );
      expect(Object.hasOwn(personVariable(harness, 'name'), 'encrypted')).toBe(
        false,
      );
    });

    /** Switching a type ON is not a decision about any attribute. */
    it('writes nothing when a type is switched on', async () => {
      const harness = openEditor();
      await switchOnType(harness, 'person');

      expect(Object.hasOwn(personVariable(harness, 'name'), 'encrypted')).toBe(
        false,
      );
      expect(
        screen.queryByRole('button', { name: 'Clear encrypted attributes' }),
      ).toBeNull();
    });
  });

  it('cannot be toggled by a spectator', async () => {
    // Opened on a protocol that already protects something, so the type's
    // panel stands open and its checkboxes are on screen to be read — which
    // is the only state in which a spectator could try to change one.
    renderStageEditor({
      stageId: 'anonymisation-1',
      registry: anonymisationStageEditor,
      readOnly: true,
      client: alreadyProtecting('name'),
    });

    await waitFor(() =>
      expect(attributeCheckbox('person', 'name')).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );
    expect(screen.getByRole('switch', { name: 'person' })).toBeDisabled();
  });
});
