import type { Meta, StoryObj } from '@storybook/react-vite';
import { useCallback, useMemo } from 'react';
import { expect, screen, userEvent, waitFor, within } from 'storybook/test';

import { useAppIntl } from '@codaco/app-i18n/react';
import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { narrativePedigreeMessages } from '../editors/narrative-pedigree/sections/narrativePedigreeMessages.ts';
import { resolveSourceStages } from '../editors/narrative-pedigree/sections/sourceStage.ts';
import { REQUIRED } from '../form/requiredField.ts';
import { useStageEditorForm } from '../form/stageEditorContext.ts';
import {
  useAskStageHasAnyValue,
  useStageValue,
} from '../form/stageFormHooks.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import { fixtureStageIds } from '../testing/protocolFixture.ts';
import SourcePedigreePickerField, {
  type SourceChangeQuestion,
  type SourcePedigreeOption,
} from './SourcePedigreePickerField.tsx';

const SOURCE_FIELD = 'sourceStageId';

/** The paths a change of source pedigree throws away, which is what it costs. */
const DISEASES_FIELD = 'diseases';

const STAGE = sectionId({ kind: 'stage', stageId: 'narrative-pedigree-1' });
const PEDIGREE = sectionId({ kind: 'stage', stageId: 'family-pedigree-1' });
const STAGE_ORDER = sectionId({ kind: 'stageOrder' });

/**
 * The English the queries below use, which is the default language's own.
 *
 * The control is handed the package's real sentences rather than story-local
 * ones, because every one of them already exists and a second English copy
 * here would drift from what the researcher reads.
 */
const SOURCE_LABEL = 'Source stage';

/** What a source change costs, in the narrative pedigree's own words. */
const SOURCE_CHANGE_QUESTION: SourceChangeQuestion = Object.freeze({
  title: narrativePedigreeMessages.sourceChangeTitle,
  description: narrativePedigreeMessages.sourceChangeDescription,
  confirmLabel: narrativePedigreeMessages.sourceChangeConfirm,
});

/**
 * What may be picked, narrowed the way the section narrows it.
 *
 * The rule is the section's because it is about where this stage runs: a
 * narrative pedigree draws a family the participant has already built, so only
 * a Family Pedigree stage BEFORE it has anything to show. It is resolved out
 * of the protocol the host is serving rather than passed in as a list, so a
 * pedigree added, renamed, re-typed, moved or deleted elsewhere changes what
 * is offered without this caller doing anything.
 *
 * A stored choice the list no longer contains is still offered, as the current
 * one and labelled with what is wrong: blanking the control would hide the
 * very reference the researcher has to resolve, and would then write the blank
 * back over it.
 */
function SourcePedigreePicker() {
  const intl = useAppIntl();
  const { identity } = useStageEditorForm();
  const protocolContext = useProtocolContext();
  const sourceStageId = useStageValue(SOURCE_FIELD);
  const hasAnyValue = useAskStageHasAnyValue();

  const { options, problem, chosenLabel } = useMemo(
    () => resolveSourceStages(protocolContext, identity.id, sourceStageId),
    [identity.id, protocolContext, sourceStageId],
  );

  const selectOptions = useMemo<SourcePedigreeOption[]>(() => {
    // Numbered as well as named: a stage label is required to be non-empty and
    // is not required to be unique, so two pedigrees can read identically.
    const offered = options.map((option) => ({
      value: option.value,
      label: intl.formatMessage(narrativePedigreeMessages.sourceStageOption, {
        position: option.position,
        stageLabel: option.label,
      }),
    }));
    if (problem === null || typeof sourceStageId !== 'string') return offered;
    return [
      ...offered,
      {
        value: sourceStageId,
        label: intl.formatMessage(
          narrativePedigreeMessages.sourceUnusableOption,
          { stageName: chosenLabel ?? sourceStageId },
        ),
        disabled: true,
      },
    ];
  }, [chosenLabel, intl, options, problem, sourceStageId]);

  // Asked of the same field a real section's reset discards, so the question
  // can neither appear over a change that costs nothing nor stay silent over
  // one that costs something.
  const confirmChange = useCallback(
    () => (hasAnyValue([DISEASES_FIELD]) ? SOURCE_CHANGE_QUESTION : undefined),
    [hasAnyValue],
  );

  return (
    <Field<typeof SourcePedigreePickerField>
      name={SOURCE_FIELD}
      component={SourcePedigreePickerField}
      confirmChange={confirmChange}
      label={intl.formatMessage(narrativePedigreeMessages.sourceLabel)}
      hint={intl.formatMessage(narrativePedigreeMessages.sourceHint)}
      placeholder={intl.formatMessage(
        narrativePedigreeMessages.sourcePlaceholder,
      )}
      options={selectOptions}
      // Disabled rather than removed when the interview offers nothing: the
      // field is also what tells the outline this section owns something
      // unanswered.
      disabled={selectOptions.length === 0}
      required={REQUIRED}
    />
  );
}

/** A narrative pedigree that has not been pointed at a family yet. */
const noSourceChosen = (host: InMemoryHost) => {
  const { document } = host.store.read(STAGE);
  const { sourceStageId: _sourceStageId, ...rest } = document;
  host.store.applyAsCollaborator(STAGE, rest);
};

/** The pedigree this stage reads, deleted out from under it. */
const sourceDeleted = (host: InMemoryHost) => {
  host.store.applyAsCollaborator(PEDIGREE, undefined);
  // And taken out of the interview's order with it, so the protocol is the one
  // a collaborator's deletion actually leaves rather than an order naming a
  // stage that is not there.
  host.store.applyAsCollaborator(STAGE_ORDER, {
    stages: fixtureStageIds().filter((id) => id !== 'family-pedigree-1'),
  });
};

/** The question this control puts, once it is open over the inert page. */
const confirmButton = () =>
  screen.findByRole('button', { name: 'Change the pedigree' });

const meta = {
  title: 'Protocol Builder/Fields/Source pedigree picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Chooses which earlier step of the interview collected the family a narrative pedigree draws on. Only Family Pedigree stages that run before this one are offered, because a family has to be built before it can be shown, and the list is read from the protocol rather than handed down — so a pedigree a collaborator adds, renames, re-types, moves or deletes changes what is on offer without the section doing anything. Every disease this stage draws names an attribute of the chosen pedigree’s family members, so a different pedigree invalidates all of them at once: the choice is held back until the researcher has agreed to lose them, and it is agreed to HERE, before the value moves, because a discard cannot be taken back by choosing the old pedigree again.',
      },
    },
  },
  args: {
    stageId: 'narrative-pedigree-1',
    sectionTitle: 'Pedigree source',
    children: <SourcePedigreePicker />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The stage as the protocol holds it, reading the one pedigree that runs
 * before it — named by where it runs as well as by what it is called.
 */
export const Chosen: Story = {};

/** Nothing chosen yet, which is where a narrative pedigree starts. */
export const NothingChosenYet: Story = {
  args: { seedEdit: noSourceChosen },
};

/** Held elsewhere: the choice can be read, and nothing can be chosen. */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('combobox', { name: SOURCE_LABEL }),
    ).toBeDisabled();
  },
};

/**
 * A narrative pedigree with no pedigree to read cannot run, so the save is
 * refused. The refusal appears only once the researcher tries to save, which
 * is also how this story knows the submit was refused rather than still in
 * flight: the sentence does not exist until it has come back.
 */
export const TheSaveIsRefusedWithNoPedigreeChosen: Story = {
  args: { seedEdit: noSourceChosen },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await canvas.findByRole('combobox', { name: SOURCE_LABEL });
    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await expect(
      await canvas.findByText('This field is required.'),
    ).toBeVisible();
    await expect(
      canvas.getByRole('status', { name: 'Save status' }),
    ).toHaveTextContent('Nothing saved yet.');
  },
};

/**
 * The first choice costs as much as any later one.
 *
 * "Nothing has been chosen yet" is not the same as "there is nothing to lose":
 * this stage already maps a disease, and that mapping names an attribute of
 * whichever family it ends up drawing. So the question is asked whatever the
 * control currently shows, and the choice only reaches the stage once it has
 * been agreed to — which the saved document is where to read.
 *
 * Throwing the diseases away is the section's half of it, and not shown here;
 * the control's half is holding the value still until the researcher has said
 * yes.
 */
export const AgreeingToWhatTheChangeCosts: Story = {
  args: { seedEdit: noSourceChosen },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.selectOptions(
      await canvas.findByRole('combobox', { name: SOURCE_LABEL }),
      'family-pedigree-1',
    );

    // The question is portalled out of the story root and makes the page
    // behind it inert, so it is reached through the document.
    await expect(
      await screen.findByText(/This will remove every disease/),
    ).toBeVisible();
    await userEvent.click(await confirmButton());
    await waitFor(async () => {
      await expect(
        screen.queryByRole('button', { name: 'Change the pedigree' }),
      ).toBeNull();
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await waitFor(async () => {
      await expect(
        canvas.getByRole('status', { name: 'Save status' }),
      ).toHaveTextContent('"sourceStageId":"family-pedigree-1"');
    });
  },
};

/**
 * And the researcher can say no. The stage is left exactly as it was, which
 * the refused save is what proves: a stage still holding no pedigree is a
 * stage the field refuses to save.
 */
export const TheChangeCanBeDeclined: Story = {
  args: { seedEdit: noSourceChosen },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.selectOptions(
      await canvas.findByRole('combobox', { name: SOURCE_LABEL }),
      'family-pedigree-1',
    );
    await confirmButton();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(async () => {
      await expect(
        screen.queryByRole('button', { name: 'Change the pedigree' }),
      ).toBeNull();
    });

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));
    await expect(
      await canvas.findByText('This field is required.'),
    ).toBeVisible();
  },
};

/**
 * The pedigree this stage reads has been deleted while the editor was open.
 *
 * The stored choice is still shown, and named for what is wrong with it, so
 * the researcher can see the reference they have to replace — and it cannot be
 * chosen again once it has been. By its identifier here rather than by a name,
 * because a deleted stage is the one case with no name left to read.
 */
export const APedigreeThatIsGone: Story = {
  args: { seedEdit: sourceDeleted },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const picker = await canvas.findByRole('combobox', { name: SOURCE_LABEL });
    await expect(picker).toHaveValue('family-pedigree-1');
    await expect(
      within(picker).getByRole('option', { name: /can no longer be used/ }),
    ).toBeDisabled();
  },
};
