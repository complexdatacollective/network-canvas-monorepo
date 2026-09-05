import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { pedigreeAndAnonymisationStageEditors } from '../../pedigreeAndAnonymisationStageEditors.ts';
import {
  anonymisationEditor,
  shimMarkdownEditorMeasurement,
} from './editorFixtures.tsx';

shimMarkdownEditorMeasurement();

const PERSON_SECTION = sectionId({ kind: 'codebookNode', typeId: 'person' });

const openFixture = () =>
  renderStageEditor({
    stageId: 'anonymisation-1',
    editor: anonymisationEditor,
  });

/** A stage of this interface that does not exist yet, as a host creates one. */
const openNewStage = () =>
  renderStageEditor({
    stage: {
      id: 'anonymisation-new',
      type: 'Anonymisation',
      fields: getInterfaceTemplate('Anonymisation'),
    },
    editor: anonymisationEditor,
  });

const personDocument = (harness: StageEditorHarness): SectionDoc => {
  const document = harness.host.getSnapshot().protocolSections[PERSON_SECTION];
  if (document === undefined) throw new Error('the fixture has no person type');
  return document;
};

const personVariable = (
  harness: StageEditorHarness,
  variableId: string,
): Record<string, unknown> => {
  const variables = personDocument(harness).variables as Record<
    string,
    unknown
  >;
  const variable = variables[variableId];
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

const outlineStateOf = (harness: StageEditorHarness, title: string) =>
  harness.outline().find((section) => section.title === title)?.state;

describe('the anonymisation stage editor', () => {
  it('claims exactly this interface in its family', () => {
    expect(pedigreeAndAnonymisationStageEditors.Anonymisation).toBeDefined();
  });

  /**
   * Every key the fixture stage holds is edited by a section this editor
   * mounts, and saving it unchanged returns it unchanged. `unowned` is empty
   * because there is nothing this interface's schema holds that the editor
   * leaves to a section that has not been built.
   */
  it('owns every key the stage holds, and round-trips it', async () => {
    const harness = openFixture();

    await harness.roundTrip({ unowned: [] });
    expect(harness.ownedKeys()).toEqual([
      'explanationText',
      'label',
      'validation',
    ]);
  });

  it('lists its sections in the order the researcher works through them', () => {
    const harness = openFixture();

    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Passphrase explanation',
      'Passphrase rules',
      'Encrypted attributes',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  /**
   * A stage being created starts from the interface's template — nothing, for
   * this interface — so the minimum edits are its name and the explanation the
   * schema requires. Seeded from `getInterfaceTemplate` rather than from a
   * hand-written object, so a template that gains a default is exercised here
   * rather than diverging from what a host actually creates.
   */
  it('saves a new stage once it has a name and an explanation', async () => {
    const harness = openNewStage();

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      'Protect their answers',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Explanation heading' }),
      'This interview protects some answers',
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Explanation' }),
      'Choose a passphrase you will remember.',
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      id: 'anonymisation-new',
      type: 'Anonymisation',
      label: 'Protect their answers',
      explanationText: {
        title: 'This interview protects some answers',
        body: 'Choose a passphrase you will remember.',
      },
    });
  });

  it('refuses an explanation with no heading, and says which section it is in', async () => {
    const harness = openFixture();

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Explanation heading' }),
    );

    expect(await harness.submit()).toBeNull();
    expect(outlineStateOf(harness, 'Passphrase explanation')).toBe(
      'Has a problem',
    );
    expect(outlineStateOf(harness, 'Passphrase rules')).toBe('Finished');
  });

  it('leaves nothing pending when the researcher cancels', async () => {
    const harness = openFixture();

    await harness.user.clear(
      screen.getByRole('textbox', { name: 'Explanation heading' }),
    );
    await harness.user.type(
      screen.getByRole('textbox', { name: 'Explanation heading' }),
      'A heading nobody saved',
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
  });

  it('refuses to save once editing has been taken away', async () => {
    const harness = openFixture();
    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
  });
});

describe('the attributes an anonymisation stage protects', () => {
  /**
   * `encrypted` belongs to a codebook attribute rather than to this stage, so
   * switching one on is a compound edit the host applies to the codebook —
   * and the stage the researcher is editing goes on being their own draft,
   * saved separately and carrying nothing about it.
   */
  it('writes the flag as a compound edit, and saves the stage beside it', async () => {
    const harness = openFixture();
    const submitted = vi.spyOn(harness.host, 'submit');

    await harness.user.click(attributeCheckbox('person', 'name'));

    await waitFor(() =>
      expect(personVariable(harness, 'name').encrypted).toBe(true),
    );
    expect(submitted).toHaveBeenCalledTimes(1);
    expect(submitted.mock.calls[0]?.[0]?.edits[0]?.sectionId).toBe(
      PERSON_SECTION,
    );

    const request = await harness.submit();
    expect(request?.stageDocument.explanationText).toEqual(
      harness.seeded.fields.explanationText,
    );
    expect(Object.hasOwn(request?.stageDocument ?? {}, 'encrypted')).toBe(
      false,
    );
  });

  /**
   * An attribute that stops being text stops being encryptable, and the
   * codebook editor clears its flag with the type change. This editor is not a
   * party to that edit: it follows it, and answers it with nothing.
   */
  it('follows a collaborator retyping an encrypted attribute without a command of its own', async () => {
    const harness = openFixture();
    const person = personDocument(harness);
    const personVariables = person.variables as Record<string, unknown>;

    // Encrypted by someone else, so the box the editor shows is the codebook's
    // answer rather than one this session put there.
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...person,
          variables: {
            ...personVariables,
            name: { name: 'name', type: 'text', encrypted: true },
          },
        },
      },
    });
    await waitFor(() =>
      expect(attributeCheckbox('person', 'name')).toBeChecked(),
    );

    const dispatched = vi.spyOn(harness.session, 'dispatch');
    const submitted = vi.spyOn(harness.host, 'submit');

    // Retyped out of text by the same collaborator, which is what the codebook
    // editor does to an attribute that stops being encryptable.
    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...person,
          variables: {
            ...personVariables,
            name: { name: 'name', type: 'number' },
          },
        },
      },
    });

    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'name' })).toBeNull(),
    );
    expect(dispatched).not.toHaveBeenCalled();
    expect(submitted).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});
