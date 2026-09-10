import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { anonymisationStageEditor } from '../AnonymisationStageEditor.ts';
import {
  attributeCheckbox,
  personDocument,
  personVariable,
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

    const maximum = await screen.findByRole('spinbutton', {
      name: /maximum length/i,
    });
    await harness.user.clear(maximum);
    await harness.user.type(maximum, '2');

    expect(await harness.submit()).toBeNull();
    expect(
      await screen.findByText(
        'The shortest passphrase you allow cannot be longer than the longest one.',
      ),
    ).toBeInTheDocument();
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
    openEditor();

    const person = within(
      await screen.findByRole('group', {
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
    await screen.findByRole('checkbox', { name: 'name' });

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
    await screen.findByRole('checkbox', { name: 'name' });

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
    await screen.findByRole('checkbox', { name: 'name' });

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
    await screen.findByRole('checkbox', { name: 'name' });
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
    await screen.findByRole('checkbox', { name: 'name' });

    await harness.user.click(attributeCheckbox('person', 'name'));

    expect(await screen.findByText(/Robin/)).toBeInTheDocument();
    expect(Object.hasOwn(personVariable(harness, 'name'), 'encrypted')).toBe(
      false,
    );
  });

  it('cannot be toggled by a spectator', async () => {
    renderStageEditor({
      stageId: 'anonymisation-1',
      registry: anonymisationStageEditor,
      readOnly: true,
    });

    await waitFor(() =>
      expect(attributeCheckbox('person', 'name')).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );
  });
});
