import { useCallback, useEffect, useMemo } from 'react';
import { compose } from 'react-recompose';
import { connect } from 'react-redux';
import { change, formValueSelector, getFormInitialValues } from 'redux-form';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import EditableAttributesList from '~/components/EditableAttributesList/EditableAttributesList';
import { Row, Section, Subsection } from '~/components/EditorLayout';
import withCreateVariableHandlers from '~/components/enhancers/withCreateVariableHandler';
import withDisabledSubjectRequired from '~/components/enhancers/withDisabledSubjectRequired';
import withSubject from '~/components/enhancers/withSubject';
import ValidatedField from '~/components/Form/ValidatedField';
import IssueAnchor from '~/components/IssueAnchor';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import {
  crossClassPickIssue,
  validatedElsewhereMessage,
  variableDisplayName,
} from '~/components/Validations/contradictions';
import { useAppDispatch, useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
import {
  EMPTY_VARIABLES,
  getVariableOptionsForSubject,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';
import { excludeValidatedUses } from '~/selectors/roleFilters';

import VariablePicker from '../../Form/Fields/VariablePicker/VariablePicker';
import withComposerFormHandlers from '../Form/withComposerFormHandlers';
import { getLayoutVariablesForSubject } from '../SociogramPrompts/selectors';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

// The variable ids a nodeForm.fields[] list writes — used against BOTH the
// live draft (allValues, from a field-level validator) and the stage's
// committed initial values (getFormInitialValues), so the intra-editor
// pair-collision check below can tell a pair the draft just created apart
// from one that already existed in the saved document.
const nodeFormFieldVariables = (
  values: Record<string, unknown> | undefined,
): string[] => {
  const nodeForm = isRecord(values) ? values.nodeForm : undefined;
  const fields =
    isRecord(nodeForm) && Array.isArray(nodeForm.fields) ? nodeForm.fields : [];
  return fields
    .filter(isRecord)
    .map((field) => field.variable)
    .filter((variable): variable is string => typeof variable === 'string');
};
type LayoutVariableOption = {
  isUsed?: boolean;
  label: string;
  type: string;
  value: string;
};
type CategoricalVariableOption = {
  isUsed?: boolean;
  label: string;
  type?: string;
  value: string;
};
type TextVariableOption = {
  isUsed?: boolean;
  label: string;
  type?: string;
  value: string;
};
export type NodeConfigurationProps = {
  entity: 'node' | 'edge' | 'ego';
  type: string | null;
  form: string;
  disabled?: boolean;
  disabledMessage?: string;
  handleCreateVariable: (
    value: string,
    variableType: string,
    fieldName: string,
  ) => void;
  handleChangeFields: (field: Record<string, unknown>) => unknown;
  layoutVariablesForSubject: LayoutVariableOption[];
  categoricalVariablesForSubject: CategoricalVariableOption[];
  quickAddOptionsForSubject: TextVariableOption[];
};
export const NodeConfigurationComponent = ({
  entity,
  type,
  form,
  disabled = false,
  disabledMessage,
  handleCreateVariable,
  handleChangeFields,
  layoutVariablesForSubject,
  categoricalVariablesForSubject,
  quickAddOptionsForSubject,
}: NodeConfigurationProps) => {
  const dispatch = useAppDispatch();
  const rawAutomaticLayout = useAppSelector((state) =>
    formValueSelector(form)(state, 'behaviours.automaticLayout'),
  );
  const automaticLayout =
    typeof rawAutomaticLayout === 'boolean' ? rawAutomaticLayout : true;
  // Selecting a node type resets subject-dependent fields, setting `behaviours`
  // to null (NodeType.handleResetStage) — and redux-form's formValueSelector
  // returns `null` (not undefined) for a path under a null parent. Re-seed the
  // template default (on) whenever the value is not a real boolean, so the
  // default survives the reset and an unset field never renders as off.
  useEffect(() => {
    if (typeof rawAutomaticLayout !== 'boolean') {
      dispatch(change(form, 'behaviours.automaticLayout', true));
    }
  }, [rawAutomaticLayout, dispatch, form]);
  // NetworkComposer is the one stage carrying both writer classes at once
  // (an unvalidated `quickAdd`/`convexHullVariable` alongside a validated
  // `nodeForm.fields` form) directly on the SAME draft, so an intra-editor
  // pick the pickers can't see (Task 8's exclusions only compare each picker
  // to the COMMITTED protocol) can still create a cross-class pair here.
  // This mount's save-time gate below covers both halves: (a) the SAVED
  // document's role map, mirroring the other unvalidated-writer gates
  // (Bin/TSC/Sociogram/Nomination), with the same committed-value escape;
  // and (b) the live DRAFT's own `nodeForm.fields` list, which the saved-doc
  // role map cannot see until this stage is actually saved.
  const nodeVariablesSubject = useMemo(
    () => (type ? { entity: entity === 'ego' ? 'node' : entity, type } : null),
    [entity, type],
  );
  const allVariables = useAppSelector((state: RootState) =>
    nodeVariablesSubject
      ? getVariablesForSubjectSelector(state, nodeVariablesSubject)
      : EMPTY_VARIABLES,
  );
  const roleMap = useAppSelector(getVariableRoleMap);
  const hasValidatedUseForSubject = useCallback(
    (variableId: string) =>
      !!nodeVariablesSubject &&
      (roleMap[roleMapKey(nodeVariablesSubject, variableId)]?.validated ?? 0) >
        0,
    [roleMap, nodeVariablesSubject],
  );
  const stageInitialValues = useAppSelector((state: RootState) =>
    getFormInitialValues(form)(state),
  );
  const originalQuickAdd =
    isRecord(stageInitialValues) &&
    typeof stageInitialValues.quickAdd === 'string'
      ? stageInitialValues.quickAdd
      : '';
  const originalConvexHullVariable =
    isRecord(stageInitialValues) &&
    typeof stageInitialValues.convexHullVariable === 'string'
      ? stageInitialValues.convexHullVariable
      : '';
  // The stage's COMMITTED nodeForm.fields variable set, for check (b)'s
  // escape below: a pre-existing conflict (already present in the saved
  // document) must never block a re-save that changes neither side of it —
  // that is the timeline alert's job, not this gate's. Only a pair this
  // draft actually introduces (either side changed away from its own
  // committed value) still blocks with no escape.
  const committedNodeFormVariableIds = useMemo(
    () =>
      nodeFormFieldVariables(
        isRecord(stageInitialValues) ? stageInitialValues : undefined,
      ),
    [stageInitialValues],
  );
  const makeCrossClassValidate = useCallback(
    (originalVariableId: string) =>
      (
        value: unknown,
        allValues?: Record<string, unknown>,
      ): string | undefined => {
        const variableId = typeof value === 'string' ? value : '';
        if (!variableId) return undefined;
        const savedDocIssue = crossClassPickIssue({
          variableId,
          originalVariableId,
          hasConflictingUse: hasValidatedUseForSubject,
          allVariables,
          message: validatedElsewhereMessage,
        });
        if (savedDocIssue) return savedDocIssue;
        if (nodeFormFieldVariables(allValues).includes(variableId)) {
          // Escape: this exact pair (this field AND a nodeForm.fields entry
          // both naming `variableId`) already existed in the committed
          // stage — neither side changed to create it just now.
          const pairAlreadyCommitted =
            variableId === originalVariableId &&
            committedNodeFormVariableIds.includes(variableId);
          if (!pairAlreadyCommitted) {
            return validatedElsewhereMessage(
              variableDisplayName(allVariables, variableId),
            );
          }
        }
        return undefined;
      },
    [hasValidatedUseForSubject, allVariables, committedNodeFormVariableIds],
  );
  const quickAddCrossClassValidate = useMemo(
    () => makeCrossClassValidate(originalQuickAdd),
    [makeCrossClassValidate, originalQuickAdd],
  );
  const convexHullCrossClassValidate = useMemo(
    () => makeCrossClassValidate(originalConvexHullVariable),
    [makeCrossClassValidate, originalConvexHullVariable],
  );
  // Mirror check: this stage's OWN unvalidated writers' CURRENT draft picks,
  // handed to the nodeForm.fields editor so it rejects a variable quickAdd/
  // convexHullVariable already claim in the SAME draft, symmetric with the
  // check above (which reads nodeForm.fields' current draft picks the same
  // way, via the `allValues` a field-level validator receives).
  const quickAddValue = useAppSelector((state: RootState) =>
    formValueSelector(form)(state, 'quickAdd'),
  );
  const convexHullVariableValue = useAppSelector((state: RootState) =>
    formValueSelector(form)(state, 'convexHullVariable'),
  );
  const siblingUnvalidatedVariableIds = useMemo(
    () =>
      [quickAddValue, convexHullVariableValue].filter(
        (value): value is string => typeof value === 'string' && value !== '',
      ),
    [quickAddValue, convexHullVariableValue],
  );
  const newVariableWindowInitialProps = {
    entity: (entity === 'ego' ? 'node' : entity) as Entity,
    type: type ?? '',
    initialValues: { name: '', type: 'categorical' },
  };
  const handleCreatedGroupVariable = (...args: unknown[]) => {
    const [id] = args;
    if (typeof id !== 'string') {
      return;
    }
    dispatch(change(form, 'convexHullVariable', id));
  };
  const [newVariableWindowProps, openNewVariableWindow] =
    useNewVariableWindowState(
      newVariableWindowInitialProps,
      handleCreatedGroupVariable,
    );
  return (
    <Section
      title="Node Configuration"
      summary={
        <Paragraph>
          Configure the variable mappings, layout behaviour, group hulls, and
          the attributes collected for each node.
        </Paragraph>
      }
      disabled={disabled}
      disabledMessage={disabledMessage}
      layout="horizontal"
    >
      <Subsection
        title="Quick add variable"
        summary="The variable populated by the inline quick-add field when a node is added from the toolbar — typically a name or label."
      >
        <Row>
          <IssueAnchor fieldName="quickAdd" description="Quick Add Variable" />
          <ValidatedField
            name="quickAdd"
            component={VariablePicker}
            validation={{
              required: true,
              crossClassPick: quickAddCrossClassValidate,
            }}
            componentProps={{
              label: 'Create or select a variable for the quick-add form',
              type,
              entity,
              options: quickAddOptionsForSubject,
              onCreateOption: (value: string) =>
                handleCreateVariable(value, 'text', 'quickAdd'),
            }}
          />
        </Row>
      </Subsection>

      <Subsection
        title="Node positions"
        summary="Stores each node's position on the canvas. Reusing the same variable across stages preserves positions as the participant moves between tasks."
      >
        <Row>
          <IssueAnchor
            fieldName="layoutVariable"
            description="Layout Variable"
          />
          <ValidatedField
            name="layoutVariable"
            component={VariablePicker}
            validation={{ required: true }}
            componentProps={{
              label: 'Create or select a variable to store node coordinates',
              type,
              entity,
              options: layoutVariablesForSubject,
              onCreateOption: (value: string) =>
                handleCreateVariable(value, 'layout', 'layoutVariable'),
            }}
          />
        </Row>
      </Subsection>

      <Subsection
        title="Automatic layout"
        summary="When on, nodes are arranged by a force-directed layout. Participants can toggle this during the interview; this sets the starting state."
      >
        <Row>
          <IssueAnchor
            fieldName="behaviours.automaticLayout"
            description="Default automatic layout"
          />
          <div className="flex flex-row items-center gap-5">
            <ToggleField
              title="Start with automatic layout switched on"
              value={automaticLayout}
              onChange={(checked) =>
                dispatch(change(form, 'behaviours.automaticLayout', checked))
              }
            />
            <span>Start with automatic layout switched on</span>
          </div>
        </Row>
      </Subsection>

      <Subsection
        title="Group hulls"
        summary="Draw shaded outlines around groups of nodes that share a value of a categorical variable. Choose (or create) the variable whose values participants can group nodes into — by tapping nodes with the Groups tool, or by lasso-selecting several at once."
      >
        <Row>
          <IssueAnchor
            fieldName="convexHullVariable"
            description="Group hull variable"
          />
          <ValidatedField
            name="convexHullVariable"
            component={VariablePicker}
            validation={{ crossClassPick: convexHullCrossClassValidate }}
            componentProps={{
              label: 'Create or select a categorical variable for grouping',
              type,
              entity,
              options: categoricalVariablesForSubject,
              onCreateOption: (name: string) =>
                openNewVariableWindow(
                  { initialValues: { name, type: 'categorical' } },
                  { field: 'convexHullVariable' },
                ),
            }}
          />
        </Row>
      </Subsection>

      <Subsection
        title="Editable attributes"
        summary="The attributes shown in the side panel when a node is selected, so they can be edited during the interview. Each attribute pairs a variable with the input control used to collect it."
      >
        <EditableAttributesList
          fieldName="nodeForm.fields"
          entity={entity === 'ego' ? 'node' : entity}
          type={type}
          form={form}
          editFormName="node-attr-edit"
          title="Edit attribute"
          handleChangeFields={handleChangeFields}
          siblingUnvalidatedVariableIds={siblingUnvalidatedVariableIds}
        />
      </Subsection>

      <NewVariableWindow
        // eslint-disable-next-line react/jsx-props-no-spreading
        {...newVariableWindowProps}
      />
    </Section>
  );
};
type OwnProps = {
  entity: 'node' | 'edge' | 'ego';
  type: string | null;
  form: string;
};
const withLayoutOptions = connect(
  (state: RootState, { entity, type }: OwnProps) => ({
    layoutVariablesForSubject: type
      ? getLayoutVariablesForSubject(state, { entity, type })
      : [],
  }),
);
/**
 * convexHullVariable is an UNVALIDATED writer: drop options a form elsewhere
 * already validates. Exported (alongside its quickAdd sibling below) so both
 * directions can be pinned directly in `pickerExclusions.test.ts`, the same
 * way `getHighlightVariablesForSubject` is.
 */
export const getConvexHullOptionsForSubject = (
  state: RootState,
  subject: { entity: 'node' | 'edge' | 'ego'; type: string },
  currentValue?: string,
) => {
  const categoricalOptions = getVariableOptionsForSubject(
    state,
    subject,
  ).filter(({ type: variableType }) => variableType === 'categorical');
  return excludeValidatedUses(state, subject, categoricalOptions, currentValue);
};

/**
 * NetworkComposer's own quickAdd (distinct from NameGeneratorQuickAdd's) is an
 * UNVALIDATED writer: drop options a form elsewhere already validates.
 */
export const getComposerQuickAddOptionsForSubject = (
  state: RootState,
  subject: { entity: 'node' | 'edge' | 'ego'; type: string },
  currentValue?: string,
) => {
  const textOptions = getVariableOptionsForSubject(state, subject).filter(
    ({ type: variableType }) => variableType === 'text',
  );
  return excludeValidatedUses(state, subject, textOptions, currentValue);
};

const withCategoricalOptions = connect(
  (state: RootState, { entity, type, form }: OwnProps) => {
    if (!type) {
      return { categoricalVariablesForSubject: [] };
    }
    const convexHullVariable = formValueSelector(form)(
      state,
      'convexHullVariable',
    ) as string | undefined;
    return {
      categoricalVariablesForSubject: getConvexHullOptionsForSubject(
        state,
        { entity, type },
        convexHullVariable,
      ),
    };
  },
);
const withQuickAddOptions = connect(
  (state: RootState, { entity, type, form }: OwnProps) => {
    if (!type) {
      return { quickAddOptionsForSubject: [] };
    }
    const quickAdd = formValueSelector(form)(state, 'quickAdd') as
      | string
      | undefined;
    return {
      quickAddOptionsForSubject: getComposerQuickAddOptionsForSubject(
        state,
        { entity, type },
        quickAdd,
      ),
    };
  },
);
export default compose<NodeConfigurationProps, StageEditorSectionProps>(
  withSubject,
  withCreateVariableHandlers,
  withComposerFormHandlers,
  withDisabledSubjectRequired,
  withLayoutOptions,
  withCategoricalOptions,
  withQuickAddOptions,
)(NodeConfigurationComponent);
