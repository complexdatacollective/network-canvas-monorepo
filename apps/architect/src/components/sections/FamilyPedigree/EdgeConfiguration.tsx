import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import {
  FAMILY_PEDIGREE_SLOTS,
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
} from '@codaco/protocol-validation';
import ArchitectField from '~/components/Form/ArchitectField';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import IssueAnchor from '~/components/IssueAnchor';
import type {
  Entity,
  LockedVariableOptions,
} from '~/components/NewVariableWindow';
import NewVariableWindow, {
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import { EntitySelectControl } from '~/components/sections/fields/EntitySelectField/EntitySelectField';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import { useStageFormContext } from '~/components/StageEditor/stageFormContext';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import type { RootState } from '~/ducks/store';
import {
  EMPTY_VARIABLES,
  getVariableOptionsForSubject,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import {
  getExclusiveVariableSlotMap,
  getVariableRoleMap,
} from '~/selectors/indexes';

import {
  makeSlotCrossClassValidator,
  selectSlotPickerOptions,
} from './slotWiring';
const remainingMessages = defineMessages({
  youAttemptedToChangeTheEdge: {
    id: 'architect.remaining.sections.familyPedigree.edgeConfiguration.youAttemptedToChangeTheEdge',
    defaultMessage:
      'You attempted to change the edge type of a stage that you have already configured. Before you can proceed the attributes selected for this edge type must be cleared. Do you want to change the edge type now?',
    description:
      'The promptBeforeChange text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
});
const messages = defineMessages({
  relationshipData: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.relationshipData',
    defaultMessage: 'Relationship data',
    description:
      'The title text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  chooseTheEdgeTypeAndMap: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.chooseTheEdgeTypeAndMap',
    defaultMessage:
      'Choose the edge type and map the attributes used to store family relationships.',
    description:
      'The description text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  edgeType: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.edgeType',
    defaultMessage: 'Edge type',
    description:
      'The description text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  relationshipAttributes: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.relationshipAttributes',
    defaultMessage: 'Relationship attributes',
    description:
      'The title text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  mapTheEdgeAttributesUsedTo: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.mapTheEdgeAttributesUsedTo',
    defaultMessage:
      'Map the edge attributes used to describe family relationships and support inheritance tracing.',
    description:
      'The description text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  relationshipTypeAttribute: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.relationshipTypeAttribute',
    defaultMessage: 'Relationship type attribute',
    description:
      'The description text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  relationshipType: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.relationshipType',
    defaultMessage: 'Relationship type',
    description:
      'The label text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  storesTheRelationshipCategoryBetweenFamily: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.storesTheRelationshipCategoryBetweenFamily',
    defaultMessage:
      'Stores the relationship category between family members, such as biological, social, donor, surrogate, adoptive, or partner.',
    description:
      'The hint text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  activeStatusAttribute: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.activeStatusAttribute',
    defaultMessage: 'Active status attribute',
    description:
      'The description text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  activeStatus: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.activeStatus',
    defaultMessage: 'Active status',
    description:
      'The label text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  aBooleanAttributeIndicatingWhetherThe: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.aBooleanAttributeIndicatingWhetherThe',
    defaultMessage:
      'A boolean attribute indicating whether the relationship is currently active.',
    description:
      'The hint text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  gestationalCarrierAttribute: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.gestationalCarrierAttribute',
    defaultMessage: 'Gestational carrier attribute',
    description:
      'The description text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  gestationalCarrier: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.gestationalCarrier',
    defaultMessage: 'Gestational carrier',
    description:
      'The label text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  aBooleanAttributeIndicatingWhetherA: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.aBooleanAttributeIndicatingWhetherA',
    defaultMessage:
      'A boolean attribute indicating whether a parent is a gestational carrier. Used only for parent relationships.',
    description:
      'The hint text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  gameteRoleAttribute: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.gameteRoleAttribute',
    defaultMessage: 'Gamete role attribute',
    description:
      'The description text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  gameteRole: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.gameteRole',
    defaultMessage: 'Gamete role',
    description:
      'The label text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
  storesWhetherAParentContributedThe: {
    id: 'architect.sections.familyPedigree.edgeConfiguration.storesWhetherAParentContributedThe',
    defaultMessage:
      'Stores whether a parent contributed the egg or sperm. The interface uses this fixed value set to trace biological inheritance.',
    description:
      'The hint text in components / sections / FamilyPedigree / EdgeConfiguration.',
  },
});

const edgeEntity: Entity = 'edge';

// Variable pickers that reference the selected edge type's variables; they must
// be cleared when the edge type changes so a saved stage never points at
// variables belonging to the previous edge type.
const EDGE_DEPENDENT_VARIABLE_FIELDS = [
  'edgeConfig.relationshipTypeVariable',
  'edgeConfig.isActiveVariable',
  'edgeConfig.isGestationalCarrierVariable',
  'edgeConfig.gameteRoleVariable',
];

type VariableWindowInitialProps = {
  entity: Entity;
  type: string;
  initialValues: {
    name: string;
    type: string;
  };
  lockedOptions: LockedVariableOptions | null;
};

const EdgeConfiguration = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const { storeApi, draft } = useStageFormContext();
  const setStageValue = useSetStageValue();
  const edgeType = useStageFormValue<string>('edgeConfig.type');
  const edgeTypeInitial = useStageInitialValue<string>('edgeConfig.type');
  const relationshipTypeVariableInitial = useStageInitialValue<string>(
    'edgeConfig.relationshipTypeVariable',
  );
  const isActiveVariableInitial = useStageInitialValue<string>(
    'edgeConfig.isActiveVariable',
  );
  const isGestationalCarrierVariableInitial = useStageInitialValue<string>(
    'edgeConfig.isGestationalCarrierVariable',
  );
  const gameteRoleVariableInitial = useStageInitialValue<string>(
    'edgeConfig.gameteRoleVariable',
  );

  // The `with*ChangeHandler` enhancer's replacement — a caller `onChange` on
  // ArchitectField would replace the store write instead of running alongside
  // it (fresco-ui `Field` spreads caller props last), so the reset lives in an
  // observer effect instead. `previousEdgeType` starts as the field's own
  // current value, so a stage's first edge-type pick never trips the reset.
  const previousEdgeType = useRef(edgeType);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersion = useRef(restoreVersion);
  useEffect(() => {
    const previous = previousEdgeType.current;
    previousEdgeType.current = edgeType;
    const previousVersion = previousRestoreVersion.current;
    previousRestoreVersion.current = restoreVersion;
    if (!previous || previous === edgeType) return;

    // An undo/redo restores the edge type together with the slots that belong
    // to it, so clearing here would wipe the half of the restore the user was
    // reaching for.
    if (previousVersion !== restoreVersion) return;

    // As ONE gesture, like its NodeConfiguration sibling: the edge-type change
    // and every slot it invalidates are a single point on the undo timeline,
    // landing with the gesture rather than at the mercy of which of the loop's
    // writes happens to be the last one to arm a debounce.
    draft.runGesture(() => {
      for (const field of EDGE_DEPENDENT_VARIABLE_FIELDS) {
        storeApi.getState().clearValue(field);
      }
    });
  }, [draft, edgeType, restoreVersion, storeApi]);

  const edgeVariableOptions = useSelector((state: RootState) =>
    edgeType
      ? getVariableOptionsForSubject(state, { entity: 'edge', type: edgeType })
      : [],
  );
  // Memoized on edgeType so the subject object identity is stable across
  // renders, matching getVariablesForSubjectSelector's reselect memoization
  // instead of defeating it every render.
  const edgeVariablesSubject = useMemo(
    () => (edgeType ? { entity: 'edge' as const, type: edgeType } : null),
    [edgeType],
  );
  const allVariables = useSelector((state: RootState) =>
    edgeVariablesSubject
      ? getVariablesForSubjectSelector(state, edgeVariablesSubject)
      : EMPTY_VARIABLES,
  );
  const roleMap = useSelector(getVariableRoleMap);
  const committedEdgeConfig =
    useStageInitialValue<Record<string, unknown>>('edgeConfig');
  const relationshipTypeDraft = useStageFormValue<string>(
    'edgeConfig.relationshipTypeVariable',
  );
  const isActiveDraft = useStageFormValue<string>(
    'edgeConfig.isActiveVariable',
  );
  const isGestationalCarrierDraft = useStageFormValue<string>(
    'edgeConfig.isGestationalCarrierVariable',
  );
  const gameteRoleDraft = useStageFormValue<string>(
    'edgeConfig.gameteRoleVariable',
  );
  // Save-time cross-class gate for an edgeConfig slot (an UNVALIDATED
  // writer). Unlike NodeConfiguration's slots there is no intra-draft sibling
  // to check: FamilyPedigree has no validated writer on its edge type.
  const exclusiveSlotMap = useSelector(getExclusiveVariableSlotMap);
  const makeSlotValidator = (slotField: keyof typeof FAMILY_PEDIGREE_SLOTS) =>
    makeSlotCrossClassValidator({
      subject: edgeVariablesSubject,
      committedConfig: committedEdgeConfig,
      committedKey: slotField,
      ownSlot: FAMILY_PEDIGREE_SLOTS[slotField],
      exclusiveSlotMap,
      roleMap,
      allVariables,
      writerClass: 'unvalidated',
    });
  const relationshipTypeCompatible = edgeVariableOptions.filter(
    (v) =>
      v.type === 'categorical' &&
      optionsMatchInterfaceOwnedSet(
        v.options,
        INTERFACE_OWNED_OPTION_SETS.relationshipType.options,
      ),
  );
  const booleanEdgeVariables = edgeVariableOptions.filter(
    (v) => v.type === 'boolean',
  );
  // Only categorical variables whose options are exactly the canonical
  // gamete-role set may be bound: the interview writes these exact values
  // (egg/sperm) onto genetic parent edges, so an existing categorical variable
  // with a different value set would silently break inheritance tracing.
  // Mirrors the relationship-type picker above, and asks the question with the
  // protocol schema's OWN comparison so the picker cannot offer a variable the
  // validator then rejects.
  const gameteRoleCompatible = edgeVariableOptions.filter(
    (v) =>
      v.type === 'categorical' &&
      optionsMatchInterfaceOwnedSet(
        v.options,
        INTERFACE_OWNED_OPTION_SETS.gameteRole.options,
      ),
  );
  // Each slot is an UNVALIDATED writer. Per-slot pools because two slots share
  // a type pool but each escapes only its own value, and each passes its own
  // slot so a second Family Pedigree over the same edge type may still share
  // the variable.
  const relationshipTypeVariableOptions = useSelector((state: RootState) =>
    selectSlotPickerOptions(state, {
      subject: edgeVariablesSubject,
      options: relationshipTypeCompatible,
      currentValue: relationshipTypeDraft,
      ownSlot: FAMILY_PEDIGREE_SLOTS.relationshipTypeVariable,
      writerClass: 'unvalidated',
    }),
  );
  const isActiveVariableOptions = useSelector((state: RootState) =>
    selectSlotPickerOptions(state, {
      subject: edgeVariablesSubject,
      options: booleanEdgeVariables,
      currentValue: isActiveDraft,
      ownSlot: FAMILY_PEDIGREE_SLOTS.isActiveVariable,
      writerClass: 'unvalidated',
    }),
  );
  const isGestationalCarrierVariableOptions = useSelector((state: RootState) =>
    selectSlotPickerOptions(state, {
      subject: edgeVariablesSubject,
      options: booleanEdgeVariables,
      currentValue: isGestationalCarrierDraft,
      ownSlot: FAMILY_PEDIGREE_SLOTS.isGestationalCarrierVariable,
      writerClass: 'unvalidated',
    }),
  );
  const gameteRoleVariableOptions = useSelector((state: RootState) =>
    selectSlotPickerOptions(state, {
      subject: edgeVariablesSubject,
      options: gameteRoleCompatible,
      currentValue: gameteRoleDraft,
      ownSlot: FAMILY_PEDIGREE_SLOTS.gameteRoleVariable,
      writerClass: 'unvalidated',
    }),
  );
  const handleCreatedVariable = (...args: unknown[]) => {
    const [id, params] = args as [
      string,
      {
        field: string;
      },
    ];
    setStageValue(params.field, id);
  };
  const initialWindowProps: VariableWindowInitialProps = {
    entity: edgeEntity,
    type: edgeType ?? '',
    initialValues: { name: '', type: '' },
    lockedOptions: null,
  };
  const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
    initialWindowProps,
    handleCreatedVariable,
  );
  const handleNewRelationshipTypeVariable = (name: string) =>
    openVariableWindow(
      {
        initialValues: { name, type: 'categorical' },
        lockedOptions: INTERFACE_OWNED_OPTION_SETS.relationshipType.options,
      },
      { field: 'edgeConfig.relationshipTypeVariable' },
    );
  const handleNewIsActiveVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'boolean' }, lockedOptions: null },
      { field: 'edgeConfig.isActiveVariable' },
    );
  const handleNewGestationalCarrierVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'boolean' }, lockedOptions: null },
      { field: 'edgeConfig.isGestationalCarrierVariable' },
    );
  const handleNewGameteRoleVariable = (name: string) =>
    openVariableWindow(
      {
        initialValues: { name, type: 'categorical' },
        // Seed and lock the canonical value set — the interview writes these
        // exact values, so the researcher may not edit them (mirrors the
        // relationship-type variable).
        lockedOptions: INTERFACE_OWNED_OPTION_SETS.gameteRole.options,
      },
      { field: 'edgeConfig.gameteRoleVariable' },
    );
  return (
    <>
      <Section
        title={intl.formatMessage(messages.relationshipData)}
        description={intl.formatMessage(messages.chooseTheEdgeTypeAndMap)}
      >
        <IssueAnchor
          fieldName="edgeConfig.type"
          description={intl.formatMessage(messages.edgeType)}
        />
        <ArchitectField
          name="edgeConfig.type"
          component={EntitySelectControl}
          entityType="edge"
          promptBeforeChange={intl.formatMessage(
            remainingMessages.youAttemptedToChangeTheEdge,
          )}
          validation={{ required: true }}
          label={intl.formatMessage(messages.edgeType)}
          initialValue={edgeTypeInitial}
        />

        {edgeType && (
          <Section
            title={intl.formatMessage(messages.relationshipAttributes)}
            description={intl.formatMessage(
              messages.mapTheEdgeAttributesUsedTo,
            )}
          >
            <IssueAnchor
              fieldName="edgeConfig.relationshipTypeVariable"
              description={intl.formatMessage(
                messages.relationshipTypeAttribute,
              )}
            />
            <ArchitectField
              name="edgeConfig.relationshipTypeVariable"
              label={intl.formatMessage(messages.relationshipType)}
              hint={intl.formatMessage(
                messages.storesTheRelationshipCategoryBetweenFamily,
              )}
              component={VariablePickerControl}
              validation={{
                required: true,
                crossClassPick: makeSlotValidator('relationshipTypeVariable'),
              }}
              initialValue={relationshipTypeVariableInitial}
              entity="edge"
              type={edgeType}
              options={relationshipTypeVariableOptions}
              onCreateOption={handleNewRelationshipTypeVariable}
              className="@min-lg:w-[50cqw]"
              inline
            />
            <IssueAnchor
              fieldName="edgeConfig.isActiveVariable"
              description={intl.formatMessage(messages.activeStatusAttribute)}
            />
            <ArchitectField
              name="edgeConfig.isActiveVariable"
              label={intl.formatMessage(messages.activeStatus)}
              hint={intl.formatMessage(
                messages.aBooleanAttributeIndicatingWhetherThe,
              )}
              component={VariablePickerControl}
              validation={{
                required: true,
                crossClassPick: makeSlotValidator('isActiveVariable'),
              }}
              initialValue={isActiveVariableInitial}
              entity="edge"
              type={edgeType}
              options={isActiveVariableOptions}
              onCreateOption={handleNewIsActiveVariable}
              className="@min-lg:w-[50cqw]"
              inline
            />
            <IssueAnchor
              fieldName="edgeConfig.isGestationalCarrierVariable"
              description={intl.formatMessage(
                messages.gestationalCarrierAttribute,
              )}
            />
            <ArchitectField
              name="edgeConfig.isGestationalCarrierVariable"
              label={intl.formatMessage(messages.gestationalCarrier)}
              hint={intl.formatMessage(
                messages.aBooleanAttributeIndicatingWhetherA,
              )}
              component={VariablePickerControl}
              validation={{
                required: true,
                crossClassPick: makeSlotValidator(
                  'isGestationalCarrierVariable',
                ),
              }}
              initialValue={isGestationalCarrierVariableInitial}
              entity="edge"
              type={edgeType}
              options={isGestationalCarrierVariableOptions}
              onCreateOption={handleNewGestationalCarrierVariable}
              className="@min-lg:w-[50cqw]"
              inline
            />
            <IssueAnchor
              fieldName="edgeConfig.gameteRoleVariable"
              description={intl.formatMessage(messages.gameteRoleAttribute)}
            />
            <ArchitectField
              name="edgeConfig.gameteRoleVariable"
              label={intl.formatMessage(messages.gameteRole)}
              hint={intl.formatMessage(
                messages.storesWhetherAParentContributedThe,
              )}
              component={VariablePickerControl}
              validation={{
                required: true,
                crossClassPick: makeSlotValidator('gameteRoleVariable'),
              }}
              initialValue={gameteRoleVariableInitial}
              entity="edge"
              type={edgeType}
              options={gameteRoleVariableOptions}
              onCreateOption={handleNewGameteRoleVariable}
              className="@min-lg:w-[50cqw]"
              inline
            />
          </Section>
        )}
      </Section>
      <NewVariableWindow {...variableWindowProps} />
    </>
  );
};
export default EdgeConfiguration;
