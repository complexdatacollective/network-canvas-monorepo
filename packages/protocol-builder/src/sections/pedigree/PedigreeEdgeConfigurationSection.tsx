import { useMemo } from 'react';

import {
  FAMILY_PEDIGREE_SLOTS,
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
  type InterfaceOwnedOptionSetKey,
} from '@codaco/protocol-validation';

import { EntitySelectControl } from '../../fields/EntitySelectField.tsx';
import ProtocolField from '../../form/ProtocolField.tsx';
import { useStageEditorForm } from '../../form/stageEditorContext.ts';
import { useStageValue } from '../../form/stageFormHooks.ts';
import type { CodebookSubject } from '../../protocol-context.ts';
import BuilderSection from '../BuilderSection.tsx';
import { useResetOnEntityTypeChange } from './entityTypeReset.ts';
import SlotVariableField from './SlotVariableField.tsx';
import {
  subjectVariableOptions,
  type SlotVariableOption,
} from './slotWiring.ts';

const TYPE_FIELD = 'edgeConfig.type';
const RELATIONSHIP_TYPE_FIELD = 'edgeConfig.relationshipTypeVariable';
const IS_ACTIVE_FIELD = 'edgeConfig.isActiveVariable';
const GESTATIONAL_CARRIER_FIELD = 'edgeConfig.isGestationalCarrierVariable';
const GAMETE_ROLE_FIELD = 'edgeConfig.gameteRoleVariable';

/**
 * Every slot that names an attribute of the edge type, and so cannot survive a
 * change of edge type.
 */
const EDGE_TYPE_DEPENDENT_FIELDS: readonly string[] = Object.freeze([
  RELATIONSHIP_TYPE_FIELD,
  IS_ACTIVE_FIELD,
  GESTATIONAL_CARRIER_FIELD,
  GAMETE_ROLE_FIELD,
]);

const NO_ATTRIBUTES_MESSAGE =
  'No attributes of this type can be used here yet. Create one to continue.';

export type PedigreeEdgeConfigurationCopy = Readonly<{
  /** Names the section in the outline and to assistive technology. */
  sectionTitle: string;
  description: string;
  typeLabel: string;
  typeHint: string;
}>;

const DEFAULT_COPY: PedigreeEdgeConfigurationCopy = {
  sectionTitle: 'Relationship data',
  description:
    'Choose the edge type and map the attributes used to store family relationships.',
  typeLabel: 'Edge type',
  typeHint:
    'Every relationship the pedigree records — parents, partners and donors alike — is an edge of this one type.',
};

export type PedigreeEdgeConfigurationSectionProps = Readonly<{
  copy?: Partial<PedigreeEdgeConfigurationCopy>;
}>;

/**
 * The edge type the pedigree records relationships as, and the attributes it
 * writes on them.
 *
 * Every slot here is structural: the participant draws a family tree and the
 * interface writes these attributes from it, so each is exclusive to its own
 * slot and none of them may be collected by a form. Unlike the node type there
 * is no validated sibling to check against — the pedigree collects nothing on
 * its edges.
 */
export default function PedigreeEdgeConfigurationSection({
  copy,
}: PedigreeEdgeConfigurationSectionProps) {
  const words = { ...DEFAULT_COPY, ...copy };
  const { protocolContext } = useStageEditorForm();
  const edgeType = useStageValue(TYPE_FIELD);
  useResetOnEntityTypeChange(TYPE_FIELD, EDGE_TYPE_DEPENDENT_FIELDS);

  const subject: CodebookSubject | null = useMemo(
    () =>
      typeof edgeType === 'string' ? { entity: 'edge', type: edgeType } : null,
    [edgeType],
  );

  const variableOptions = useMemo(
    () => subjectVariableOptions(protocolContext, subject),
    [protocolContext, subject],
  );
  const booleanVariables = useMemo(
    () => variableOptions.filter((option) => option.type === 'boolean'),
    [variableOptions],
  );
  // Only categorical attributes carrying exactly the canonical value set may be
  // bound: the interview writes these exact values onto the edges it draws, and
  // the genetics engine branches on them. Asked with the protocol schema's own
  // comparison, so a picker can never offer what the schema then refuses.
  const matchingOwnedOptions = useMemo(
    () =>
      (setKey: InterfaceOwnedOptionSetKey): SlotVariableOption[] =>
        variableOptions.filter(
          (option) =>
            option.type === 'categorical' &&
            optionsMatchInterfaceOwnedSet(
              option.options === undefined ? undefined : [...option.options],
              INTERFACE_OWNED_OPTION_SETS[setKey].options,
            ),
        ),
    [variableOptions],
  );
  const relationshipTypeVariables = useMemo(
    () => matchingOwnedOptions('relationshipType'),
    [matchingOwnedOptions],
  );
  const gameteRoleVariables = useMemo(
    () => matchingOwnedOptions('gameteRole'),
    [matchingOwnedOptions],
  );

  return (
    <BuilderSection title={words.sectionTitle} description={words.description}>
      <ProtocolField<typeof EntitySelectControl>
        name={TYPE_FIELD}
        component={EntitySelectControl}
        entityType="edge"
        label={words.typeLabel}
        hint={words.typeHint}
        required
      />

      {subject !== null && (
        <>
          <SlotVariableField
            name={RELATIONSHIP_TYPE_FIELD}
            label="Relationship type"
            hint="A categorical attribute holding what kind of relationship each edge is — biological, social, donor, surrogate, adoptive or partner. Its values are fixed by the interface."
            subject={subject}
            options={relationshipTypeVariables}
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.relationshipTypeVariable}
            variableType="categorical"
            lockedOptions={INTERFACE_OWNED_OPTION_SETS.relationshipType.options}
            createLabel="Create a new relationship type attribute"
            createDescription="Create the categorical attribute the pedigree records relationship kinds in"
            emptyMessage={NO_ATTRIBUTES_MESSAGE}
          />
          <SlotVariableField
            name={IS_ACTIVE_FIELD}
            label="Active status"
            hint="A boolean attribute recording whether the relationship is a current one."
            subject={subject}
            options={booleanVariables}
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.isActiveVariable}
            variableType="boolean"
            createLabel="Create a new active status attribute"
            createDescription="Create a boolean attribute recording whether a relationship is current"
            emptyMessage={NO_ATTRIBUTES_MESSAGE}
          />
          <SlotVariableField
            name={GESTATIONAL_CARRIER_FIELD}
            label="Gestational carrier"
            hint="A boolean attribute recording who carried each pregnancy. It is only written on parent relationships."
            subject={subject}
            options={booleanVariables}
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.isGestationalCarrierVariable}
            variableType="boolean"
            createLabel="Create a new gestational carrier attribute"
            createDescription="Create a boolean attribute recording who carried each pregnancy"
            emptyMessage={NO_ATTRIBUTES_MESSAGE}
          />
          <SlotVariableField
            name={GAMETE_ROLE_FIELD}
            label="Gamete role"
            hint="A categorical attribute recording whether a parent contributed the egg or the sperm, which the pedigree traces biological inheritance through. Its values are fixed by the interface."
            subject={subject}
            options={gameteRoleVariables}
            writerClass="unvalidated"
            ownSlot={FAMILY_PEDIGREE_SLOTS.gameteRoleVariable}
            variableType="categorical"
            lockedOptions={INTERFACE_OWNED_OPTION_SETS.gameteRole.options}
            createLabel="Create a new gamete role attribute"
            createDescription="Create the categorical attribute the pedigree records gamete roles in"
            emptyMessage={NO_ATTRIBUTES_MESSAGE}
          />
        </>
      )}
    </BuilderSection>
  );
}
