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
}: Readonly<{ canCreate?: boolean }>) {
  const options = useAttributeOptions(PERSON);
  return (
    <Field<typeof VariablePickerField>
      name="nodeConfig.egoVariable"
      component={VariablePickerField}
      label="Attribute this question records"
      hint="Every answer to this question is stored under this attribute."
      options={options}
      required={REQUIRED}
      {...(canCreate
        ? {
            onCreateOption: async (variableName: string) => {
              // A story holds still, so the codebook write is the one thing
              // stood in for: what the picker does with each ANSWER is what
              // these stories are about.
              await Promise.resolve();
              return variableName === 'taken'
                ? ({ status: 'refused' } as const)
                : ({ status: 'created' } as const);
            },
          }
        : {})}
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Attribute picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Picks one codebook attribute, and — where the caller allows it — invents the one that is missing. What may be offered is the section’s rule, because it depends on what the choice is for: a rule offers the attributes it can compare, a form drops the ones its other questions already collect. The picker states the chosen attribute’s type beside it, keeps a stored choice it was not offered rather than blanking it, and, when a caller passes a way to create one, asks only for a name.',
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

/** The stage as the protocol holds it, with the chosen attribute's type stated. */
export const Chosen: Story = {};

/**
 * The type is stated beside the choice rather than only implied: it decides
 * what the next control can ask, so the researcher has to be able to read it.
 */
export const TheTypeOfWhatWasChosen: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts.
    await awaitPassiveEffects();

    const picker = await canvas.findByRole('combobox', {
      name: 'Attribute this question records',
    });
    await userEvent.selectOptions(picker, 'age');

    await expect(
      canvas.getByLabelText('Attribute type: number'),
    ).toHaveTextContent('number');
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
      const { document } = host.store.read(stage);
      const nodeConfig =
        typeof document.nodeConfig === 'object' && document.nodeConfig !== null
          ? document.nodeConfig
          : {};
      host.store.applyAsCollaborator(stage, {
        ...document,
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
      const { document } = host.store.read(stage);
      const nodeConfig =
        typeof document.nodeConfig === 'object' && document.nodeConfig !== null
          ? document.nodeConfig
          : {};
      host.store.applyAsCollaborator(stage, {
        ...document,
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

/**
 * Where a caller allows one to be invented: the name box is beside the list,
 * because choosing something that exists and asking for something to be made
 * are different acts. The researcher is only ever asked for a name.
 */
export const InventingOne: Story = {
  args: { children: <AttributePicker canCreate /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', {
      name: 'Create a new attribute',
    });
    await userEvent.type(box, 'nominated_early');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Create the attribute' }),
    );

    // The box empties once the attribute exists, because asking for it again
    // is refused for a duplicate name the researcher never chose to ask for.
    await expect(box).toHaveValue('');
  },
};

/**
 * A create the codebook would not take. The name stays in the box, because the
 * refusal is about that name and the researcher has it to correct.
 */
export const ACreateThatWasRefused: Story = {
  args: { children: <AttributePicker canCreate /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const box = await canvas.findByRole('textbox', {
      name: 'Create a new attribute',
    });
    await userEvent.type(box, 'taken');
    await userEvent.click(
      canvas.getByRole('button', { name: 'Create the attribute' }),
    );

    await expect(box).toHaveValue('taken');
  },
};
