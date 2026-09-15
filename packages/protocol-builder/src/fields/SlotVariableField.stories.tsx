import type { Meta, StoryObj } from '@storybook/react-vite';
import { useMemo } from 'react';
import { expect, userEvent, within } from 'storybook/test';

import type { MessageDescriptor } from '@codaco/app-i18n/messages';
import { awaitPassiveEffects } from '@codaco/fresco-ui/storybook-support/awaitPassiveEffects';
import {
  INTERFACE_OWNED_OPTION_SETS,
  type InterfaceOwnedOption,
  type VariableType,
} from '@codaco/protocol-validation';
import type { SectionDoc } from '@codaco/studio-sync/apply';
import { sectionId } from '@codaco/studio-sync/taxonomy';

import type { WriterClass } from '../codebook/variableRoles.ts';
import { pedigreeMessages } from '../editors/family-pedigree/sections/pedigreeMessages.ts';
import {
  draftRowVariables,
  PEDIGREE_EXCLUSIVE_SLOTS,
  subjectVariableOptions,
} from '../editors/family-pedigree/sections/slotWiring.ts';
import { useStageValue } from '../form/stageFormHooks.ts';
import type { CodebookSubject } from '../protocol-context.ts';
import { useProtocolContext } from '../state/protocolContext.ts';
import { FieldStoryHost } from '../testing/FieldStoryHost.tsx';
import type { InMemoryHost } from '../testing/host/createInMemoryHost.ts';
import SlotVariableField from './SlotVariableField.tsx';

const PEDIGREE_STAGE = sectionId({
  kind: 'stage',
  stageId: 'family-pedigree-1',
});
const FAMILY_MEMBER = sectionId({
  kind: 'codebookNode',
  typeId: 'family_member',
});

const TYPE_FIELD = 'nodeConfig.type';
const LABEL_FIELD = 'nodeConfig.nodeLabelVariable';
const BIOLOGICAL_SEX_FIELD = 'nodeConfig.biologicalSexVariable';
const FORM_FIELD = 'nodeConfig.form';
const NOMINATION_PROMPTS_FIELD = 'nominationPrompts';
const EGO_SLOT = PEDIGREE_EXCLUSIVE_SLOTS.egoVariable;
const RELATIONSHIP_SLOT = PEDIGREE_EXCLUSIVE_SLOTS.relationshipVariable;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * The four attributes a pedigree's node configuration binds, with the props
 * `PedigreeNodeConfigurationSection` mounts each of them with.
 *
 * The differences are the point of these stories. The display label is a
 * VALIDATED writer — a participant types the name it holds — and the other
 * three are structural, written from the tree the participant draws with
 * nothing checking the answer. Two of those are exclusive to their own slot,
 * and the fourth is not (binning family members by sex is legitimate
 * authoring) but its VALUES belong to the interface, which is a different rule
 * and the one that decides what may be bound to it.
 */
type NodeSlot =
  | 'displayLabel'
  | 'participant'
  | 'relationship'
  | 'biologicalSex';

type SlotWiring = Readonly<{
  /** The slot's path in the stage document. */
  name: string;
  label: MessageDescriptor;
  hint: MessageDescriptor;
  createLabel: MessageDescriptor;
  variableType: VariableType;
  writerClass: WriterClass;
  /** The interface slot this picker fills, where the schema names one. */
  ownSlot?: string;
  lockedOptions?: readonly InterfaceOwnedOption[];
}>;

const NODE_SLOTS: Readonly<Record<NodeSlot, SlotWiring>> = {
  displayLabel: {
    name: LABEL_FIELD,
    label: pedigreeMessages.nodeLabelLabel,
    hint: pedigreeMessages.nodeLabelHint,
    createLabel: pedigreeMessages.nodeLabelCreateLabel,
    variableType: 'text',
    writerClass: 'validated',
  },
  participant: {
    name: EGO_SLOT.path,
    label: pedigreeMessages.nodeEgoLabel,
    hint: pedigreeMessages.nodeEgoHint,
    createLabel: pedigreeMessages.nodeEgoCreateLabel,
    variableType: 'boolean',
    writerClass: 'unvalidated',
    ownSlot: EGO_SLOT.slot,
  },
  relationship: {
    name: RELATIONSHIP_SLOT.path,
    label: pedigreeMessages.nodeRelationshipLabel,
    hint: pedigreeMessages.nodeRelationshipHint,
    createLabel: pedigreeMessages.nodeRelationshipCreateLabel,
    variableType: 'text',
    writerClass: 'unvalidated',
    ownSlot: RELATIONSHIP_SLOT.slot,
  },
  biologicalSex: {
    name: BIOLOGICAL_SEX_FIELD,
    label: pedigreeMessages.nodeBiologicalSexLabel,
    hint: pedigreeMessages.nodeBiologicalSexHint,
    createLabel: pedigreeMessages.nodeBiologicalSexCreateLabel,
    variableType: 'categorical',
    writerClass: 'unvalidated',
    lockedOptions: INTERFACE_OWNED_OPTION_SETS.biologicalSex.options,
  },
};

/**
 * One slot, wired as its section wires it.
 *
 * The pool is the node type's attributes narrowed to the type this slot binds,
 * and the other writers are read from the stage's LIVE draft — a form field or
 * a nomination toggle added in this session is in no protocol yet, and one just
 * cleared must free its attribute at once. Both are the section's work rather
 * than the field's, so a story that skipped them would show a control nobody
 * mounts.
 */
function PedigreeSlot({ slot }: Readonly<{ slot: NodeSlot }>) {
  const wiring = NODE_SLOTS[slot];
  const protocolContext = useProtocolContext();
  const nodeType = useStageValue(TYPE_FIELD);
  const formRows = useStageValue(FORM_FIELD);
  const nominationRows = useStageValue(NOMINATION_PROMPTS_FIELD);
  const labelDraft = useStageValue(LABEL_FIELD);
  const egoDraft = useStageValue(EGO_SLOT.path);
  const relationshipDraft = useStageValue(RELATIONSHIP_SLOT.path);
  const biologicalSexDraft = useStageValue(BIOLOGICAL_SEX_FIELD);

  const subject: CodebookSubject | null = useMemo(
    () =>
      typeof nodeType === 'string' ? { entity: 'node', type: nodeType } : null,
    [nodeType],
  );

  const options = useMemo(
    () =>
      subjectVariableOptions(protocolContext, subject).filter(
        (option) => option.type === wiring.variableType,
      ),
    [protocolContext, subject, wiring.variableType],
  );

  const draftFormVariables = useMemo(
    () => draftRowVariables(formRows),
    [formRows],
  );
  const draftUnvalidatedVariables = useMemo(
    () => [
      ...[egoDraft, relationshipDraft, biologicalSexDraft].filter(
        (value): value is string => typeof value === 'string',
      ),
      ...draftRowVariables(nominationRows),
    ],
    [biologicalSexDraft, egoDraft, nominationRows, relationshipDraft],
  );
  const draftLabelVariable =
    typeof labelDraft === 'string' && labelDraft !== ''
      ? labelDraft
      : undefined;

  // Each writer class is told what the OTHER one claims: the label refuses what
  // the structural slots derive, and they refuse what the stage's own form
  // collects. The label is also named on its own to the slots, because what it
  // costs them is different — the interview would overwrite the name the
  // participant typed with whatever the slot derives.
  const isLabel = slot === 'displayLabel';

  return (
    <SlotVariableField
      name={wiring.name}
      label={wiring.label}
      hint={wiring.hint}
      subject={subject}
      options={options}
      writerClass={wiring.writerClass}
      {...(wiring.ownSlot === undefined ? {} : { ownSlot: wiring.ownSlot })}
      draftConflicting={
        isLabel ? draftUnvalidatedVariables : draftFormVariables
      }
      {...(isLabel || draftLabelVariable === undefined
        ? {}
        : { draftLabelVariable })}
      variableType={wiring.variableType}
      {...(wiring.lockedOptions === undefined
        ? {}
        : { lockedOptions: wiring.lockedOptions })}
      createLabel={wiring.createLabel}
      emptyMessage={pedigreeMessages.slotEmptyState}
    />
  );
}

/**
 * Opens the slot's attribute window, the way a researcher reaches the list.
 *
 * The stage arrives from the host over a promise, so the editor — and every
 * control in it — is drawn a turn after the story mounts; every play in this
 * file awaits that before its first query. Either trigger name, because some
 * of these stories open on a slot that already holds an attribute and some on
 * one that does not, and the button says which.
 */
const openTheWindow = async (canvasElement: HTMLElement) => {
  const canvas = within(canvasElement);
  await awaitPassiveEffects();
  await userEvent.click(
    await canvas.findByRole('button', { name: /^(Select|Change) attribute$/u }),
  );
  return within(await within(document.body).findByRole('dialog'));
};

const nodeConfigOf = (document: SectionDoc): Record<string, unknown> =>
  isRecord(document.nodeConfig) ? document.nodeConfig : {};

/** A pedigree whose slot at this key has never been filled in. */
const withoutNodeConfigKey = (key: string) => (host: InMemoryHost) => {
  const { document } = host.store.read(PEDIGREE_STAGE);
  host.store.applyAsCollaborator(PEDIGREE_STAGE, {
    ...document,
    nodeConfig: Object.fromEntries(
      Object.entries(nodeConfigOf(document)).filter(
        ([candidate]) => candidate !== key,
      ),
    ),
  });
};

/** A pedigree whose slot at this key names this attribute. */
const holdingNodeConfigKey =
  (key: string, variableId: string) => (host: InMemoryHost) => {
    const { document } = host.store.read(PEDIGREE_STAGE);
    host.store.applyAsCollaborator(PEDIGREE_STAGE, {
      ...document,
      nodeConfig: { ...nodeConfigOf(document), [key]: variableId },
    });
  };

const meta = {
  title: 'Protocol Builder/Fields/Pedigree slot attribute',
  component: FieldStoryHost,
  parameters: {
    layout: 'fullscreen',
    docs: {
      description: {
        component:
          'One attribute a Family Pedigree writes the family into: chosen from the codebook, or created on the spot without leaving the stage. The picker, the create control and the save-time gate are one component because they have to agree — a picker that offered what the gate refuses reads as the editor changing its mind, and a create that seeded a different type would make an attribute the picker hides again. What may be bound is narrowed by the attribute’s type, by who else writes it (a participant types the display label, so nothing derived may overwrite it), by which other interface slot already claims it, and — where the interview and the genetics engine branch on exact values — by the values it offers.',
      },
    },
  },
  args: {
    stageId: 'family-pedigree-1',
    sectionTitle: 'Family members',
    children: <PedigreeSlot slot="participant" />,
  },
  tags: ['autodocs'],
} satisfies Meta<typeof FieldStoryHost>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * The slot as the protocol holds it, with the attribute's type stated beside
 * the choice and the way to invent another inside the window the choice is
 * made in — the attribute a researcher wants is often the one they have only
 * just thought of, and looking for it and finding it does not exist are one
 * act.
 */
export const AHeldSlot: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The stage arrives from the host over a promise, so the editor — and
    // every control in it — is drawn a turn after the story mounts. Every play
    // in this file awaits its FIRST query for that reason.
    await awaitPassiveEffects();

    // The slot's choice is shown as a typed pill over the trigger that opens
    // the window, and the kind of answer is stated beside it rather than left
    // to the pill's colour.
    await expect(
      await canvas.findByRole('button', { name: 'Change attribute' }),
    ).toBeEnabled();
    const held = canvasElement.querySelector('[data-attribute-type]');
    await expect(held).toHaveAttribute('data-attribute-type', 'boolean');
    await expect(held).toHaveTextContent('is_ego');
    await expect(
      canvas.getByText('Attribute type: boolean'),
    ).toBeInTheDocument();
    // Inventing one is offered from inside that window, on the term the
    // researcher typed: the slot carries no create control of its own.
    const window = await openTheWindow(canvasElement);
    await userEvent.type(
      window.getByRole('searchbox', { name: 'Find or create an attribute' }),
      'seen_in_person',
    );
    await expect(
      await window.findByRole('option', {
        name: 'Create new attribute called “seen_in_person”.',
      }),
    ).toBeInTheDocument();
  },
};

/**
 * A slot nothing is bound to yet, which is where a pedigree built from scratch
 * starts. The attribute is the researcher's to choose or to create; the slot
 * itself is not optional, so the stage cannot be saved until it holds one.
 */
export const NothingChosenYet: Story = {
  args: { seedEdit: withoutNodeConfigKey('egoVariable') },
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
 * Choosing another attribute of the same type. Only the booleans of this node
 * type are offered — the slot cannot bind anything else, whatever the
 * researcher would rather it were.
 */
export const ChoosingAnotherAttribute: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const window = await openTheWindow(canvasElement);
    await expect(window.queryByRole('option', { name: 'fm_name' })).toBeNull();

    await userEvent.click(
      window.getByRole('option', { name: 'hasConditionX' }),
    );

    await expect(
      await canvas.findByRole('button', { name: 'Change attribute' }),
    ).toBeInTheDocument();
    await expect(
      canvasElement.querySelector('[data-attribute-type]'),
    ).toHaveTextContent('hasConditionX');
  },
};

/**
 * Held elsewhere: the binding can be read and not changed. Creating is inside
 * the window now, so the disabled trigger is what withholds it — the window
 * never opens, and with it neither the list nor its create row, which is the
 * right answer for an action whose only explanation would be that somebody
 * else has the stage. The banner above the editor says who has it.
 */
export const ASpectator: Story = {
  args: { readOnly: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    const trigger = await canvas.findByRole('button', {
      name: 'Change attribute',
    });
    await expect(trigger).toBeDisabled();
    await userEvent.click(trigger);
    await expect(within(document.body).queryByRole('dialog')).toBeNull();
  },
};

/**
 * The attribute a slot names has been deleted from the codebook.
 *
 * The picker is built from the codebook as it stands, so it stops offering the
 * attribute at once — but the slot is still holding it, and a value that is
 * there satisfies the required rule. The gate is what refuses the save, in the
 * pedigree's own words and under the control the researcher has to change:
 * nothing can be recorded under an attribute that is not there, and unlike
 * every other rule here there is no escape for a pick that arrived with the
 * protocol, because this is not a decision anybody made.
 */
export const AnAttributeTheCodebookHasLost: Story = {
  args: {
    seedEdit: holdingNodeConfigKey('egoVariable', 'was_the_participant'),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // Kept and named rather than blanked: blanking would hide the reference
    // the researcher has to replace, and then write the blank over it.
    await expect(
      await canvas.findByText(
        'was_the_participant — this attribute is not available here',
      ),
    ).toBeInTheDocument();

    await userEvent.click(canvas.getByRole('button', { name: 'Save stage' }));

    await expect(
      await canvas.findByText(
        '"was_the_participant" is no longer in the codebook, so nothing can be recorded under it. Choose another attribute.',
      ),
    ).toBeInTheDocument();
  },
};

/**
 * A slot whose values the interface owns, and an attribute whose values
 * somebody has since edited.
 *
 * The interview writes those exact values and the genetics engine branches on
 * them, so an attribute carrying any other set would quietly degrade what the
 * pedigree records. It is still in the codebook and still categorical, so the
 * type gate has nothing to say about it: it is ruled out and named for what is
 * actually wrong, rather than dropped from the pool — dropped, the picker could
 * only have said it was "not available here", and it is available, exactly
 * where the researcher left it.
 */
export const AnAttributeWhoseValuesChanged: Story = {
  args: {
    children: <PedigreeSlot slot="biologicalSex" />,
    seedEdit: (host) => {
      const { document } = host.store.read(FAMILY_MEMBER);
      const variables = isRecord(document.variables) ? document.variables : {};
      host.store.applyAsCollaborator(FAMILY_MEMBER, {
        ...document,
        variables: {
          ...variables,
          // One option short of the set the interface owns.
          biologicalSex: {
            name: 'biologicalSex',
            type: 'categorical',
            options: [
              { value: 'female', label: 'Female' },
              { value: 'male', label: 'Male' },
            ],
          },
        },
      });
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await awaitPassiveEffects();

    // Still the held choice, named for what is actually wrong with it, and the
    // reason said under the control the researcher has to change.
    await expect(
      await canvas.findByText(
        'biologicalSex — no longer offers the values this control needs',
      ),
    ).toBeInTheDocument();
    await expect(
      canvas.getByText(
        'This attribute no longer offers the exact values this control needs, because they were changed somewhere else. Choose another one.',
      ),
    ).toBeInTheDocument();
    // And the window offers nothing at all: an attribute ruled out that no
    // slot holds is never listed, so the only categorical this node type has
    // is not on the list either.
    const window = await openTheWindow(canvasElement);
    await expect(window.queryAllByRole('option')).toHaveLength(0);
  },
};
