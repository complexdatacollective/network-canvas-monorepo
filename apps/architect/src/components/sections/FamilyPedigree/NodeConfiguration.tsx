import { get, union } from 'es-toolkit/compat';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
} from 'react';
import { useSelector } from 'react-redux';

import { createMessageError, defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import Section from '@codaco/fresco-ui/Section';
import {
  FAMILY_PEDIGREE_SLOTS,
  INTERFACE_OWNED_OPTION_SETS,
  optionsMatchInterfaceOwnedSet,
} from '@codaco/protocol-validation';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import {
  arrayItemMessages,
  arrayValidationMessages,
} from '~/components/Form/arrayFields/arrayMessages';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
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
import {
  composerValidationViews,
  isVariableUsedBySibling,
  sharedFormValidationView,
} from '~/components/sections/Form/composerHelpers';
import FieldEditorPreview from '~/components/sections/Form/FieldEditorPreview';
import FieldFields from '~/components/sections/Form/FieldFields';
import {
  CODEBOOK_PROPERTIES,
  getCodebookProperties,
  itemSelector,
  normalizeField,
} from '~/components/sections/Form/helpers';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import { useStageFormContext } from '~/components/StageEditor/stageFormContext';
import {
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
} from '~/components/StageEditor/stageFormHooks';
import { makeFieldEditorValidate } from '~/components/Validations/contradictions';
import { getTypeForComponent } from '~/config/variables';
import { useAppDispatch } from '~/ducks/hooks';
import {
  createVariableAsync,
  updateVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import { getFamilyPedigreeNodeTypeChangeBlock } from '~/ducks/modules/protocol/stages';
import type { RootState } from '~/ducks/store';
import { toSubmissionError } from '~/i18n/submissionErrors';
import {
  EMPTY_VARIABLES,
  getVariableOptionsForSubject,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import {
  getExclusiveVariableSlotMap,
  getVariableRoleMap,
} from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';
import { hasUnvalidatedUse } from '~/selectors/roleFilters';

import CodebookVariableValidationSection from '../CodebookVariableValidationSection';
import NodeFormFieldPreview from './NodeFormFieldPreview';
import {
  draftFormFieldVariables,
  makeSlotCrossClassValidator,
  selectSlotPickerOptions,
} from './slotWiring';
const remainingMessages = defineMessages({
  youAttemptedToChangeTheNode: {
    id: 'architect.remaining.sections.familyPedigree.nodeConfiguration.youAttemptedToChangeTheNode',
    defaultMessage:
      'You attempted to change the node type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?',
    description:
      'The promptBeforeChange text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  editField: {
    id: 'architect.remaining.sections.familyPedigree.nodeConfiguration.editField',
    defaultMessage: 'Edit Field',
    description:
      'The addTitle text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
});
const chromeMessages = defineMessages({
  thisFamilyPedigreeStageSNetworkIs: {
    id: 'architect.chrome.sections.familyPedigree.nodeConfiguration.thisFamilyPedigreeStageSNetworkIs',
    defaultMessage:
      "{stageCount, plural, one {This Family Pedigree stage's network is used by the Narrative Pedigree stage {stageNames}. Change or remove that stage before changing the node type.} other {This Family Pedigree stage's network is used by the Narrative Pedigree stages {stageNames}. Change or remove those stages before changing the node type.}}",
    description:
      'Researcher-facing explanatory text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
});
const additionalMessages = defineMessages({
  createNewFormField: {
    id: 'architect.additional.sections.familyPedigree.nodeConfiguration.createNewFormField',
    defaultMessage: 'Create new form field',
    description:
      'The addButtonLabel text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
});
const messages = defineMessages({
  familyMemberData: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.familyMemberData',
    defaultMessage: 'Family member data',
    description:
      'The title text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  chooseTheNodeTypeAndMap: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.chooseTheNodeTypeAndMap',
    defaultMessage:
      'Choose the node type and map the attributes used to represent family members.',
    description:
      'The description text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  nodeType: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.nodeType',
    defaultMessage: 'Node type',
    description:
      'The description text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  familyMemberAttributes: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.familyMemberAttributes',
    defaultMessage: 'Family member attributes',
    description:
      'The title text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  mapTheNodeAttributesUsedTo: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.mapTheNodeAttributesUsedTo',
    defaultMessage:
      'Map the node attributes used to label family members and store pedigree relationships.',
    description:
      'The description text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  displayLabelAttribute: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.displayLabelAttribute',
    defaultMessage: 'Display label attribute',
    description:
      'The description text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  displayLabel: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.displayLabel',
    defaultMessage: 'Display label',
    description:
      'The label text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  aTextAttributeUsedToStore: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.aTextAttributeUsedToStore',
    defaultMessage:
      'A text attribute used to store the display label for each family member other than the participant.',
    description:
      'The hint text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  participantIdentifierAttribute: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.participantIdentifierAttribute',
    defaultMessage: 'Participant identifier attribute',
    description:
      'The description text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  participantIdentifier: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.participantIdentifier',
    defaultMessage: 'Participant identifier',
    description:
      'The label text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  aBooleanAttributeUsedToIdentify: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.aBooleanAttributeUsedToIdentify',
    defaultMessage:
      'A boolean attribute used to identify which node represents the participant in the family pedigree.',
    description:
      'The hint text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  relationshipToParticipantAttribute: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.relationshipToParticipantAttribute',
    defaultMessage: 'Relationship to participant attribute',
    description:
      'The description text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  relationshipToParticipant: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.relationshipToParticipant',
    defaultMessage: 'Relationship to participant',
    description:
      'The label text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  storesEachPersonSRelationshipToThe: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.storesEachPersonSRelationshipToThe',
    defaultMessage:
      "Stores each person's relationship to the participant, such as mother, uncle, or daughter. The family pedigree interface calculates this value automatically.",
    description:
      'The hint text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  biologicalSexAttribute: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.biologicalSexAttribute',
    defaultMessage: 'Biological sex attribute',
    description:
      'The description text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  biologicalSex: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.biologicalSex',
    defaultMessage: 'Biological sex',
    description:
      'The label text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  storesEachFamilyMemberSSexRecorded: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.storesEachFamilyMemberSSexRecorded',
    defaultMessage:
      "Stores each family member's sex recorded at birth for sex-linked inheritance.",
    description:
      'The hint text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  formConfiguration: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.formConfiguration',
    defaultMessage: 'Form configuration',
    description:
      'The title text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  optionallyAddFieldsShownWhenParticipants: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.optionallyAddFieldsShownWhenParticipants',
    defaultMessage:
      'Optionally add fields shown when participants add or edit family members.',
    description:
      'The description text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
  formFields: {
    id: 'architect.sections.familyPedigree.nodeConfiguration.formFields',
    defaultMessage: 'Form fields',
    description:
      'The label text in components / sections / FamilyPedigree / NodeConfiguration.',
  },
});
const finalMessages = defineMessages({
  untitled: {
    id: 'architect.final.components.sections.FamilyPedigree.NodeConfiguration.untitled',
    defaultMessage: 'Untitled',
    description: 'Researcher-facing Architect control or feedback.',
  },
  missing: {
    id: 'architect.final.components.sections.FamilyPedigree.NodeConfiguration.missing',
    defaultMessage: 'Attribute not found',
    description: 'Researcher-facing Architect control or feedback.',
  },
});

// The form editor and its row/interactive previews carry their own specific
// prop types rather than the array field's generic `Renderer` bag;
// DialogArrayField spreads item values plus a `form` DOM-id string into
// whatever they declare
// (FieldFields' `PromptFields` still requires it, pre-Form-batch), so the
// cast is safe.
type Renderer = ComponentType<Record<string, unknown>>;

const nodeEntity: Entity = 'node';

// Stage-level configuration that does not reference node variables survives a
// node-type change; framing/boundaries/introScreen are required (or
// self-contained) schema fields, so clearing them would make the stage fail
// schema validation on save. Exported for the seam test that checks it against
// the schema's required fields.
export const PRESERVE_ON_NODE_TYPE_CHANGE = [
  'id',
  'type',
  'label',
  'interviewScript',
  'skipLogic',
  'edgeConfig',
  'censusPrompt',
  'framing',
  'boundaries',
  'introScreen',
  'nodeConfig.type',
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

/** nodeConfig slots that write structural attributes without validation. */
const UNVALIDATED_NODE_SLOT_FIELDS = [
  'egoVariable',
  'relationshipVariable',
  'biologicalSexVariable',
] as const;

/**
 * The interface-owned slot each picker fills, so it can exempt itself from the
 * exclusivity gate. `biologicalSexVariable` is absent deliberately: the
 * interface owns its OPTIONS, not the reference, so binning family members by
 * sex stays available.
 */
const OWN_SLOT_BY_FIELD: Partial<
  Record<(typeof UNVALIDATED_NODE_SLOT_FIELDS)[number], string>
> = {
  egoVariable: FAMILY_PEDIGREE_SLOTS.egoVariable,
  relationshipVariable: FAMILY_PEDIGREE_SLOTS.relationshipVariable,
};

const NodeConfiguration = (_props: StageEditorSectionProps) => {
  const intl = useAppIntl();
  const dispatch = useAppDispatch();
  const { storeApi, committedStage, stageId, draft } = useStageFormContext();
  const setStageValue = useSetStageValue();
  const nodeType = useStageFormValue<string>('nodeConfig.type');
  const nodeTypeInitial = useStageInitialValue<string>('nodeConfig.type');
  const nodeLabelVariableInitial = useStageInitialValue<string>(
    'nodeConfig.nodeLabelVariable',
  );
  const egoVariableInitial = useStageInitialValue<string>(
    'nodeConfig.egoVariable',
  );
  const relationshipVariableInitial = useStageInitialValue<string>(
    'nodeConfig.relationshipVariable',
  );
  const biologicalSexVariableInitial = useStageInitialValue<string>(
    'nodeConfig.biologicalSexVariable',
  );
  const excludeStageId = stageId ?? undefined;
  const stages = useSelector(
    (state: RootState) => getProtocol(state)?.stages ?? [],
  );
  const dependentNarrativeStages = stageId
    ? getFamilyPedigreeNodeTypeChangeBlock(stages, stageId)
    : [];
  const nodeTypeChangeBlockReason =
    dependentNarrativeStages.length > 0
      ? intl.formatMessage(chromeMessages.thisFamilyPedigreeStageSNetworkIs, {
          stageCount: dependentNarrativeStages.length,
          stageNames: intl.formatList(
            dependentNarrativeStages.map(
              (dependent) =>
                dependent.label || intl.formatMessage(finalMessages.untitled),
            ),
          ),
        })
      : null;

  // The `with*ChangeHandler` enhancer's replacement — a caller `onChange` on
  // ArchitectField would replace the store write instead of running alongside
  // it, so the reset is an observer effect. Every non-preserved top-level key
  // is cleared as a whole TREE (registered + dormant descendants — see
  // store's `clearValue`), unioning currently-assembled keys with the committed
  // stage's own keys so a collapsed section's stale value is cleared too.
  // `nodeConfig` clears as a tree like every other reset key — including its
  // own `type` descendant, the field that just changed — so it is restored
  // immediately after, matching `PRESERVE_ON_NODE_TYPE_CHANGE`'s intent.
  const previousNodeType = useRef(nodeType);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersion = useRef(restoreVersion);
  useEffect(() => {
    const previous = previousNodeType.current;
    previousNodeType.current = nodeType;
    const previousVersion = previousRestoreVersion.current;
    previousRestoreVersion.current = restoreVersion;
    if (!previous || previous === nodeType) return;

    // An undo/redo restores the node type together with the configuration
    // that belongs to it, so resetting here would wipe the half of the restore
    // the user was reaching for — and, since this reset clears nearly the whole
    // stage, would leave that configuration unrecoverable.
    if (previousVersion !== restoreVersion) return;

    const topLevelPreserved = new Set(
      PRESERVE_ON_NODE_TYPE_CHANGE.filter((key) => !key.includes('.')),
    );
    const fieldsToReset = union(
      Object.keys(storeApi.getState().getFormValues()),
      Object.keys(committedStage ?? {}),
    ).filter((key) => !topLevelPreserved.has(key));

    // As ONE gesture: the loop reaches `nodeConfig.type` (cleared here,
    // re-seeded below) before `nodeConfig.form`, an array that snapshots on
    // the write. Unbatched, undo therefore stopped on a stage with no node
    // type and no configuration at all — an unconfigured state the researcher
    // never created, reading as "undo destroyed my stage".
    draft.runGesture(() => {
      for (const field of fieldsToReset) {
        storeApi.getState().clearValue(field);
      }
      setStageValue('nodeConfig.type', nodeType);
    });
  }, [
    committedStage,
    draft,
    nodeType,
    restoreVersion,
    setStageValue,
    storeApi,
  ]);

  const nodeVariableOptions = useSelector((state: RootState) =>
    nodeType
      ? getVariableOptionsForSubject(state, { entity: 'node', type: nodeType })
      : [],
  );
  // Memoized on nodeType so the subject object identity is stable across
  // renders, matching getVariablesForSubjectSelector's reselect memoization
  // instead of defeating it every render.
  const nodeVariablesSubject = useMemo(
    () => (nodeType ? { entity: 'node' as const, type: nodeType } : null),
    [nodeType],
  );
  const allVariables = useSelector((state: RootState) =>
    nodeVariablesSubject
      ? getVariablesForSubjectSelector(state, nodeVariablesSubject)
      : EMPTY_VARIABLES,
  );
  const resolvedComposerViews = useMemo(
    () =>
      composerValidationViews(
        stages,
        { entity: 'node', type: nodeType ?? null },
        excludeStageId,
      ),
    [stages, nodeType, excludeStageId],
  );
  const pedigreeFormFields = useStageFormValue('nodeConfig.form');
  const nodeConfigFormInitial =
    useStageInitialValue<Record<string, unknown>[]>('nodeConfig.form');
  const resolvedFormViews = useMemo(
    () => [
      sharedFormValidationView(pedigreeFormFields),
      ...resolvedComposerViews,
    ],
    [pedigreeFormFields, resolvedComposerViews],
  );
  const roleMap = useSelector(getVariableRoleMap);
  const committedNodeConfig =
    useStageInitialValue<Record<string, unknown>>('nodeConfig');
  const nodeLabelDraft = useStageFormValue<string>(
    'nodeConfig.nodeLabelVariable',
  );
  const egoDraft = useStageFormValue<string>('nodeConfig.egoVariable');
  const relationshipDraft = useStageFormValue<string>(
    'nodeConfig.relationshipVariable',
  );
  const biologicalSexDraft = useStageFormValue<string>(
    'nodeConfig.biologicalSexVariable',
  );
  // Memoized on the structural scalar picks (NOT the whole assembled form
  // values, whose identity changes on every keystroke) so
  // `hasUnvalidatedUseForSubject`
  // — and through it `editorValidate` and its per-dialog-session baseline
  // cache — keeps a stable identity while unrelated fields are edited.
  const draftUnvalidatedSlotVariables = useMemo(
    () =>
      [egoDraft, relationshipDraft, biologicalSexDraft].filter(
        (value): value is string => typeof value === 'string',
      ),
    [egoDraft, relationshipDraft, biologicalSexDraft],
  );
  // Backs makeFieldEditorValidate's save-time gate: a form field may not pick
  // a variable some bin/highlight/census/etc. elsewhere already writes.
  // Identical wiring shape to Form.tsx (direct `makeFieldEditorValidate(...)`
  // passthrough, no wrapping closure) — mount-level coverage of this exact
  // shape (real role-map subscription, real subject scoping, the
  // escape) lives in Form/__tests__/Form.crossClassGate.test.tsx rather than
  // being duplicated here; only the subject derivation differs (`nodeType`
  // from this stage's own form value vs. Form.tsx's `withSubject`).
  // `draftUnvalidatedSlotVariables` additionally closes the intra-draft case
  // THIS stage type makes possible: its structural nodeConfig slots
  // (unvalidated writers) live
  // on the same unsaved stage form as the form-field dialog, so a slot pick
  // that has not reached the saved document yet still rejects the same
  // variable here.
  const hasUnvalidatedUseForSubject = useCallback(
    (variableId: string) =>
      !!nodeVariablesSubject &&
      (draftUnvalidatedSlotVariables.includes(variableId) ||
        hasUnvalidatedUse(roleMap, nodeVariablesSubject, variableId)),
    [roleMap, nodeVariablesSubject, draftUnvalidatedSlotVariables],
  );
  const editorValidate = useMemo(() => {
    const validateField = makeFieldEditorValidate(
      allVariables,
      undefined,
      undefined,
      hasUnvalidatedUseForSubject,
      resolvedFormViews,
      undefined,
    );
    return (
      values: Record<string, unknown>,
      props?: { editIndex?: number; initialValues?: unknown },
    ): Record<string, unknown> => {
      const variable =
        typeof values.variable === 'string' ? values.variable : '';
      // One form may not collect a variable twice — same rule, message and
      // predicate as the ordinary Form editor, so the two cannot drift, and
      // read from the LIVE rows for the same reason: a field added in this
      // editing session is not on the saved stage yet, so the committed
      // snapshot would let its variable be picked a second time (and would not
      // hide it in the picker either), leaving a stage the schema refuses on
      // save — while a variable freed by a row just deleted would go on being
      // rejected.
      if (
        isVariableUsedBySibling(pedigreeFormFields, variable, props?.editIndex)
      ) {
        return {
          variable: createMessageError(arrayValidationMessages.duplicateField),
        };
      }
      return validateField(values, props);
    };
  }, [
    allVariables,
    hasUnvalidatedUseForSubject,
    resolvedFormViews,
    pedigreeFormFields,
  ]);
  const exclusiveSlotMap = useSelector(getExclusiveVariableSlotMap);
  // Save-time cross-class gate for a nodeConfig slot (an UNVALIDATED writer).
  // Both writer classes live on this one stage form, so the sync validator
  // also sees the still-unsaved `nodeConfig.form` draft through `allValues`.
  const makeSlotValidator = (
    slotField: (typeof UNVALIDATED_NODE_SLOT_FIELDS)[number],
  ) =>
    makeSlotCrossClassValidator({
      subject: nodeVariablesSubject,
      committedConfig: committedNodeConfig,
      committedKey: slotField,
      ownSlot: OWN_SLOT_BY_FIELD[slotField],
      exclusiveSlotMap,
      roleMap,
      allVariables,
      writerClass: 'unvalidated',
      draftConflictingVariables: draftFormFieldVariables,
    });
  // The label is a validated Field whenever the pedigree collects a family
  // member (ego is rendered iconically and has no label value). It therefore
  // follows the same cross-class rule as QuickAdd: sharing with another
  // validated writer is safe, while sharing with a bin/highlight/structural
  // writer would bypass the codebook rules on one path. It fills no interface
  // slot of its own, so it passes none — a variable ANY slot owns is refused,
  // which is what `findExclusiveVariableConflicts` reports for a second writer
  // on an owned variable, and what its own picker already drops.
  const nodeLabelCrossClassValidate = makeSlotCrossClassValidator({
    subject: nodeVariablesSubject,
    committedConfig: committedNodeConfig,
    committedKey: 'nodeLabelVariable',
    exclusiveSlotMap,
    roleMap,
    allVariables,
    writerClass: 'validated',
    draftConflictingVariables: () => draftUnvalidatedSlotVariables,
  });
  const textNodeVariables = nodeVariableOptions.filter(
    (v) => v.type === 'text',
  );
  const booleanNodeVariables = nodeVariableOptions.filter(
    (v) => v.type === 'boolean',
  );
  // Only categorical variables whose options are exactly the canonical
  // biological-sex set may be bound: the interview and genetics engine depend on
  // the exact values (female/male/…), so an existing categorical variable with a
  // different value set would silently degrade sex resolution. Mirrors the
  // relationship-type picker in EdgeConfiguration, and asks the question with
  // the protocol schema's OWN comparison so the picker cannot offer a variable
  // the validator then rejects.
  const biologicalSexCompatible = nodeVariableOptions.filter(
    (v) =>
      v.type === 'categorical' &&
      optionsMatchInterfaceOwnedSet(
        v.options,
        INTERFACE_OWNED_OPTION_SETS.biologicalSex.options,
      ),
  );
  // The label is a VALIDATED writer, so it excludes variables claimed by an
  // unvalidated path. Structural slots do the opposite. Each picker keeps its
  // own current value offered as the usual escape for imported protocols.
  //
  // The two structural slots below additionally exclude a variable ANOTHER
  // interface slot already owns, passing their own slot so a variable a second
  // Family Pedigree binds in the SAME slot stays on offer — sharing structural
  // variables between two pedigrees over one node type is legitimate authoring,
  // and the protocol rule is slot-aware for exactly that reason.
  const nodeLabelVariableOptions = useSelector((state: RootState) =>
    selectSlotPickerOptions(state, {
      subject: nodeVariablesSubject,
      options: textNodeVariables,
      currentValue: nodeLabelDraft,
      writerClass: 'validated',
    }),
  );
  const egoVariableOptions = useSelector((state: RootState) =>
    selectSlotPickerOptions(state, {
      subject: nodeVariablesSubject,
      options: booleanNodeVariables,
      currentValue: egoDraft,
      ownSlot: FAMILY_PEDIGREE_SLOTS.egoVariable,
      writerClass: 'unvalidated',
    }),
  );
  const relationshipVariableOptions = useSelector((state: RootState) =>
    selectSlotPickerOptions(state, {
      subject: nodeVariablesSubject,
      options: textNodeVariables,
      currentValue: relationshipDraft,
      ownSlot: FAMILY_PEDIGREE_SLOTS.relationshipVariable,
      writerClass: 'unvalidated',
    }),
  );
  const biologicalSexVariableOptions = useSelector((state: RootState) =>
    selectSlotPickerOptions(state, {
      subject: nodeVariablesSubject,
      options: biologicalSexCompatible,
      currentValue: biologicalSexDraft,
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
    entity: nodeEntity,
    type: nodeType ?? '',
    initialValues: { name: '', type: '' },
    lockedOptions: null,
  };
  const [variableWindowProps, openVariableWindow] = useNewVariableWindowState(
    initialWindowProps,
    handleCreatedVariable,
  );
  const handleNewNodeLabelVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'text' }, lockedOptions: null },
      { field: 'nodeConfig.nodeLabelVariable' },
    );
  const handleNewEgoVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'boolean' }, lockedOptions: null },
      { field: 'nodeConfig.egoVariable' },
    );
  const handleNewRelationshipVariable = (name: string) =>
    openVariableWindow(
      { initialValues: { name, type: 'text' }, lockedOptions: null },
      { field: 'nodeConfig.relationshipVariable' },
    );
  const handleNewBiologicalSexVariable = (name: string) =>
    openVariableWindow(
      {
        initialValues: { name, type: 'categorical' },
        // Seed and lock the canonical value set — the interview and genetics
        // engine depend on these exact values, so the researcher may not edit
        // them (mirrors the relationship-type variable).
        lockedOptions: INTERFACE_OWNED_OPTION_SETS.biologicalSex.options,
      },
      { field: 'nodeConfig.biologicalSexVariable' },
    );

  // `handleChangeFields`'s replacement for the `withHandlers`/`connect`
  // composition: creates or updates the codebook variable a form field picks
  // before the row is committed. The write lands on the stage editor's draft
  // codebook, which is compared against the codebook the editor opened on to
  // decide dirtiness — so nothing has to announce the edit. Failures return
  // `{success:false, ...}` instead of throwing `SubmissionError`.
  const handleChangeFields = useCallback(
    async (values: unknown): Promise<unknown> => {
      const { variable, component, _createNewVariable, ...rest } = values as {
        variable?: string;
        component?: string;
        _createNewVariable?: string;
        [key: string]: unknown;
      };
      const variableType = getTypeForComponent(component);
      const codebookProperties = getCodebookProperties(rest);
      const configuration = {
        type: variableType,
        component,
        ...codebookProperties,
      };
      if (!_createNewVariable) {
        // `allVariables` is this render's codebook snapshot for the node
        // type, already scoped by `nodeVariablesSubject` — reused here rather
        // than re-selecting, since a plain Redux selector isn't reachable
        // from inside this async callback (rendering, not dispatching, is
        // where `useSelector` runs).
        const current = get(allVariables, variable ?? '');
        if (!current) {
          return {
            success: false,
            formErrors: [createMessageError(finalMessages.missing)],
          };
        }
        await dispatch(
          updateVariableAsync({
            entity: 'node',
            type: nodeType ?? '',
            variable: variable ?? '',
            configuration: configuration as Record<string, unknown>,
            replaceProperties: CODEBOOK_PROPERTIES,
          }),
        );
        return { variable, ...rest };
      }
      try {
        // unwrap() re-throws the thunk's error instead of resolving to a
        // rejected action whose payload is undefined.
        const { variable: createdVariable } = await dispatch(
          createVariableAsync({
            entity: 'node',
            type: nodeType ?? '',
            configuration: {
              ...configuration,
              name: _createNewVariable,
            } as Record<string, unknown>,
          }),
        ).unwrap();
        return { variable: createdVariable, ...rest };
      } catch (e) {
        return {
          success: false,
          fieldErrors: { variable: [toSubmissionError(e)] },
        };
      }
    },
    [allVariables, dispatch, nodeType],
  );

  return (
    <>
      <Section
        title={intl.formatMessage(messages.familyMemberData)}
        description={intl.formatMessage(messages.chooseTheNodeTypeAndMap)}
      >
        <IssueAnchor
          fieldName="nodeConfig.type"
          description={intl.formatMessage(messages.nodeType)}
        />
        <ArchitectField
          name="nodeConfig.type"
          component={EntitySelectControl}
          entityType="node"
          promptBeforeChange={intl.formatMessage(
            remainingMessages.youAttemptedToChangeTheNode,
          )}
          blockChangeReason={nodeTypeChangeBlockReason}
          validation={{ required: true }}
          label={intl.formatMessage(messages.nodeType)}
          initialValue={nodeTypeInitial}
        />

        {nodeType && (
          <Section
            title={intl.formatMessage(messages.familyMemberAttributes)}
            description={intl.formatMessage(
              messages.mapTheNodeAttributesUsedTo,
            )}
          >
            <IssueAnchor
              fieldName="nodeConfig.nodeLabelVariable"
              description={intl.formatMessage(messages.displayLabelAttribute)}
            />
            <ArchitectField
              name="nodeConfig.nodeLabelVariable"
              label={intl.formatMessage(messages.displayLabel)}
              hint={intl.formatMessage(messages.aTextAttributeUsedToStore)}
              component={VariablePickerControl}
              validation={{
                required: true,
                crossClassPick: nodeLabelCrossClassValidate,
              }}
              initialValue={nodeLabelVariableInitial}
              entity="node"
              type={nodeType}
              options={nodeLabelVariableOptions}
              onCreateOption={handleNewNodeLabelVariable}
              className="@min-lg:w-[50cqw]"
              inline
            />
            {nodeLabelDraft && (
              <CodebookVariableValidationSection
                fieldName="nodeConfig.nodeLabelVariable"
                entity="node"
                type={nodeType}
                variableId={nodeLabelDraft}
              />
            )}
            <IssueAnchor
              fieldName="nodeConfig.egoVariable"
              description={intl.formatMessage(
                messages.participantIdentifierAttribute,
              )}
            />
            <ArchitectField
              name="nodeConfig.egoVariable"
              label={intl.formatMessage(messages.participantIdentifier)}
              hint={intl.formatMessage(
                messages.aBooleanAttributeUsedToIdentify,
              )}
              component={VariablePickerControl}
              validation={{
                required: true,
                crossClassPick: makeSlotValidator('egoVariable'),
              }}
              initialValue={egoVariableInitial}
              entity="node"
              type={nodeType}
              options={egoVariableOptions}
              onCreateOption={handleNewEgoVariable}
              className="@min-lg:w-[50cqw]"
              inline
            />
            <IssueAnchor
              fieldName="nodeConfig.relationshipVariable"
              description={intl.formatMessage(
                messages.relationshipToParticipantAttribute,
              )}
            />
            <ArchitectField
              name="nodeConfig.relationshipVariable"
              label={intl.formatMessage(messages.relationshipToParticipant)}
              hint={intl.formatMessage(
                messages.storesEachPersonSRelationshipToThe,
              )}
              component={VariablePickerControl}
              validation={{
                required: true,
                crossClassPick: makeSlotValidator('relationshipVariable'),
              }}
              initialValue={relationshipVariableInitial}
              entity="node"
              type={nodeType}
              options={relationshipVariableOptions}
              onCreateOption={handleNewRelationshipVariable}
              className="@min-lg:w-[50cqw]"
              inline
            />
            <IssueAnchor
              fieldName="nodeConfig.biologicalSexVariable"
              description={intl.formatMessage(messages.biologicalSexAttribute)}
            />
            <ArchitectField
              name="nodeConfig.biologicalSexVariable"
              label={intl.formatMessage(messages.biologicalSex)}
              hint={intl.formatMessage(
                messages.storesEachFamilyMemberSSexRecorded,
              )}
              component={VariablePickerControl}
              validation={{
                required: true,
                crossClassPick: makeSlotValidator('biologicalSexVariable'),
              }}
              initialValue={biologicalSexVariableInitial}
              entity="node"
              type={nodeType}
              options={biologicalSexVariableOptions}
              onCreateOption={handleNewBiologicalSexVariable}
              className="@min-lg:w-[50cqw]"
              inline
            />
          </Section>
        )}

        {nodeType && (
          <Section
            title={intl.formatMessage(messages.formConfiguration)}
            description={intl.formatMessage(
              messages.optionallyAddFieldsShownWhenParticipants,
            )}
            toggleable
            defaultOpen={pedigreeFormFields !== undefined}
          >
            <ArchitectArrayField
              name="nodeConfig.form"
              label={intl.formatMessage(messages.formFields)}
              component={DialogArrayField}
              addButtonLabel={intl.formatMessage(
                additionalMessages.createNewFormField,
              )}
              validation={{}}
              initialValue={nodeConfigFormInitial ?? []}
              addTitle={intl.formatMessage(remainingMessages.editField)}
              editorFieldsComponent={FieldFields as unknown as Renderer}
              editorPreviewComponent={FieldEditorPreview as unknown as Renderer}
              editorProps={{
                type: nodeType,
                entity: 'node',
                siblingFields: pedigreeFormFields,
              }}
              previewComponent={NodeFormFieldPreview as unknown as Renderer}
              editorTitle={intl.formatMessage(remainingMessages.editField)}
              editorValidate={editorValidate}
              itemLabelMessage={arrayItemMessages.field}
              sortable
              onBeforeSave={handleChangeFields}
              normalizeItem={(value: unknown) =>
                normalizeField(value as Record<string, unknown>)
              }
              itemSelector={itemSelector('node', nodeType ?? null)}
              requestedEditFormName="editable-list-form"
            />
          </Section>
        )}
      </Section>
      <NewVariableWindow {...variableWindowProps} />
    </>
  );
};
export default NodeConfiguration;
