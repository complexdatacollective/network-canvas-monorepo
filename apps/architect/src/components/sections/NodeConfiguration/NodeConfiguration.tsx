import { isEqual } from 'es-toolkit/compat';
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { defineMessages } from '@codaco/app-i18n/messages';
import { useAppIntl } from '@codaco/app-i18n/react';
import ToggleField from '@codaco/fresco-ui/form/fields/ToggleField';
import Section from '@codaco/fresco-ui/Section';
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
import { getVariableRoleMap } from '~/selectors/indexes';
import {
  excludeUnvalidatedUses,
  excludeValidatedUses,
  hasUnvalidatedUse,
  hasValidatedUse,
} from '~/selectors/roleFilters';

import { VariablePickerControl as VariablePicker } from '../../Form/Fields/VariablePicker/VariablePicker';
import CodebookVariableValidationSection from '../CodebookVariableValidationSection';
import { useComposerFieldCommit } from '../Form/fieldCommit';
import { getLayoutVariablesForSubject } from '../SociogramPrompts/selectors';
const defaultMessages = defineMessages({
  disabledMessage: {
    id: 'architect.defaults.components.sections.NodeConfiguration.NodeConfiguration.disabledMessage',
    defaultMessage: 'Select a node type above to configure this section.',
    description:
      'Default researcher-facing copy when the caller does not supply its own disabledMessage.',
  },
});
const remainingMessages = defineMessages({
  selectANodeTypeAboveTo: {
    id: 'architect.remaining.sections.nodeConfiguration.nodeConfiguration.selectANodeTypeAboveTo',
    defaultMessage: 'Select a node type above to configure this section.',
    description:
      'The disabledMessage text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
});
const additionalMessages = defineMessages({
  createNewNodeAttribute: {
    id: 'architect.additional.sections.nodeConfiguration.nodeConfiguration.createNewNodeAttribute',
    defaultMessage: 'Create new node attribute',
    description:
      'The addButtonLabel text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
});
const messages = defineMessages({
  nodeConfiguration: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.nodeConfiguration',
    defaultMessage: 'Node configuration',
    description:
      'The title text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  configureAttributeMappingsLayoutBehaviourGroup: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.configureAttributeMappingsLayoutBehaviourGroup',
    defaultMessage:
      'Configure attribute mappings, layout behaviour, group hulls, and editable node attributes.',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  quickAddAttribute: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.quickAddAttribute',
    defaultMessage: 'Quick add attribute',
    description:
      'The title text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  theAttributePopulatedByTheInline: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.theAttributePopulatedByTheInline',
    defaultMessage:
      'The attribute populated by the inline quick-add field when a node is added from the toolbar — typically a name or label.',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  quickAddAttributed4972: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.quickAddAttributed4972',
    defaultMessage: 'Quick Add Attribute',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  createOrSelectAnAttributeFor: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.createOrSelectAnAttributeFor',
    defaultMessage: 'Create or select an attribute for the quick-add form',
    description:
      'The label text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  nodePositions: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.nodePositions',
    defaultMessage: 'Node positions',
    description:
      'The title text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  storesEachNodeSPositionOnThe: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.storesEachNodeSPositionOnThe',
    defaultMessage:
      "Stores each node's position on the canvas. Reusing the same attribute across stages preserves positions as the participant moves between tasks.",
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  layoutAttribute: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.layoutAttribute',
    defaultMessage: 'Layout Attribute',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  createOrSelectAnAttributeTo: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.createOrSelectAnAttributeTo',
    defaultMessage: 'Create or select an attribute to store node coordinates',
    description:
      'The label text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  automaticLayout: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.automaticLayout',
    defaultMessage: 'Automatic layout',
    description:
      'The title text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  whenOnNodesAreArrangedBy: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.whenOnNodesAreArrangedBy',
    defaultMessage:
      'When on, nodes are arranged by a force-directed layout. Participants can toggle this during the interview; this sets the starting state.',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  defaultAutomaticLayout: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.defaultAutomaticLayout',
    defaultMessage: 'Default automatic layout',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  startWithAutomaticLayoutSwitchedOn: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.startWithAutomaticLayoutSwitchedOn',
    defaultMessage: 'Start with automatic layout switched on',
    description:
      'The label text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  groupHulls: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.groupHulls',
    defaultMessage: 'Group hulls',
    description:
      'The title text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  drawShadedOutlinesAroundGroupsOf: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.drawShadedOutlinesAroundGroupsOf',
    defaultMessage:
      'Draw shaded outlines around groups of nodes that share a value of a categorical attribute. Choose (or create) the attribute whose values participants can group nodes into — by tapping nodes with the Groups tool, or by lasso-selecting several at once.',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  groupHullAttribute: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.groupHullAttribute',
    defaultMessage: 'Group hull attribute',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  createOrSelectACategoricalAttribute: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.createOrSelectACategoricalAttribute',
    defaultMessage: 'Create or select a categorical attribute for grouping',
    description:
      'The label text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  editableAttributes: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.editableAttributes',
    defaultMessage: 'Editable attributes',
    description:
      'The title text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  theAttributesShownInTheSide: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.theAttributesShownInTheSide',
    defaultMessage:
      'The attributes shown in the side panel when a node is selected, so they can be edited during the interview. Each attribute is paired with the input control used to collect it.',
    description:
      'The description text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
  editAttribute: {
    id: 'architect.sections.nodeConfiguration.nodeConfiguration.editAttribute',
    defaultMessage: 'Edit attribute',
    description:
      'The title text in components / sections / NodeConfiguration / NodeConfiguration.',
  },
});

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
  disabledMessage: providedDisabledMessage,
  handleCreateVariable,
  handleChangeFields,
}: NodeConfigurationProps) => {
  const intl = useAppIntl();
  const disabledMessage =
    providedDisabledMessage ??
    intl.formatMessage(defaultMessages.disabledMessage);

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
      hasUnvalidatedUse(roleMap, nodeVariablesSubject, variableId),
    [roleMap, nodeVariablesSubject],
  );
  const hasValidatedUseForSubject = useCallback(
    (variableId: string) =>
      !!nodeVariablesSubject &&
      hasValidatedUse(roleMap, nodeVariablesSubject, variableId),
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
      title={intl.formatMessage(messages.nodeConfiguration)}
      description={
        disabled
          ? disabledMessage
          : intl.formatMessage(
              messages.configureAttributeMappingsLayoutBehaviourGroup,
            )
      }
      disabled={disabled}
    >
      <Section
        title={intl.formatMessage(messages.quickAddAttribute)}
        description={intl.formatMessage(
          messages.theAttributePopulatedByTheInline,
        )}
      >
        <IssueAnchor
          fieldName="quickAdd"
          description={intl.formatMessage(messages.quickAddAttributed4972)}
        />
        <ArchitectField
          name="quickAdd"
          label={intl.formatMessage(messages.createOrSelectAnAttributeFor)}
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
        {typeof quickAddVariable === 'string' && (
          <CodebookVariableValidationSection
            fieldName="quickAdd"
            entity={entity}
            type={type}
            variableId={quickAddVariable}
          />
        )}
      </Section>

      <Section
        title={intl.formatMessage(messages.nodePositions)}
        description={intl.formatMessage(messages.storesEachNodeSPositionOnThe)}
      >
        <IssueAnchor
          fieldName="layoutVariable"
          description={intl.formatMessage(messages.layoutAttribute)}
        />
        <ArchitectField
          name="layoutVariable"
          label={intl.formatMessage(messages.createOrSelectAnAttributeTo)}
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
      </Section>

      <Section
        title={intl.formatMessage(messages.automaticLayout)}
        description={intl.formatMessage(messages.whenOnNodesAreArrangedBy)}
      >
        <IssueAnchor
          fieldName="behaviours.automaticLayout"
          description={intl.formatMessage(messages.defaultAutomaticLayout)}
        />
        <ArchitectField
          name="behaviours.automaticLayout"
          label={intl.formatMessage(
            messages.startWithAutomaticLayoutSwitchedOn,
          )}
          component={ToggleField}
          inline
          initialValue={initialAutomaticLayout ?? true}
        />
      </Section>

      <Section
        title={intl.formatMessage(messages.groupHulls)}
        description={intl.formatMessage(
          messages.drawShadedOutlinesAroundGroupsOf,
        )}
      >
        <IssueAnchor
          fieldName="convexHullVariable"
          description={intl.formatMessage(messages.groupHullAttribute)}
        />
        <ArchitectField
          name="convexHullVariable"
          label={intl.formatMessage(
            messages.createOrSelectACategoricalAttribute,
          )}
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
      </Section>

      <Section
        title={intl.formatMessage(messages.editableAttributes)}
        description={intl.formatMessage(messages.theAttributesShownInTheSide)}
      >
        <EditableAttributesList
          fieldName="nodeForm.fields"
          entity={entity === 'ego' ? 'node' : entity}
          type={type}
          editFormName="node-attr-edit"
          title={intl.formatMessage(messages.editAttribute)}
          // Distinguishes this list from the per-edge-type attribute lists the
          // same Network Composer stage renders below it.
          addButtonLabel={intl.formatMessage(
            additionalMessages.createNewNodeAttribute,
          )}
          handleChangeFields={handleChangeFields}
          siblingUnvalidatedVariableIds={siblingUnvalidatedVariableIds}
        />
      </Section>

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
  const intl = useAppIntl();
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
      disabledMessage={intl.formatMessage(
        remainingMessages.selectANodeTypeAboveTo,
      )}
      handleCreateVariable={createVariable}
      handleChangeFields={handleChangeFields}
    />
  );
};

export default NodeConfiguration;
