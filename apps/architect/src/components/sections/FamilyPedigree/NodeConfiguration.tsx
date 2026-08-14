import { get, union } from 'es-toolkit/compat';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ComponentType,
} from 'react';
import { useSelector } from 'react-redux';

import Surface from '@codaco/fresco-ui/layout/Surface';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import type { VariableOptions } from '@codaco/protocol-validation';
import { BIOLOGICAL_SEX_OPTIONS } from '@codaco/shared-consts';
import { Row, Section } from '~/components/EditorLayout';
import ArchitectArrayField from '~/components/Form/ArchitectArrayField';
import ArchitectField from '~/components/Form/ArchitectField';
import DialogArrayField from '~/components/Form/arrayFields/DialogArrayField';
import { clearFieldValue } from '~/components/Form/clearFieldValue';
import { VariablePickerControl } from '~/components/Form/Fields/VariablePicker/VariablePicker';
import IssueAnchor from '~/components/IssueAnchor';
import type { Entity } from '~/components/NewVariableWindow';
import NewVariableWindow, {
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import { EntitySelectControl } from '~/components/sections/fields/EntitySelectField/EntitySelectField';
import {
  composerValidationViews,
  sharedFormValidationView,
} from '~/components/sections/Form/composerHelpers';
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
import {
  crossClassPickIssue,
  makeFieldEditorValidate,
  unvalidatedElsewhereMessage,
  validatedElsewhereMessage,
  variableDisplayName,
} from '~/components/Validations/contradictions';
import { getTypeForComponent } from '~/config/variables';
import { useAppDispatch } from '~/ducks/hooks';
import {
  createVariableAsync,
  updateVariableAsync,
} from '~/ducks/modules/protocol/codebook';
import { getFamilyPedigreeNodeTypeChangeBlock } from '~/ducks/modules/protocol/stages';
import type { RootState } from '~/ducks/store';
import {
  EMPTY_VARIABLES,
  getVariableOptionsForSubject,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';
import { getProtocol } from '~/selectors/protocol';
import {
  excludeUnvalidatedUses,
  excludeValidatedUses,
} from '~/selectors/roleFilters';
import { ensureError } from '~/utils/ensureError';
import { optionsMatch } from '~/utils/variables';

import CodebookVariableValidationSection from '../CodebookVariableValidationSection';
import NodeFormFieldPreview from './NodeFormFieldPreview';

// `FieldFields`/`NodeFormFieldPreview` carry their own specific prop types
// rather than the array field's generic `Renderer` bag; DialogArrayField
// spreads item values plus a `form` DOM-id string into whatever they declare
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
  lockedOptions: VariableOptions | null;
};

type VariableRowProps = {
  name: string;
  label: string;
  description: string;
  entityType: string;
  options: {
    value: string;
    label: string;
    type?: string;
  }[];
  onCreateOption: (name: string) => void;
  /**
   * Save-time cross-class gate for this slot, in whichever direction its
   * writer class demands (the node label validates; the structural slots do
   * not): a sync field validator, so an invalid pick blocks the stage
   * editor's save — the same field-level `crossClassPick` shape
   * NetworkComposer's quickAdd uses.
   */
  crossClassPick: (value: unknown, allValues?: unknown) => string | undefined;
};

const VariableRow = ({
  name,
  label,
  description,
  entityType,
  options,
  onCreateOption,
  crossClassPick,
}: VariableRowProps) => {
  const initialValue = useStageInitialValue<string>(name);

  return (
    <div className="flex items-start gap-5">
      <div className="flex flex-1 basis-0 flex-col gap-1 pt-2.5">
        <span className="font-semibold">
          {label}
          <span className="text-destructive ms-1">*</span>
        </span>
        <span className="text-text/60 text-sm leading-snug">{description}</span>
      </div>
      <div className="relative flex-1 basis-0">
        <IssueAnchor fieldName={name} description={`${label} Variable`} />
        <ArchitectField
          name={name}
          component={VariablePickerControl}
          validation={{ required: true, crossClassPick }}
          label={`${label} variable`}
          labelHidden
          initialValue={initialValue}
          entity="node"
          type={entityType}
          options={options}
          onCreateOption={onCreateOption}
        />
      </div>
    </div>
  );
};
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** nodeConfig slots that write structural attributes without validation. */
const UNVALIDATED_NODE_SLOT_FIELDS = [
  'egoVariable',
  'relationshipVariable',
  'biologicalSexVariable',
] as const;

const NodeConfiguration = (_props: StageEditorSectionProps) => {
  const dispatch = useAppDispatch();
  const { storeApi, committedStage, stageId, draft } = useStageFormContext();
  const setStageValue = useSetStageValue();
  const nodeType = useStageFormValue<string>('nodeConfig.type');
  const nodeTypeInitial = useStageInitialValue<string>('nodeConfig.type');
  const excludeStageId = stageId ?? undefined;
  const stages = useSelector(
    (state: RootState) => getProtocol(state)?.stages ?? [],
  );
  const dependentNarrativeStages = stageId
    ? getFamilyPedigreeNodeTypeChangeBlock(stages, stageId)
    : [];
  const nodeTypeChangeBlockReason =
    dependentNarrativeStages.length > 0
      ? `This Family Pedigree stage's network is used by the following Narrative Pedigree stage(s): ${dependentNarrativeStages
          .map((dependent) => `"${dependent.label || 'Untitled'}"`)
          .join(
            ', ',
          )}. Change or remove those stage(s) before changing its node type.`
      : null;

  // The `with*ChangeHandler` enhancer's replacement — a caller `onChange` on
  // ArchitectField would replace the store write instead of running alongside
  // it, so the reset is an observer effect. Every non-preserved top-level key
  // is cleared as a whole TREE (registered + dormant descendants — see
  // `clearFieldValue`), unioning currently-assembled keys with the committed
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
        clearFieldValue(storeApi, field);
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
  // values, whose identity changes on every keystroke) so `hasUnvalidatedUse`
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
  // shape (real role-map subscription, real roleMapKey subject scoping, the
  // escape) lives in Form/__tests__/Form.crossClassGate.test.tsx rather than
  // being duplicated here; only the subject derivation differs (`nodeType`
  // from this stage's own form value vs. Form.tsx's `withSubject`).
  // `draftUnvalidatedSlotVariables` additionally closes the intra-draft case
  // THIS stage type makes possible: its structural nodeConfig slots
  // (unvalidated writers) live
  // on the same unsaved stage form as the form-field dialog, so a slot pick
  // that has not reached the saved document yet still rejects the same
  // variable here.
  const hasUnvalidatedUse = useCallback(
    (variableId: string) =>
      !!nodeVariablesSubject &&
      (draftUnvalidatedSlotVariables.includes(variableId) ||
        (roleMap[roleMapKey(nodeVariablesSubject, variableId)]?.unvalidated ??
          0) > 0),
    [roleMap, nodeVariablesSubject, draftUnvalidatedSlotVariables],
  );
  const editorValidate = useMemo(
    () =>
      makeFieldEditorValidate(
        allVariables,
        undefined,
        undefined,
        hasUnvalidatedUse,
        resolvedFormViews,
      ),
    [allVariables, hasUnvalidatedUse, resolvedFormViews],
  );
  // Save-time cross-class gate for a nodeConfig slot (an UNVALIDATED writer):
  // rejects a pick a form elsewhere in the saved document already collects,
  // OR one this stage's own still-unsaved nodeConfig.form draft collects
  // (both writer classes live on this one stage form, so the sync validator
  // sees the sibling draft directly through `allValues`). Escapes the slot's
  // own committed value so a pre-existing conflict (e.g. an imported
  // protocol) stays saveable — the timeline alert handles it
  // non-destructively.
  const makeSlotValidator =
    (slotField: (typeof UNVALIDATED_NODE_SLOT_FIELDS)[number]) =>
    (value: unknown, allValues?: unknown): string | undefined => {
      if (!nodeVariablesSubject) return undefined;
      const variableId = typeof value === 'string' ? value : '';
      if (!variableId) return undefined;
      const committedRaw: unknown = isRecord(committedNodeConfig)
        ? committedNodeConfig[slotField]
        : undefined;
      const committed = typeof committedRaw === 'string' ? committedRaw : '';
      if (variableId === committed) return undefined;
      const draftFormFields: unknown = get(allValues, 'nodeConfig.form');
      if (
        Array.isArray(draftFormFields) &&
        draftFormFields.some(
          (field: unknown) => isRecord(field) && field.variable === variableId,
        )
      ) {
        return validatedElsewhereMessage(
          variableDisplayName(allVariables, variableId),
        );
      }
      return crossClassPickIssue({
        variableId,
        originalVariableId: committed,
        hasConflictingUse: (id) =>
          (roleMap[roleMapKey(nodeVariablesSubject, id)]?.validated ?? 0) > 0,
        allVariables,
        message: validatedElsewhereMessage,
      });
    };
  // The label is a validated Field whenever the pedigree collects a family
  // member (ego is rendered iconically and has no label value). It therefore
  // follows the same cross-class rule as QuickAdd: sharing with another
  // validated writer is safe, while sharing with a bin/highlight/structural
  // writer would bypass the codebook rules on one path.
  const nodeLabelCrossClassValidate = (value: unknown): string | undefined => {
    if (!nodeVariablesSubject) return undefined;
    const variableId = typeof value === 'string' ? value : '';
    if (!variableId) return undefined;
    const committedRaw: unknown = isRecord(committedNodeConfig)
      ? committedNodeConfig.nodeLabelVariable
      : undefined;
    const committed = typeof committedRaw === 'string' ? committedRaw : '';
    if (variableId === committed) return undefined;
    if (draftUnvalidatedSlotVariables.includes(variableId)) {
      return unvalidatedElsewhereMessage(
        variableDisplayName(allVariables, variableId),
      );
    }
    return crossClassPickIssue({
      variableId,
      originalVariableId: committed,
      hasConflictingUse: (id) =>
        (roleMap[roleMapKey(nodeVariablesSubject, id)]?.unvalidated ?? 0) > 0,
      allVariables,
      message: unvalidatedElsewhereMessage,
    });
  };
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
  // relationship-type picker in EdgeConfiguration.
  const biologicalSexCompatible = nodeVariableOptions.filter(
    (v) =>
      v.type === 'categorical' &&
      optionsMatch(v.options, BIOLOGICAL_SEX_OPTIONS),
  );
  // The label is a VALIDATED writer, so it excludes variables claimed by an
  // unvalidated path. Structural slots do the opposite. Each picker keeps its
  // own current value offered as the usual escape for imported protocols.
  const nodeLabelVariableOptions = useSelector((state: RootState) =>
    nodeVariablesSubject
      ? excludeUnvalidatedUses(
          state,
          nodeVariablesSubject,
          textNodeVariables,
          nodeLabelDraft,
        )
      : [],
  );
  const egoVariableOptions = useSelector((state: RootState) =>
    nodeVariablesSubject
      ? excludeValidatedUses(
          state,
          nodeVariablesSubject,
          booleanNodeVariables,
          egoDraft,
        )
      : [],
  );
  const relationshipVariableOptions = useSelector((state: RootState) =>
    nodeVariablesSubject
      ? excludeValidatedUses(
          state,
          nodeVariablesSubject,
          textNodeVariables,
          relationshipDraft,
        )
      : [],
  );
  const biologicalSexVariableOptions = useSelector((state: RootState) =>
    nodeVariablesSubject
      ? excludeValidatedUses(
          state,
          nodeVariablesSubject,
          biologicalSexCompatible,
          biologicalSexDraft,
        )
      : [],
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
        lockedOptions: BIOLOGICAL_SEX_OPTIONS,
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
          return { success: false, formErrors: ['Variable not found'] };
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
          fieldErrors: { variable: [ensureError(e).message] },
        };
      }
    },
    [allVariables, dispatch, nodeType],
  );

  return (
    <>
      <Section
        title="Node Configuration"
        summary={
          <Paragraph>
            Select the node type and configure variables and form fields for
            family members.
          </Paragraph>
        }
      >
        <Row>
          <IssueAnchor fieldName="nodeConfig.type" description="Node Type" />
          <ArchitectField
            name="nodeConfig.type"
            component={EntitySelectControl}
            entityType="node"
            promptBeforeChange="You attempted to change the node type of a stage that you have already configured. Before you can proceed the stage must be reset, which will remove any existing configuration. Do you want to reset the stage now?"
            blockChangeReason={nodeTypeChangeBlockReason}
            validation={{ required: true }}
            label="Node type"
            initialValue={nodeTypeInitial}
          />
        </Row>

        {nodeType && (
          <>
            <Surface
              noContainer
              spacing="sm"
              shadow="none"
              className="my-7 flex flex-col gap-7 overflow-visible!"
            >
              <VariableRow
                name="nodeConfig.nodeLabelVariable"
                label="Node Label"
                description="A text variable used to store the display label for each family member other than the participant."
                entityType={nodeType}
                options={nodeLabelVariableOptions}
                onCreateOption={handleNewNodeLabelVariable}
                crossClassPick={nodeLabelCrossClassValidate}
              />
              {nodeLabelDraft && (
                <CodebookVariableValidationSection
                  fieldName="nodeConfig.nodeLabelVariable"
                  entity="node"
                  type={nodeType}
                  variableId={nodeLabelDraft}
                />
              )}
              <VariableRow
                name="nodeConfig.egoVariable"
                label="Ego Identifier"
                description="A boolean variable to identify which node represents the participant (ego) in the family pedigree."
                entityType={nodeType}
                options={egoVariableOptions}
                onCreateOption={handleNewEgoVariable}
                crossClassPick={makeSlotValidator('egoVariable')}
              />
              <VariableRow
                name="nodeConfig.relationshipVariable"
                label="Relationship to Participant"
                description="Stores each person's relationship to the participant (e.g., mother, uncle, daughter). Automatically calculated by the family pedigree interface."
                entityType={nodeType}
                options={relationshipVariableOptions}
                onCreateOption={handleNewRelationshipVariable}
                crossClassPick={makeSlotValidator('relationshipVariable')}
              />
              <VariableRow
                name="nodeConfig.biologicalSexVariable"
                label="Biological Sex Variable"
                description="Stores each family member’s sex recorded at birth (female/male/intersex/don’t know/prefer not to say), used for sex-linked inheritance."
                entityType={nodeType}
                options={biologicalSexVariableOptions}
                onCreateOption={handleNewBiologicalSexVariable}
                crossClassPick={makeSlotValidator('biologicalSexVariable')}
              />
            </Surface>

            <Section
              title="Form Fields"
              summary={
                <Paragraph>
                  Add fields to collect information about each family member.
                  These fields will be shown when participants add or edit
                  family members.
                </Paragraph>
              }
              layout="vertical"
            >
              <ArchitectArrayField
                name="nodeConfig.form"
                label="Form fields"
                labelHidden
                component={DialogArrayField}
                validation={{}}
                initialValue={nodeConfigFormInitial ?? []}
                addTitle="Edit Field"
                editorFieldsComponent={FieldFields as unknown as Renderer}
                editorProps={{ type: nodeType, entity: 'node' }}
                previewComponent={NodeFormFieldPreview as unknown as Renderer}
                editorTitle="Edit Field"
                editorValidate={editorValidate}
                itemLabel="field"
                sortable
                onBeforeSave={handleChangeFields}
                normalizeItem={(value: unknown) =>
                  normalizeField(value as Record<string, unknown>)
                }
                itemSelector={itemSelector('node', nodeType ?? null)}
                requestedEditFormName="editable-list-form"
              />
            </Section>
          </>
        )}
      </Section>
      <NewVariableWindow {...variableWindowProps} />
    </>
  );
};
export default NodeConfiguration;
