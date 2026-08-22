import { useEffect, useMemo, useRef } from 'react';
import { useSelector } from 'react-redux';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import {
  FAMILY_PEDIGREE_SLOTS,
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
} from '@codaco/protocol-validation';
import { Section } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import { clearFieldValue } from '~/components/Form/clearFieldValue';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import IssueAnchor from '~/components/IssueAnchor';
import type {
  Entity,
  LockedVariableOptions,
} from '~/components/NewVariableWindow';
import NewVariableWindow, {
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import { useOwningStageReader } from '~/components/NewVariableWindow/prospectiveImpliedRules';
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
  /** See `prospectiveImpliedRules`. */
  readOwningStage: () => Record<string, unknown> | undefined;
  slotPath: string | null;
};

type VariableRowProps = {
  name: string;
  label: string;
  description: string;
  options: {
    value: string;
    label: string;
    type?: string;
  }[];
  onCreateOption: (name: string) => void;
  edgeType: string;
  /**
   * Save-time cross-class gate for this slot (an UNVALIDATED writer): a sync
   * field validator, so an invalid pick blocks the stage editor's save — the
   * same field-level `crossClassPick` shape NetworkComposer's quickAdd uses.
   */
  crossClassPick: (value: unknown) => string | undefined;
};

const VariableRow = ({
  name,
  label,
  description,
  options,
  onCreateOption,
  edgeType,
  crossClassPick,
}: VariableRowProps) => {
  const initialValue = useStageInitialValue<string>(name);

  return (
    /* Stacks below its own container width rather than the viewport's — see
       the matching row in `NodeConfiguration.tsx` for why, including why the
       `flex-1 basis-0` sizing is gated on the same query. */
    <div className="@container">
      <div className="flex flex-col items-start gap-5 @min-[34rem]:flex-row">
        <div className="flex w-full min-w-0 flex-col gap-1 @min-[34rem]:flex-1 @min-[34rem]:basis-0 @min-[34rem]:pt-2.5">
          <span className="font-semibold">
            {label}
            <span className="text-destructive ms-1">*</span>
          </span>
          <span className="text-text/60 text-sm leading-snug">
            {description}
          </span>
        </div>
        <div className="relative w-full min-w-0 @min-[34rem]:flex-1 @min-[34rem]:basis-0">
          <IssueAnchor fieldName={name} description={`${label} Attribute`} />
          <ArchitectField
            name={name}
            component={VariablePickerControl}
            validation={{ required: true, crossClassPick }}
            label={`${label} attribute`}
            labelHidden
            initialValue={initialValue}
            entity="edge"
            type={edgeType}
            options={options}
            onCreateOption={onCreateOption}
          />
        </div>
      </div>
    </div>
  );
};

const EdgeConfiguration = (_props: StageEditorSectionProps) => {
  const { storeApi, draft } = useStageFormContext();
  const setStageValue = useSetStageValue();
  const edgeType = useStageFormValue<string>('edgeConfig.type');
  const edgeTypeInitial = useStageInitialValue<string>('edgeConfig.type');

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
        clearFieldValue(storeApi, field);
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
  const readOwningStage = useOwningStageReader();
  const initialWindowProps: VariableWindowInitialProps = {
    entity: edgeEntity,
    type: edgeType ?? '',
    initialValues: { name: '', type: '' },
    lockedOptions: null,
    readOwningStage,
    slotPath: null,
  };
  const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
    initialWindowProps,
    handleCreatedVariable,
  );
  /**
   * Opening the window is also declaring which slot the new attribute will
   * fill: the stage field the created id is written into IS that slot's
   * stage-relative path, so the window can ask the schema what this stage
   * implies about an attribute there rather than being told the path twice.
   */
  const openVariableWindowForSlot = (
    props: Omit<Partial<VariableWindowInitialProps>, 'slotPath'>,
    field: string,
  ) => openVariableWindow({ ...props, slotPath: field }, { field });
  const handleNewRelationshipTypeVariable = (name: string) =>
    openVariableWindowForSlot(
      {
        initialValues: { name, type: 'categorical' },
        lockedOptions: INTERFACE_OWNED_OPTION_SETS.relationshipType.options,
      },
      'edgeConfig.relationshipTypeVariable',
    );
  const handleNewIsActiveVariable = (name: string) =>
    openVariableWindowForSlot(
      { initialValues: { name, type: 'boolean' }, lockedOptions: null },
      'edgeConfig.isActiveVariable',
    );
  const handleNewGestationalCarrierVariable = (name: string) =>
    openVariableWindowForSlot(
      { initialValues: { name, type: 'boolean' }, lockedOptions: null },
      'edgeConfig.isGestationalCarrierVariable',
    );
  const handleNewGameteRoleVariable = (name: string) =>
    openVariableWindowForSlot(
      {
        initialValues: { name, type: 'categorical' },
        // Seed and lock the canonical value set — the interview writes these
        // exact values, so the researcher may not edit them (mirrors the
        // relationship-type variable).
        lockedOptions: INTERFACE_OWNED_OPTION_SETS.gameteRole.options,
      },
      'edgeConfig.gameteRoleVariable',
    );
  return (
    <>
      <Section
        title="Edge Configuration"
        summary={
          <>
            <Paragraph>
              The family pedigree is stored as a network: each family member is
              a node, and every parent or partner connection between two people
              is an edge. This interface needs an edge type so that it can
              record those connections in your codebook — including the
              parentage it infers automatically — and so that the structure of
              the pedigree appears in your exported data.
            </Paragraph>
            <Paragraph>
              Select the edge type to use, along with the attributes that store
              the details of each relationship.
            </Paragraph>
          </>
        }
      >
        <>
          <IssueAnchor fieldName="edgeConfig.type" description="Edge Type" />
          <ArchitectField
            name="edgeConfig.type"
            component={EntitySelectControl}
            entityType="edge"
            promptBeforeChange="You attempted to change the edge type of a stage that you have already configured. Before you can proceed the attributes selected for this edge type must be cleared. Do you want to change the edge type now?"
            validation={{ required: true }}
            label="Edge type"
            initialValue={edgeTypeInitial}
          />
        </>
        {edgeType && (
          <Surface
            noContainer
            spacing="sm"
            shadow="none"
            className="mt-7 flex flex-col gap-7 overflow-visible!"
          >
            <VariableRow
              name="edgeConfig.relationshipTypeVariable"
              label="Relationship Type"
              description="Stores the type of relationship between family members (e.g. biological, social, donor, surrogate, adoptive, or partner)."
              edgeType={edgeType}
              options={relationshipTypeVariableOptions}
              onCreateOption={handleNewRelationshipTypeVariable}
              crossClassPick={makeSlotValidator('relationshipTypeVariable')}
            />
            <VariableRow
              name="edgeConfig.isActiveVariable"
              label="Is Active"
              description="Stores whether the relationship is currently active."
              edgeType={edgeType}
              options={isActiveVariableOptions}
              onCreateOption={handleNewIsActiveVariable}
              crossClassPick={makeSlotValidator('isActiveVariable')}
            />
            <VariableRow
              name="edgeConfig.isGestationalCarrierVariable"
              label="Gestational Carrier"
              description="Stores whether a parent is a gestational carrier (parent edges only)."
              edgeType={edgeType}
              options={isGestationalCarrierVariableOptions}
              onCreateOption={handleNewGestationalCarrierVariable}
              crossClassPick={makeSlotValidator('isGestationalCarrierVariable')}
            />
            <VariableRow
              name="edgeConfig.gameteRoleVariable"
              label="Gamete Role"
              description="Stores which reproductive cell (gamete) a parent contributed to a child: the egg or the sperm. The interface uses this to trace the biological route of inheritance along each parent relationship. This attribute uses a fixed set of values (egg/sperm) that cannot be edited."
              edgeType={edgeType}
              options={gameteRoleVariableOptions}
              onCreateOption={handleNewGameteRoleVariable}
              crossClassPick={makeSlotValidator('gameteRoleVariable')}
            />
          </Surface>
        )}
      </Section>
      <NewVariableWindow {...variableWindowProps} />
    </>
  );
};
export default EdgeConfiguration;
