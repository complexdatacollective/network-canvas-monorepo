import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import { binMessages } from '../editors/ordinal-bin/sections/binMessages.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import BinAttributeField, {
  type BinAttributeSlot,
} from './BinAttributeField.tsx';

/** Whose attributes a bin prompt sorts, which the stage's subject decides. */
const PERSON: CodebookSubject = { entity: 'node', type: 'person' };

/** The codebook section a collaborator's edits below are written to. */
const PERSON_TYPE = sectionId({ kind: 'codebookNode', typeId: 'person' });

/** What an Ordinal Bin can draw before the bins stop being readable. */
const ORDINAL_BIN_LIMIT = 5;

/**
 * Where an Ordinal Bin prompt keeps the attribute whose ordered values are the
 * bins, and the only kind of answer that slot can bind.
 *
 * Frozen module constants rather than literals in the markup, as the two bins
 * declare them: the slot is a dependency of everything this control derives,
 * and one rebuilt on every render would rebuild all of it.
 */
const SCALE_SLOT: BinAttributeSlot = Object.freeze({
  name: 'variable',
  variableType: 'ordinal',
  // The bins are filled by dragging, which writes the attribute without asking
  // the participant anything a form could check.
  writerClass: 'unvalidated',
  goneRefusal: binMessages.binAttributeGoneRefusal,
});

/** The same slot for a Categorical Bin, whose values have no order among them. */
const BINS_SLOT: BinAttributeSlot = Object.freeze({
  name: 'variable',
  variableType: 'categorical',
  writerClass: 'unvalidated',
  goneRefusal: binMessages.binAttributeGoneRefusal,
});

/** What an Ordinal Bin prompt saved without an attribute is told. */
const REFUSAL = 'Choose the attribute whose values become the bins.';

/** The scale an Ordinal Bin prompt sorts people along. */
function TheScale({ committed }: Readonly<{ committed: string | undefined }>) {
  return (
    <BinAttributeField
      slot={SCALE_SLOT}
      subject={PERSON}
      committed={committed}
      label="Attribute"
      hint="Each of this attribute's values becomes a bin, in the order the attribute lists them."
      emptyMessage="This type has no ordinal attributes yet. Create one to say what the scale is."
      requiredMessage={REFUSAL}
      createLabel="Create a new attribute"
      optionLimit={ORDINAL_BIN_LIMIT}
      optionLimitDescription="This interface is designed for up to five bins. Beyond that the bins become hard to read and hard to drop into, which costs data quality."
    />
  );
}

/** The named bins a Categorical Bin prompt sorts people into. */
function TheBins({ committed }: Readonly<{ committed: string | undefined }>) {
  return (
    <BinAttributeField
      slot={BINS_SLOT}
      subject={PERSON}
      committed={committed}
      label="Attribute"
      hint="Each of this attribute's values becomes a bin, and dropping someone into a bin records that value for them."
      emptyMessage="This type has no categorical attributes yet. Create one to say what the bins are."
      requiredMessage={REFUSAL}
      createLabel="Create a new attribute"
      optionLimit={8}
      optionLimitDescription="This interface is designed for up to eight bins, including a follow-up bin. Beyond that the bins become hard to read and hard to drop into, which costs data quality. Consider grouping the values and asking for the detail in a later question."
    />
  );
}

const meta = {
  title: 'Protocol Builder/Fields/Bin attribute picker',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'Says which attribute a bin prompt sorts people by, and offers the codebook edits that attribute invites. Three controls in the order a researcher meets them: pick one of the attributes this prompt can bind, invent one if none fits, and change what the one they picked holds. What may be picked is narrowed by what the interview does with it — an attribute another stage collects through the codebook’s own rules is not one this stage may overwrite by dragging, and one whose values another interface computes is not a bin at all. The attribute’s values are edited through the codebook rather than on the prompt, because that is where they live.',
      },
    },
  },
  args: {
    stageId: 'ordinal-bin-1',
    // What the host stands in for is the row dialog that edits one question.
    sectionTitle: 'The scale',
    children: <TheScale committed="contactFreq" />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The prompt as the protocol holds it: one ordinal attribute, and its values. */
export const AScaleAlreadyChosen: Story = {};

/** A prompt nobody has said the scale of yet. */
export const ANewPrompt: Story = {
  args: { children: <TheScale committed={undefined} /> },
};

/**
 * Held elsewhere: the attribute is there to read, and neither the codebook
 * edits it invites nor the way to invent one is offered — starting either is a
 * write, and this researcher may make none.
 */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('combobox', { name: 'Attribute' }),
    ).toBeDisabled();
    await expect(
      canvas.queryByRole('button', { name: 'Create a new attribute' }),
    ).toBeNull();
  },
};

/**
 * A prompt saved without an attribute. The bins ARE the attribute's values, so
 * there is nothing to draw and nothing to record until one is named.
 */
export const AnAttributeThatMustBeChosen: Story = {
  args: { children: <TheScale committed={undefined} /> },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await userEvent.click(
      await canvas.findByRole('button', { name: 'Save stage' }),
    );

    await expect(await canvas.findByText(REFUSAL)).toBeInTheDocument();
  },
};

/**
 * An attribute this prompt names and nothing here offers — deleted from the
 * codebook, or changed to a kind of answer this interface cannot draw as bins.
 *
 * Kept and named rather than blanked, so the reference the researcher has to
 * replace is on screen instead of being hidden and then written back over. The
 * save is refused separately by `binAttributePickIssue`, which the two bins'
 * sections apply in their own `beforeSave`: a row gate is the dialog's to run,
 * so this host reaches the control's sentence and not that one.
 */
export const AnAttributeNothingOffers: Story = {
  args: { children: <TheScale committed="withdrawn_attribute" /> },
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
 * More values than this interface can draw at once.
 *
 * Counted from the CODEBOOK rather than from the prompt, because the values
 * belong to the attribute: a collaborator adding a sixth one makes this stage
 * unreadable without touching the stage. A warning rather than a refusal —
 * the protocol is valid, and how many bins a screen can carry is a judgement
 * about the interview rather than a rule about the document.
 */
export const MoreBinsThanFit: Story = {
  args: {
    seedEdit: (host) => {
      const { document } = host.store.read(PERSON_TYPE);
      const variables =
        typeof document.variables === 'object' && document.variables !== null
          ? document.variables
          : {};
      host.store.applyAsCollaborator(PERSON_TYPE, {
        ...document,
        variables: {
          ...variables,
          contactFreq: {
            name: 'contactFreq',
            type: 'ordinal',
            options: [
              { label: 'Daily', value: 6 },
              { label: 'Weekly', value: 5 },
              { label: 'Monthly', value: 4 },
              { label: 'Every few months', value: 3 },
              { label: 'Once a year', value: 2 },
              { label: 'Less than once a year', value: 1 },
            ],
          },
        },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByText('More bins than fit on one screen'),
    ).toBeInTheDocument();
  },
};

/**
 * The same control in a Categorical Bin, whose bins are named answers with no
 * order among them. One component, because the two bins are the same question
 * asked of different kinds of answer — which is the whole of what the slot
 * says.
 */
export const TheOtherBin: Story = {
  args: {
    stageId: 'categorical-bin-1',
    sectionTitle: 'The bins',
    children: <TheBins committed="contactType" />,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    await expect(
      await canvas.findByRole('combobox', { name: 'Attribute' }),
    ).toHaveValue('contactType');
  },
};
