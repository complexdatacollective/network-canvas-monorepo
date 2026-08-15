import { isEqual } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Paragraph from '@codaco/fresco-ui/typography/Paragraph';
import { Row, Section, Subsection } from '~/components/EditorLayout';
import ArchitectField from '~/components/Form/ArchitectField';
import EditableAttributesList from '~/components/Form/arrayFields/EditableAttributesList';
import IssueAnchor from '~/components/IssueAnchor';
import NewVariableWindow, {
  type Entity,
  useNewVariableWindowState,
} from '~/components/NewVariableWindow';
import type { StageEditorSectionProps } from '~/components/StageEditor/Interfaces';
import { useStageRestoreVersion } from '~/components/StageEditor/StageFormBridge';
import {
  useCreateVariable,
  useSetStageValue,
  useStageFormValue,
  useStageInitialValue,
  useSubject,
  type CreateStageVariable,
} from '~/components/StageEditor/stageFormHooks';
import {
  crossClassPickIssue,
  unvalidatedElsewhereMessage,
  validatedElsewhereMessage,
  variableDisplayName,
} from '~/components/Validations/contradictions';
import { useAppSelector } from '~/ducks/hooks';
import type { RootState } from '~/ducks/modules/root';
import {
  EMPTY_VARIABLES,
  getVariableOptionsForSubject,
  getVariablesForSubjectSelector,
} from '~/selectors/codebook';
import { getVariableRoleMap, roleMapKey } from '~/selectors/indexes';
import {
  excludeUnvalidatedUses,
  excludeValidatedUses,
} from '~/selectors/roleFilters';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import CodebookVariableValidationSection from '../CodebookVariableValidationSection';
import { useComposerFieldCommit } from '../Form/fieldCommit';
import { getLayoutVariablesForSubject } from '../SociogramPrompts/selectors';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const nodeFormFieldVariables = (values: unknown): string[] => {
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
  disabled?: boolean;
  disabledMessage?: string;
  handleCreateVariable: CreateStageVariable;
  handleChangeFields: (field: Record<string, unknown>) => unknown;
};

/**
 * The presentational body of the section — a plain function component so it
 * stays directly testable, but it reads the stage form (quickAdd,
 * convexHullVariable, behaviours.automaticLayout, and their committed
 * originals) through the stage-form hooks rather than taking them as props,
 * since they are stage-form-scoped concerns the caller has no other reason to
 * know about.
 */
export const NodeConfigurationComponent = ({
  entity,
  type,
  disabled = false,
  disabledMessage,
  handleCreateVariable,
  handleChangeFields,
}: NodeConfigurationProps) => {
  const setStageValue = useSetStageValue();
  const quickAddVariable = useStageFormValue<string>('quickAdd');
  const initialQuickAdd = useStageInitialValue<string>('quickAdd');
  const convexHullVariable = useStageFormValue<string>('convexHullVariable');
  const initialConvexHullVariable =
    useStageInitialValue<string>('convexHullVariable');
  const initialAutomaticLayout = useStageInitialValue<boolean>(
    'behaviours.automaticLayout',
  );
  const initialNodeForm = useStageInitialValue('nodeForm');
  const initialLayoutVariable = useStageInitialValue<string>('layoutVariable');

  // Selecting a node type resets subject-dependent fields (see
  // useResetStageOnSubjectChange), but that reset writes the whole
  // `behaviours` object at once and this toggle registers under the nested
  // name `behaviours.automaticLayout` — a distinct field-store entry the
  // reset's write never reaches. Re-seed the template default (on)
  // explicitly whenever the subject actually changes, mirroring the
  // enhancer-era `NodeType.handleResetStage` behaviour this replaces.
  const { subject } = useSubject();
  const previousSubjectRef = useRef(subject);
  const restoreVersion = useStageRestoreVersion();
  const previousRestoreVersionRef = useRef(restoreVersion);
  useEffect(() => {
    const previous = previousSubjectRef.current;
    previousSubjectRef.current = subject;
    const previousRestoreVersion = previousRestoreVersionRef.current;
    previousRestoreVersionRef.current = restoreVersion;
    if (!previous || isEqual(previous, subject)) return;

    // An undo/redo restores the subject together with the toggle state that
    // belongs to it, so re-seeding here would overwrite the half of the
    // restore the user was reaching for.
    if (previousRestoreVersion !== restoreVersion) return;

    setStageValue('behaviours.automaticLayout', true);
  }, [restoreVersion, subject, setStageValue]);

  // quickAdd applies codebook validation, while convexHullVariable's group
  // and lasso interactions write directly. Their gates therefore check
  // opposite role classes.
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
  const hasUnvalidatedUseForSubject = useCallback(
    (variableId: string) =>
      !!nodeVariablesSubject &&
      (roleMap[roleMapKey(nodeVariablesSubject, variableId)]?.unvalidated ??
        0) > 0,
    [roleMap, nodeVariablesSubject],
  );
  const hasValidatedUseForSubject = useCallback(
    (variableId: string) =>
      !!nodeVariablesSubject &&
      (roleMap[roleMapKey(nodeVariablesSubject, variableId)]?.validated ?? 0) >
        0,
    [roleMap, nodeVariablesSubject],
  );
  const originalQuickAdd = initialQuickAdd ?? '';
  const originalConvexHullVariable = initialConvexHullVariable ?? '';
  const committedNodeFormVariableIds = useMemo(
    () => nodeFormFieldVariables(initialNodeForm),
    [initialNodeForm],
  );
  const quickAddCrossClassValidate = useCallback(
    (value: unknown): string | undefined => {
      const variableId = typeof value === 'string' ? value : '';
      if (!variableId) return undefined;
      return crossClassPickIssue({
        variableId,
        originalVariableId: originalQuickAdd,
        hasConflictingUse: hasUnvalidatedUseForSubject,
        allVariables,
        message: unvalidatedElsewhereMessage,
      });
    },
    [originalQuickAdd, hasUnvalidatedUseForSubject, allVariables],
  );
  const convexHullCrossClassValidate = useCallback(
    (
      value: unknown,
      allValues?: Record<string, unknown>,
    ): string | undefined => {
      const variableId = typeof value === 'string' ? value : '';
      if (!variableId) return undefined;
      const savedDocumentIssue = crossClassPickIssue({
        variableId,
        originalVariableId: originalConvexHullVariable,
        hasConflictingUse: hasValidatedUseForSubject,
        allVariables,
        message: validatedElsewhereMessage,
      });
      if (savedDocumentIssue) return savedDocumentIssue;
      if (!nodeFormFieldVariables(allValues).includes(variableId)) {
        return undefined;
      }
      const pairAlreadyCommitted =
        variableId === originalConvexHullVariable &&
        committedNodeFormVariableIds.includes(variableId);
      return pairAlreadyCommitted
        ? undefined
        : validatedElsewhereMessage(
            variableDisplayName(allVariables, variableId),
          );
    },
    [
      allVariables,
      committedNodeFormVariableIds,
      hasValidatedUseForSubject,
      originalConvexHullVariable,
    ],
  );
  const siblingUnvalidatedVariableIds = useMemo(
    () =>
      typeof convexHullVariable === 'string' && convexHullVariable !== ''
        ? [convexHullVariable]
        : [],
    [convexHullVariable],
  );
  const layoutVariablesForSubject = useAppSelector(
    (state: RootState): LayoutVariableOption[] =>
      nodeVariablesSubject
        ? (getLayoutVariablesForSubject(
            state,
            nodeVariablesSubject,
          ) as LayoutVariableOption[])
        : [],
  );
  const categoricalVariablesForSubject = useAppSelector(
    (state: RootState): CategoricalVariableOption[] =>
      nodeVariablesSubject
        ? (getConvexHullOptionsForSubject(
            state,
            nodeVariablesSubject,
            convexHullVariable,
          ) as CategoricalVariableOption[])
        : [],
  );
  const quickAddOptionsForSubject = useAppSelector(
    (state: RootState): TextVariableOption[] =>
      nodeVariablesSubject
        ? (getComposerQuickAddOptionsForSubject(
            state,
            nodeVariablesSubject,
            quickAddVariable,
          ) as TextVariableOption[])
        : [],
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
    setStageValue('convexHullVariable', id);
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
          <ArchitectField
            name="quickAdd"
            label="Create or select a variable for the quick-add form"
            component={VariablePicker}
            initialValue={initialQuickAdd}
            validation={{
              required: true,
              crossClassPick: quickAddCrossClassValidate,
            }}
            type={type}
            entity={entity}
            options={quickAddOptionsForSubject}
            onCreateOption={(value: string) =>
              handleCreateVariable(value, 'text', 'quickAdd', {
                required: true,
              })
            }
          />
        </Row>
        {typeof quickAddVariable === 'string' && (
          <CodebookVariableValidationSection
            fieldName="quickAdd"
            entity={entity}
            type={type}
            variableId={quickAddVariable}
          />
        )}
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
          <ArchitectField
            name="layoutVariable"
            label="Create or select a variable to store node coordinates"
            component={VariablePicker}
            initialValue={initialLayoutVariable}
            validation={{ required: true }}
            type={type}
            entity={entity}
            options={layoutVariablesForSubject}
            onCreateOption={(value: string) =>
              handleCreateVariable(value, 'layout', 'layoutVariable')
            }
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
          <ArchitectField
            name="behaviours.automaticLayout"
            label="Start with automatic layout switched on"
            component={ToggleField}
            inline
            initialValue={initialAutomaticLayout ?? true}
          />
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
          <ArchitectField
            name="convexHullVariable"
            label="Create or select a categorical variable for grouping"
            component={VariablePicker}
            initialValue={initialConvexHullVariable}
            validation={{ crossClassPick: convexHullCrossClassValidate }}
            type={type}
            entity={entity}
            options={categoricalVariablesForSubject}
            onCreateOption={(name: string) =>
              openNewVariableWindow(
                { initialValues: { name, type: 'categorical' } },
                { field: 'convexHullVariable' },
              )
            }
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
          editFormName="node-attr-edit"
          title="Edit attribute"
          // Distinguishes this list from the per-edge-type attribute lists the
          // same Network Composer stage renders below it.
          addButtonLabel="Create new node attribute"
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

/**
 * convexHullVariable writes group membership without applying codebook
 * validation, so variables already written by a validated form are omitted.
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
 * NetworkComposer's own quickAdd (distinct from NameGeneratorQuickAdd's) is a
 * VALIDATED writer (its interview input now honours the target variable's
 * codebook validation — see network-composer.ts): drop options an
 * unvalidated writer elsewhere already claims. Mirrors
 * `QuickAdd/withOptions.tsx`'s `getQuickAddOptionsForSubject`.
 */
export const getComposerQuickAddOptionsForSubject = (
  state: RootState,
  subject: { entity: 'node' | 'edge' | 'ego'; type: string },
  currentValue?: string,
) => {
  const textOptions = getVariableOptionsForSubject(state, subject).filter(
    ({ type: variableType }) => variableType === 'text',
  );
  return excludeUnvalidatedUses(state, subject, textOptions, currentValue);
};

const NodeConfiguration = (_props: StageEditorSectionProps) => {
  const { entity, type } = useSubject();
  const { createVariable } = useCreateVariable();
  const handleChangeFields = useComposerFieldCommit({
    entity,
    type: type ?? '',
  });

  return (
    <NodeConfigurationComponent
      entity={entity}
      type={type}
      disabled={!type}
      disabledMessage="Select a node type above to configure this section."
      handleCreateVariable={createVariable}
      handleChangeFields={handleChangeFields}
    />
  );
};

export default NodeConfiguration;
