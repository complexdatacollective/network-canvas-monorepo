import { act, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import StageNameSection from '../../StageNameSection.tsx';
import AnonymisationExplanationSection from '../AnonymisationExplanationSection.tsx';
import AnonymisationValidationSection from '../AnonymisationValidationSection.tsx';
import EncryptedVariablesSection from '../EncryptedVariablesSection.tsx';

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const openEditor = () =>
  renderStageEditor({
    stageId: 'anonymisation-1',
    sections: (
      <>
        <StageNameSection />
        <AnonymisationExplanationSection />
        <AnonymisationValidationSection />
        <EncryptedVariablesSection />
      </>
    ),
  });

/** The person type as the authoritative protocol currently holds it. */
const personDocument = (harness: StageEditorHarness): SectionDoc => {
  const document = harness.host.getSnapshot().protocolSections[PERSON_SECTION];
  if (document === undefined) throw new Error('the fixture has no person type');
  return document;
};

const personVariable = (
  harness: StageEditorHarness,
  variableId: string,
): Record<string, unknown> => {
  const variables = personDocument(harness).variables;
  const variable = (variables as Record<string, unknown>)[variableId];
  if (typeof variable !== 'object' || variable === null) {
    throw new Error(`the person type has no "${variableId}" attribute`);
  }
  return variable as Record<string, unknown>;
};

/** The checkbox for one attribute of one type, named by its own group. */
const attributeCheckbox = (typeName: string, attribute: string) =>
  within(
    screen.getByRole('group', { name: `Encrypted attributes for ${typeName}` }),
  ).getByRole('checkbox', { name: attribute });

describe('the sections of an anonymisation stage', () => {
  it('saves the stage it opened, unchanged', async () => {
    const harness = openEditor();

    await harness.roundTrip();
  });

  it('reports each decision the stage holds separately', async () => {
    const harness = openEditor();

    await waitFor(() => expect(harness.outline()).toHaveLength(4));
    expect(harness.outline()).toEqual([
      { title: 'Stage name', state: 'Finished' },
      { title: 'Passphrase explanation', state: 'Finished' },
      { title: 'Passphrase rules', state: 'Finished' },
      { title: 'Encrypted attributes', state: 'Finished' },
    ]);
  });

  it('saves a rewritten explanation', async () => {
    const harness = openEditor();

    const heading = screen.getByRole('textbox', {
      name: 'Explanation heading',
    });
    await harness.user.clear(heading);
    await harness.user.type(heading, 'Your answers are protected');

    const request = await harness.submit();
    expect(request?.stageDocument.explanationText).toEqual({
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
      screen.getByRole('textbox', { name: 'Explanation heading' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByRole('textbox', { name: 'Explanation heading' }),
    ).toHaveAttribute('aria-invalid', 'true');
  });

  it('refuses passphrase rules whose shortest allowed length exceeds its longest', async () => {
    const harness = openEditor();

    const maximum = screen.getByRole('spinbutton', {
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
      screen.getByRole('switch', { name: 'Passphrase rules' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Remove the rules' }),
    );

    const request = await harness.submit();
    expect(request).not.toBeNull();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'validation')).toBe(
      false,
    );
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
   * toggle is a codebook edit — one compound edit, applied whole or not at
   * all, through the same path the codebook screen uses.
   */
  it('writes the flag through one compound edit', async () => {
    const harness = openEditor();
    const submitted = vi.spyOn(harness.host, 'submit');

    await harness.user.click(attributeCheckbox('person', 'name'));

    await waitFor(() =>
      expect(personVariable(harness, 'name').encrypted).toBe(true),
    );
    expect(submitted).toHaveBeenCalledTimes(1);
    const [submission] = submitted.mock.calls[0] ?? [];
    expect(submission?.edits).toHaveLength(1);
    expect(submission?.edits[0]?.sectionId).toBe(PERSON_SECTION);
    // The stage itself is untouched: the flag is not a stage field, and
    // nothing about this edit belongs in the stage's own document.
    expect(harness.pendingCommands()).toEqual([]);
    const request = await harness.submit();
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'encrypted')).toBe(
      false,
    );
  });

  /** Absence is how the schema spells "not encrypted". */
  it('removes the flag rather than storing false', async () => {
    const harness = openEditor();

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
   * A compound edit rebases the stage draft onto what the host answered with,
   * so an edit the researcher has in progress has to come through it. If it
   * did not, ticking a box would silently discard the sentence they were part
   * way through writing.
   */
  it('keeps an unsaved stage edit made before the toggle', async () => {
    const harness = openEditor();
    const heading = screen.getByRole('textbox', {
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
    const request = await harness.submit();
    expect(request?.stageDocument.explanationText).toMatchObject({
      title: 'Rewritten heading',
    });
  });

  it('shows the flag as the codebook holds it, not as this section left it', async () => {
    const harness = openEditor();

    await harness.user.click(attributeCheckbox('person', 'name'));

    await waitFor(() =>
      expect(attributeCheckbox('person', 'name')).toBeChecked(),
    );
    expect(
      attributeCheckbox('person', 'relationship_to_ego'),
    ).not.toBeChecked();
  });

  /**
   * An attribute that stops being text stops being encryptable, and the
   * codebook editor clears its flag with the type change. This section is not
   * a party to that edit and must not answer it with one of its own.
   */
  it('follows a collaborator changing an attribute out of text, without echoing it', async () => {
    const harness = openEditor();
    await screen.findByRole('checkbox', { name: 'name' });
    const submitted = vi.spyOn(harness.host, 'submit');
    const person = personDocument(harness);
    const variables = { ...(person.variables as Record<string, unknown>) };
    variables.name = { name: 'name', type: 'number' };

    harness.receiveCodebookUpdate({
      node: { person: { ...person, variables } },
    });

    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'name' })).toBeNull(),
    );
    expect(submitted).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
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

  it('cannot be toggled by a spectator', async () => {
    const harness = openEditor();
    await screen.findByRole('checkbox', { name: 'name' });

    harness.setReadOnly();

    await waitFor(() =>
      expect(attributeCheckbox('person', 'name')).toHaveAttribute(
        'aria-disabled',
        'true',
      ),
    );
  });
});

describe('leaving an anonymisation stage without saving', () => {
  it('leaves no staged resource and no pending command behind', async () => {
    const harness = openEditor();
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Explanation heading' }),
      '!',
    );

    await act(async () => {
      await harness.cancel();
    });

    expect(harness.pendingCommands()).toEqual([]);
    const listed = await harness.gateway.list();
    expect(listed.status).toBe('ok');
    expect(
      listed.status === 'ok'
        ? listed.data.filter((entry) => entry.status === 'staged')
        : [],
    ).toEqual([]);
  });
});
