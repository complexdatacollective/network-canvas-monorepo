import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import SubmitButton from '@codaco/fresco-ui/form/SubmitButton';
import type { SectionDoc } from '@codaco/studio-sync/apply';

import { getInterfaceTemplate } from '../../../interfaces/templates.ts';
import type { StageEditorComponent } from '../../../stage-editor-contract.ts';
import {
  renderStageEditor,
  type StageEditorHarness,
} from '../../../testing/renderStageEditor.tsx';
import { OrdinalBinStageEditor } from '../OrdinalBinStageEditor.tsx';
import {
  CREATE_POSITION,
  destinationOptions,
  destinationsAfterInsertion,
  stageNameInput,
  switchSkipLogicOn,
} from './createMode.ts';

/**
 * The named editor as a host mounts it: the editor itself, plus the action
 * chrome the host puts in its slot. Never disabled, so that a refused save can
 * be asked for and reported rather than hidden behind an inert button.
 */
const editor: StageEditorComponent<'OrdinalBin'> = (props) => (
  <OrdinalBinStageEditor
    {...props}
    actions={({ formId }) => (
      <SubmitButton form={formId}>Save stage</SubmitButton>
    )}
  />
);

const openFixture = () => ({ stageId: 'ordinal-bin-1', editor });

const prompts = (stage: SectionDoc): Record<string, unknown>[] =>
  Array.isArray(stage.prompts)
    ? stage.prompts.filter(
        (row: unknown): row is Record<string, unknown> =>
          typeof row === 'object' && row !== null,
      )
    : [];

describe('the Ordinal Bin stage editor', () => {
  it('saves the stage it opened, with every key still accounted for', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.roundTrip({ unowned: [] });
  });

  it('lists its sections in the order the plan standardises', async () => {
    const harness = renderStageEditor(openFixture());

    await waitFor(() => expect(harness.outline()).toHaveLength(6));
    expect(harness.outline().map((section) => section.title)).toEqual([
      'Stage name',
      'Node type',
      'Stage filter',
      'Prompts',
      'Skip logic',
      'Interviewer guidance',
    ]);
  });

  it('refuses a stage with no name, and says which section is missing one', async () => {
    const harness = renderStageEditor({
      stage: {
        type: 'OrdinalBin',
        fields: {
          label: '',
          subject: { entity: 'node', type: 'person' },
          prompts: [
            {
              id: 'prompt-a',
              text: 'First question',
              variable: 'contactFreq',
              color: 'ord-color-seq-1',
            },
          ],
        },
      },
      editor,
    });

    expect(await harness.submit()).toBeNull();
    expect(screen.getByRole('textbox', { name: 'Stage name' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await waitFor(() =>
      expect(
        harness.outline().find((section) => section.title === 'Stage name')
          ?.state,
      ).toBe('Has a problem'),
    );
  });

  it('leaves nothing pending when the researcher discards the edit', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.type(
      screen.getByRole('textbox', { name: 'Stage name' }),
      ' revised',
    );
    await harness.cancel();

    expect(harness.pendingCommands()).toEqual([]);
  });

  it('refuses to save once editing has been taken away, and says so', async () => {
    const harness = renderStageEditor(openFixture());

    harness.setReadOnly();

    expect(await harness.submit()).toBeNull();
    expect(
      screen.getByText(
        'This stage is read-only, so your changes were not saved. Take over editing and try again.',
      ),
    ).toBeInTheDocument();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * A stage the host is CREATING rather than one the interview already contains.
 *
 * Nothing about it is a prop this editor passes: whether the stage exists yet
 * and where the host is about to insert it are facts only the session has, and
 * the shared sections read both out of it.
 */
describe('creating an Ordinal Bin stage', () => {
  it('opens on the interface template with a proposed name, and offers only the destinations its position allows', async () => {
    const harness = renderStageEditor({
      create: { type: 'OrdinalBin', position: CREATE_POSITION },
      editor,
    });

    // Proposed, and unique in the interview: the fixture already holds a stage
    // called "Ordinal Bin", so an unqualified proposal would be a second.
    await waitFor(() => expect(stageNameInput()).toHaveValue('Ordinal Bin #2'));

    // This interface's template carries nothing, so the new stage opens with
    // nothing written for the researcher to find and undo.
    expect(getInterfaceTemplate('OrdinalBin')).toEqual({});
    expect(screen.queryAllByRole('button', { name: /^Edit prompt/ })).toEqual(
      [],
    );

    await switchSkipLogicOn(harness);
    expect(destinationOptions()).toEqual(destinationsAfterInsertion());
  });

  /**
   * The other half of the same journey: the researcher writes the one thing
   * the template does not carry, and the new stage saves.
   *
   * Separate from the assertion above because the two fail for different
   * reasons and writing a prompt is most of what this journey costs. The name
   * is the one the editor PROPOSED, never typed, and it follows the type the
   * researcher picks on the way; the gradient is the one the prompt seeded,
   * which nobody chose either.
   */
  it('saves the new stage once its prompt is written', async () => {
    const harness = renderStageEditor({
      create: { type: 'OrdinalBin', position: CREATE_POSITION },
      editor,
    });

    await waitFor(() => expect(stageNameInput()).toHaveValue('Ordinal Bin #2'));
    await harness.user.click(screen.getByRole('radio', { name: 'person' }));
    await harness.user.click(
      screen.getByRole('button', { name: 'Create new prompt' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Prompt text' }),
      'How often?',
    );
    await harness.user.selectOptions(
      screen.getByRole('combobox', { name: 'Attribute' }),
      'contactFreq',
    );
    await harness.user.click(screen.getByRole('button', { name: 'Add' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    expect(request?.stageDocument).toMatchObject({
      type: 'OrdinalBin',
      label: 'Person Ordinal Bin',
      subject: { entity: 'node', type: 'person' },
    });
    expect(prompts(request?.stageDocument ?? {})).toEqual([
      {
        id: expect.any(String) as unknown as string,
        text: 'How often?',
        variable: 'contactFreq',
        color: 'ord-color-seq-1',
      },
    ]);
  });
});

/**
 * A collaborator's codebook change reaches this editor as an authoritative
 * update. Following it must not write it back: a batch echoed here would be
 * saved as this session's own edit.
 */
describe('a codebook that changes while the Ordinal Bin editor is open', () => {
  it('follows an attribute a collaborator renamed, without echoing a command', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: {
        person: {
          ...personDocument(harness),
          variables: {
            ...personVariables(harness),
            contactFreq: {
              ...(personVariables(harness).contactFreq as object),
              name: 'contactRate',
            },
          },
        },
      },
    });

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'contactRate' }),
      ).toBeInTheDocument(),
    );
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });

  it('reports an attribute a collaborator removed rather than blanking the pick', async () => {
    const harness = renderStageEditor(openFixture());
    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await screen.findByRole('combobox', { name: 'Attribute' });
    const dispatch = vi.spyOn(harness.session, 'dispatch');

    harness.receiveCodebookUpdate({
      node: { person: { ...personDocument(harness), variables: {} } },
    });

    expect(
      await screen.findByText(
        'This attribute is no longer in the codebook. Choose another one.',
      ),
    ).toBeInTheDocument();
    expect(dispatch).not.toHaveBeenCalled();
    expect(harness.pendingCommands()).toEqual([]);
  });
});

/**
 * The scale is an attribute's ordered values, so creating one from inside a
 * prompt is a compound edit against the codebook, after which the prompt
 * naming it is saved with the stage.
 *
 * Only the second half is asked here. That the host is asked ONCE, against the
 * codebook section alone, is asked of the same section by the prompt-section
 * tests; what is left for the named editor is that the pick reaches the stage
 * save.
 */
describe('creating a scale from inside the Ordinal Bin editor', () => {
  it('saves the stage that names what it created', async () => {
    const harness = renderStageEditor(openFixture());

    await harness.user.click(
      screen.getByRole('button', { name: 'Edit prompt' }),
    );
    await harness.user.click(
      await screen.findByRole('button', { name: 'Create a new attribute' }),
    );
    await harness.user.type(
      await screen.findByRole('textbox', { name: 'Attribute name' }),
      'closeness',
    );
    await addOption(harness, 1, 'Rare', 1);
    await addOption(harness, 2, 'Often', 2);
    await harness.user.click(
      screen.getByRole('button', { name: 'Create attribute' }),
    );

    const picker = await screen.findByRole('combobox', { name: 'Attribute' });
    await waitFor(() =>
      expect(
        within(picker).getByRole('option', { name: 'closeness' }),
      ).toBeInTheDocument(),
    );

    await harness.user.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );

    const request = await harness.submit();
    const saved = prompts(request?.stageDocument ?? {})[0];
    expect(saved?.variable).toEqual(expect.any(String));
    expect(saved?.variable).not.toBe('contactFreq');
  });
});

type SessionReader = Readonly<{
  session: { getSnapshot(): { protocolSections: Record<string, unknown> } };
}>;

function personDocument(harness: SessionReader): Record<string, unknown> {
  const document =
    harness.session.getSnapshot().protocolSections['codebook:node:person'];
  if (typeof document !== 'object' || document === null) {
    throw new Error('the fixture has no person type');
  }
  return { ...document };
}

function personVariables(harness: SessionReader): Record<string, unknown> {
  const variables = personDocument(harness).variables;
  if (typeof variables !== 'object' || variables === null) {
    throw new Error('the fixture’s person type has no attributes');
  }
  return { ...variables };
}

/**
 * Adds one option to the attribute editor that is open.
 *
 * The value is typed rather than cleared first: a new option's value starts
 * empty, and the attribute is refused without one.
 */
async function addOption(
  harness: StageEditorHarness,
  position: number,
  label: string,
  value: number,
) {
  await harness.user.click(screen.getByRole('button', { name: 'Add option' }));
  await harness.user.type(
    await screen.findByRole('textbox', { name: `Option ${position} label` }),
    label,
  );
  await harness.user.type(
    screen.getByRole('textbox', { name: `Option ${position} value` }),
    String(value),
  );
}
