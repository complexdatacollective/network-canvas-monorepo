import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import Field from '@codaco/fresco-ui/form/Field/Field';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { REQUIRED } from '../form/requiredField.ts';
import {
  type CodebookSubject,
  variablesForSubject,
} from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import VariablePickerField from './VariablePickerField.tsx';

const PERSON: CodebookSubject = { entity: 'node', type: 'person' };

const FIELD_LABEL = 'Attribute this question records';

/**
 * What may be picked, narrowed the way a section narrows it.
 *
 * A section holds this rule because the rule is the section's: this one offers
 * every attribute of the people the stage collects, and rules out the one that
 * records where a node was dragged to — a position is not an answer, so no
 * question can be about it. The picker is handed the result.
 */
function useAttributeOptions(subject: CodebookSubject) {
  const protocolContext = useProtocolContext();
  return useMemo(
    () =>
      Object.entries(variablesForSubject(protocolContext, subject)).map(
        ([value, variable]) => ({
          value,
          label: variable.name,
          type: variable.type,
          ...(variable.type === 'layout'
            ? {
                usable: false,
                unusableWords: {
                  optionLabel: `${variable.name} — records a position, not an answer`,
                  note: 'This attribute records where somebody was placed on a screen, so a question cannot be about it. Choose another one.',
                },
              }
            : {}),
        }),
      ),
    [protocolContext, subject],
  );
}

/** A picker over the attributes of the people this protocol collects. */
function AttributePicker({
  canCreate = false,
  readOnly = false,
}: Readonly<{ canCreate?: boolean; readOnly?: boolean }>) {
  const options = useAttributeOptions(PERSON);
  return (
    <Field<typeof VariablePickerField>
      name="nodeConfig.egoVariable"
      component={VariablePickerField}
      label={FIELD_LABEL}
      hint="Every answer to this question is stored under this attribute."
      options={options}
      namesInUse={options.map(({ label }) => label)}
      required={REQUIRED}
      readOnly={readOnly}
      {...(canCreate
        ? {
            onCreateOption: async (variableName: string) => {
              // A story holds still, so the codebook write is the one thing
              // stood in for: what the picker does with each ANSWER is what
              // these stories are about.
              await Promise.resolve();
              return variableName === 'taken'
                ? ({
                    status: 'refused',
                    message: 'Pick another name.',
                  } as const)
                : ({ status: 'created' } as const);
            },
          }
        : {})}
    />
  );
}

const openThePicker = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  // The stage arrives from the host over a promise, so the editor — and every
  // control in it — is drawn a turn after the story mounts.
  await awaitPassiveEffects();
  // Either name: the fixture's stage already holds an attribute in some of
  // these stories and holds none in others, and the trigger says which.
  await userEvent.click(
    await canvas.findByRole('button', {
      name: /^(Select|Change) attribute$/u,
    }),
  );
  return within(await within(document.body).findByRole('dialog'));
};

const meta = {
  title: 'Protocol Builder/Fields/Attribute picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Picks one codebook attribute, and — where the caller allows it — invents the one that is missing. A trigger and a window, never a list in place: the codebooks this searches run to dozens of attributes of one kind. What may be offered is the section’s rule, because it depends on what the choice is for. The picker shows the chosen attribute as a typed pill, keeps a stored choice it was not offered rather than blanking it, and, when a caller passes a way to create one, asks only for a name — from inside the window, on whatever was typed into the search box.',
      },
    },
  },
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'What this question records',
    children: <AttributePicker />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The stage as the protocol holds it, with the chosen attribute shown. */
export const Chosen: Story = {};

/**
 * Nothing chosen. Said rather than left blank: an empty control reads as an
 * unanswered question rather than as one that failed to draw.
 */
export const NothingChosen: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'family-pedigree-1' });
      const { document: stageDocument } = host.store.read(stage);
      const nodeConfig =
        typeof stageDocument.nodeConfig === 'object' &&
        stageDocument.nodeConfig !== null
          ? stageDocument.nodeConfig
          : {};
      host.store.applyAsCollaborator(stage, {
        ...stageDocument,
        nodeConfig: { ...nodeConfig, egoVariable: undefined },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText('No attribute selected'),
    ).toBeInTheDocument();
    await expect(
      canvas.getByRole('button', { name: 'Select attribute' }),
    ).toBeInTheDocument();
  },
};

/**
 * Somebody else is editing the stage. The trigger is still there and still
 * says what it would do — a control that disappears cannot show that editing
 * is held elsewhere.
 */
export const HeldBySomebodyElse: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('button', { name: 'Change attribute' }),
    ).toBeDisabled();
  },
};

/**
 * The question refused: a stage saved without an attribute cannot be run, and
 * the sentence names the control that resolves it.
 */
export const Unanswered: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'family-pedigree-1' });
      const { document: stageDocument } = host.store.read(stage);
      const nodeConfig =
        typeof stageDocument.nodeConfig === 'object' &&
        stageDocument.nodeConfig !== null
          ? stageDocument.nodeConfig
          : {};
      host.store.applyAsCollaborator(stage, {
        ...stageDocument,
        nodeConfig: { ...nodeConfig, egoVariable: undefined },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(
      await canvas.findByText('This field is required.'),
    ).toBeInTheDocument();
  },
};

/**
 * What the control is FOR, driven end to end: open the window, narrow the list
 * by typing, walk into it with the arrow keys and take a row with Enter — then
 * read the attribute back off the trigger.
 */
export const FindingAnAttribute: Story = {
  args: { children: <AttributePicker /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await openThePicker(canvasElement);

    await expect(
      dialog.getByRole('searchbox', { name: 'Find or create an attribute' }),
    ).toHaveFocus();

    await userEvent.keyboard('contact');
    const narrowed = dialog.getAllByRole('option');
    await expect(narrowed.length).toBeGreaterThan(0);
    for (const row of narrowed) {
      await expect(row.textContent?.toLowerCase()).toContain('contact');
    }

    await userEvent.keyboard('{ArrowDown}');
    const listbox = dialog.getByRole('listbox', { name: 'Attribute results' });
    await expect(listbox.contains(document.activeElement)).toBe(true);
    await userEvent.keyboard('{Enter}');

    await expect(
      await canvas.findByRole('button', { name: 'Change attribute' }),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText('contactFreq', { selector: 'span' }),
    ).toBeInTheDocument();
  },
};

/**
 * Where a caller allows one to be invented: the create row is the first thing
 * a name nothing matches produces, so looking for an attribute and finding it
 * does not exist are one act.
 */
export const InventingOne: Story = {
  args: { children: <AttributePicker canCreate /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const dialog = await openThePicker(canvasElement);

    await userEvent.keyboard('nominated_early');
    const create = dialog.getByRole('option', {
      name: 'Create new attribute called “nominated_early”.',
    });
    await expect(dialog.getAllByRole('option')[0]).toBe(create);
    await userEvent.click(create);

    await expect(
      await canvas.findByRole('button', { name: 'Change attribute' }),
    ).toBeInTheDocument();
  },
};

/**
 * A name the type already holds is refused before it is asked for: the row
 * states the reason and does nothing, rather than spending a round trip to
 * come back with a duplicate complaint about a name still on screen.
 */
export const ANameThatCannotBeUsed: Story = {
  args: { children: <AttributePicker canCreate /> },
  play: async ({ canvasElement }) => {
    const dialog = await openThePicker(canvasElement);

    await userEvent.keyboard('nominated early');
    await expect(
      dialog.getByRole('option', {
        name: 'Cannot create attribute named “nominated early”: only letters, numbers and the symbols ._-: can be used in a name',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  },
};

/**
 * An attribute the codebook still holds and this question may not use. It is
 * shown as the current choice and named for what is wrong with it, in the
 * caller's own words — "no longer in the codebook" would send the researcher
 * looking for something that never went anywhere.
 */
export const AChoiceThatIsRuledOut: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'family-pedigree-1' });
      const { document: stageDocument } = host.store.read(stage);
      const nodeConfig =
        typeof stageDocument.nodeConfig === 'object' &&
        stageDocument.nodeConfig !== null
          ? stageDocument.nodeConfig
          : {};
      host.store.applyAsCollaborator(stage, {
        ...stageDocument,
        nodeConfig: { ...nodeConfig, egoVariable: 'layout' },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'This attribute records where somebody was placed on a screen, so a question cannot be about it. Choose another one.',
      ),
    ).toBeInTheDocument();
  },
};

/**
 * A stored attribute nothing here offers. Kept and named, so the save can
 * still be refused and the researcher can see the reference they must replace
 * — blanking the control would hide it and then write the blank over it.
 */
export const AChoiceNothingOffers: Story = {
  args: {
    seedEdit: (host) => {
      const stage = sectionId({ kind: 'stage', stageId: 'family-pedigree-1' });
      const { document: stageDocument } = host.store.read(stage);
      const nodeConfig =
        typeof stageDocument.nodeConfig === 'object' &&
        stageDocument.nodeConfig !== null
          ? stageDocument.nodeConfig
          : {};
      host.store.applyAsCollaborator(stage, {
        ...stageDocument,
        nodeConfig: { ...nodeConfig, egoVariable: 'deleted_attribute' },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText(
        'This attribute is not available here. Choose another one.',
      ),
    ).toBeInTheDocument();
  },
};
